-- QPass Dev B: resumen ANTES de aplicar 202611170001_devb_saldos.sql.
-- Ejecutar COMPLETO en SQL Editor como postgres. Devuelve UNA sola tabla.
-- Una sola sentencia WITH ... SELECT: sin DDL, DML, DO, RPC de aplicación,
-- tablas/funciones temporales ni cambios de sesión/transacción.
-- query_to_xml ejecuta EXCLUSIVAMENTE los SELECT agregados escritos abajo,
-- y solo si existen columnas compatibles y acceso sin filtrado RLS.
-- No devuelve nombres, correos, UUID, QR, rutas de imágenes ni saldos individuales.
-- La ausencia del historial CLI no demuestra ausencia de migraciones manuales.
-- OK no autoriza el despliegue: resolver BLOQUEOS y revisar ADVERTENCIAS con A/C/D.
-- Ver todas las filas (más de 180); aumentar el límite de resultados si la interfaz lo recorta.
-- RESUMEN_GENERAL aparece primero, luego BLOQUEOS, ADVERTENCIAS y OK.
-- cantidad NULL es normal en reglas de catálogo; "NO EVALUADO" siempre es BLOQUEO.
-- Referencia de query_to_xml: https://www.postgresql.org/docs/17/functions-xml.html

with
-- Se buscan OID por catálogo, sin resolver nombres mediante regclass/regprocedure:
-- así un esquema sin USAGE también genera filas de diagnóstico y no una excepción.
relaciones as (
  select n.nspname esquema_rel,c.relname tabla_rel,n.nspname||'.'||c.relname nombre_rel,c.oid oid_rel
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','auth','storage','supabase_migrations')
),
funciones_catalogo as (
  select n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')' firma_catalogo,
    p.oid oid_funcion
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth')
),
requeridas(esquema,tabla,especificacion) as (values
  ('public','usuarios','id|uuid;rol|rol_usuario;activo|boolean;nombre|texto'),
  ('public','eventos','id|integer;titulo|texto;estado|estado;fecha_fin|timestamp with time zone'),
  ('public','asignaciones_staff','id|integer;usuario_id|uuid;evento_id|integer;rol_staff|rol_usuario'),
  ('public','compras','id|integer;estado_pago|estado'),
  ('public','tipos_ticket','id|integer;evento_id|integer'),
  ('public','entradas','id|integer;compra_id|integer;tipo_ticket_id|integer;usuario_destino_id|uuid;codigo_qr|texto;estado|estado'),
  ('public','lotes_qr_fisico','id|integer;evento_id|integer'),
  ('public','vinculos_qr_fisico','id|integer;lote_id|integer;entrada_id|integer;codigo_qr|texto;usuario_id|uuid'),
  ('public','saldos_puntos','id|integer;usuario_id|uuid;evento_id|integer;saldo|numeric(10,2);reservado|numeric(10,2)'),
  ('public','recargas','id|integer;recargador_id|uuid;usuario_id|uuid;evento_id|integer;monto|numeric(10,2);creado_en|timestamp with time zone'),
  ('public','devoluciones','id|integer;usuario_id|uuid;encargado_id|uuid;solicitud_id|integer;monto|numeric(10,2);comprobante_url|texto;foto_usuario_url|texto;procesado_en|timestamp with time zone'),
  ('public','reportes_recarga','id|integer;usuario_id|uuid;recarga_id|integer;descripcion|texto;estado|estado;creado_en|timestamp with time zone'),
  ('public','solicitudes_devolucion','id|integer;usuario_id|uuid;evento_id|integer;monto_solicitado|numeric(10,2);qr_bancario_url|texto;estado|estado;creado_en|timestamp with time zone'),
  ('public','devc_parametros','clave|texto;valor|integer'),
  ('storage','objects','bucket_id|texto;name|texto'),
  ('storage','buckets','id|texto;name|texto;public|boolean;file_size_limit|bigint;allowed_mime_types|text[]'),
  ('auth','users','id|uuid')
),
columnas as (
  select r.esquema,r.tabla,split_part(e,'|',1) columna,split_part(e,'|',2) tipo_esperado
  from requeridas r cross join lateral unnest(string_to_array(r.especificacion,';')) e
),
columnas_estado as (
  select x.*,a.attnum is not null presente,format_type(a.atttypid,a.atttypmod) tipo_actual,
    coalesce(case
      when x.tipo_esperado='texto' then t.typcategory='S'
      when x.tipo_esperado='estado' then t.typcategory in ('S','E')
      when x.tipo_esperado='rol_usuario' then a.atttypid=(select rt.oid from pg_type rt join pg_namespace rn on rn.oid=rt.typnamespace where rn.nspname='public' and rt.typname='rol_usuario')
      else format_type(a.atttypid,a.atttypmod)=x.tipo_esperado end,false) compatible
  from columnas x
  left join pg_attribute a on a.attrelid=(select oid_rel from relaciones where esquema_rel=x.esquema and tabla_rel=x.tabla)
    and a.attname=x.columna and a.attnum>0 and not a.attisdropped
  left join pg_type t on t.oid=a.atttypid
),
tablas_estado as (
  select r.esquema||'.'||r.tabla nombre,c.oid,c.relkind,
    coalesce(c.relkind in ('r','p'),false) es_tabla,
    (select bool_and(x.presente and x.compatible) from columnas_estado x
      where x.esquema=r.esquema and x.tabla=r.tabla) columnas_validas,
    coalesce(has_schema_privilege(n.oid,'USAGE') and has_table_privilege(c.oid,'SELECT')
      and (not c.relrowsecurity or rol.rolsuper or rol.rolbypassrls
        or (c.relowner=rol.oid and not c.relforcerowsecurity)),false) lectura_completa,
    c.relrowsecurity,c.relforcerowsecurity
  from requeridas r left join pg_class c on c.oid=(select oid_rel from relaciones where esquema_rel=r.esquema and tabla_rel=r.tabla)
  left join pg_namespace n on n.oid=c.relnamespace
  join pg_roles rol on rol.rolname=current_user
),
-- Firmas y nombres de argumentos: ambos importan para PostgREST.
-- Las cuatro últimas funciones de C no son prerrequisitos estrictos de B,
-- pero permiten revisar la integración completa de negocios/ayudantes.
firmas(firma,retorno,argumentos,estricta,acl_heredada) as (values
  ('public.es_admin()','boolean','',true,false),
  ('public.qpass_autorizado_evento(integer,text[])','boolean','p_evento,p_roles',true,false),
  ('public.identificar_qr(text,integer)','jsonb','p_codigo,p_evento',true,true),
  ('public.devd_mantener_reserva()','trigger','',true,false),
  ('public.comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text)','jsonb','p_evento_id,p_lineas,p_correo_destino,p_solicitud_id,p_resultado',true,false),
  ('public.reportar_entrada_propia(integer,text,uuid)','integer','p_entrada,p_descripcion,p_solicitud',true,false),
  ('public.cobrar_venta(integer,integer,text,jsonb,uuid,numeric)','jsonb','p_evento,p_negocio,p_codigo,p_lineas,p_solicitud,p_total_esperado',true,false),
  ('public.listar_reportes_admin(text,text,text)','record','p_tipo,p_estado,p_busqueda',true,false),
  ('public.resolver_reporte_admin(text,integer)','boolean','p_tipo,p_id',true,false),
  ('public.crear_solicitud_devolucion(integer,numeric,text)','integer','p_evento,p_monto,p_qr_ruta',true,true),
  ('public.devc_mis_solicitudes_devolucion()','jsonb','',true,true),
  ('public.devc_eventos_devolucion_cliente()','jsonb','',true,false),
  ('public.devc_eventos_encargado()','jsonb','',true,false),
  ('public.listar_solicitudes_devolucion(integer,text)','jsonb','p_evento,p_estado',true,false),
  ('public.rechazar_solicitud_devolucion(integer)','void','p_solicitud',true,false),
  ('public.devc_dueno_activo()','boolean','',false,false),
  ('public.devc_es_dueno(integer)','boolean','p_negocio',false,false),
  ('public.crear_negocio(text,text)','integer','p_nombre,p_descripcion',false,false),
  ('public.vincular_ayudante(uuid,integer[])','void','p_usuario,p_negocios',false,false)
),
funciones_estado as (
  select f.*,p.oid,p.prokind,p.prosecdef,p.proretset,p.proname,
    format_type(p.prorettype,null) retorno_actual,
    coalesce(p.proargnames[1:p.pronargs],array[]::text[]) nombres_actuales,
    pg_get_userbyid(p.proowner) propietario,
    coalesce(p.proconfig @> array['search_path=""'],false) ruta_vacia,
    coalesce(has_function_privilege((select oid from pg_roles where rolname='authenticated'),p.oid,'EXECUTE'),false) auth_execute,
    coalesce(has_function_privilege((select oid from pg_roles where rolname='anon'),p.oid,'EXECUTE'),false) anon_execute,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))
      where grantee=0 and privilege_type='EXECUTE') public_execute
  from firmas f left join pg_proc p on p.oid=(select oid_funcion from funciones_catalogo where firma_catalogo=f.firma)
),
marcas as (
  select exists(select 1 from pg_attribute where attrelid=(select oid_rel from relaciones where nombre_rel='public.solicitudes_devolucion')
    and attname='liquidada_en' and not attisdropped and atttypid='timestamptz'::regtype) liquidada,
    exists(select 1 from pg_attribute where attrelid=(select oid_rel from relaciones where nombre_rel='public.solicitudes_devolucion')
    and attname='cancelada_en' and not attisdropped and atttypid='timestamptz'::regtype) cancelada,
    exists(select 1 from pg_attribute where attrelid=(select oid_rel from relaciones where nombre_rel='public.recargas')
    and attname='puntos' and not attisdropped and atttypid='numeric'::regtype) puntos,
    exists(select 1 from pg_attribute where attrelid=(select oid_rel from relaciones where nombre_rel='public.recargas')
    and attname='tasa' and not attisdropped and atttypid='numeric'::regtype) tasa,
    exists(select 1 from pg_attribute where attrelid=(select oid_rel from relaciones where nombre_rel='public.devoluciones')
    and attname='evento_id' and not attisdropped and atttypid='integer'::regtype) evento_devolucion
),
-- Cada consulta devuelve solo un contador n. Si faltan columnas/permisos, no se ejecuta.
-- No se ejecutan definiciones SQL procedentes de datos del usuario.
datos(id,tablas,consulta,con_casos,descripcion,accion) as (
  select v.* from marcas m cross join lateral (values
  ('DATOS_SALDOS_DUPLICADOS',array['public.saldos_puntos'],
    'select count(*) as n from (select 1 from public.saldos_puntos group by usuario_id,evento_id having count(*)>1) x',
    'BLOQUEO','Pares usuario/evento con más de un saldo.',
    'Conciliar duplicados con D/B sin borrar ni fusionar automáticamente.'),
  ('DATOS_SALDOS_INVALIDOS',array['public.saldos_puntos'],
    'select count(*) as n from public.saldos_puntos where usuario_id is null or evento_id is null or saldo is null or reservado is null or saldo<0 or reservado<0 or saldo<reservado or saldo::text in (''NaN'',''Infinity'',''-Infinity'') or reservado::text in (''NaN'',''Infinity'',''-Infinity'')',
    'BLOQUEO','Saldos negativos, no finitos, sin identidad o con reserva superior al total.',
    'Conciliar el origen; no crear puntos ni reducir reservas a ciegas.'),
  ('DATOS_RESERVAS_ACUMULADAS',array['public.saldos_puntos','public.solicitudes_devolucion'],
    'select count(*) as n from public.saldos_puntos s where s.reservado is distinct from (select coalesce(sum(d.monto_solicitado),0) from public.solicitudes_devolucion d where d.usuario_id=s.usuario_id and d.evento_id=s.evento_id and d.estado::text in (''en_revision'',''aprobada'')'
      ||case when m.liquidada then ' and d.liquidada_en is null' else '' end||')',
    'BLOQUEO','Reservas distintas de la suma de solicitudes activas no liquidadas.',
    'Acordar conciliación C/D/B; una aprobada sin liquidar continúa reservando.'),
  ('DATOS_SOLICITUDES_SIN_SALDO',array['public.solicitudes_devolucion','public.saldos_puntos'],
    'select count(*) as n from public.solicitudes_devolucion d where d.estado::text in (''en_revision'',''aprobada'')'
      ||case when m.liquidada then ' and d.liquidada_en is null' else '' end
      ||' and not exists(select 1 from public.saldos_puntos s where s.usuario_id=d.usuario_id and s.evento_id=d.evento_id)',
    'BLOQUEO','Solicitudes activas sin su fila de saldo.',
    'Revisar con C/D; no generar un saldo ficticio.'),
  ('DATOS_SOLICITUDES_INVALIDAS',array['public.solicitudes_devolucion'],
    'select count(*) as n from public.solicitudes_devolucion where usuario_id is null or evento_id is null or monto_solicitado is null or monto_solicitado<=0 or monto_solicitado::text in (''NaN'',''Infinity'',''-Infinity'') or estado is null or estado::text not in (''en_revision'',''aprobada'',''rechazada'')',
    'BLOQUEO','Solicitudes con monto, identidad o estado incompatible.',
    'Conciliar con C antes de cambiar reservas o liquidar.'),
  ('DATOS_APROBADAS_POR_REVISAR',array['public.solicitudes_devolucion'],
    'select count(*) as n from public.solicitudes_devolucion d where d.estado::text=''aprobada'''
      ||case when m.liquidada then ' and d.liquidada_en is null' else '' end,
    'ADVERTENCIA','Solicitudes aprobadas sin liquidación explícita; pueden ser reservas legítimas.',
    'Confirmar con C si siguen pendientes. No asumir que aprobada significa pagada.'),
  ('DATOS_DEVOLUCIONES_DUPLICADAS',array['public.devoluciones'],
    'select count(*) as n from (select 1 from public.devoluciones where solicitud_id is not null group by solicitud_id having count(*)>1) x',
    'BLOQUEO','Solicitudes con más de una devolución; el índice único B fallaría.',
    'Conciliar registros con C/D/B sin eliminarlos para forzar la migración.'),
  ('DATOS_DEVOLUCIONES_ENLACE_INVALIDO',array['public.devoluciones','public.solicitudes_devolucion'],
    'select count(*) as n from public.devoluciones d left join public.solicitudes_devolucion s on s.id=d.solicitud_id where d.solicitud_id is not null and (s.id is null or s.usuario_id is distinct from d.usuario_id or s.monto_solicitado is distinct from d.monto or s.estado::text is distinct from ''aprobada'')',
    'BLOQUEO','Devoluciones enlazadas a solicitud inexistente o con titular/monto/estado incompatible.',
    'Conciliar semántica y pago con C/D/B.'),
  ('DATOS_DEVOLUCIONES_SIN_MARCA',array['public.devoluciones','public.solicitudes_devolucion'],
    'select count(*) as n from public.devoluciones d join public.solicitudes_devolucion s on s.id=d.solicitud_id'
      ||case when m.liquidada then ' where s.liquidada_en is null' else '' end,
    'BLOQUEO','Devoluciones ya registradas sin liquidada_en; riesgo de liquidar dos veces.',
    'Acordar migración de conciliación. No marcar todas las aprobadas como pagadas.'),
  ('DATOS_LIQUIDACION_INCOHERENTE',array['public.solicitudes_devolucion','public.devoluciones'],
    case when m.liquidada then
      'select count(*) as n from public.solicitudes_devolucion s where s.liquidada_en is not null and (s.estado::text is distinct from ''aprobada'' or (select count(*) from public.devoluciones d where d.solicitud_id=s.id and d.usuario_id=s.usuario_id and d.monto=s.monto_solicitado)<>1)'
      else 'select 0::bigint as n' end,
    'BLOQUEO','Marcas liquidada_en sin estado aprobado y una devolución coherente. Sin columna B todavía: 0 es esperado.',
    'Conciliar; no liberar reserva ni volver a descontar automáticamente.'),
  ('DATOS_CANCELACION_INCOHERENTE',array['public.solicitudes_devolucion'],
    case when m.cancelada then 'select count(*) as n from public.solicitudes_devolucion s where s.cancelada_en is not null and (s.estado::text is distinct from ''rechazada'''
      ||case when m.liquidada then ' or s.liquidada_en is not null' else '' end||')'
      else 'select 0::bigint as n' end,
    'BLOQUEO','Cancelaciones con estado incompatible o simultáneamente liquidadas. Sin columna B todavía: 0 es esperado.',
    'Revisar estados terminales con C/B.'),
  ('DATOS_RECARGAS_HISTORICAS',array['public.recargas'],
    'select count(*) as n from public.recargas'
      ||case when m.puntos and m.tasa then ' where puntos is null or tasa is null' else '' end,
    'ADVERTENCIA','Recargas sin conversión histórica demostrable; B conserva NULL y no permite ajustarlas automáticamente.',
    'Acordar unidades y presentación de históricos. No inventar tasas ni backfill.'),
  ('DATOS_RECARGAS_MONTOS_INVALIDOS',array['public.recargas'],
    'select count(*) as n from public.recargas where monto is null or monto<=0 or monto::text in (''NaN'',''Infinity'',''-Infinity'')',
    'BLOQUEO','Recargas históricas con monto inválido.',
    'Conciliar antes de habilitar operaciones; no reinterpretar unidades.'),
  ('DATOS_DEVOLUCIONES_HISTORICAS',array['public.devoluciones'],
    'select count(*) as n from public.devoluciones where solicitud_id is null'
      ||case when m.evento_devolucion then ' and evento_id is null' else '' end,
    'ADVERTENCIA','Devoluciones presenciales sin evento demostrable; podrían quedar fuera del historial por evento.',
    'Acordar presentación/conciliación sin inferir el evento.'),
  ('DATOS_DEVOLUCIONES_MONTOS_INVALIDOS',array['public.devoluciones'],
    'select count(*) as n from public.devoluciones where monto is null or monto<=0 or monto::text in (''NaN'',''Infinity'',''-Infinity'')',
    'BLOQUEO','Devoluciones históricas con monto inválido.',
    'Conciliar con C/D/B, sin alterar saldos automáticamente.'),
  ('OPERACION_CLIENTES_ACTIVOS',array['public.usuarios','auth.users'],
    'select count(*) as n from public.usuarios u join auth.users a on a.id=u.id where u.activo and u.rol::text=''cliente''',
    'ADVERTENCIA','Cuentas cliente activas con vínculo Auth; un número positivo no demuestra que sean cuentas de prueba.',
    'Confirmar cuentas ficticias autorizadas; no compartir sus datos.'),
  ('OPERACION_RECARGADORES_ASIGNADOS',array['public.usuarios','auth.users','public.asignaciones_staff','public.eventos'],
    'select count(*) as n from public.usuarios u join auth.users au on au.id=u.id where u.activo and u.rol::text=''recargador'' and exists(select 1 from public.asignaciones_staff a join public.eventos e on e.id=a.evento_id where a.usuario_id=u.id and a.rol_staff::text=''recargador'')',
    'ADVERTENCIA','Recargadores activos con Auth y al menos un evento válido asignado.',
    'Si es 0, bloquea pruebas operativas, no la creación del esquema B.'),
  ('OPERACION_DEVOLUCION_ASIGNADA',array['public.usuarios','auth.users','public.asignaciones_staff','public.eventos'],
    'select count(*) as n from public.usuarios u join auth.users au on au.id=u.id where u.activo and u.rol::text=''devolucion'' and exists(select 1 from public.asignaciones_staff a join public.eventos e on e.id=a.evento_id where a.usuario_id=u.id and a.rol_staff::text=''devolucion'')',
    'ADVERTENCIA','Encargados de devolución activos con Auth y evento válido asignado.',
    'Si es 0, bloquea pruebas operativas, no la creación del esquema B.'),
  ('OPERACION_PERFILES_SIN_AUTH',array['public.usuarios','auth.users'],
    'select count(*) as n from public.usuarios u where not exists(select 1 from auth.users a where a.id=u.id)',
    'BLOQUEO','Perfiles sin usuario Auth correspondiente.',
    'Revisar integridad con el responsable de Auth; no crear cuentas automáticamente.'),
  ('OPERACION_ASIGNACIONES_INCOMPATIBLES',array['public.asignaciones_staff','public.usuarios','public.eventos'],
    'select count(*) as n from public.asignaciones_staff a left join public.usuarios u on u.id=a.usuario_id left join public.eventos e on e.id=a.evento_id where u.id is null or e.id is null or not u.activo or a.rol_staff::text is distinct from u.rol::text',
    'ADVERTENCIA','Asignaciones sin titular/evento válido, inactivas o con rol distinto del perfil.',
    'Revisar con administración; estas asignaciones no habilitan las RPC de B.'),
  ('OPERACION_PLAZO_C',array['public.devc_parametros'],
    'select count(*) as n from public.devc_parametros where clave=''plazo_devolucion_horas'' and valor>0',
    'ADVERTENCIA','Configuraciones válidas del plazo virtual C.',
    'Debe existir exactamente una; acordar horas. No afecta HU16 ni la instalación del esquema.'),
  ('STORAGE_BUCKET_C',array['storage.buckets'],
    'select count(*) as n from storage.buckets where id=''devoluciones'' and not public and file_size_limit=5242880 and allowed_mime_types @> array[''image/png'',''image/jpeg'',''image/webp''] and allowed_mime_types <@ array[''image/png'',''image/jpeg'',''image/webp'']',
    'BLOQUEO','Bucket C privado con límite 5 MiB y MIME esperados.',
    'Si es 0, revisar despliegue/configuración C antes de B.'),
  ('STORAGE_BUCKET_B_PREEXISTENTE',array['storage.buckets'],
    'select count(*) as n from storage.buckets where id=''devb-evidencias''',
    'ADVERTENCIA','Bucket B ya existente: la candidata cambia privacidad, tamaño y MIME mediante upsert.',
    'Si existe, revisar pertenencia y uso antes de aplicar. Ausente es esperado antes de B.')
  ) v(id,tablas,consulta,con_casos,descripcion,accion)
),
datos_preparados as (
  select d.*,not exists(select 1 from unnest(d.tablas) requerida
    left join tablas_estado t on t.nombre=requerida
    where not coalesce(t.es_tabla and t.columnas_validas and t.lectura_completa,false)) ejecutable
  from datos d
),
datos_resultado as materialized (
  select d.*,
    case when ejecutable then ((pg_catalog.xpath('/table/row/n/text()',
      pg_catalog.query_to_xml(consulta,false,false,'')))[1]::text)::bigint else null end cantidad
  from datos_preparados d
),
colisiones_columnas(tabla,columna) as (values
  ('recargas','puntos'),('recargas','tasa'),
  ('devoluciones','evento_id'),('devoluciones','importe_simulado'),('devoluciones','tasa'),
  ('solicitudes_devolucion','liquidada_en'),('solicitudes_devolucion','cancelada_en'),
  ('reportes_recarga','solicitud_id')
),
politicas_storage as (
  select p.*, (p.roles && array['public','anon','authenticated']::name[]
    or exists(select 1 from pg_roles r where r.rolname=any(p.roles)
      and (pg_has_role((select oid from pg_roles where rolname='authenticated'),r.oid,'MEMBER')
        or pg_has_role((select oid from pg_roles where rolname='anon'),r.oid,'MEMBER')))) afecta_clientes
  from pg_policies p where p.schemaname='storage' and p.tablename='objects'
),
resultados(orden,comprobacion,estado,cantidad,detalle,accion) as (
  select 10,'SESION_SQL_EDITOR',
    case when current_user='postgres' then 'OK' else 'BLOQUEO' end,null::bigint,
    'La revisión de despliegue espera el rol postgres. Los conteos se omiten si RLS/permisos impiden ver toda la tabla.',
    'Ejecutar como postgres desde SQL Editor; no usar una sesión cliente para certificar integridad.'
  union all
  select 11,'SESION_AISLAMIENTO',
    case when current_setting('transaction_isolation')='read committed' then 'OK' else 'BLOQUEO' end,null,
    'Las RPC financieras de B/D exigen READ COMMITTED.',
    'Revisar configuración de conexión/transacción antes del despliegue; este SELECT no la modifica.'
  union all
  select 12,'ROL_SQL_'||esperado,
    case when r.oid is null or (esperado<>'service_role' and (r.rolsuper or r.rolbypassrls))
      then 'BLOQUEO' else 'OK' end,null,
    'El rol debe existir; anon/authenticated no deben omitir RLS ni ser superusuarios.',
    'Revisar roles de Supabase. No usar service_role para comprobar permisos de clientes.'
  from (values ('anon'),('authenticated'),('service_role')) x(esperado)
  left join pg_roles r on r.rolname=x.esperado
  union all
  select 20,'TABLA_'||nombre,case when es_tabla then 'OK' else 'BLOQUEO' end,null,
    case when es_tabla then 'Tabla base presente.' else 'Tabla ausente o relación de tipo incompatible.' end,
    'Contrastar esquema A/C/D aprobado; no reconstruir tablas sobre datos existentes.'
  from tablas_estado
  union all
  select 21,'COLUMNA_'||esquema||'.'||tabla||'.'||columna,
    case when presente and compatible then 'OK' else 'BLOQUEO' end,null,
    format('Esperado: %s; actual: %s.',tipo_esperado,coalesce(tipo_actual,'AUSENTE')),
    'Instalar/revisar el prerrequisito correspondiente antes de B.'
  from columnas_estado
  union all
  select 22,'LECTURA_INTEGRIDAD_'||nombre,
    case when es_tabla and columnas_validas and lectura_completa then 'OK' else 'BLOQUEO' end,null,
    case when es_tabla and columnas_validas and lectura_completa then 'Conteos accesibles sin filtrado RLS.'
      else 'No se pueden certificar los conteos: faltan columnas/tipos, SELECT/USAGE o acceso sin filtro RLS.' end,
    'No interpretar una comprobación omitida como cero incidencias.'
  from tablas_estado
  union all
  select 30,'RPC_'||firma,
    case when oid is not null and prokind='f' and prosecdef and propietario='postgres'
      and retorno_actual=retorno and nombres_actuales=string_to_array(argumentos,',')
      and proretset=(retorno='record') and (proname='es_admin' or ruta_vacia)
      then 'OK' when estricta then 'BLOQUEO' else 'ADVERTENCIA' end,null,
    format('Esperada %s -> %s; presente=%s; retorno=%s; argumentos=%s; definer=%s; propietario=%s.',
      firma,retorno,oid is not null,coalesce(retorno_actual,'AUSENTE'),
      array_to_string(nombres_actuales,','),coalesce(prosecdef,false),coalesce(propietario,'AUSENTE')),
    case when estricta then 'Comparar definición con A/C/D y su orden. La firma sola no demuestra equivalencia del cuerpo.'
      else 'C negocios/ayudantes: revisar integración completa; no es dependencia SQL estricta de HU16.' end
  from funciones_estado
  union all
  select 31,'ACL_HEREDADA_'||firma,
    case when oid is not null and auth_execute and not anon_execute and not public_execute
      then 'OK' else 'BLOQUEO' end,null,
    format('authenticated EXECUTE=%s; anon EXECUTE=%s; PUBLIC EXECUTE=%s.',auth_execute,anon_execute,public_execute),
    'B conserva ACL de las funciones reemplazadas A/C. Corregir con su responsable, no abrir acceso anónimo.'
  from funciones_estado where acl_heredada
  union all
  select 32,'AUTH_UID',
    case when exists(select 1 from pg_proc where oid=(select oid_funcion from funciones_catalogo where firma_catalogo='auth.uid()')
      and prokind='f' and prorettype='uuid'::regtype) then 'OK' else 'BLOQUEO' end,null,
    'La identificación requiere auth.uid() -> uuid, sin argumentos.',
    'Revisar Auth del entorno; no sustituirlo por el mock de las pruebas locales.'
  union all
  select 33,'ENUM_ROL_'||rol,case when exists(select 1 from pg_enum
    where enumtypid=(select rt.oid from pg_type rt join pg_namespace rn on rn.oid=rt.typnamespace where rn.nspname='public' and rt.typname='rol_usuario') and enumlabel=rol) then 'OK' else 'BLOQUEO' end,null,
    'Valor de rol requerido por B.','Revisar enum/base de usuarios con A/C antes de desplegar.'
  from (values ('cliente'),('recargador'),('devolucion'),('admin')) r(rol)
  union all
  select 40,'UNICIDAD_SALDO_USUARIO_EVENTO',
    case when exists(select 1 from pg_constraint c
      join pg_index i on i.indexrelid=c.conindid where c.conrelid=(select oid_rel from relaciones where nombre_rel='public.saldos_puntos')
      and c.contype='u' and c.convalidated and i.indisvalid and i.indisready
      and (select array_agg(a.attname::text order by a.attname)
        from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k)
        =array['evento_id','usuario_id']::text[]) then 'OK' else 'BLOQUEO' end,null,
    'Se requiere UNIQUE(usuario_id,evento_id) válido, además de verificar duplicados existentes.',
    'Conciliar con D; B usa ON CONFLICT sobre esa clave.'
  union all
  select 41,'CONSTRAINT_DEVD_SALDO_CUBRE_RESERVA',
    case when exists(select 1 from pg_constraint where conrelid=(select oid_rel from relaciones where nombre_rel='public.saldos_puntos')
      and conname='devd_saldo_cubre_reserva' and contype='c' and convalidated
      and replace(lower(regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]()"]','','g')),'::numeric','')
        = 'reservado>=0andsaldo>=reservadoandsaldo<>''nan''andreservado<>''nan''') then 'OK' else 'BLOQUEO' end,null,
    'Debe existir y estar validada la barrera saldo >= reservado >= 0 de D.',
    'Comparar también su definición con D003; no repetir su inicialización sobre una base avanzada.'
  union all
  select 42,'TRIGGER_'||nombre,
    case when exists(select 1 from pg_trigger where tgrelid=(select oid_rel from relaciones where nombre_rel=tabla)
      and tgname=nombre and tgfoid=(select oid_funcion from funciones_catalogo where firma_catalogo=firma) and tgtype=tipo
      and tgenabled='O' and not tgisinternal) then 'OK' else 'BLOQUEO' end,null,
    'Trigger D requerido, asociado a su función, con eventos correctos y habilitado.',
    'Comparar con D003; no instalar un segundo acumulador de reservas.'
  from (values
    ('public.solicitudes_devolucion','devd_reserva','public.devd_mantener_reserva()',23),
    ('public.saldos_puntos','devd_saldo_claves','public.devd_proteger_saldo()',19),
    ('public.solicitudes_devolucion','devd_no_borrar_reservas','public.devd_impedir_borrado_financiero()',11)
  ) t(tabla,nombre,firma,tipo)
  union all
  select 44,'CLAVE_REFERENCIADA_B_'||tabla,
    case when exists(select 1 from pg_index i
      join pg_attribute a on a.attrelid=i.indrelid and a.attname='id' and not a.attisdropped
      where i.indrelid=(select oid_rel from relaciones where nombre_rel=tabla)
        and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
        and i.indnkeyatts=1 and i.indpred is null and i.indexprs is null
        and exists(select 1 from unnest(i.indkey) with ordinality k(attnum,posicion)
          where posicion=1 and k.attnum=a.attnum)) then 'OK' else 'BLOQUEO' end,null,
    'B añade claves foráneas a id: necesita una clave única válida, inmediata y no parcial.',
    'Revisar PK/UNIQUE con el responsable del esquema; no crear una clave sobre duplicados.'
  from (values ('public.usuarios'),('public.eventos'),('public.recargas'),('public.devoluciones')) x(tabla)
  union all
  select 43,'RLS_'||nombre,
    case when oid is not null and relrowsecurity and not relforcerowsecurity then 'OK' else 'BLOQUEO' end,null,
    'Se espera RLS activa, sin FORCE RLS que cambie la ejecución de las RPC SECURITY DEFINER.',
    'Revisar con el responsable del esquema; no desactivar RLS para superar el diagnóstico.'
  from tablas_estado where nombre in ('public.usuarios','public.eventos','public.saldos_puntos','public.solicitudes_devolucion','storage.objects')
  union all
  select 50,id,
    case when not ejecutable or cantidad is null then 'BLOQUEO'
      when id in ('OPERACION_CLIENTES_ACTIVOS','OPERACION_RECARGADORES_ASIGNADOS','OPERACION_DEVOLUCION_ASIGNADA','OPERACION_PLAZO_C','STORAGE_BUCKET_C')
        then case when cantidad>0 then 'OK' else con_casos end
      when cantidad>0 then con_casos else 'OK' end,
    cantidad,
    case when ejecutable then descripcion else 'NO EVALUADO: esquema/permisos/visibilidad incompletos. '||descripcion end,
    accion
  from datos_resultado
  union all
  select 60,'COLISION_COLUMNA_B_'||tabla||'.'||columna,
    case when exists(select 1 from pg_attribute where attrelid=(select oid_rel from relaciones where nombre_rel='public.'||tabla)
      and attname=columna and attnum>0 and not attisdropped) then 'BLOQUEO' else 'OK' end,null,
    'Antes de B esta columna debe estar ausente. Si existe, la candidata no se puede reaplicar sin revisión.',
    'Comparar instalación parcial/completa. No usar IF NOT EXISTS para ocultar diferencias.'
  from colisiones_columnas
  union all
  select 61,'COLISION_RELACION_B_'||c.relname,'BLOQUEO',1,
    'Ya existe una tabla, índice o secuencia en el espacio de nombres B.',
    'No aplicar la migración original otra vez; revisar catálogo y preparar reparación específica.'
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname like 'devb\_%' escape '\'
  union all
  select 62,'COLISION_FUNCIONES_B',
    case when count(*)>0 then 'BLOQUEO' else 'OK' end,count(*),
    'Funciones B preexistentes, incluidas otras sobrecargas; su ausencia es esperada antes de la primera instalación.',
    'No confundir consultar_mis_saldos ausente antes de B con un prerrequisito A/C/D faltante.'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and (p.proname like 'devb_%' or p.proname in ('registrar_recarga','ajustar_recarga','reportar_recarga',
      'registrar_devolucion','liquidar_solicitud_devolucion','consultar_mis_saldos','consultar_saldo_staff',
      'consultar_ticket_extraviado','historial_recargas','mis_reportes_recarga','historial_devoluciones','cancelar_solicitud_devolucion'))
  union all
  select 63,'COLISION_OTROS_OBJETOS_B',
    case when n>0 then 'BLOQUEO' else 'OK' end,n,
    'Triggers, constraint de recarga o políticas Storage B ya existentes.',
    'Detener reaplicación y revisar objetos parciales.'
  from (select
    (select count(*) from pg_trigger where not tgisinternal and
      ((tgrelid=(select oid_rel from relaciones where nombre_rel='public.recargas') and tgname='devb_recarga_inmutable')
      or (tgrelid=(select oid_rel from relaciones where nombre_rel='public.devoluciones') and tgname='devb_devolucion_inmutable')
      or (tgrelid=(select oid_rel from relaciones where nombre_rel='public.devb_movimientos') and tgname='devb_movimiento_inmutable')))
    +(select count(*) from pg_constraint where conrelid=(select oid_rel from relaciones where nombre_rel='public.recargas') and conname='devb_recarga_nueva_valida')
    +(select count(*) from pg_policies where schemaname='storage' and tablename='objects'
      and policyname in ('devb_evidencias_insert','devb_evidencias_select')) as n) x
  union all
  select 70,'STORAGE_POLITICA_'||policyname,
    case when afecta_clientes then 'ADVERTENCIA' else 'OK' end,null,
    format('Comando=%s; tipo=%s; aplica a clientes=%s. No se evalúa aquí la equivalencia lógica del filtro.',
      cmd,permissive,afecta_clientes),
    'Revisar USING/WITH CHECK en Dashboard. Una política permisiva puede ampliar acceso; una restrictiva puede impedirlo. No borrarlas automáticamente.'
  from politicas_storage
  union all
  select 71,'STORAGE_REVISION_MANUAL','ADVERTENCIA',count(*),
    'Políticas existentes en storage.objects. El análisis estático no certifica lectura, sustitución o borrado cruzado de evidencias.',
    'Acordar alcance con sus responsables y probar sesiones reales en aislado; service_role omite RLS.'
  from politicas_storage
  union all
  select 80,'OPERACION_TASA_POR_EVENTO','ADVERTENCIA',null,
    'B no configura Bs/punto. Ausencia de devb_conversion antes de B es normal; la tasa acordada se carga después.',
    'Acordar tasa/precisión por evento para recargas/devoluciones. HU16 funciona sin tasa.'
  union all
  select 81,'HISTORIAL_CLI',
    case when (select oid_rel from relaciones where nombre_rel='supabase_migrations.schema_migrations') is null then 'ADVERTENCIA' else 'OK' end,null,
    case when (select oid_rel from relaciones where nombre_rel='supabase_migrations.schema_migrations') is null
      then 'No existe la tabla de historial CLI. No demuestra ausencia de migraciones aplicadas manualmente.'
      else 'Existe la tabla del historial CLI; no demuestra por sí sola equivalencia del esquema.' end,
    'Usar catálogo y archivos aprobados como evidencia; no crear ni reparar el historial para forzar el despliegue.'
  union all
  select 82,'REVISION_CONTRATOS_Y_ESCRITORES','ADVERTENCIA',null,
    'B reemplaza funciones A/C/D, revoca acceso directo y hace inmutables recargas/devoluciones históricas.',
    'A/C/D deben confirmar contratos, escritores privilegiados, borrados administrativos y conciliación. El SQL no conoce integraciones externas.'
  union all
  select 83,'AUTORIZACION_DESTINO_RESPALDO','ADVERTENCIA',null,
    'Este SELECT no demuestra aislamiento, respaldo restaurable ni autorización de despliegue compartido.',
    'Requiere acuerdo del equipo y responsable Supabase. No ejecutar la migración solo porque no aparezcan BLOQUEOS.'
),
resumen as (
  select 0 orden,'RESUMEN_GENERAL' comprobacion,
    case when count(*) filter(where estado='BLOQUEO')>0 then 'BLOQUEO'
      when count(*) filter(where estado='ADVERTENCIA')>0 then 'ADVERTENCIA' else 'OK' end estado,
    count(*) filter(where estado='BLOQUEO') cantidad,
    format('BLOQUEOS: %s; ADVERTENCIAS: %s; OK: %s.',
      count(*) filter(where estado='BLOQUEO'),count(*) filter(where estado='ADVERTENCIA'),count(*) filter(where estado='OK')) detalle,
    'Cualquier BLOQUEO impide aplicar la candidata. Revisar cada ADVERTENCIA; cero BLOQUEOS no es autorización.' accion
  from resultados
)
select orden,comprobacion,estado,cantidad,detalle,accion
from (select * from resumen union all select * from resultados) final
order by case when orden=0 then 0 when estado='BLOQUEO' then 1 when estado='ADVERTENCIA' then 2 else 3 end,
  orden,comprobacion;
