-- Solo lectura. Ejecutar después de 000 y ANTES de 001.
-- Todas las filas correcto deben ser true. Ejecutar también 90_funciones_originales.sql.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='3s';
select 'esquema previo, sin versiones D aplicadas' prueba,
  to_regclass('public.negocios_eventos') is null and
  to_regprocedure('public.comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text)') is null and
  to_regprocedure('public.reportar_entrada_propia(integer,text,uuid)') is null and
  to_regprocedure('public.cobrar_venta(integer,integer,text,jsonb,uuid,numeric)') is null correcto;
select 'RLS existente activado y no forzado' prueba,count(*)=9 and bool_and(c.relrowsecurity and not c.relforcerowsecurity) correcto
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('entradas','reportes_entrada','negocios','productos','ayudantes','ventas','venta_items','saldos_puntos','solicitudes_devolucion');
select 'unicidad real usuario-evento de saldo' prueba,exists(select 1 from pg_constraint
  where conrelid='public.saldos_puntos'::regclass and contype='u' and convalidated
    and pg_get_constraintdef(oid)='UNIQUE (usuario_id, evento_id)') correcto;
-- Estos contadores son puertas de 003, no condiciones de HU9/HU14.
select 'puerta comercial: devoluciones existentes' observacion,count(*) cantidad from public.devoluciones;
select 'puerta comercial: reservas sin saldo' observacion,count(*) cantidad
from public.solicitudes_devolucion d where d.estado in ('en_revision','aprobada') and not exists
  (select 1 from public.saldos_puntos s where s.usuario_id=d.usuario_id and s.evento_id=d.evento_id);
select 'puerta comercial: reservas superiores a saldo' observacion,count(*) cantidad
from public.saldos_puntos s where s.saldo<(select coalesce(sum(d.monto_solicitado),0)
  from public.solicitudes_devolucion d where d.usuario_id=s.usuario_id and d.evento_id=s.evento_id and d.estado in ('en_revision','aprobada'));
-- Volumen y bloqueos: evaluar ventana de mantenimiento; no cancelar sesiones aquí.
select c.relname,pg_total_relation_size(c.oid) bytes from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('entradas','reportes_entrada','ventas','venta_items','saldos_puntos','solicitudes_devolucion');
select pid,state,wait_event_type,wait_event,now()-xact_start duracion_transaccion
from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and xact_start is not null;
rollback;
