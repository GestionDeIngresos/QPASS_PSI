-- ════════════════════════════════════════════════════════════════
-- QPass · Sprint 2 · Dev A · DATOS DE PRUEBA para /admin/solicitudes
-- Requisito: haber corrido sprint2_devA_admin_eventos.sql y tener ≥1 usuario registrado.
-- Idempotente (no duplica). Para limpiar:
--   delete from public.eventos where titulo like '[Prueba] %';
-- ════════════════════════════════════════════════════════════════
do $$
declare
  u uuid;
  e integer;
  r record;
begin
  select id into u from public.usuarios order by creado_en limit 1;
  if u is null then
    raise exception 'Primero registra al menos un usuario desde la app.';
  end if;

  for r in
    select * from (values
      ('[Prueba] Neon Nights Festival 2026',        'en_revision', 'pendiente_aprobacion', 10, 12),
      ('[Prueba] Glow Party Electronic Night',      'aprobada',    'aprobado',             20, 21),
      ('[Prueba] Summer Fest Sunset Session',       'aprobada',    'aprobado',             30, 32),
      ('[Prueba] Underground Techno Basement',      'rechazada',   'borrador',             40, 41)
    ) as t(titulo, est_sol, est_evt, dias_ini, dias_fin)
  loop
    select id into e from public.eventos where titulo = r.titulo;
    if e is null then
      insert into public.eventos (organizador_id, titulo, descripcion, ubicacion, fecha_evento, fecha_fin, tipo_acceso, estado)
      values (u, r.titulo, 'Evento de prueba para el panel de Admin.', 'Av. América esq. Pando, Cochabamba',
              now() + make_interval(days => r.dias_ini), now() + make_interval(days => r.dias_fin),
              'qr_digital', r.est_evt::public.estado_evento)
      returning id into e;

      insert into public.solicitudes_organizador (usuario_id, estado, evento_id, revisado_en)
      values (u, r.est_sol::public.estado_solicitud, e, case when r.est_sol = 'en_revision' then null else now() end);

      if r.est_sol = 'aprobada' then
        insert into public.tipos_ticket (evento_id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario)
        values (e, 'General', 'Acceso general a todas las zonas.', 15, 500, 4),
               (e, 'VIP',     'Acceso preferencial y barra libre.', 30, 100, 2);
      end if;
    end if;
  end loop;
end $$;
