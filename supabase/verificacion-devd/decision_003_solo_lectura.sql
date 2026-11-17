-- UNA sentencia SELECT; UN resultado. Ejecutar como postgres en el SQL Editor.
-- No modifica datos, RLS, funciones ni permisos; no invoca RPC de la aplicación.
-- TRUE = condición comprobada; FALSE = detener y revisar; NULL = validación humana pendiente.
-- Pensada para después de 000–002 y antes de la PRIMERA aplicación de 003.
with recursive
contexto as (
  select current_user='postgres' as acceso
),
catalogo_relaciones as materialized (
  -- Comparar nombres contra catálogo: nunca convertir un nombre pendiente a regclass.
  select c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relowner,c.relacl
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
),
columnas as (
  select c.relname tabla,a.attname columna,pg_catalog.format_type(a.atttypid,a.atttypmod) tipo,
    a.atttypid,a.attnotnull,a.attnum
  from catalogo_relaciones c
  join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
),
requeridas(tabla,columna,tipo) as (values
  ('saldos_puntos','id','integer'),('saldos_puntos','usuario_id','uuid'),
  ('saldos_puntos','evento_id','integer'),('saldos_puntos','saldo','numeric(10,2)'),
  ('solicitudes_devolucion','id','integer'),('solicitudes_devolucion','usuario_id','uuid'),
  ('solicitudes_devolucion','evento_id','integer'),('solicitudes_devolucion','monto_solicitado','numeric(10,2)'),
  ('solicitudes_devolucion','estado','public.estado_solicitud'),
  ('ventas','id','integer'),('ventas','ayudante_id','integer'),('ventas','cliente_id','uuid'),
  ('ventas','negocio_id','integer'),('ventas','evento_id','integer'),('ventas','total','numeric(10,2)'),
  ('venta_items','venta_id','integer'),('venta_items','producto_id','integer'),
  ('venta_items','cantidad','integer'),('venta_items','precio_unitario','numeric(10,2)'),
  ('negocios','id','integer'),('negocios','estado','boolean'),
  ('productos','id','integer'),('productos','negocio_id','integer'),('productos','precio','numeric(10,2)'),
  ('ayudantes','id','integer'),('ayudantes','usuario_id','uuid'),('ayudantes','negocio_id','integer'),('ayudantes','activo','boolean'),
  ('usuarios','id','uuid'),('usuarios','activo','boolean'),('usuarios','rol','public.rol_usuario'),
  ('asignaciones_staff','usuario_id','uuid'),('asignaciones_staff','evento_id','integer'),
  ('asignaciones_staff','rol_staff','public.rol_usuario'),('eventos','id','integer'),('entradas','id','integer')
),
incompatibles as (
  select r.tabla||'.'||r.columna||' esperado '||r.tipo||' NOT NULL, actual '||coalesce(c.tipo,'AUSENTE')||
    case when c.columna is null then '' when c.attnotnull then ' NOT NULL' else ' NULL' end detalle
  from requeridas r left join columnas c on c.tabla=r.tabla and c.columna=r.columna
  left join pg_catalog.pg_namespace nt on nt.nspname=case when r.tipo like 'public.%' then 'public' else 'pg_catalog' end
  left join pg_catalog.pg_type t on t.typnamespace=nt.oid and t.typname=case r.tipo
    when 'integer' then 'int4' when 'boolean' then 'bool' when 'numeric(10,2)' then 'numeric'
    else case when r.tipo like 'public.%' then split_part(r.tipo,'.',2) else r.tipo end end
  where c.columna is null or t.oid is null or c.atttypid is distinct from t.oid
    or not c.attnotnull or (r.tipo='numeric(10,2)' and c.tipo<>r.tipo)
),
-- JSON evita referenciar reservado (todavía no existe) o fallar al inspeccionar
-- columnas de datos que hayan cambiado de tipo. Las tablas base sí deben existir.
saldos as (
  select j->>'usuario_id' usuario,j->>'evento_id' evento,
    case when j->>'saldo' ~ '^[+-]?[0-9]+([.][0-9]+)?$' then (j->>'saldo')::numeric end saldo
  from public.saldos_puntos s cross join lateral (select pg_catalog.to_jsonb(s) j) x
),
solicitudes as (
  select j->>'usuario_id' usuario,j->>'evento_id' evento,j->>'estado' estado,
    case when j->>'monto_solicitado' ~ '^[+-]?[0-9]+([.][0-9]+)?$' then (j->>'monto_solicitado')::numeric end monto
  from public.solicitudes_devolucion d cross join lateral (select pg_catalog.to_jsonb(d) j) x
),
reservas as (
  select usuario,evento,sum(monto) monto from solicitudes where estado in ('en_revision','aprobada') group by usuario,evento
),
triggers_financieros as (
  select c.relname||'.'||t.tgname||' [estado='||t.tgenabled::text||']' nombre
  from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal
    and c.relname in ('ventas','venta_items','saldos_puntos','solicitudes_devolucion','devoluciones','recargas')
),
clases_catalogo as (
  select c.relname,c.oid from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='pg_catalog' and c.relname in ('pg_proc','pg_class','pg_rewrite','pg_policy','pg_operator','pg_type')
),
funciones as materialized (
  select p.oid,n.nspname esquema,p.proname,
    n.nspname||'.'||p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')' nombre,
    coalesce(p.prosrc,'') cuerpo,p.prosqlbody is not null cuerpo_preanalizado,
    p.prosecdef,pg_catalog.pg_get_userbyid(p.proowner) propietario,l.lanname lenguaje,
    (select string_agg(e.extname,', ' order by e.extname) from pg_catalog.pg_depend d
      join pg_catalog.pg_extension e on e.oid=d.refobjid
      where d.classid=(select oid from clases_catalogo where relname='pg_proc')
        and d.objid=p.oid and d.deptype='e') extension
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  join pg_catalog.pg_language l on l.oid=p.prolang
  -- FirstNormalObjectId: objetos instalados, incluidos miembros de extensiones
  -- y funciones de usuario en pg_catalog. Ninguna excepcion por esquema/nombre,
  -- propietario, SECURITY DEFINER o pertenencia a una extension.
  where p.oid>=16384 and p.prokind in ('f','p')
),
cuerpos_evaluados as materialized (
  select f.*,
    -- Eliminar literales y comentarios conjuntamente: no confundir UPDATE
    -- contenido en un mensaje/WAL con una sentencia. No ejecutar/descompilar.
    pg_catalog.regexp_replace(cuerpo,
      '''([^'']|'''')*''|--[^\n]*|/\*.*?\*/',' ','gs') codigo
  from funciones f
),
senales as materialized (
  select f.*,
    -- El lexer reducido no resuelve dollar quoting ni escapes E'...'.
    -- Esos cuerpos van a revision, no se usa su DML textual como prueba.
    codigo ~ '\$([a-z_][a-z_0-9]*)?\$' or cuerpo ~* '\mE''' lexico_inconcluso,
    pg_catalog.regexp_replace(codigo,
      '\m(grant|revoke)[[:space:]]+execute[[:space:]]+on[[:space:]]+function\M',
      'permiso_funcion','gi') ~* '\mexecute\M' dinamica,
    codigo ~* '\m(insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into|truncate([[:space:]]+table)?)[[:space:]]+(only[[:space:]]+)?"?public"?[[:space:]]*\.[[:space:]]*"?(saldos_puntos|solicitudes_devolucion|devoluciones|recargas|ventas|venta_items)\M' escritura_financiera,
    codigo ~* '\m(saldos_puntos|solicitudes_devolucion|devoluciones|recargas|ventas|venta_items)\M' menciona_finanzas
  from cuerpos_evaluados f
),
llamadas_texto as materialized (
  -- Las llamadas de PL/pgSQL o SQL de texto no siempre figuran en pg_depend.
  -- Todas las sobrecargas de un nombre no cualificado son posibilidades;
  -- no se presume resolucion por search_path ni que la llamada sea alcanzable.
  select f.oid origen,g.oid destino
  from senales f cross join lateral pg_catalog.regexp_matches(f.codigo,
    '(?:"?([a-z_][a-z_0-9$]*)"?[[:space:]]*\.[[:space:]]*)?"?([a-z_][a-z_0-9$]*)"?[[:space:]]*\(','gi') m(partes)
  join funciones g on lower(g.proname)=lower(m.partes[2])
    and (m.partes[1] is null or lower(g.esquema)=lower(m.partes[1]))
),
aristas as materialized (
  -- Aristas = un objeto usa/puede activar otro. No equivalen a escritura.
  select 'f'||f.oid::text origen,
    case when d.refclassid=(select oid from clases_catalogo where relname='pg_proc') then 'f'
      when d.refclassid=(select oid from clases_catalogo where relname='pg_type') then 't'
      when d.refclassid=(select oid from clases_catalogo where relname='pg_operator') then 'o' else 'r' end||d.refobjid::text destino
  from funciones f join pg_catalog.pg_depend d on d.objid=f.oid
    and d.classid=(select oid from clases_catalogo where relname='pg_proc')
  where d.refclassid in (select oid from clases_catalogo where relname in ('pg_proc','pg_class','pg_type','pg_operator'))
  union
  select 'f'||origen::text,'f'||destino::text from llamadas_texto
  union
  -- Referencias textuales a relaciones: complementar dependencias ausentes
  -- sin invocar SQL que apunte a objetos futuros. Incluye vistas de otros esquemas.
  select 'f'||f.oid::text,'r'||c.oid::text from senales f
  cross join lateral pg_catalog.regexp_matches(f.codigo,
    '\m(from|join|update|into|truncate)[[:space:]]+(?:only[[:space:]]+)?(?:"?([a-z_][a-z_0-9$]*)"?[[:space:]]*\.[[:space:]]*)?"?([a-z_][a-z_0-9$]*)"?','gi') m(partes)
  join pg_catalog.pg_class c on lower(c.relname)=lower(m.partes[3])
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    and (m.partes[2] is null or lower(n.nspname)=lower(m.partes[2]))
  union
  select 'r'||r.ev_class::text,
    case when d.refclassid=(select oid from clases_catalogo where relname='pg_proc') then 'f'
      when d.refclassid=(select oid from clases_catalogo where relname='pg_type') then 't'
      when d.refclassid=(select oid from clases_catalogo where relname='pg_operator') then 'o' else 'r' end||d.refobjid::text
  from pg_catalog.pg_rewrite r join pg_catalog.pg_depend d on d.objid=r.oid
    and d.classid=(select oid from clases_catalogo where relname='pg_rewrite')
  where d.refclassid in (select oid from clases_catalogo where relname in ('pg_proc','pg_class','pg_type','pg_operator'))
  union
  select 'r'||t.tgrelid::text,'f'||t.tgfoid::text from pg_catalog.pg_trigger t where not t.tgisinternal
  union
  select 'r'||p.polrelid::text,'f'||d.refobjid::text from pg_catalog.pg_policy p
  join pg_catalog.pg_depend d on d.objid=p.oid
    and d.classid=(select oid from clases_catalogo where relname='pg_policy')
    and d.refclassid=(select oid from clases_catalogo where relname='pg_proc')
  union
  select 'r'||c.confrelid::text,'r'||c.conrelid::text from pg_catalog.pg_constraint c
  where c.contype='f' and (c.confdeltype in ('c','n','d') or c.confupdtype in ('c','n','d'))
  union
  select 'o'||o.oid::text,'f'||o.oprcode::oid::text from pg_catalog.pg_operator o
  union
  -- Un tipo compuesto o funcion de E/S puede ser una dependencia indirecta.
  select 't'||t.oid::text,'r'||t.typrelid::text from pg_catalog.pg_type t where t.typrelid<>0
  union
  select 't'||t.oid::text,'f'||x.funcion::text from pg_catalog.pg_type t
  cross join lateral (values(t.typinput::oid),(t.typoutput::oid),(t.typreceive::oid),(t.typsend::oid)) x(funcion)
  where x.funcion<>0
  union
  select 't'||t.oid::text,'t'||t.typbasetype::text from pg_catalog.pg_type t where t.typbasetype<>0
  union
  select 't'||c.casttarget::text,'f'||c.castfunc::oid::text from pg_catalog.pg_cast c where c.castfunc::oid<>0
),
vinculos_financieros(objeto) as (
  select 'r'||oid::text from catalogo_relaciones
  where relname in ('saldos_puntos','solicitudes_devolucion','devoluciones','recargas','ventas','venta_items')
  union
  select a.origen from aristas a join vinculos_financieros v on v.objeto=a.destino
),
incertidumbre(objeto) as (
  select 'f'||oid::text from senales
  where dinamica or lexico_inconcluso or lenguaje not in ('sql','plpgsql') or escritura_financiera
    or menciona_finanzas or exists(select 1 from vinculos_financieros v where v.objeto='f'||oid::text)
  union
  select a.origen from aristas a join incertidumbre i on i.objeto=a.destino
),
clasificacion_funciones as materialized (
  select f.*,
    case when escritura_financiera and not lexico_inconcluso then false
      when exists(select 1 from incertidumbre i where i.objeto='f'||f.oid::text) then null::boolean
      else true end correcto,
    case when lexico_inconcluso then 'REVISION: quoting/escapes requieren analisis SQL completo'
      when escritura_financiera then 'RIESGO: DML estatico dirigido a tabla financiera (revisar alcanzabilidad)'
      when dinamica then 'REVISION: SQL dinamico; destinos/tipos/funciones ejecutadas no demostrables'
      when lenguaje not in ('sql','plpgsql') then 'REVISION: implementacion opaca para este analisis'
      when exists(select 1 from vinculos_financieros v where v.objeto='f'||f.oid::text) or menciona_finanzas
        then 'REVISION: acceso/dependencia financiera; no prueba escritura'
      when exists(select 1 from incertidumbre i where i.objeto='f'||f.oid::text)
        then 'REVISION: cadena hacia funcion/objeto de riesgo o indeterminado'
      else 'SIN RELACION FINANCIERA DETECTADA (no certificacion de seguridad)' end motivo
  from senales f
),
decision_funciones as (
  select case when bool_or(correcto is false) then false
    when bool_or(correcto is null) then null::boolean else true end correcto,
    'RIESGO='||count(*) filter(where correcto is false)::text||
    '; REVISION='||count(*) filter(where correcto is null)::text||
    '; SIN RELACION DETECTADA='||count(*) filter(where correcto is true)::text||'. '||
    coalesce(string_agg(nombre||' ['||motivo||'; lenguaje='||lenguaje||
      '; SECURITY DEFINER='||prosecdef::text||'; propietario='||propietario||
      '; extension='||coalesce(extension,'no registrada')||']','; ' order by nombre)
      filter(where correcto is not true),'Sin candidatas financieras o indeterminadas.')||
    ' Dependencias pg_depend + llamadas textuales + vistas/reglas/triggers/RLS/cascadas/operadores/tipos; no prueba ausencia de rutas dinamicas/externas. GRANT/REVOKE EXECUTE ON FUNCTION es permiso, no ejecucion.' detalle
  from clasificacion_funciones
),
objetos_nuevos as (
  select 'relacion '||nombre nombre from (values('negocios_eventos'),('devd_ventas_idempotencia'),
    ('devd_ventas_historial'),('devd_items_venta'),('devd_productos_negocio'),('devd_solicitudes_reservas')) r(nombre)
  where exists(select 1 from catalogo_relaciones c where c.relname=r.nombre)
  union all
  select 'columna '||c.tabla||'.'||c.columna from columnas c where
    (c.tabla='saldos_puntos' and c.columna='reservado') or
    (c.tabla='ventas' and c.columna in ('solicitud_id','solicitud_payload','confirmada_en','negocio_nombre_historico','entrada_id','cobrador_id','respuesta')) or
    (c.tabla='venta_items' and c.columna='producto_nombre_historico')
  union all
  select 'funcion '||p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('devd_mantener_reserva','devd_impedir_borrado_financiero','devd_proteger_saldo','devd_negocio_autorizado')
  union all
  select 'politica '||tablename||'.'||policyname from pg_catalog.pg_policies where schemaname='public'
    and policyname in ('devd_negocios_select','devd_productos_select','devd_ayudantes_select','devd_negocios_eventos_select')
  union all
  select 'constraint '||conname from pg_catalog.pg_constraint x join catalogo_relaciones c on c.oid=x.conrelid
  where c.relname='saldos_puntos' and conname='devd_saldo_cubre_reserva'
),
relaciones as (
  select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,pg_catalog.pg_get_userbyid(c.relowner) propietario
  from catalogo_relaciones c where c.relkind='r'
),
checks(orden,comprobacion,correcto,detalle) as (
  select 1,'Lectura administrativa sin filtrado RLS',acceso,
    'Usuario SQL: '||current_user||'. Debe ser postgres; los conteos no son concluyentes con un rol filtrado.' from contexto
  union all select 2,'Columnas actuales de saldos_puntos',
    not exists(select 1 from incompatibles where detalle like 'saldos_puntos.%'),
    coalesce((select string_agg(columna||' '||tipo||case when attnotnull then ' NOT NULL' else ' NULL' end,', ' order by attnum)
      from columnas where tabla='saldos_puntos'),'Tabla/columnas ausentes')
  union all select 3,'Tipos y columnas requeridos por 003',not exists(select 1 from incompatibles),
    coalesce((select string_agg(detalle,'; ' order by detalle) from incompatibles),'Tipos y NOT NULL esperados presentes')
  union all select 4,'Unicidad no diferible de saldo por usuario/evento',exists(
    select 1 from pg_catalog.pg_constraint c join catalogo_relaciones r on r.oid=c.conrelid
    where r.relname='saldos_puntos' and c.contype='u'
      and c.convalidated and not c.condeferrable and cardinality(c.conkey)=2
      and (select array_agg(a.attname::text order by a.attname) from unnest(c.conkey) k(attnum)
        join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=array['evento_id','usuario_id']),
    'Se requiere unicidad real, no basta observar cero duplicados en una tabla vacia.'
  union all select 5,'Objetos de primera instalacion de 003 libres',not exists(select 1 from objetos_nuevos),
    coalesce((select string_agg(nombre,'; ' order by nombre) from objetos_nuevos),'Sin colisiones: 003 no parece instalada parcial ni completamente.')
  union all select 5.1,'negocios_eventos pendiente de 003',
    not exists(select 1 from catalogo_relaciones where relname='negocios_eventos'),
    case when exists(select 1 from catalogo_relaciones where relname='negocios_eventos')
      then 'YA EXISTE: revisar instalacion previa o parcial. No repetir 003.'
      else 'PENDIENTE: sera creada por 003. Su ausencia es esperada; no se consulta su contenido.' end
  union all select 5.2,'saldos_puntos.reservado pendiente de 003',
    not exists(select 1 from columnas where tabla='saldos_puntos' and columna='reservado'),
    case when exists(select 1 from columnas where tabla='saldos_puntos' and columna='reservado')
      then 'YA EXISTE: revisar instalacion previa o parcial y la semantica de la reserva.'
      else 'PENDIENTE: sera agregada por 003. Se calculan reservas propuestas desde solicitudes, sin leer esa columna.' end
  union all select 6,'Sin solicitudes en_revision por conciliar',case when acceso then
    not exists(select 1 from solicitudes where estado='en_revision') end,
    (select count(*)::text from solicitudes where estado='en_revision')||' solicitudes. Si hay filas, revisar si saldo ya las descuenta; no implica por si solo corrupcion.' from contexto
  union all select 7,'Sin solicitudes aprobada por conciliar',case when acceso then
    not exists(select 1 from solicitudes where estado='aprobada') end,
    (select count(*)::text from solicitudes where estado='aprobada')||' solicitudes. Verificar liquidacion; 003 reserva el monto completo de las aprobadas.' from contexto
  union all select 8,'Estados de devolucion reconocidos',case when acceso then
    not exists(select 1 from solicitudes where estado is null or estado not in ('en_revision','aprobada','rechazada')) end,
    (select count(*)::text from solicitudes)||' solicitudes totales; '||
    (select count(*)::text from solicitudes where estado='rechazada')||' rechazadas.' from contexto
  union all select 9,'Importes de saldo y solicitudes validos',case when acceso then
    not exists(select 1 from saldos where saldo is null or saldo<0)
    and not exists(select 1 from solicitudes where monto is null or monto<=0) end,
    'Sin importes nulos, negativos o no finitos; solicitudes deben ser mayores que cero.' from contexto
  union all select 10,'Sin devoluciones historicas (guard de 003)',case when acceso then
    not exists(select 1 from public.devoluciones) end,
    (select count(*)::text from public.devoluciones)||' filas. Cualquier devolucion existente hace abortar la 003 actual.' from contexto
  union all select 11,'Reservas activas con cuenta de saldo',case when acceso then
    not exists(select 1 from reservas r where not exists(select 1 from saldos s where s.usuario=r.usuario and s.evento=r.evento)) end,
    'Cada solicitud en_revision/aprobada debe corresponder a una cuenta usuario/evento.' from contexto
  union all select 12,'Reservas propuestas no superan saldo',case when acceso then
    not exists(select 1 from reservas r join saldos s using(usuario,evento) where r.monto>s.saldo or s.saldo is null) end,
    'SUM(monto_solicitado de en_revision/aprobada) <= saldo. No acredita que B no hubiera descontado reservas antes.' from contexto
  union all select 13,'Sin triggers financieros que requieran revision',not exists(select 1 from triggers_financieros),
    coalesce((select string_agg(nombre,'; ' order by nombre) from triggers_financieros),'Ningun trigger no interno sobre ventas/items/saldos/solicitudes/devoluciones/recargas.')
  union all select 14,'Sin funciones de escritura financiera aparente o SQL dinamico',correcto,detalle from decision_funciones
  union all select 15,'RLS de ventas activada sin FORCE',exists(select 1 from relaciones where relname='ventas' and relrowsecurity and not relforcerowsecurity),
    '003 revoca escritura directa; sus RPC futuras requieren el esquema RLS revisado.'
  union all select 16,'Politicas de ventas coinciden con catalogo previo',not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='ventas'),
    coalesce((select string_agg(policyname||' ['||cmd||', '||permissive||', roles='||roles::text||']','; ' order by policyname)
      from pg_catalog.pg_policies where schemaname='public' and tablename='ventas'),'0 politicas, como en el catalogo exportado. Nuevas politicas requieren revision, no eliminacion automatica.')
  union all select 17,'RLS de productos activada sin FORCE',exists(select 1 from relaciones where relname='productos' and relrowsecurity and not relforcerowsecurity),
    '003 agrega lectura autorizada de catalogo y revoca escrituras directas.'
  union all select 18,'Politicas de productos coinciden con catalogo previo',not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='productos'),
    coalesce((select string_agg(policyname||' ['||cmd||', '||permissive||', roles='||roles::text||']','; ' order by policyname)
      from pg_catalog.pg_policies where schemaname='public' and tablename='productos'),'0 politicas, como en el catalogo exportado. Revisar cambios de C antes de revocar permisos.')
  union all select 18.1,'Permisos de columnas de ventas y productos sin desviaciones',
    (select count(*)=2 from relaciones where relname in ('ventas','productos')) and not exists(
      select 1 from pg_catalog.pg_attribute a join catalogo_relaciones c on c.oid=a.attrelid
      where c.relname in ('ventas','productos') and a.attnum>0 and not a.attisdropped and a.attacl is not null),
    coalesce((select string_agg(relname||' ACL='||coalesce(relacl::text,'NULL (privilegios predeterminados)'),'; ' order by relname)
      from relaciones where relname in ('ventas','productos')),'Tablas base ausentes')||
      '. Se esperan ACL de columna nulas como en el catalogo. Los grants de tabla amplios no sustituyen RLS; 003 los restringe.'
  union all select 19,'Propietarios y RLS de tablas comerciales',
    (select count(*)=7 and bool_and(propietario='postgres' and relrowsecurity and not relforcerowsecurity) from relaciones
      where relname in ('ventas','venta_items','saldos_puntos','solicitudes_devolucion','negocios','productos','ayudantes')),
    'Siete tablas existentes, propietario postgres, RLS activada y no forzada.'
),
manuales(orden,comprobacion,correcto,detalle) as (values
  (21,'Contrato B/C de unidad precio/puntos aprobado',null::boolean,'NO VERIFICABLE POR SQL. numeric(10,2) y tablas vacias no demuestran equivalencia de precio y puntos.'),
  (22,'Contrato B de saldo, reserva y liquidacion aprobado',null::boolean,'NO VERIFICABLE POR SQL. Acordar saldo total vs gastable; reserva de en_revision/aprobada; liquidacion o exclusion explicita del flujo de devolucion.'),
  (23,'Relacion negocio/evento y permisos acordados con C',null::boolean,'NO VERIFICABLE POR SQL. 003 crea negocios_eventos sin pares habilitados. No inferir autorizacion desde ventas o rol staff.'),
  (24,'Escritores externos e indirectos coordinados',null::boolean,'NO VERIFICABLE POR SQL. Revisar RPC indirectas, Edge Functions, servicios con service_role y tareas de B/C; un escaneo textual no demuestra su ausencia.'),
  (25,'Respaldo y ventana sin escritores confirmados',null::boolean,'NO VERIFICABLE POR SQL. Confirmar respaldo recuperable y pausa de escritores antes de instalar; esta lectura no bloquea cambios posteriores.')
),
resumen as (
  select case when bool_or(correcto is false) then false
    when bool_or(correcto is null) then null::boolean else true end tecnico from checks
)
select comprobacion,correcto,detalle from (
  select * from checks
  union all select 20,'RESULTADO TECNICO',tecnico,
    case when tecnico is true then 'Sin obstaculos en los controles automaticos. No equivale a contrato aprobado ni a permiso para activar cobros.'
      when tecnico is false then 'DETENER: revisar las filas FALSE antes de instalar 003; no quitar guards para forzarla.'
      else 'INCONCLUSO: algun control no pudo comprobarse.' end from resumen
  union all select * from manuales
  union all select 26,'RESULTADO FINAL PARA INSTALAR 003',case when tecnico is false then false else null::boolean end,
    case when tecnico is false then 'NO LISTA: hay controles tecnicos pendientes, ademas de confirmaciones humanas.'
      else 'PENDIENTE DE REVISION HUMANA: si se instala solo infraestructura, acordar explicitamente ese alcance, mantener cobros apagados y no introducir movimientos hasta aprobar el contrato.' end from resumen
) resultado order by orden;
