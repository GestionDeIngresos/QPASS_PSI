-- ════════════════════════════════════════════════════════════════
-- QPass · Sprint 1 · Dev B
-- Lectura PÚBLICA (rol anon + usuarios logueados) de eventos, categorías y tickets.
-- Ejecutar UNA vez en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
-- ════════════════════════════════════════════════════════════════

-- ─── 1) EVENTOS: solo los publicados ────────────────────────────
alter table public.eventos enable row level security;

drop policy if exists "eventos_select_publicados" on public.eventos;
create policy "eventos_select_publicados"
  on public.eventos
  for select
  to anon, authenticated
  using (estado = 'publicado');

-- ─── 2) CATEGORÍAS: lectura abierta (solo nombre/descripcion) ───
alter table public.categorias_evento enable row level security;

drop policy if exists "categorias_evento_select_publico" on public.categorias_evento;
create policy "categorias_evento_select_publico"
  on public.categorias_evento
  for select
  to anon, authenticated
  using (true);
  -- Si tu columna "estado" marca categorías activas, cambia "true" por la condición real,
  -- ej.:  using (estado = 'activa')   ← ajusta al valor que uses

-- ─── 3) TIPOS DE TICKET: solo los de eventos publicados ─────────
alter table public.tipos_ticket enable row level security;

drop policy if exists "tipos_ticket_select_de_eventos_publicados" on public.tipos_ticket;
create policy "tipos_ticket_select_de_eventos_publicados"
  on public.tipos_ticket
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.eventos e
      where e.id = tipos_ticket.evento_id
        and e.estado = 'publicado'
    )
  );

-- ─── 4) Permisos de tabla (RLS filtra filas; GRANT permite entrar) ─
-- Solo SELECT: no se da ningún permiso de escritura al público.
grant select on public.eventos          to anon, authenticated;
grant select on public.categorias_evento to anon, authenticated;
grant select on public.tipos_ticket     to anon, authenticated;

-- ─── 5) (Opcional) Índices para que el listado siga rápido ──────
create index if not exists idx_eventos_estado_fecha on public.eventos (estado, fecha_evento);
create index if not exists idx_eventos_categoria    on public.eventos (categoria_id);
create index if not exists idx_tipos_ticket_evento  on public.tipos_ticket (evento_id);

-- NOTA: las políticas de Postgres se SUMAN (OR). Si tus compañeros crean después
-- políticas para organizadores/admin (ver borradores propios, editar, etc.),
-- no pisan estas: el público seguirá viendo únicamente lo publicado.
