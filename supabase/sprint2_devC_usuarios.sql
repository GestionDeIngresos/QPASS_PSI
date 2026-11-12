-- ════════════════════════════════════════════════════════════════
-- QPass · Sprint 2 · Dev C
-- Gestión de usuarios (HU 26), personal con evento asignado (HU 34)
-- y edición del propio perfil desde "Mi Cuenta" (HU 5).
-- Requiere antes: supabase/sprint2_devA_admin_eventos.sql (función es_admin()).
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
-- ════════════════════════════════════════════════════════════════

-- ─── 1) Rol nuevo del mockup ────────────────────────────────────
-- El enum ya trae: admin, cliente, supervisor, devolucion, ayudante, negocio.
-- Falta "escaneador" (personal que escanea QR en puerta).
alter type public.rol_usuario add value if not exists 'escaneador';

-- ─── 2) Estado Activo / Inactivo del usuario ─────────────────────
alter table public.usuarios add column if not exists activo boolean not null default true;

-- ─── 3) Un evento asignado por persona del personal ──────────────
alter table public.asignaciones_staff add column if not exists asignado_en timestamptz not null default now();

do $$
begin
  if not exists (select 1 from public.asignaciones_staff group by usuario_id having count(*) > 1) then
    create unique index if not exists asignaciones_staff_usuario_unico on public.asignaciones_staff (usuario_id);
  else
    raise notice 'asignaciones_staff tiene usuarios con más de un evento: no se creó el índice único.';
  end if;
end $$;

-- ─── 4) Permisos básicos de tabla (RLS decide el resto) ──────────
grant select, update, delete on public.usuarios to authenticated;
grant select, insert, update, delete on public.asignaciones_staff to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ─── 5) Políticas de usuarios ────────────────────────────────────
alter table public.usuarios enable row level security;
-- (la de SELECT para admin ya la crea Dev A: "usuarios_select_admin")

drop policy if exists "usuarios_update_admin" on public.usuarios;
create policy "usuarios_update_admin" on public.usuarios
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "usuarios_delete_admin" on public.usuarios;
create policy "usuarios_delete_admin" on public.usuarios
  for delete to authenticated
  using (public.es_admin() and id <> (select auth.uid())); -- un admin no se borra a sí mismo

-- Cada usuario ve y edita SU fila (Mi Cuenta → Editar perfil)
drop policy if exists "usuarios_select_propio" on public.usuarios;
create policy "usuarios_select_propio" on public.usuarios
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "usuarios_update_propio" on public.usuarios;
create policy "usuarios_update_propio" on public.usuarios
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ─── 6) Nadie se sube el rol a sí mismo ──────────────────────────
-- RLS no puede limitar columnas: este trigger impide que un usuario normal cambie
-- rol, estado o correo. Pasan el admin, la service role y los triggers internos.
create or replace function public.usuarios_proteger_campos()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.es_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.rol is distinct from old.rol
     or new.activo is distinct from old.activo
     or new.correo is distinct from old.correo then
    raise exception 'Solo un administrador puede cambiar el rol, el estado o el correo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists qpass_usuarios_proteger_campos on public.usuarios;
create trigger qpass_usuarios_proteger_campos
  before update on public.usuarios
  for each row execute function public.usuarios_proteger_campos();

-- ─── 7) El correo de public.usuarios sigue al de auth.users ──────
-- (cuando el usuario confirma un correo nuevo, o el admin lo cambia)
create or replace function public.sincronizar_correo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.usuarios set correo = new.email where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.sincronizar_correo_usuario() from public, anon, authenticated;

drop trigger if exists qpass_sincronizar_correo on auth.users;
create trigger qpass_sincronizar_correo
  after update of email on auth.users
  for each row execute function public.sincronizar_correo_usuario();

-- ─── 8) Políticas de asignaciones_staff ──────────────────────────
alter table public.asignaciones_staff enable row level security;

drop policy if exists "asignaciones_admin_all" on public.asignaciones_staff;
create policy "asignaciones_admin_all" on public.asignaciones_staff
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- El personal ve a qué evento está asignado
drop policy if exists "asignaciones_select_propia" on public.asignaciones_staff;
create policy "asignaciones_select_propia" on public.asignaciones_staff
  for select to authenticated
  using (usuario_id = (select auth.uid()));

-- ─── Variable de entorno necesaria (NO va al repo) ───────────────
-- Crear y eliminar cuentas usa la service role key, solo en el servidor:
--   .env.local →  SUPABASE_SERVICE_ROLE_KEY=...   (Supabase → Project Settings → API)
