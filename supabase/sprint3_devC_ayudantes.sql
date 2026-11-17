-- QPass · Sprint 3 · Dev C · HU 57–58
-- Gestión de ayudantes del propietario de negocio.
-- Requiere sprint3_devC_negocios.sql ya aplicado:
--   define devc_dueno_activo(), devc_es_dueno() y políticas SELECT del dueño.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ─── 1) vincular_ayudante ─────────────────────────────────────────────────────
-- Se llama desde el servidor justo después de crear la cuenta del ayudante.
-- El servidor crea la cuenta (Auth) con rol = 'ayudante' usando la service role;
-- luego llama a esta RPC con la sesión del dueño para registrar la vinculación.
create or replace function public.vincular_ayudante(
  p_usuario  uuid,
  p_negocios integer[]
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_evento_id integer;
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if p_negocios is null or array_length(p_negocios, 1) is null then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  -- Todos los negocios deben ser del dueño.
  if exists (
    select 1 from unnest(p_negocios) as pid
    where not exists (
      select 1 from public.negocios where id = pid and dueno_id = auth.uid()
    )
  ) then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  -- El usuario destino debe existir, estar activo y tener rol 'ayudante'.
  if not exists (
    select 1 from public.usuarios
    where id = p_usuario and activo and rol = 'ayudante'
  ) then
    raise exception 'USUARIO_NO_AYUDANTE';
  end if;
  -- El destino no puede tener filas de ayudantes de OTRO dueño.
  if exists (
    select 1 from public.ayudantes a
    join public.negocios n on n.id = a.negocio_id
    where a.usuario_id = p_usuario and n.dueno_id <> auth.uid()
  ) then
    raise exception 'AYUDANTE_DE_OTRO_DUENO';
  end if;
  -- Evento del dueño (asignaciones_staff con rol_staff = 'negocio').
  select evento_id into v_evento_id
    from public.asignaciones_staff
    where usuario_id = auth.uid() and rol_staff = 'negocio';
  if not found then
    raise exception 'SIN_EVENTO_ASIGNADO';
  end if;
  -- Si el destino ya tiene asignaciones_staff, debe coincidir con el evento del dueño.
  if exists (select 1 from public.asignaciones_staff where usuario_id = p_usuario) then
    if not exists (
      select 1 from public.asignaciones_staff
      where usuario_id = p_usuario
        and evento_id = v_evento_id
        and rol_staff = 'ayudante'
    ) then
      raise exception 'AYUDANTE_CON_OTRO_EVENTO';
    end if;
  else
    insert into public.asignaciones_staff(usuario_id, evento_id, rol_staff)
    values(p_usuario, v_evento_id, 'ayudante')
    on conflict do nothing;
  end if;
  -- Registrar las vinculaciones; reactivar si ya existían.
  insert into public.ayudantes(negocio_id, usuario_id, activo)
  select pid, p_usuario, true from unnest(p_negocios) as pid
  on conflict (negocio_id, usuario_id) do update set activo = true;
end;
$$;

-- ─── 2) editar_ayudante ───────────────────────────────────────────────────────
create or replace function public.editar_ayudante(
  p_usuario  uuid,
  p_nombre   text,
  p_negocios integer[],
  p_activo   boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_nombre text := btrim(p_nombre);
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  -- El destino debe tener al menos una fila en negocios del dueño.
  if not exists (
    select 1 from public.ayudantes a
    join public.negocios n on n.id = a.negocio_id
    where a.usuario_id = p_usuario and n.dueno_id = auth.uid()
  ) then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if v_nombre is null or length(v_nombre) < 1 or length(v_nombre) > 120 then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  if p_activo is null then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  -- p_negocios puede estar vacío solo si p_activo = false (desactivación total).
  if array_length(p_negocios, 1) is null and p_activo is distinct from false then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  -- Todos los negocios de p_negocios deben ser del dueño.
  if array_length(p_negocios, 1) is not null then
    if exists (
      select 1 from unnest(p_negocios) as pid
      where not exists (
        select 1 from public.negocios where id = pid and dueno_id = auth.uid()
      )
    ) then
      raise exception 'SIN_PERMISOS' using errcode = '42501';
    end if;
  end if;
  -- Actualizar nombre del ayudante.
  update public.usuarios set nombre = v_nombre where id = p_usuario;
  -- Negocios en p_negocios: upsert con activo = p_activo.
  if array_length(p_negocios, 1) is not null then
    insert into public.ayudantes(negocio_id, usuario_id, activo)
    select pid, p_usuario, p_activo from unnest(p_negocios) as pid
    on conflict (negocio_id, usuario_id) do update set activo = excluded.activo;
  end if;
  -- Negocios del dueño que no están en p_negocios: desactivar sin borrar.
  update public.ayudantes a
    set activo = false
    from public.negocios n
    where a.negocio_id = n.id
      and n.dueno_id = auth.uid()
      and a.usuario_id = p_usuario
      and not (a.negocio_id = any(coalesce(p_negocios, '{}'::integer[])));
end;
$$;

-- ─── 3) eliminar_ayudante ─────────────────────────────────────────────────────
create or replace function public.eliminar_ayudante(p_usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ids integer[];
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  -- Bloquear primero, luego recoger los ids sin FOR UPDATE.
  perform 1 from public.ayudantes a
    join public.negocios n on n.id = a.negocio_id
    where a.usuario_id = p_usuario and n.dueno_id = auth.uid()
    for update of a;
  select array_agg(a.id) into v_ids
    from public.ayudantes a
    join public.negocios n on n.id = a.negocio_id
    where a.usuario_id = p_usuario and n.dueno_id = auth.uid();
  if v_ids is null then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if exists (select 1 from public.ventas where ayudante_id = any(v_ids)) then
    raise exception 'AYUDANTE_CON_VENTAS';
  end if;
  delete from public.ayudantes where id = any(v_ids);
  -- Si no quedan filas de ayudante para ese usuario, eliminar su asignación.
  if not exists (select 1 from public.ayudantes where usuario_id = p_usuario) then
    delete from public.asignaciones_staff
      where usuario_id = p_usuario and rol_staff = 'ayudante';
  end if;
  -- La cuenta y la fila de usuarios NO se borran; eso es responsabilidad del servidor.
end;
$$;

-- ─── 4) listar_ayudantes_dueno ───────────────────────────────────────────────
create or replace function public.listar_ayudantes_dueno()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  -- CTE: una fila por usuario con activo y subarreglo de negocios del dueño.
  with filas as (
    select
      u.id                                                        as usuario_id,
      u.nombre,
      u.correo,
      bool_or(a.activo)                                           as activo,
      (
        select coalesce(jsonb_agg(
          jsonb_build_object('id', n2.id, 'nombre', n2.nombre, 'activo', a2.activo)
          order by n2.nombre
        ), '[]'::jsonb)
        from public.ayudantes a2
        join public.negocios n2 on n2.id = a2.negocio_id
        where a2.usuario_id = u.id and n2.dueno_id = auth.uid()
      )                                                           as negocios
    from public.usuarios u
    join public.ayudantes a on a.usuario_id = u.id
    join public.negocios n on n.id = a.negocio_id
    where n.dueno_id = auth.uid()
    group by u.id, u.nombre, u.correo
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'usuarioId', f.usuario_id,
      'nombre',    f.nombre,
      'correo',    f.correo,
      'activo',    f.activo,
      'negocios',  f.negocios
    )
    order by f.nombre
  ), '[]'::jsonb) into v_result
  from filas f;
  return v_result;
end;
$$;

-- ─── Revoke / grant ───────────────────────────────────────────────────────────
revoke all on function public.vincular_ayudante(uuid, integer[]) from public, anon;
revoke all on function public.editar_ayudante(uuid, text, integer[], boolean) from public, anon;
revoke all on function public.eliminar_ayudante(uuid) from public, anon;
revoke all on function public.listar_ayudantes_dueno() from public, anon;
grant execute on function public.vincular_ayudante(uuid, integer[]) to authenticated;
grant execute on function public.editar_ayudante(uuid, text, integer[], boolean) to authenticated;
grant execute on function public.eliminar_ayudante(uuid) to authenticated;
grant execute on function public.listar_ayudantes_dueno() to authenticated;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- REFERENCIA RÁPIDA
-- ─────────────────────────────────────────────────────────────────────────────
-- Orden de aplicación:
--   1. 202611160003_devd_comercio_base.sql  (Dev D — ya aplicado)
--   2. sprint3_devC_negocios.sql            (Dev C — ya aplicado)
--   3. sprint3_devC_ayudantes.sql           (este archivo)
--
-- RPCs (todas SECURITY DEFINER, solo rol authenticated):
--
--   vincular_ayudante(p_usuario uuid, p_negocios integer[]) → void
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023),
--              USUARIO_NO_AYUDANTE, AYUDANTE_DE_OTRO_DUENO,
--              SIN_EVENTO_ASIGNADO, AYUDANTE_CON_OTRO_EVENTO
--     Nota: la creación de la cuenta (Auth) la hace el servidor con la
--     service role, siempre con rol = 'ayudante' fijo; luego llama a
--     vincular_ayudante con la sesión del dueño.
--
--   editar_ayudante(p_usuario uuid, p_nombre text,
--                   p_negocios integer[], p_activo boolean) → void
--     p_negocios puede ser vacío solo si p_activo = false (desactivación total).
--     Nunca se borran filas de ayudantes; se conserva el historial de ventas.
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023)
--
--   eliminar_ayudante(p_usuario uuid) → void
--     Borra solo las filas de ayudantes del dueño. Si no quedan más filas,
--     borra también asignaciones_staff con rol_staff = 'ayudante'.
--     No borra la cuenta ni la fila de usuarios.
--     Errores: SIN_PERMISOS(42501), AYUDANTE_CON_VENTAS
--     (si hay ventas la UI debe sugerir desactivarlo con editar_ayudante)
--
--   listar_ayudantes_dueno() → jsonb
--     Arreglo [{usuarioId, nombre, correo, activo, negocios:[{id,nombre,activo}]}]
--     activo = true si alguna fila del dueño está activa. Ordenado por nombre.
--     Errores: SIN_PERMISOS(42501)
-- ═════════════════════════════════════════════════════════════════════════════
