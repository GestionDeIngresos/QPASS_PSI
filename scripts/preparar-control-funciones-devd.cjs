/* eslint-disable @typescript-eslint/no-require-imports -- Genera consultas locales, no se conecta a ninguna base. */
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const c = require('../docs/integracion-supabase/qpass_catalogo_supabase_2026-11-16.json');
const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
const filas = c.funciones.map(f => '(' + [literal(f.nombre), literal(f.firma),
  literal(createHash('md5').update(f.definicion.replace(/\s+/g, ' ').trim()).digest('hex')),
  literal(f.propietario), String(f.definer), literal(JSON.stringify(f.configuracion)) + '::jsonb',
  literal(JSON.stringify(f.acl || [])) + '::jsonb', String(f.anon_execute), String(f.authenticated_execute)].join(',') + ')');
const sql = `-- Generado desde catálogo SHA256 dbee7ad1fa7f95ea7741d7e61eca365f174caa1087adc781f58c9718574c4a07.
-- Ejecutar después de CADA migración. Todas las filas correcto=true.
-- MD5 es una comparación de definición normalizada, no una firma criptográfica.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='3s';
with esperado(nombre,firma,hash,propietario,definer,config,acl,anon,autenticado) as (values
  ${filas.join(',\n  ')}
)
select e.nombre||'('||e.firma||')' prueba,
  coalesce(
    md5(btrim(regexp_replace(pg_get_functiondef(p.oid),'[[:space:]]+',' ','g')))=e.hash
    and pg_get_userbyid(p.proowner)=e.propietario and p.prosecdef=e.definer
    and coalesce(to_jsonb(p.proconfig),'null'::jsonb)=e.config
    and array(select a::text from unnest(coalesce(p.proacl,'{}'::aclitem[])) a order by a::text)
        = array(select a from jsonb_array_elements_text(e.acl) a order by a)
    and has_function_privilege('anon',p.oid,'EXECUTE')=e.anon
    and has_function_privilege('authenticated',p.oid,'EXECUTE')=e.autenticado,false) correcto
from esperado e left join pg_proc p on p.pronamespace='public'::regnamespace
  and p.proname=e.nombre and pg_get_function_identity_arguments(p.oid)=e.firma
order by e.nombre;
rollback;
`;
fs.writeFileSync('supabase/verificacion-devd/90_funciones_originales.sql', sql);
console.log(`Control de ${filas.length} funciones originales preparado. Sin SQL remoto.`);
