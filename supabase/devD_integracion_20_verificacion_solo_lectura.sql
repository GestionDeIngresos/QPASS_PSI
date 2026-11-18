-- QPass · Sprint 3 · Dev D · Verificación previa/posterior (NO aplica migraciones)
-- Ejecutar cada bloque de resultados tras la fase correspondiente. Solo metadatos.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';

-- Tras HU 9/HU 14: existencia Y permisos efectivos. Existir no prueba autorización.
with esperadas(firma) as (values
  ('public.comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text)'),
  ('public.consultar_compra_propia(text)'),
  ('public.reportar_entrada_propia(integer,text,uuid)'),
  ('public.consultar_mis_reportes_entrada()'),
  ('public.comprar_entradas(text,jsonb,text)'),
  ('public.comprar_entradas_prueba(text,jsonb,text,uuid,text)'),
  ('public.identificar_qr(text,integer)'),
  ('public.listar_reportes_admin(text,text,text)'),
  ('public.resolver_reporte_admin(text,integer)')
)
select e.firma,p.oid is not null as existe,pg_get_userbyid(p.proowner) as propietario,
  p.prosecdef as definer,p.proconfig as configuracion,
  case when p.oid is not null then has_function_privilege('anon',p.oid,'execute') end as anon_execute,
  case when p.oid is not null then has_function_privilege('authenticated',p.oid,'execute') end as authenticated_execute
from esperadas e left join pg_proc p on p.oid=to_regprocedure(e.firma);

-- Tras cada migración: comparar políticas/ACL con el inventario previo.
select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
  and c.relname in ('entradas','compras','reportes_entrada','ventas','venta_items','saldos_puntos','solicitudes_devolucion','recargas','devoluciones')
order by c.relname;
select tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in
  ('entradas','compras','reportes_entrada','ventas','venta_items','saldos_puntos','solicitudes_devolucion','recargas','devoluciones')
order by tablename,policyname;

-- Tras HU 14/borrador de históricos: tipos, defaults y nulabilidad exactos.
select table_name,column_name,data_type,is_nullable,column_default,numeric_precision,numeric_scale
from information_schema.columns where table_schema='public' and (
  (table_name='reportes_entrada' and column_name='solicitud_id') or
  (table_name='ventas' and column_name in ('solicitud_id','solicitud_payload','confirmada_en','negocio_nombre_historico','entrada_id','total')) or
  (table_name='venta_items' and column_name in ('producto_nombre_historico','precio_unitario')))
order by table_name,column_name;
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
  and tablename in ('reportes_entrada','ventas') order by tablename,indexname;
select c.conname,pg_get_constraintdef(c.oid),c.convalidated from pg_constraint c
where c.conrelid='public.ventas'::regclass and c.contype='f';

-- Confirmar que no se añadió/modificó un trigger financiero indirectamente.
select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and c.relname in
  ('ventas','venta_items','saldos_puntos','solicitudes_devolucion','recargas','devoluciones','reportes_entrada')
order by c.relname,t.tgname;
rollback;
