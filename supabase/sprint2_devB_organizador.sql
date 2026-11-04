-- ════════════════════════════════════════════════════════════════
-- QPass · Sprint 2 · Dev B
-- Panel del organizador: Mis Solicitudes (HU 18 y 19), editar mi evento (HU 20)
-- y Mis Eventos (HU 21).
-- REQUIERE haber ejecutado antes supabase/sprint2_devA_admin_eventos.sql
-- (usa es_admin(), eventos.fecha_fin, solicitudes_organizador.evento_id y guardar_evento_completo).
-- Ejecutar UNA vez en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Qué garantiza (aunque alguien llame a la API de Supabase a mano, sin pasar por la web):
--   · El organizador NUNCA cambia el estado de un evento (no puede auto-publicarse).
--   · El organizador solo ve/edita/elimina eventos PROPIOS.
--   · Un evento con entradas vendidas NO se puede eliminar.
--   · Una solicitud solo se crea "en_revision" y sobre un evento propio pendiente.
-- ════════════════════════════════════════════════════════════════

-- ─── 0) ¿El evento tiene entradas vendidas? ─────────────────────
-- SECURITY DEFINER porque el organizador no puede leer "entradas" (RLS).
-- Solo responde para el dueño del evento o un admin; para los demás devuelve false.
create or replace function public.evento_tiene_entradas(p_evento_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.eventos e
      where e.id = p_evento_id
        and (e.organizador_id = (select auth.uid()) or public.es_admin())
    )
    then exists (
      select 1
      from public.entradas en
      join public.tipos_ticket t on t.id = en.tipo_ticket_id
      where t.evento_id = p_evento_id
    )
    else false
  end;
$$;
revoke all on function public.evento_tiene_entradas(integer) from public, anon;
grant execute on function public.evento_tiene_entradas(integer) to authenticated;

-- ─── 1) Trigger: campos que SOLO un admin puede cambiar ─────────
-- Las políticas RLS no pueden comparar "valor viejo vs nuevo"; el trigger sí.
-- Sin sesión de usuario (SQL Editor / service role) no restringe nada.
create or replace function public.proteger_campos_evento()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) is null or public.es_admin() then
    return new;
  end if;

  if new.estado is distinct from old.estado then
    raise exception 'Solo un administrador puede cambiar el estado de un evento.' using errcode = '42501';
  end if;
  if new.organizador_id is distinct from old.organizador_id then
    raise exception 'No se puede cambiar el organizador de un evento.' using errcode = '42501';
  end if;
  if new.destacado_carrusel is distinct from old.destacado_carrusel then
    raise exception 'Solo un administrador puede destacar un evento en la landing.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_campos_evento on public.eventos;
create trigger trg_proteger_campos_evento
  before update on public.eventos
  for each row execute function public.proteger_campos_evento();

-- ─── 2) EVENTOS: políticas del organizador ──────────────────────
alter table public.eventos enable row level security;

-- Ve TODOS sus eventos (cualquier estado); los publicados ya los ve todo el mundo
drop policy if exists "eventos_organizador_select" on public.eventos;
create policy "eventos_organizador_select" on public.eventos
  for select to authenticated
  using (organizador_id = (select auth.uid()));

-- Crea eventos solo a su nombre, SIEMPRE "pendiente_aprobacion" y sin destacar
-- (así envía una solicitud; no puede crearlos ya publicados)
drop policy if exists "eventos_organizador_insert" on public.eventos;
create policy "eventos_organizador_insert" on public.eventos
  for insert to authenticated
  with check (
    organizador_id = (select auth.uid())
    and estado = 'pendiente_aprobacion'
    and coalesce(destacado_carrusel, false) = false
  );

-- Edita solo sus eventos ya aprobados o publicados.
-- (El cambio de estado lo bloquea el trigger de arriba)
drop policy if exists "eventos_organizador_update" on public.eventos;
create policy "eventos_organizador_update" on public.eventos
  for update to authenticated
  using (organizador_id = (select auth.uid()) and estado in ('aprobado', 'publicado'))
  with check (organizador_id = (select auth.uid()));

-- Elimina solo sus eventos SIN entradas vendidas
drop policy if exists "eventos_organizador_delete" on public.eventos;
create policy "eventos_organizador_delete" on public.eventos
  for delete to authenticated
  using (organizador_id = (select auth.uid()) and not public.evento_tiene_entradas(id));

-- ─── 3) TIPOS_TICKET: solo los de sus eventos ───────────────────
alter table public.tipos_ticket enable row level security;

drop policy if exists "tipos_ticket_organizador_all" on public.tipos_ticket;
create policy "tipos_ticket_organizador_all" on public.tipos_ticket
  for all to authenticated
  using (
    exists (select 1 from public.eventos e
            where e.id = tipos_ticket.evento_id and e.organizador_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.eventos e
            where e.id = tipos_ticket.evento_id and e.organizador_id = (select auth.uid()))
  );

-- ─── 4) SOLICITUDES: ve las suyas y crea nuevas "en_revision" ────
-- No hay política de UPDATE: solo el admin las resuelve.
alter table public.solicitudes_organizador enable row level security;

drop policy if exists "solicitudes_organizador_select" on public.solicitudes_organizador;
create policy "solicitudes_organizador_select" on public.solicitudes_organizador
  for select to authenticated
  using (usuario_id = (select auth.uid()));

drop policy if exists "solicitudes_organizador_insert" on public.solicitudes_organizador;
create policy "solicitudes_organizador_insert" on public.solicitudes_organizador
  for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and estado = 'en_revision'
    and revisado_por is null
    and revisado_en is null
    and solicitudes_organizador.evento_id is not null
    and exists (
      select 1 from public.eventos e
      where e.id = solicitudes_organizador.evento_id
        and e.organizador_id = (select auth.uid())
        and e.estado = 'pendiente_aprobacion'
    )
  );

-- ─── 5) Eliminar un evento propio (atómico) ─────────────────────
-- SECURITY INVOKER: respeta las políticas de arriba. Si algo falla, se revierte todo.
-- Errores (message): CON_VENTAS, NO_ENCONTRADO
create or replace function public.eliminar_evento_sin_ventas(p_evento_id integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_borrados integer;
begin
  if public.evento_tiene_entradas(p_evento_id) then
    raise exception 'CON_VENTAS';
  end if;

  delete from public.tipos_ticket where evento_id = p_evento_id;
  delete from public.eventos where id = p_evento_id;
  get diagnostics v_borrados = row_count;

  if v_borrados = 0 then
    raise exception 'NO_ENCONTRADO'; -- no existe o no es tuyo (y revierte el borrado de tickets)
  end if;
end;
$$;
revoke all on function public.eliminar_evento_sin_ventas(integer) from public, anon;
grant execute on function public.eliminar_evento_sin_ventas(integer) to authenticated;

-- ─── 6) Estadísticas del evento (modal "Ver detalles") ──────────
-- Solo cuenta compras confirmadas y entradas no anuladas.
-- Solo el dueño del evento o un admin pueden consultarlas.
create or replace function public.estadisticas_evento(p_evento_id integer)
returns table (
  usuarios            bigint,
  entradas_vendidas   bigint,
  ingreso_entradas    numeric,
  ingreso_servicios   numeric,
  ingreso_total       numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_entradas  bigint;
  v_usuarios  bigint;
  v_subtotal  numeric;
  v_servicios numeric;
begin
  if not exists (
    select 1 from public.eventos e
    where e.id = p_evento_id
      and (e.organizador_id = (select auth.uid()) or public.es_admin())
  ) then
    raise exception 'Sin permisos para ver las estadísticas de este evento.' using errcode = '42501';
  end if;

  select count(en.id), count(distinct en.usuario_destino_id), coalesce(sum(t.precio), 0)
    into v_entradas, v_usuarios, v_subtotal
  from public.entradas en
  join public.tipos_ticket t on t.id = en.tipo_ticket_id
  join public.compras c on c.id = en.compra_id
  where t.evento_id = p_evento_id
    and c.estado_pago = 'confirmado'
    and en.estado <> 'anulada';

  -- cada compra es de UN solo evento, así que sus cargos de servicio le pertenecen
  select coalesce(sum(c.cargos_servicio), 0)
    into v_servicios
  from public.compras c
  where c.estado_pago = 'confirmado'
    and exists (
      select 1
      from public.entradas en
      join public.tipos_ticket t on t.id = en.tipo_ticket_id
      where en.compra_id = c.id and t.evento_id = p_evento_id
    );

  return query select v_usuarios, v_entradas, v_subtotal, v_servicios, v_subtotal + v_servicios;
end;
$$;
revoke all on function public.estadisticas_evento(integer) from public, anon;
grant execute on function public.estadisticas_evento(integer) to authenticated;

-- ─── 7) Índices para que "Mis Eventos / Mis Solicitudes" sigan rápidos ───
create index if not exists idx_eventos_organizador on public.eventos (organizador_id, estado);
create index if not exists idx_solicitudes_usuario on public.solicitudes_organizador (usuario_id, solicitado_en desc);
