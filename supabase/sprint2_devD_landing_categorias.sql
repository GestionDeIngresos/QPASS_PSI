-- ════════════════════════════════════════════════════════════════
-- QPass · Sprint 2 · Dev D
-- Landing pública (HU 1) · Carrusel (HU 25) · Categorías (HU 35)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
-- REQUIERE haber ejecutado antes sprint2_devA_admin_eventos.sql (usa public.es_admin()).
-- ════════════════════════════════════════════════════════════════

-- ─── 1) Columna del carrusel (por si no existiera) ───────────────
alter table public.eventos
  add column if not exists destacado_carrusel boolean not null default false;

-- Índice parcial: la Landing solo busca los destacados
create index if not exists idx_eventos_carrusel
  on public.eventos (fecha_evento)
  where destacado_carrusel = true and estado = 'publicado';

-- ─── 2) Categorías: el PÚBLICO solo ve las ACTIVAS (estado = true) ───
alter table public.categorias_evento enable row level security;

drop policy if exists "categorias_evento_select_publico" on public.categorias_evento;
create policy "categorias_evento_select_publico"
  on public.categorias_evento
  for select
  to anon, authenticated
  using (estado = true);

-- ─── 3) Categorías: el ADMIN puede ver todas, crear, editar y eliminar ───
grant select on public.categorias_evento to anon, authenticated;
grant insert, update, delete on public.categorias_evento to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "categorias_evento_admin_all" on public.categorias_evento;
create policy "categorias_evento_admin_all"
  on public.categorias_evento
  for all
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Evita nombres de categoría repetidos (sin importar mayúsculas)
create unique index if not exists uq_categorias_evento_nombre
  on public.categorias_evento (lower(nombre));

-- ─── 4) Eventos: el admin ya edita todo con "eventos_admin_all" (Dev A).
--        La Landing lee con "eventos_select_publicados" (Sprint 1). Nada más que hacer.

-- ─── (Opcional) Datos de prueba: marca 4 eventos publicados como destacados ───
-- update public.eventos set destacado_carrusel = true
--  where id in (select id from public.eventos where estado = 'publicado' order by fecha_evento limit 4);
