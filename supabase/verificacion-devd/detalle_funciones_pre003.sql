-- Generado por scripts/generar-detalle-funciones-pre003.cjs.
-- Misma clasificacion que decision_003_solo_lectura.sql; NO modifica el detector.
-- UNA sentencia SELECT, solo catalogos. Ejecutar como postgres ANTES de 003.
-- Una fila por funcion REVISION (correcto IS NULL); no invoca esas funciones.
-- Exportar el resultado completo a CSV. Filas esperadas = REVISION del detector
-- en la misma instantanea de catalogo (77 en la salida informada por el usuario).
-- No expone cuerpos, valores predeterminados de argumentos, ACL ni filas de usuarios.
with recursive
catalogo_relaciones as materialized (
  -- Comparar nombres contra catálogo: nunca convertir un nombre pendiente a regclass.
  select c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relowner,c.relacl
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
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
relaciones_por_funcion(objeto,tabla) as (
  -- Solo proyeccion de las aristas ya clasificadas: no cambia ningun criterio.
  select 'r'||oid::text,'public.'||relname from catalogo_relaciones
  where relname in ('saldos_puntos','solicitudes_devolucion','devoluciones','recargas','ventas','venta_items')
  union
  select a.origen,r.tabla from aristas a join relaciones_por_funcion r on r.objeto=a.destino
)
select f.esquema,f.proname nombre,
  pg_catalog.pg_get_function_identity_arguments(f.oid) firma,
  'REVISION'::text clasificacion,
  f.motivo||'; lenguaje='||f.lenguaje||'; SECURITY DEFINER='||f.prosecdef::text||
    '; extension='||coalesce(f.extension,'no registrada') motivo,
  coalesce((select string_agg(r.tabla,'; ' order by r.tabla) from relaciones_por_funcion r
    where r.objeto='f'||f.oid::text),
    case when f.menciona_finanzas then 'Mencion financiera textual sin ruta resuelta en las aristas'
      else 'Sin vinculo estatico resuelto; NO demuestra ausencia de acceso dinamico o indirecto' end)
    relacion_financiera_detectada
from clasificacion_funciones f
where f.correcto is null
order by f.esquema,f.proname,pg_catalog.pg_get_function_identity_arguments(f.oid);
