-- QPass · Dev D · Políticas RLS de LECTURA para compras y entradas
-- Ejecutar en Supabase → SQL Editor (o `supabase db push` si usan migraciones).

alter table public.compras  enable row level security;
alter table public.entradas enable row level security;

-- Idempotente: se puede ejecutar más de una vez
drop policy if exists "compras_select_propias"  on public.compras;
drop policy if exists "entradas_select_propias" on public.entradas;

-- Un usuario solo ve las compras que él realizó
create policy "compras_select_propias"
  on public.compras
  for select
  to authenticated
  using (comprador_id = (select auth.uid()));

-- Un usuario ve las entradas que le pertenecen (destino) o las de sus compras
-- (cubre "compra para otra persona": el comprador sigue viendo la entrada que regaló)
create policy "entradas_select_propias"
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

-- Índices para que las políticas no hagan full scans
create index if not exists idx_compras_comprador  on public.compras (comprador_id);
create index if not exists idx_entradas_destino   on public.entradas (usuario_destino_id);
create index if not exists idx_entradas_compra    on public.entradas (compra_id);

-- tipos_ticket y eventos deben ser legibles para el join (si aún no lo son):
-- alter table public.eventos      enable row level security;
-- alter table public.tipos_ticket enable row level security;
-- create policy "eventos_select_todos"      on public.eventos      for select to authenticated using (true);
-- create policy "tipos_ticket_select_todos" on public.tipos_ticket for select to authenticated using (true);
