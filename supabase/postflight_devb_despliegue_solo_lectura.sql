-- Dev B: ejecutar DESPUÉS de B, además de verificacion_devb_saldos.sql.
-- No llama RPC financieras ni crea sesiones/usuarios/objetos Storage.
begin transaction read only;
set local lock_timeout='3s';
set local statement_timeout='30s';

with firmas(firma,expuesta) as (values
  ('devb_inmutable()',false), ('devb_exigir_staff(integer,text)',false),
  ('devb_identidad_bloqueada(text,integer)',false), ('devb_reintento(uuid,jsonb)',false),
  ('devb_tasa(integer)',false), ('devb_archivo(text,integer,uuid,text)',false),
  ('devb_eventos(text)',true), ('consultar_saldo_staff(integer,text,text)',true),
  ('registrar_recarga(integer,text,numeric,uuid)',true),
  ('ajustar_recarga(integer,numeric,text,uuid)',true), ('reportar_recarga(integer,text,uuid)',true),
  ('registrar_devolucion(integer,text,numeric,text,text,uuid)',true),
  ('liquidar_solicitud_devolucion(integer)',true), ('consultar_mis_saldos()',true),
  ('consultar_ticket_extraviado(text,integer)',true), ('historial_recargas(integer,integer)',true),
  ('mis_reportes_recarga(integer)',true), ('historial_devoluciones(integer,integer)',true),
  ('cancelar_solicitud_devolucion(integer)',true),
  ('identificar_qr(text,integer)',true), ('crear_solicitud_devolucion(integer,numeric,text)',true),
  ('devc_mis_solicitudes_devolucion()',true), ('devd_mantener_reserva()',false)
)
select firma,p.oid is not null presente,
  coalesce(pg_get_userbyid(p.proowner)='postgres',false) propietario_correcto,
  coalesce(p.prosecdef=(firma<>'devb_inmutable()'),false) seguridad_correcta,
  coalesce(p.proconfig @> array['search_path=""'],false) search_path_vacio,
  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=expuesta,false) permiso_authenticated_correcto,
  coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) anon_denegado,
  not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))
    where grantee=0 and privilege_type='EXECUTE') public_denegado
from firmas left join pg_proc p on p.oid=to_regprocedure('public.'||firma) order by firma;

with esperados(tabla,nombre,tipo) as (values
  ('recargas','devb_recarga_inmutable',27), ('devoluciones','devb_devolucion_inmutable',27),
  ('devb_movimientos','devb_movimiento_inmutable',27), ('solicitudes_devolucion','devd_reserva',23)
)
select tabla,nombre,exists(select 1 from pg_trigger where tgrelid=to_regclass('public.'||tabla)
  and tgname=nombre and tgenabled='O' and tgtype=tipo and not tgisinternal
  and tgfoid=to_regprocedure(case when nombre='devd_reserva' then 'public.devd_mantener_reserva()'
    else 'public.devb_inmutable()' end)) correcto from esperados order by tabla;

with tablas(nombre) as (values ('devb_conversion'),('devb_movimientos'),('recargas'),('devoluciones'),('reportes_recarga'))
select nombre,coalesce(c.relrowsecurity and not c.relforcerowsecurity,false) rls_correcta,
  coalesce(not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false) anon_sin_acceso,
  coalesce(not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false) authenticated_sin_acceso
from tablas left join pg_class c on c.oid=to_regclass('public.'||nombre) order by nombre;

with indices(nombre) as (values ('devb_liquidacion_unica'),('devb_reporte_solicitud'),
  ('devb_recargas_historial'),('devb_devoluciones_historial'))
select nombre,coalesce(i.indisvalid and i.indisready,false) correcto
from indices left join pg_index i on i.indexrelid=to_regclass('public.'||nombre) order by nombre;

-- Comparar definiciones con la migración revisada. Los nombres por sí solos no certifican equivalencia.
select c.relname indice,pg_get_indexdef(i.indexrelid) definicion
from pg_index i join pg_class c on c.oid=i.indexrelid
where c.relnamespace='public'::regnamespace and c.relname like 'devb_%' order by c.relname;
select c.conrelid::regclass tabla,c.conname,pg_get_constraintdef(c.oid) definicion,c.convalidated
from pg_constraint c where c.conrelid in (to_regclass('public.devb_conversion'),to_regclass('public.devb_movimientos'))
  or c.conname in ('devb_recarga_nueva_valida','devd_saldo_cubre_reserva') order by tabla,c.conname;

select 'storage_rls_activa' prueba,exists(select 1 from pg_class
  where oid='storage.objects'::regclass and relrowsecurity) correcto;
select 'bucket_privado_2mb_imagenes' prueba,exists(select 1 from storage.buckets
  where id='devb-evidencias' and not public and file_size_limit=2097152
    and allowed_mime_types @> array['image/png','image/jpeg','image/webp']
    and allowed_mime_types <@ array['image/png','image/jpeg','image/webp']) correcto;
select 'politicas_b_propias' prueba,count(*)=2 correcto from pg_policies
where schemaname='storage' and tablename='objects'
  and ((policyname='devb_evidencias_insert' and cmd='INSERT')
    or (policyname='devb_evidencias_select' and cmd='SELECT'));
-- Revisión humana obligatoria: una política ajena ALL/SELECT/UPDATE/DELETE puede ampliar acceso.
select policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname='storage' and tablename='objects' order by policyname;

-- Caso peligroso: una devolución anterior enlazada, sin liquidada_en, podría pagarse otra vez.
select 'sin_liquidaciones_heredadas_ambiguas' prueba,not exists(
  select 1 from public.devoluciones d join public.solicitudes_devolucion s on s.id=d.solicitud_id
  where s.liquidada_en is null) correcto;
select 'reservas_con_saldo' prueba,not exists(select 1 from public.solicitudes_devolucion d
  left join public.saldos_puntos s on s.usuario_id=d.usuario_id and s.evento_id=d.evento_id
  where d.estado in ('en_revision','aprobada') and d.liquidada_en is null and s.id is null) correcto;

-- Agregados: observar, no inventar configuraciones ni copiar datos personales.
select 'conversion' observacion,count(*) eventos_configurados from public.devb_conversion;
select 'plazo_virtual' observacion,exists(select 1 from public.devc_parametros
  where clave='plazo_devolucion_horas' and valor>0) configurado;
rollback;
