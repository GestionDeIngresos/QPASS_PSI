-- Solo lectura. Ejecutar después de 001; toda fila correcto=true.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='3s';
select 'RPC HU9: propietario, search_path y EXECUTE' prueba,
  count(*)=2 and bool_and(p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
    and coalesce('search_path=""'=any(p.proconfig),false)
    and has_function_privilege('authenticated',p.oid,'EXECUTE')
    and not has_function_privilege('anon',p.oid,'EXECUTE')) correcto
from pg_proc p where p.oid in (to_regprocedure('public.comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text)'),
  to_regprocedure('public.consultar_compra_propia(text)'));
select 'limite restrictivo del destinatario' prueba,exists(select 1 from pg_policies
  where schemaname='public' and tablename='entradas' and policyname='devd_entradas_destinatario_limite'
  and permissive='RESTRICTIVE' and cmd='SELECT' and roles=array['authenticated']::name[]
  and qual like '%usuario_destino_id%' and qual like '%activo%') correcto;
select 'politica anterior ya no consulta al comprador' prueba,exists(select 1 from pg_policies
  where schemaname='public' and tablename='entradas' and policyname='entradas_select_comprador_o_destinatario'
  and qual not like '%comprador_id%' and qual like '%usuario_destino_id%') correcto;
select 'sin escritura directa de entradas' prueba,
  not has_any_column_privilege('authenticated','public.entradas','INSERT')
  and not has_any_column_privilege('authenticated','public.entradas','UPDATE')
  and not has_table_privilege('authenticated','public.entradas','DELETE')
  and not has_table_privilege('authenticated','public.entradas','TRUNCATE') correcto;
-- Permiso por columna para usuarios normales: la visibilidad efectiva la determina RLS.
select 'lectura directa QR conservada para destinatario via RLS' prueba,
  has_column_privilege('authenticated','public.entradas','codigo_qr','SELECT') correcto;
rollback;
