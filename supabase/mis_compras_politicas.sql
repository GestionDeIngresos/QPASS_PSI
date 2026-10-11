-- ════════════════════════════════════════════════════════════════
-- QPass · Sprint 1 · Dev D (Mis Compras / Confirmación)
-- RLS de LECTURA para compras y entradas.
-- Usa los MISMOS nombres de política que supabase/compras_politicas_y_funcion.sql (Dev C):
-- si ya ejecutaron ese archivo, correr este es inofensivo (no duplica nada).
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ════════════════════════════════════════════════════════════════

alter table public.compras  enable row level security;
alter table public.entradas enable row level security;

-- Un usuario solo ve las compras que él realizó
drop policy if exists "compras_select_propias" on public.compras;
create policy "compras_select_propias"
  on public.compras
  for select
  to authenticated
  using (comprador_id = (select auth.uid()));

-- Un usuario ve las entradas que le pertenecen (destinatario) o las de sus compras
drop policy if exists "entradas_select_comprador_o_destinatario" on public.entradas;
create policy "entradas_select_comprador_o_destinatario"
  on public.entradas
  for select
  to authenticated
  using (
    usuario_destino_id = (select auth.uid())
    or exists (
      select 1 from public.compras c
      where c.id = entradas.compra_id
        and c.comprador_id = (select auth.uid())
    )
  );

grant select on public.compras  to authenticated;
grant select on public.entradas to authenticated;

-- Índices para que las políticas no hagan full scans
create index if not exists idx_compras_comprador on public.compras (comprador_id);
create index if not exists idx_entradas_destino  on public.entradas (usuario_destino_id);
create index if not exists idx_entradas_compra   on public.entradas (compra_id);
