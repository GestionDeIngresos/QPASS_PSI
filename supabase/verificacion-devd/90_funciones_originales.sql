-- Generado desde catálogo SHA256 dbee7ad1fa7f95ea7741d7e61eca365f174caa1087adc781f58c9718574c4a07.
-- Ejecutar después de CADA migración. Todas las filas correcto=true.
-- MD5 es una comparación de definición normalizada, no una firma criptográfica.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='3s';
with esperado(nombre,firma,hash,propietario,definer,config,acl,anon,autenticado) as (values
  ('comprar_entradas','p_evento_id text, p_lineas jsonb, p_correo_destino text','908e0e6e690782a586b428fa79365784','postgres',true,'["search_path=public"]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('comprar_entradas_prueba','p_evento_id text, p_lineas jsonb, p_correo_destino text, p_solicitud_id uuid, p_resultado text','46a7670b9234a6a2b60815267503cfd8','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('consultar_lote_qr','p_lote integer','c0cc76a44e748162a58e7a5dbd3053af','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('corregir_acceso','p_id integer, p_version integer, p_resultado text, p_observacion text, p_motivo text, p_eliminar boolean','c1b1f8b2801a0c4b1b6885cf38c565d4','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('eliminar_evento_sin_ventas','p_evento_id integer','cd83e3fa3db9fe30b8c7e11a568ea29b','postgres',false,'["search_path=public"]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('es_admin','','b5d2ab3e501a3e5b3364a8093bc91995','postgres',true,'["search_path=public"]'::jsonb,'["postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,true,true),
  ('estadisticas_evento','p_evento_id integer','6ae38b046bc1835f692d86b4bff540f5','postgres',true,'["search_path=public"]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('evento_tiene_entradas','p_evento_id integer','d1acb5c3d1768ced5e0f62db814342c1','postgres',true,'["search_path=public"]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('eventos_supervisor','','52aee8458effb6320c352dc474f9ab7d','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('generar_lote_qr','p_evento integer, p_cantidad integer, p_solicitud uuid','6ae7d7f6ff94a3a2c43da121d90f95d0','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('guardar_evento_completo','p_evento_id integer, p_organizador_id uuid, p_estado estado_evento, p_datos jsonb, p_tickets jsonb','9821076581c0d664530bfd52bb3c9a04','postgres',false,'["search_path=public"]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('handle_new_user','','2b6d23064efc22d3bffc5bb57d10212f','postgres',true,'null'::jsonb,'["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,true,true),
  ('historial_accesos','p_evento integer, p_resultado text, p_fecha date, p_incluir_eliminados boolean','b1dce81eb3c31567cee6b3f6205761c4','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('identificar_qr','p_codigo text, p_evento integer','b448f0d5d5a3344b5f938858532f7d3d','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('incrementar_version_edicion','','2b895aeec60dce77228aef5a4fccfa33','postgres',false,'["search_path=\"\""]'::jsonb,'["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,true,true),
  ('listar_reportes_admin','p_tipo text, p_estado text, p_busqueda text','a9af5bda7ce87c070c18ab0275c1b8c0','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('proteger_campos_evento','','d01d75c5ae232404ea5ce5e253071b31','postgres',false,'["search_path=public"]'::jsonb,'["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,true,true),
  ('qpass_autorizado_evento','p_evento integer, p_roles text[]','1469b5055962ecbddb0d9f1402da4b83','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('registrar_acceso','p_codigo text, p_evento integer, p_permitir boolean, p_foto text, p_solicitud uuid','197071354e550f31f4b4f7f2f023435b','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('reportar_acceso','p_id integer, p_descripcion text, p_solicitud uuid','c19a9e6f354892943f616f5da91dac84','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('resolver_reporte_admin','p_tipo text, p_id integer','77779bab99217a4fe96591c8d91edc18','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('resumen_dashboard','p_evento integer','e8ec8b22d8fdb1c44e2ba651b3ca9423','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true),
  ('sincronizar_correo_usuario','','459ac1e46dba6cbb8a794fcd61bb0cdd','postgres',true,'["search_path=public"]'::jsonb,'["postgres=X/postgres","service_role=X/postgres"]'::jsonb,false,false),
  ('usuarios_proteger_campos','','438674c7b45a8ea50e94b307d5728a67','postgres',false,'["search_path=public"]'::jsonb,'["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,true,true),
  ('vincular_manilla','p_codigo text, p_entrada_codigo text, p_carnet text','aacdab54093fce130b579fb22830e21a','postgres',true,'["search_path=\"\""]'::jsonb,'["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]'::jsonb,false,true)
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
