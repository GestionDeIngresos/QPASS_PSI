-- QPass · Sprint 3 · Dev C · HU 17, 50, 51 (sin liquidación)
-- Gestión de solicitudes de devolución: cliente y encargado.
-- Requiere sprint3_devA_qr.sql (qpass_autorizado_evento) y
--   202611160003_devd_comercio_base.sql (triggers de reserva) ya aplicados.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ─── 1) Tabla de parámetros configurables ────────────────────────────────────
-- Sin grants: solo accesible desde funciones SECURITY DEFINER.
-- Para cargar el plazo después de desplegar (ver referencia al pie).
create table if not exists public.devc_parametros (
  clave          text        primary key,
  valor          integer     not null check (valor > 0),
  actualizado_en timestamptz not null default now()
);
alter table public.devc_parametros enable row level security;
revoke all on public.devc_parametros from public, anon, authenticated;

-- ─── 2) Bucket privado 'devoluciones' ────────────────────────────────────────
-- Ruta: <usuario_id>/<evento_id>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'devoluciones',
  'devoluciones',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- insert: solo en la carpeta propia (primer segmento = auth.uid()).
drop policy if exists devc_devoluciones_insert on storage.objects;
create policy devc_devoluciones_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'devoluciones'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- select: propietario o encargado de devoluciones del evento (segundo segmento).
drop policy if exists devc_devoluciones_select on storage.objects;
create policy devc_devoluciones_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'devoluciones'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or public.qpass_autorizado_evento(
           case when split_part(name, '/', 2) ~ '^[0-9]{1,9}$'
             then split_part(name, '/', 2)::integer else null end,
           array['devolucion']
         )
    )
  );

-- ─── 3) devc_eventos_devolucion_cliente ───────────────────────────────────────
-- Eventos donde el usuario tiene saldo, con estado de plazo y disponible.
create or replace function public.devc_eventos_devolucion_cliente()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_plazo  integer;
  v_result jsonb;
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and activo) then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  select valor into v_plazo from public.devc_parametros where clave = 'plazo_devolucion_horas';
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'eventoId',   e.id,
      'titulo',     e.titulo,
      'fechaFin',   e.fecha_fin,
      'saldo',      sp.saldo::text,
      'reservado',  sp.reservado::text,
      'disponible', (sp.saldo - sp.reservado)::text,
      'venceEn',    case when v_plazo is not null
                      then e.fecha_fin + (v_plazo * interval '1 hour')
                      else null end,
      'habilitado', (
        e.fecha_fin is not null
        and now() >= e.fecha_fin
        and v_plazo is not null
        and now() <= e.fecha_fin + (v_plazo * interval '1 hour')
      )
    )
    order by e.fecha_evento desc, e.id desc
  ), '[]'::jsonb) into v_result
  from public.saldos_puntos sp
  join public.eventos e on e.id = sp.evento_id
  where sp.usuario_id = auth.uid();
  return v_result;
end;
$$;

-- ─── 4) crear_solicitud_devolucion ───────────────────────────────────────────
-- HU 17: el cliente sube su QR bancario y registra la solicitud.
-- El trigger devd_mantener_reserva (Dev D) reserva el monto al insertar.
create or replace function public.crear_solicitud_devolucion(
  p_evento  integer,
  p_monto   numeric,
  p_qr_ruta text
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_plazo integer;
  v_fin   timestamptz;
  v_saldo public.saldos_puntos%rowtype;
  v_id    integer;
begin
  -- Usuario activo.
  if not exists (select 1 from public.usuarios where id = auth.uid() and activo) then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  -- Monto: positivo, no NaN, máximo 2 decimales.
  if p_monto is null or p_monto <= 0
     or p_monto = 'NaN'::numeric
     or p_monto != round(p_monto, 2) then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  -- Plazo configurado.
  select valor into v_plazo from public.devc_parametros where clave = 'plazo_devolucion_horas';
  if not found then
    raise exception 'PLAZO_NO_CONFIGURADO';
  end if;
  -- Evento finalizado.
  select fecha_fin into v_fin from public.eventos where id = p_evento;
  if not found or v_fin is null or now() < v_fin then
    raise exception 'EVENTO_NO_FINALIZADO';
  end if;
  -- Dentro del plazo.
  if now() > v_fin + (v_plazo * interval '1 hour') then
    raise exception 'FUERA_DE_PLAZO';
  end if;
  -- QR válido: ruta propia del usuario/evento y existe en el bucket.
  if p_qr_ruta is null
     or p_qr_ruta not like auth.uid()::text || '/' || p_evento::text || '/%'
     or not exists (
       select 1 from storage.objects
       where bucket_id = 'devoluciones' and name = p_qr_ruta
     ) then
    raise exception 'QR_INVALIDO';
  end if;
  -- Bloquear fila de saldo (cerrojo contra solicitudes concurrentes).
  select * into v_saldo
    from public.saldos_puntos
    where usuario_id = auth.uid() and evento_id = p_evento
    for update;
  if not found then
    raise exception 'SIN_SALDO';
  end if;
  -- Sin solicitud ya pendiente para este evento.
  if exists (
    select 1 from public.solicitudes_devolucion
    where usuario_id = auth.uid() and evento_id = p_evento
      and estado in ('en_revision', 'aprobada')
  ) then
    raise exception 'SOLICITUD_PENDIENTE';
  end if;
  -- Saldo disponible (saldo - reservado) cubre el monto pedido.
  if p_monto > v_saldo.saldo - v_saldo.reservado then
    raise exception 'SALDO_INSUFICIENTE';
  end if;
  -- Insertar; el trigger de D actualiza reservado automáticamente.
  insert into public.solicitudes_devolucion(
    usuario_id, evento_id, monto_solicitado, qr_bancario_url, estado
  ) values (
    auth.uid(), p_evento, p_monto, p_qr_ruta, 'en_revision'
  ) returning id into v_id;
  return v_id;
end;
$$;

-- ─── 5) devc_mis_solicitudes_devolucion ──────────────────────────────────────
-- Historial de solicitudes del usuario autenticado, de más reciente a más antigua.
create or replace function public.devc_mis_solicitudes_devolucion()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and activo) then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',       sd.id,
      'eventoId', sd.evento_id,
      'evento',   e.titulo,
      'monto',    sd.monto_solicitado::text,
      'estado',   sd.estado,
      'creadoEn', sd.creado_en,
      'qrRuta',   sd.qr_bancario_url
    )
    order by sd.creado_en desc, sd.id desc
  ), '[]'::jsonb) into v_result
  from public.solicitudes_devolucion sd
  join public.eventos e on e.id = sd.evento_id
  where sd.usuario_id = auth.uid();
  return v_result;
end;
$$;

-- ─── 6) devc_eventos_encargado ────────────────────────────────────────────────
-- Rol 'devolucion': eventos de sus asignaciones. Admin: todos los publicados.
create or replace function public.devc_eventos_encargado()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_rol    text;
  v_result jsonb;
begin
  select u.rol::text into v_rol from public.usuarios u where u.id = auth.uid() and u.activo;
  if v_rol is null or v_rol not in ('devolucion', 'admin') then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if v_rol = 'admin' then
    select coalesce(jsonb_agg(
      jsonb_build_object('id', e.id, 'titulo', e.titulo)
      order by e.fecha_evento desc, e.id desc
    ), '[]'::jsonb) into v_result
    from public.eventos e
    where e.estado = 'publicado';
  else
    select coalesce(jsonb_agg(
      jsonb_build_object('id', e.id, 'titulo', e.titulo)
      order by e.fecha_evento desc, e.id desc
    ), '[]'::jsonb) into v_result
    from public.asignaciones_staff a
    join public.eventos e on e.id = a.evento_id
    where a.usuario_id = auth.uid() and a.rol_staff = 'devolucion';
  end if;
  return v_result;
end;
$$;

-- ─── 7) listar_solicitudes_devolucion ────────────────────────────────────────
-- HU 50: bandeja del encargado; de más antigua a más reciente.
create or replace function public.listar_solicitudes_devolucion(
  p_evento integer,
  p_estado text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.qpass_autorizado_evento(p_evento, array['devolucion']) then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('', 'en_revision', 'aprobada', 'rechazada') then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',          sd.id,
      'solicitante', u.nombre,
      'correo',      u.correo,
      'monto',       sd.monto_solicitado::text,
      'estado',      sd.estado,
      'creadoEn',    sd.creado_en,
      'qrRuta',      sd.qr_bancario_url
    )
    order by sd.creado_en asc, sd.id asc
  ), '[]'::jsonb) into v_result
  from public.solicitudes_devolucion sd
  join public.usuarios u on u.id = sd.usuario_id
  where sd.evento_id = p_evento
    and (p_estado = '' or sd.estado::text = p_estado);
  return v_result;
end;
$$;

-- ─── 8) rechazar_solicitud_devolucion ────────────────────────────────────────
-- HU 51 (parcial): bloquea la fila, valida autorización y cambia estado.
-- Idempotente si ya está rechazada. El trigger de D libera la reserva al actualizar.
create or replace function public.rechazar_solicitud_devolucion(p_solicitud integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sol public.solicitudes_devolucion%rowtype;
begin
  select * into v_sol
    from public.solicitudes_devolucion
    where id = p_solicitud
    for update;
  if not found then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if not public.qpass_autorizado_evento(v_sol.evento_id, array['devolucion']) then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if v_sol.estado = 'rechazada' then return; end if;
  if v_sol.estado = 'aprobada' then
    raise exception 'SOLICITUD_YA_PROCESADA';
  end if;
  -- estado = en_revision; el trigger actualiza reservado al cambiar.
  update public.solicitudes_devolucion set estado = 'rechazada' where id = p_solicitud;
end;
$$;

-- ─── Revoke / grant ───────────────────────────────────────────────────────────
revoke all on function public.devc_eventos_devolucion_cliente() from public, anon;
revoke all on function public.crear_solicitud_devolucion(integer, numeric, text) from public, anon;
revoke all on function public.devc_mis_solicitudes_devolucion() from public, anon;
revoke all on function public.devc_eventos_encargado() from public, anon;
revoke all on function public.listar_solicitudes_devolucion(integer, text) from public, anon;
revoke all on function public.rechazar_solicitud_devolucion(integer) from public, anon;
grant execute on function public.devc_eventos_devolucion_cliente() to authenticated;
grant execute on function public.crear_solicitud_devolucion(integer, numeric, text) to authenticated;
grant execute on function public.devc_mis_solicitudes_devolucion() to authenticated;
grant execute on function public.devc_eventos_encargado() to authenticated;
grant execute on function public.listar_solicitudes_devolucion(integer, text) to authenticated;
grant execute on function public.rechazar_solicitud_devolucion(integer) to authenticated;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- REFERENCIA RÁPIDA
-- ─────────────────────────────────────────────────────────────────────────────
-- Orden de aplicación:
--   1. sprint3_devA_qr.sql                     (qpass_autorizado_evento)
--   2. 202611160003_devd_comercio_base.sql      (triggers de reserva en saldos_puntos)
--   3. sprint3_devC_devoluciones.sql            (este archivo)
--
-- Cargar el plazo después del despliegue (N = horas):
--   insert into public.devc_parametros(clave, valor)
--   values ('plazo_devolucion_horas', N)
--   on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
--
-- Bucket: 'devoluciones' (privado, 5 MB, png/jpeg/webp)
--   Ruta: <usuario_id>/<evento_id>/<uuid>.<ext>
--   Políticas: insert (propietario), select (propietario o autorizado_evento devolucion).
--   Sin update ni delete.
--
-- RPCs (todas SECURITY DEFINER, solo rol authenticated):
--
--   devc_eventos_devolucion_cliente() → jsonb
--     [{eventoId, titulo, fechaFin, saldo, reservado, disponible, venceEn, habilitado}]
--     habilitado: true si evento terminó, plazo vigente (now ≤ venceEn) y plazo configurado.
--     Montos como texto con 2 decimales.
--     Errores: SIN_PERMISOS(42501)
--
--   crear_solicitud_devolucion(p_evento, p_monto, p_qr_ruta) → integer   HU 17
--     Devuelve el id de la solicitud creada (estado en_revision).
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023),
--              PLAZO_NO_CONFIGURADO, EVENTO_NO_FINALIZADO, FUERA_DE_PLAZO,
--              QR_INVALIDO, SIN_SALDO, SOLICITUD_PENDIENTE, SALDO_INSUFICIENTE
--
--   devc_mis_solicitudes_devolucion() → jsonb
--     [{id, eventoId, evento, monto, estado, creadoEn, qrRuta}]
--     Ordenado de más reciente a más antigua.
--     Errores: SIN_PERMISOS(42501)
--
--   devc_eventos_encargado() → jsonb
--     [{id, titulo}] — eventos asignados (rol devolucion) o todos los publicados (admin).
--     Errores: SIN_PERMISOS(42501)
--
--   listar_solicitudes_devolucion(p_evento, p_estado) → jsonb            HU 50
--     p_estado: '' (todas) | 'en_revision' | 'aprobada' | 'rechazada'
--     [{id, solicitante, correo, monto, estado, creadoEn, qrRuta}]
--     Ordenado de más antigua a más reciente.
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023)
--
--   rechazar_solicitud_devolucion(p_solicitud) → void                 HU 51 parcial
--     Idempotente si ya está rechazada. El trigger de D libera la reserva.
--     Errores: SIN_PERMISOS(42501), SOLICITUD_YA_PROCESADA
--
-- PENDIENTE — Dev B (núcleo de liquidación, fuera del alcance de este archivo):
--   aceptar_solicitud_devolucion(p_solicitud integer) → void
--     Pasa estado a 'aprobada'; el trigger de D actualiza la reserva.
--   liquidar_solicitud_devolucion(p_solicitud integer) → void
--     Descuenta saldo, libera reserva y registra en devoluciones exactamente una vez.
-- ═════════════════════════════════════════════════════════════════════════════
