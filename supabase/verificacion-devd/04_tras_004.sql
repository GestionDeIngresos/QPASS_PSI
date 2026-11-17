-- Solo lectura. Incluye corrección HU61; no sustituye aceptación en clon ni revisión de 003.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='3s';
select 'service_role sin TRUNCATE/TRIGGER sobre cabecera o lineas' prueba,
  not has_table_privilege('service_role','public.ventas','TRUNCATE')
  and not has_table_privilege('service_role','public.venta_items','TRUNCATE')
  and not has_table_privilege('service_role','public.ventas','TRIGGER')
  and not has_table_privilege('service_role','public.venta_items','TRIGGER') correcto;
select 'service_role no puede desactivar triggers como administrador' prueba,
  not exists(select 1 from pg_roles where rolname='service_role' and rolsuper)
  and not has_parameter_privilege('service_role','session_replication_role','SET')
  and not pg_has_role('service_role','postgres','SET')
  and not pg_has_role('service_role','postgres','USAGE') correcto;
with esperadas(firma) as (values
  ('public.consultar_catalogo_ayudante(integer)'),('public.consultar_saldo_venta(integer,integer,text)'),
  ('public.cobrar_venta(integer,integer,text,jsonb,uuid,numeric)'),('public.consultar_detalle_venta(integer,integer)'),
  ('public.consultar_resumen_ventas(integer)'),('public.consultar_historial_ventas(integer,date,date,integer,text,integer,integer)'))
select e.firma prueba,coalesce(p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
  and 'search_path=""'=any(p.proconfig) and has_function_privilege('authenticated',p.oid,'EXECUTE')
  and not has_function_privilege('anon',p.oid,'EXECUTE')
  and not has_function_privilege('service_role',p.oid,'EXECUTE'),false) correcto
from esperadas e left join pg_proc p on p.oid=to_regprocedure(e.firma);
with internas(firma) as (values('public.devd_venta_visible(integer,integer)'),('public.devd_venta_dto(integer)'),
  ('public.devd_proteger_venta_confirmada()'),('public.devd_mantener_reserva()'),
  ('public.devd_impedir_borrado_financiero()'),('public.devd_proteger_saldo()'),
  ('public.devd_validar_venta_confirmada(public.ventas)'),('public.devd_comprobar_venta_al_cierre()'))
select e.firma||': sin EXECUTE API' prueba,coalesce(not has_function_privilege('authenticated',p.oid,'EXECUTE')
  and not has_function_privilege('anon',p.oid,'EXECUTE')
  and not has_function_privilege('service_role',p.oid,'EXECUTE'),false) correcto
from internas e left join pg_proc p on p.oid=to_regprocedure(e.firma);
select 'triggers venta y lineas habilitados' prueba,count(*)=2 and bool_and(t.tgenabled='O') correcto
from pg_trigger t where (t.tgrelid='public.ventas'::regclass and t.tgname='devd_venta_inmutable')
or (t.tgrelid='public.venta_items'::regclass and t.tgname='devd_items_inmutables');
select 'invariantes diferidos al cierre habilitados' prueba,count(*)=2 and
  bool_and(t.tgenabled='O' and t.tgdeferrable and t.tginitdeferred) correcto
from pg_trigger t where (t.tgrelid='public.ventas'::regclass and t.tgname='devd_venta_coherente_al_cierre')
or (t.tgrelid='public.venta_items'::regclass and t.tgname='devd_items_coherentes_al_cierre');
select 'constraint confirmacion validado' prueba,exists(select 1 from pg_constraint where conrelid='public.ventas'::regclass
  and conname='devd_confirmacion_completa' and contype='c' and convalidated) correcto;
select 'sin ventas confirmadas inconsistentes' prueba,not exists(select 1 from public.ventas v where v.confirmada_en is not null
  and (v.total is distinct from (select sum(i.cantidad*i.precio_unitario) from public.venta_items i where i.venta_id=v.id)
    or v.total::text is distinct from v.respuesta->>'total' or v.id::text is distinct from v.respuesta->>'id'
    or v.respuesta is distinct from public.devd_venta_dto(v.id))) correcto;
select 'sin duplicados de solicitud por cobrador' prueba,not exists(select 1 from public.ventas where solicitud_id is not null
  group by cobrador_id,solicitud_id having count(*)>1) correcto;
rollback;
