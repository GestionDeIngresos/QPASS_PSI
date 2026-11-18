  -- Ejecutar DESPUÉS de 001/002 y ANTES de 003. No repetir 000–002.
  -- No es migración. No habilita negocios, modifica datos ni invoca RPC.
  begin transaction isolation level repeatable read read only;
  set local statement_timeout='30s';
  set local lock_timeout='3s';

  select current_database() base,current_timestamp capturado_en,
    current_setting('transaction_read_only') solo_lectura,current_setting('server_version') version;
  select 'negocios' tabla,count(*) filas from public.negocios
  union all select 'productos',count(*) from public.productos
  union all select 'ayudantes',count(*) from public.ayudantes
  union all select 'saldos_puntos',count(*) from public.saldos_puntos
  union all select 'solicitudes_devolucion',count(*) from public.solicitudes_devolucion
  union all select 'devoluciones',count(*) from public.devoluciones
  union all select 'recargas',count(*) from public.recargas
  union all select 'ventas',count(*) from public.ventas
  union all select 'venta_items',count(*) from public.venta_items;
  select e.estado,count(d.id) solicitudes from
    (values('en_revision'),('aprobada'),('rechazada')) e(estado)
  left join public.solicitudes_devolucion d on d.estado::text=e.estado group by e.estado order by e.estado;

  -- Estas tres puertas deben dar cero antes de 003. No prueban por sí solas que
  -- B no hubiera descontado reservas previamente: eso exige conocer sus escritores.
  select
    (select count(*) from public.devoluciones) devoluciones_heredadas,
    (select count(*) from public.solicitudes_devolucion d where d.estado in ('en_revision','aprobada') and not exists(
      select 1 from public.saldos_puntos s where s.usuario_id=d.usuario_id and s.evento_id=d.evento_id)) reservas_sin_saldo,
    (select count(*) from public.saldos_puntos s where s.saldo<(
      select coalesce(sum(d.monto_solicitado),0) from public.solicitudes_devolucion d
      where d.usuario_id=s.usuario_id and d.evento_id=s.evento_id and d.estado in ('en_revision','aprobada'))) reservas_superiores_saldo;

  select to_regclass('public.negocios_eventos') relacion_propuesta_ya_existente,
    exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='saldos_puntos' and column_name='reservado') reservado_ya_existente;
  select c.table_name,c.column_name,c.data_type,c.numeric_precision,c.numeric_scale
  from information_schema.columns c where c.table_schema='public' and
    ((c.table_name='productos' and c.column_name='precio') or (c.table_name='saldos_puntos' and c.column_name='saldo')
    or (c.table_name='negocios' and c.column_name like '%evento%')) order by c.table_name,c.ordinal_position;

  select count(*) asignaciones_comerciales_activas,
    count(*) filter(where n.estado and u.activo and u.rol='ayudante'
      and exists(select 1 from public.asignaciones_staff s where s.usuario_id=a.usuario_id and s.rol_staff='ayudante'))
      con_negocio_cuenta_rol_y_staff_validos
  from public.ayudantes a join public.negocios n on n.id=a.negocio_id join public.usuarios u on u.id=a.usuario_id
  where a.activo;

  -- RLS/ACL y triggers actuales: revisar cualquier diferencia con el catálogo.
  select c.relname,pg_get_userbyid(c.relowner) propietario,c.relrowsecurity,c.relforcerowsecurity,c.relacl
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in
    ('negocios','productos','ayudantes','ventas','venta_items','saldos_puntos','solicitudes_devolucion','devoluciones','recargas') order by c.relname;
  select * from pg_policies where schemaname='public' and tablename in
    ('negocios','productos','ayudantes','ventas','venta_items','saldos_puntos','solicitudes_devolucion','devoluciones','recargas')
  order by tablename,policyname;
  select c.relname,x.conname,x.convalidated,pg_get_constraintdef(x.oid) definicion
  from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('saldos_puntos','productos','ayudantes','ventas','venta_items','solicitudes_devolucion','devoluciones')
  order by c.relname,x.conname;
  select tablename,indexname,indexdef from pg_indexes where schemaname='public'
  and tablename in ('saldos_puntos','productos','ayudantes','ventas','venta_items','solicitudes_devolucion','devoluciones')
  order by tablename,indexname;
  select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definicion
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal and c.relname in
    ('ventas','venta_items','saldos_puntos','solicitudes_devolucion','devoluciones','recargas') order by c.relname,t.tgname;

  -- Catálogo anterior: cero funciones con referencias a estos objetos. Detecta
  -- candidatos nuevos, incluidos internos no expuestos en OpenAPI. Inspeccionar
  -- su cuerpo con el inventario 00 si aparece alguno; no inferir semántica del nombre.
  select p.proname,pg_get_function_identity_arguments(p.oid) firma,
    pg_get_userbyid(p.proowner) propietario,p.prosecdef,p.proconfig,
    encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') cuerpo_sha256
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and not exists(
    select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and (case when p.prokind='f' then pg_get_functiondef(p.oid) else '' end)
      ~* '\m(saldos_puntos|solicitudes_devolucion|devoluciones|venta_items)\M'
  order by p.proname;
  rollback;
