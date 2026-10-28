-- ════════════════════════════════════════════════════════════════
-- QPass · Sprint 2 · Dev A
-- Base del panel Admin + formulario por pasos de eventos.
-- Ejecutar UNA vez en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
-- ════════════════════════════════════════════════════════════════

-- ─── 1) ¿El usuario actual es admin? (la reutilizan TODAS las políticas) ───
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where id = (select auth.uid()) and rol = 'admin'
  );
$$;
revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to anon, authenticated;

-- ─── 2) Estructura nueva ─────────────────────────────────────────
-- Cronograma del mockup = fecha/hora de inicio (fecha_evento) + fecha/hora de fin (fecha_fin)
alter table public.eventos add column if not exists fecha_fin timestamptz;

-- Cada solicitud apunta al evento que se está solicitando
alter table public.solicitudes_organizador
  add column if not exists evento_id integer references public.eventos(id) on delete cascade;
create index if not exists idx_solicitudes_evento on public.solicitudes_organizador (evento_id);

-- ─── 3) Permisos básicos de tabla (RLS decide el resto) ──────────
grant select, insert, update, delete on public.eventos, public.tipos_ticket to authenticated;
grant select, insert, update, delete on public.solicitudes_organizador to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ─── 4) Políticas de ADMIN ───────────────────────────────────────
alter table public.eventos                 enable row level security;
alter table public.tipos_ticket            enable row level security;
alter table public.solicitudes_organizador enable row level security;

drop policy if exists "eventos_admin_all" on public.eventos;
create policy "eventos_admin_all" on public.eventos
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "tipos_ticket_admin_all" on public.tipos_ticket;
create policy "tipos_ticket_admin_all" on public.tipos_ticket
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "solicitudes_admin_all" on public.solicitudes_organizador;
create policy "solicitudes_admin_all" on public.solicitudes_organizador
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- El admin necesita ver nombre/correo de quien solicita
drop policy if exists "usuarios_select_admin" on public.usuarios;
create policy "usuarios_select_admin" on public.usuarios
  for select to authenticated
  using (public.es_admin());

-- ─── 5) Storage: bucket público "eventos" (fotos de portada y mapas) ───
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eventos', 'eventos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "eventos_img_lectura_publica" on storage.objects;
create policy "eventos_img_lectura_publica" on storage.objects
  for select to public using (bucket_id = 'eventos');

-- Cada usuario sube a su carpeta (<su-uuid>/archivo); el admin puede en cualquiera
drop policy if exists "eventos_img_subir" on storage.objects;
create policy "eventos_img_subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'eventos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.es_admin()));

drop policy if exists "eventos_img_editar" on storage.objects;
create policy "eventos_img_editar" on storage.objects
  for update to authenticated
  using (bucket_id = 'eventos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.es_admin()));

drop policy if exists "eventos_img_borrar" on storage.objects;
create policy "eventos_img_borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'eventos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.es_admin()));

-- ─── 6) Guardado ATÓMICO de evento + tickets (lo usa el formulario por pasos) ───
-- SECURITY INVOKER: respeta RLS de quien llama (admin u organizador).
-- Si algo falla (p. ej. quitar un ticket con ventas) se revierte TODO.
create or replace function public.guardar_evento_completo(
  p_evento_id      integer,                  -- null = crear evento nuevo
  p_organizador_id uuid,                     -- solo al crear
  p_estado         public.estado_evento,     -- null = no cambiar (al crear es obligatorio)
  p_datos          jsonb,
  p_tickets        jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id integer;
  t    jsonb;
begin
  if p_evento_id is null then
    if p_organizador_id is null or p_estado is null then
      raise exception 'Faltan el organizador o el estado del evento.';
    end if;
    insert into eventos (organizador_id, categoria_id, titulo, descripcion, foto_url, ubicacion,
                         mapa_url, fecha_evento, fecha_fin, tipo_acceso, estado)
    values (p_organizador_id, nullif(p_datos->>'categoria_id','')::integer, p_datos->>'titulo',
            nullif(p_datos->>'descripcion',''), nullif(p_datos->>'foto_url',''), p_datos->>'ubicacion',
            nullif(p_datos->>'mapa_url',''), (p_datos->>'fecha_evento')::timestamptz,
            (p_datos->>'fecha_fin')::timestamptz, (p_datos->>'tipo_acceso')::tipo_acceso_evento, p_estado)
    returning id into v_id;
  else
    update eventos set
      categoria_id = nullif(p_datos->>'categoria_id','')::integer,
      titulo       = p_datos->>'titulo',
      descripcion  = nullif(p_datos->>'descripcion',''),
      foto_url     = nullif(p_datos->>'foto_url',''),
      ubicacion    = p_datos->>'ubicacion',
      mapa_url     = nullif(p_datos->>'mapa_url',''),
      fecha_evento = (p_datos->>'fecha_evento')::timestamptz,
      fecha_fin    = (p_datos->>'fecha_fin')::timestamptz,
      tipo_acceso  = (p_datos->>'tipo_acceso')::tipo_acceso_evento,
      estado       = coalesce(p_estado, estado)
    where id = p_evento_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Evento no encontrado o sin permisos para editarlo.';
    end if;
  end if;

  -- quita los tickets que ya no vienen (si tienen ventas, la FK lo impide y todo se revierte)
  delete from tipos_ticket
  where evento_id = v_id
    and id not in (select (x->>'id')::integer from jsonb_array_elements(p_tickets) x where x->>'id' is not null);

  for t in select * from jsonb_array_elements(p_tickets) loop
    if t->>'id' is not null then
      update tipos_ticket set
        nombre = t->>'nombre',
        descripcion = nullif(t->>'descripcion',''),
        precio = (t->>'precio')::numeric,
        cantidad_disponible = (t->>'cantidad_disponible')::integer,
        limite_por_usuario = (t->>'limite_por_usuario')::integer
      where id = (t->>'id')::integer and evento_id = v_id;
    else
      insert into tipos_ticket (evento_id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario)
      values (v_id, t->>'nombre', nullif(t->>'descripcion',''), (t->>'precio')::numeric,
              (t->>'cantidad_disponible')::integer, (t->>'limite_por_usuario')::integer);
    end if;
  end loop;

  return v_id;
end;
$$;
revoke all on function public.guardar_evento_completo(integer, uuid, public.estado_evento, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_evento_completo(integer, uuid, public.estado_evento, jsonb, jsonb) to authenticated;

-- ─── Cómo marcarte como ADMIN para probar (reemplaza el correo) ───
-- update public.usuarios set rol = 'admin' where correo = 'tu-correo@ejemplo.com';
