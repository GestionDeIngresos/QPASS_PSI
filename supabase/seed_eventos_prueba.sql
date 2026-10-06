-- ════════════════════════════════════════════════════════════════
-- QPass · Datos de PRUEBA para verificar la vista pública
-- Todos los títulos empiezan con "[TEST]" para borrarlos fácil (ver final).
-- Fechas relativas a "ahora", así nunca caducan.
-- Listo para pegar y ejecutar: NO hay que editar nada.
-- ════════════════════════════════════════════════════════════════

-- ─── ZONA EDITABLE ──────────────────────────────────────────────
-- El organizador de los eventos de prueba es el usuario más antiguo de
-- public.usuarios. Si prefieres otro, cambia la subconsulta
--   (select id from public.usuarios order by creado_en limit 1)
-- por:  'tu-uuid-aqui'
-- categorias_evento.estado es BOOLEAN en tu BD: true = activa.
-- ────────────────────────────────────────────────────────────────

-- ─── Categorías ─────────────────────────────────────────────────
insert into public.categorias_evento (nombre, descripcion, estado)
values
  ('[TEST] Música electrónica', 'Techno, house y más', true),
  ('[TEST] Conciertos',         'Bandas en vivo',      true);

-- ─── Eventos: 3 publicados próximos, 1 publicado pasado y 2 que NO deben verse ───
insert into public.eventos
  (organizador_id, categoria_id, titulo, descripcion, ubicacion, fecha_evento, tipo_acceso, estado, destacado_carrusel)
values
  ((select id from public.usuarios order by creado_en limit 1),
   (select id from public.categorias_evento where nombre = '[TEST] Música electrónica'),
   '[TEST] Neon Nights', E'Una noche de luces de neón y techno melódico.\nDJs residentes e invitados especiales.',
   'Phono Club, Cochabamba', now() + interval '10 days', 'qr_fisico', 'publicado', true),

  ((select id from public.usuarios order by creado_en limit 1),
   (select id from public.categorias_evento where nombre = '[TEST] Música electrónica'),
   '[TEST] Electro Fest', 'Festival de música electrónica al aire libre.',
   'Parque Demetrio Canelas, Cochabamba', now() + interval '25 days', 'qr_digital', 'publicado', false),

  ((select id from public.usuarios order by creado_en limit 1),
   (select id from public.categorias_evento where nombre = '[TEST] Conciertos'),
   '[TEST] Rock en el Valle', 'Las mejores bandas locales en un solo escenario.',
   'Coliseo del Valle, Cochabamba', now() + interval '40 days', 'qr_digital', 'publicado', false),

  ((select id from public.usuarios order by creado_en limit 1),
   (select id from public.categorias_evento where nombre = '[TEST] Música electrónica'),
   '[TEST] Winter Bass', 'Edición pasada (debe aparecer como Finalizado, sin tickets).',
   'Razzmatazz, Cochabamba', now() - interval '30 days', 'qr_fisico', 'publicado', false),

  ((select id from public.usuarios order by creado_en limit 1),
   (select id from public.categorias_evento where nombre = '[TEST] Conciertos'),
   '[TEST] Evento Borrador', 'NO debe verse en la vista pública.',
   'Lugar secreto', now() + interval '15 days', 'qr_digital', 'borrador', false),

  ((select id from public.usuarios order by creado_en limit 1),
   (select id from public.categorias_evento where nombre = '[TEST] Conciertos'),
   '[TEST] Evento Pendiente', 'NO debe verse en la vista pública.',
   'Lugar secreto', now() + interval '20 days', 'qr_digital', 'pendiente_aprobacion', false);

-- ─── Tickets (precio / cupo variados para ver "Agotado", "¡Quedan N!" y "N disponibles") ───
insert into public.tipos_ticket (evento_id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario)
select id, 'General Access', 'Acceso a la pista principal + consumición mínima', 25, 100, 4
from public.eventos where titulo = '[TEST] Neon Nights';

insert into public.tipos_ticket (evento_id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario)
select id, 'VIP Pass (Backstage)', 'Acceso preferente sin colas, zona VIP y backstage', 50, 8, 2
from public.eventos where titulo = '[TEST] Neon Nights';

insert into public.tipos_ticket (evento_id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario)
select id, 'Preventa', 'Precio especial de lanzamiento', 30, 0, 4
from public.eventos where titulo = '[TEST] Electro Fest';

insert into public.tipos_ticket (evento_id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario)
select id, 'Platea', 'Ubicación numerada', 60, 40, 6
from public.eventos where titulo = '[TEST] Electro Fest';

insert into public.tipos_ticket (evento_id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario)
select id, 'Entrada general', null, 20, 200, 5
from public.eventos where titulo = '[TEST] Rock en el Valle';

-- Ticket de un evento NO publicado (la política de tipos_ticket debe ocultarlo)
insert into public.tipos_ticket (evento_id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario)
select id, 'Ticket oculto', 'No debe ser visible para el público', 99, 10, 1
from public.eventos where titulo = '[TEST] Evento Borrador';

-- ─── LIMPIEZA (ejecutar cuando termines de probar) ──────────────
-- delete from public.tipos_ticket where evento_id in (select id from public.eventos where titulo like '[TEST]%');
-- delete from public.eventos where titulo like '[TEST]%';
-- delete from public.categorias_evento where nombre like '[TEST]%';