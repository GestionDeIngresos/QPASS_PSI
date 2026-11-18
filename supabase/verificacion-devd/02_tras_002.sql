-- Solo lectura. Después de 002; ejecutar además 90 para probar que Admin A no cambió.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='3s';
select 'solicitud de reporte UUID nullable' prueba,exists(select 1 from information_schema.columns
  where table_schema='public' and table_name='reportes_entrada' and column_name='solicitud_id'
    and data_type='uuid' and is_nullable='YES') correcto;
select 'indice idempotente valido y exacto' prueba,exists(select 1 from pg_index i
  where i.indrelid='public.reportes_entrada'::regclass and i.indisunique and i.indisvalid and i.indisready
    and i.indpred is null and i.indexprs is null and i.indnkeyatts=2
    and pg_get_indexdef(i.indexrelid,1,true)='usuario_id'
    and pg_get_indexdef(i.indexrelid,2,true)='solicitud_id') correcto;
select 'RPC HU14: propietario, search_path y EXECUTE' prueba,
  count(*)=2 and bool_and(p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
    and coalesce('search_path=""'=any(p.proconfig),false)
    and has_function_privilege('authenticated',p.oid,'EXECUTE')
    and not has_function_privilege('anon',p.oid,'EXECUTE')) correcto
from pg_proc p where p.oid in (to_regprocedure('public.reportar_entrada_propia(integer,text,uuid)'),
  to_regprocedure('public.consultar_mis_reportes_entrada()'));
select 'reportes solo por RPC, sin lectura o escritura directa' prueba,
  not has_any_column_privilege('authenticated','public.reportes_entrada','SELECT')
  and not has_any_column_privilege('authenticated','public.reportes_entrada','INSERT')
  and not has_any_column_privilege('authenticated','public.reportes_entrada','UPDATE')
  and not has_table_privilege('authenticated','public.reportes_entrada','DELETE') correcto;
select 'Admin A mantiene ejecucion' prueba,
  has_function_privilege('authenticated','public.listar_reportes_admin(text,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.resolver_reporte_admin(text,integer)','EXECUTE') correcto;
select 'reportar no instala triggers sobre entradas/reportes' prueba,
  not exists(select 1 from pg_trigger where not tgisinternal
    and tgrelid in ('public.entradas'::regclass,'public.reportes_entrada'::regclass)) correcto;
rollback;
