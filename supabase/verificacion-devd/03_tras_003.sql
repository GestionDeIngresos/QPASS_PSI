-- Solo lectura; no habilita pares negocio-evento. Esperado correcto=true.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='3s';
select 'ningun negocio habilitado por la migracion' prueba,not exists(select 1 from public.negocios_eventos where activo) correcto;
select 'RLS comercial activo y no forzado' prueba,count(*)=8 and bool_and(c.relrowsecurity and not c.relforcerowsecurity) correcto
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('negocios','productos','ayudantes','negocios_eventos','ventas','venta_items','saldos_puntos','solicitudes_devolucion');
select r.rol||': sin INSERT/UPDATE/DELETE/TRUNCATE de '||t.tabla prueba,
  not has_any_column_privilege(r.rol,'public.'||t.tabla,'INSERT')
  and not has_any_column_privilege(r.rol,'public.'||t.tabla,'UPDATE')
  and not has_table_privilege(r.rol,'public.'||t.tabla,'DELETE')
  and not has_table_privilege(r.rol,'public.'||t.tabla,'TRUNCATE') correcto
from (values('anon'),('authenticated')) r(rol)
cross join (values('negocios'),('productos'),('ayudantes'),('negocios_eventos'),('ventas'),('venta_items'),('saldos_puntos'),('solicitudes_devolucion')) t(tabla);
select 'ninguna reserva mayor al saldo o desincronizada' prueba,not exists(select 1 from public.saldos_puntos s
  where s.saldo<s.reservado or s.reservado<0 or s.reservado is distinct from (select coalesce(sum(d.monto_solicitado),0)
    from public.solicitudes_devolucion d where d.usuario_id=s.usuario_id and d.evento_id=s.evento_id and d.estado in ('en_revision','aprobada'))) correcto;
select 'triggers de reserva activos' prueba,count(*)=3 and bool_and(t.tgenabled='O') correcto from pg_trigger t
where (t.tgrelid='public.solicitudes_devolucion'::regclass and t.tgname in ('devd_reserva','devd_no_borrar_reservas'))
or (t.tgrelid='public.saldos_puntos'::regclass and t.tgname='devd_saldo_claves');
select 'constraint cobertura validado' prueba,exists(select 1 from pg_constraint where conrelid='public.saldos_puntos'::regclass
  and conname='devd_saldo_cubre_reserva' and contype='c' and convalidated) correcto;
select 'indice idempotente por cobrador y solicitud' prueba,exists(select 1 from pg_index i
  where i.indrelid='public.ventas'::regclass and i.indisunique and i.indisvalid and i.indisready
    and i.indpred is null and i.indexprs is null and i.indnkeyatts=2
    and pg_get_indexdef(i.indexrelid,1,true)='cobrador_id'
    and pg_get_indexdef(i.indexrelid,2,true)='solicitud_id') correcto;
-- Solo observación; service_role ES privilegiado. No confundir con clientes web.
select 'service_role' rol,has_table_privilege('service_role','public.productos','UPDATE') actualiza_precio,
  has_table_privilege('service_role','public.saldos_puntos','UPDATE') actualiza_saldo,
  has_table_privilege('service_role','public.ventas','INSERT') inserta_ventas;
rollback;
