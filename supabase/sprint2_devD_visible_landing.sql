-- QPass · Sprint 2 · Dev D
-- Ocultar eventos de todas las secciones públicas de la Landing sin despublicarlos.
-- Seguro de volver a ejecutar. No altera filas existentes ni modifica políticas RLS.

alter table public.eventos
  add column if not exists visible_landing boolean not null default true;

-- La visibilidad puede leerse públicamente y cambiarse por usuarios autenticados.
-- RLS sigue aplicando: eventos publicados para lectura y public.es_admin() para edición.
grant select (visible_landing) on public.eventos to anon, authenticated;
grant update (visible_landing) on public.eventos to authenticated;
