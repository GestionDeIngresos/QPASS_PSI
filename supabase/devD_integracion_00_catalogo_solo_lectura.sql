-- QPass · Sprint 3 · Dev D · Inventario completo previo a integración
-- NO ES UNA MIGRACIÓN. Ejecutar con acceso de catálogo autorizado (SQL Editor).
-- Solo metadatos de public. Sin filas de negocio, auth.users, claves ni URLs SMTP.
-- Los cuerpos de funciones deben revisarse localmente antes de compartirlos:
-- un cuerpo heredado podría contener literales sensibles.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

select jsonb_build_object(
  'database', current_database(),
  'capturado_en', current_timestamp,
  'version', current_setting('server_version'),
  'solo_lectura', current_setting('transaction_read_only'),
  'relaciones', (select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', c.relname, 'tipo', c.relkind, 'propietario', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity, 'rls_forzada', c.relforcerowsecurity,
    'acl', c.relacl,
    'columnas', (select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', a.attname, 'tipo', format_type(a.atttypid,a.atttypmod),
      'not_null', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
      'default', pg_get_expr(d.adbin,d.adrelid), 'acl', a.attacl
    ) order by a.attnum),'[]'::jsonb)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', x.conname, 'tipo', x.contype, 'definicion', pg_get_constraintdef(x.oid),
      'validada', x.convalidated, 'diferible', x.condeferrable
    ) order by x.conname),'[]'::jsonb) from pg_constraint x where x.conrelid=c.oid)
  ) order by c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')),
  'indices', (select coalesce(jsonb_agg(to_jsonb(x) order by x.tablename,x.indexname),'[]'::jsonb)
    from pg_indexes x where x.schemaname='public'),
  'politicas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.tablename,x.policyname),'[]'::jsonb)
    from pg_policies x where x.schemaname='public'),
  'permisos_tabla', (select coalesce(jsonb_agg(to_jsonb(x) order by x.table_name,x.grantee,x.privilege_type),'[]'::jsonb)
    from information_schema.table_privileges x where x.table_schema='public'),
  'permisos_columna', (select coalesce(jsonb_agg(to_jsonb(x) order by x.table_name,x.column_name,x.grantee),'[]'::jsonb)
    from information_schema.column_privileges x where x.table_schema='public'),
  'funciones', (select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', p.proname, 'firma', pg_get_function_identity_arguments(p.oid),
    'retorno', pg_get_function_result(p.oid), 'propietario', pg_get_userbyid(p.proowner),
    'definer', p.prosecdef, 'volatilidad', p.provolatile, 'configuracion', p.proconfig,
    'acl', p.proacl, 'definicion', pg_get_functiondef(p.oid),
    'anon_execute', has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute', has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) order by p.proname,p.oid),'[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind in ('f','p') and not exists (
      select 1 from pg_depend e where e.classid='pg_proc'::regclass and e.objid=p.oid and e.deptype='e')),
  'triggers', (select coalesce(jsonb_agg(jsonb_build_object(
    'tabla', c.relname, 'nombre', t.tgname, 'habilitado', t.tgenabled,
    'definicion', pg_get_triggerdef(t.oid), 'funcion', t.tgfoid::regprocedure::text
  ) order by c.relname,t.tgname),'[]'::jsonb)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal),
  'enums', (select coalesce(jsonb_agg(jsonb_build_object('tipo',t.typname,'valor',e.enumlabel) order by t.typname,e.enumsortorder),'[]'::jsonb)
    from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'),
  'vistas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.viewname),'[]'::jsonb)
    from pg_views x where x.schemaname='public'),
  'dependencias', (select coalesce(jsonb_agg(jsonb_build_object(
    'objeto', pg_describe_object(d.classid,d.objid,d.objsubid),
    'depende_de', pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid), 'tipo',d.deptype
  )),'[]'::jsonb) from pg_depend d where d.refclassid='pg_class'::regclass and d.refobjid in (
    select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
      and c.relname in ('ventas','venta_items','saldos_puntos','solicitudes_devolucion','devoluciones','recargas','negocios','productos','ayudantes','entradas','compras','reportes_entrada'))),
  'default_acl', (select coalesce(jsonb_agg(jsonb_build_object(
    'propietario',pg_get_userbyid(a.defaclrole),'tipo',a.defaclobjtype,'acl',a.defaclacl
  )),'[]'::jsonb) from pg_default_acl a left join pg_namespace n on n.oid=a.defaclnamespace where n.nspname='public' or a.defaclnamespace=0)
) as catalogo_qpass;

rollback;
