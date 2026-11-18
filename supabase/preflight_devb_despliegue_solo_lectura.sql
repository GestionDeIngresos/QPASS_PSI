-- Dev B: ejecutar ANTES de instalar B, con el esquema A/C/D ya preparado.
-- Solo catálogo, booleanos y agregados; no consulta nombres, QR, imágenes o saldos individuales.
-- Un resultado sin excepciones NO certifica aislamiento ni políticas Storage ajenas.
begin transaction read only;
set local lock_timeout='3s';
set local statement_timeout='30s';

select 'sesion' comprobacion, current_user='postgres' propietario_esperado,
  current_setting('transaction_read_only')='on' solo_lectura,
  current_setting('transaction_isolation')='read committed' aislamiento_esperado;

with requeridas(tabla,columnas) as (values
  ('usuarios','id,rol,activo,nombre'),
  ('eventos','id,titulo,estado,fecha_fin'),
  ('asignaciones_staff','id,usuario_id,evento_id,rol_staff'),
  ('compras','id,estado_pago'), ('tipos_ticket','id,evento_id'),
  ('entradas','id,compra_id,tipo_ticket_id,usuario_destino_id,codigo_qr,estado'),
  ('lotes_qr_fisico','id,evento_id'), ('vinculos_qr_fisico','id,lote_id,entrada_id,codigo_qr'),
  ('saldos_puntos','id,usuario_id,evento_id,saldo,reservado'),
  ('recargas','id,recargador_id,usuario_id,evento_id,monto,creado_en'),
  ('devoluciones','id,usuario_id,encargado_id,solicitud_id,monto,comprobante_url,foto_usuario_url,procesado_en'),
  ('reportes_recarga','id,usuario_id,recarga_id,descripcion,estado,creado_en'),
  ('solicitudes_devolucion','id,usuario_id,evento_id,monto_solicitado,qr_bancario_url,estado,creado_en'),
  ('devc_parametros','clave,valor')
), columnas as (select tabla,unnest(string_to_array(columnas,',')) columna from requeridas)
select tabla,columna,exists(select 1 from pg_attribute a
  where a.attrelid=to_regclass('public.'||tabla) and a.attname=columna
    and a.attnum>0 and not a.attisdropped) presente
from columnas order by tabla,columna;

with firmas(firma) as (values
  ('public.es_admin()'), ('public.qpass_autorizado_evento(integer,text[])'),
  ('public.identificar_qr(text,integer)'), ('public.devd_mantener_reserva()'),
  ('public.comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text)'),
  ('public.reportar_entrada_propia(integer,text,uuid)'),
  ('public.cobrar_venta(integer,integer,text,jsonb,uuid,numeric)'),
  ('public.listar_reportes_admin(text,text,text)'), ('public.resolver_reporte_admin(text,integer)'),
  ('public.crear_solicitud_devolucion(integer,numeric,text)'),
  ('public.devc_mis_solicitudes_devolucion()'), ('public.devc_eventos_devolucion_cliente()'),
  ('public.devc_eventos_encargado()'), ('public.listar_solicitudes_devolucion(integer,text)'),
  ('public.rechazar_solicitud_devolucion(integer)')
)
select firma,p.oid is not null presente,p.prosecdef security_definer,
  pg_get_userbyid(p.proowner) propietario,p.proconfig configuracion,p.proacl permisos,
  md5(pg_get_functiondef(p.oid)) huella_definicion
from firmas left join pg_proc p on p.oid=to_regprocedure(firma) order by firma;

-- Revisar TODO el inventario: políticas permisivas ajenas pueden abrir el bucket nuevo.
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where (schemaname='storage' and tablename='objects')
  or (schemaname='public' and tablename in ('recargas','devoluciones','reportes_recarga','saldos_puntos','solicitudes_devolucion'))
order by schemaname,tablename,policyname;
select n.nspname esquema,c.relname tabla,c.relrowsecurity rls,c.relforcerowsecurity rls_forzada,c.relacl permisos
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='storage' and c.relname in ('objects','buckets'))
  or (n.nspname='public' and c.relname in ('usuarios','eventos','recargas','devoluciones','reportes_recarga','saldos_puntos','solicitudes_devolucion'))
order by esquema,tabla;
select t.tgrelid::regclass tabla,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definicion
from pg_trigger t where not t.tgisinternal and t.tgrelid in
  (to_regclass('public.recargas'),to_regclass('public.devoluciones'),to_regclass('public.reportes_recarga'),
   to_regclass('public.saldos_puntos'),to_regclass('public.solicitudes_devolucion')) order by tabla,t.tgname;

-- Barreras de instalación. Cualquier excepción exige detenerse y revisar, no borrar objetos/datos.
do $$
declare firma text; tabla text;
begin
  if current_user<>'postgres' then raise exception 'DEVB_REQUIERE_POSTGRES'; end if;
  foreach firma in array array['public.es_admin()','public.qpass_autorizado_evento(integer,text[])',
    'public.identificar_qr(text,integer)','public.devd_mantener_reserva()',
    'public.comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text)',
    'public.reportar_entrada_propia(integer,text,uuid)',
    'public.cobrar_venta(integer,integer,text,jsonb,uuid,numeric)',
    'public.listar_reportes_admin(text,text,text)','public.resolver_reporte_admin(text,integer)',
    'public.crear_solicitud_devolucion(integer,numeric,text)','public.devc_mis_solicitudes_devolucion()',
    'public.devc_eventos_devolucion_cliente()','public.devc_eventos_encargado()',
    'public.listar_solicitudes_devolucion(integer,text)','public.rechazar_solicitud_devolucion(integer)'] loop
    if not exists(select 1 from pg_proc p where p.oid=to_regprocedure(firma)
      and p.prosecdef and pg_get_userbyid(p.proowner)='postgres') then
      raise exception 'DEVB_PRERREQUISITO_RPC: %',firma;
    end if;
  end loop;
  foreach tabla in array array['public.recargas','public.devoluciones','public.reportes_recarga',
    'public.saldos_puntos','public.solicitudes_devolucion','public.devc_parametros','storage.objects','storage.buckets'] loop
    if to_regclass(tabla) is null then raise exception 'DEVB_PRERREQUISITO_TABLA: %',tabla; end if;
  end loop;
  -- CREATE OR REPLACE conserva estas ACL: B no las sanea al reemplazar A/C.
  foreach firma in array array['public.identificar_qr(text,integer)',
    'public.crear_solicitud_devolucion(integer,numeric,text)','public.devc_mis_solicitudes_devolucion()'] loop
    if not has_function_privilege('authenticated',to_regprocedure(firma),'EXECUTE')
      or has_function_privilege('anon',to_regprocedure(firma),'EXECUTE')
      or exists(select 1 from pg_proc p,
        lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where p.oid=to_regprocedure(firma) and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'DEVB_ACL_HEREDADA_INCOMPATIBLE: %',firma;
    end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.saldos_puntos'::regclass
    and conname='saldos_puntos_usuario_id_evento_id_key' and contype='u' and convalidated)
    or not exists(select 1 from pg_constraint where conrelid='public.saldos_puntos'::regclass
    and conname='devd_saldo_cubre_reserva' and contype='c' and convalidated) then
    raise exception 'DEVB_PRERREQUISITO_RESTRICCIONES_D';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.solicitudes_devolucion'::regclass
    and tgname='devd_reserva' and tgfoid=to_regprocedure('public.devd_mantener_reserva()')
    and tgtype=23 and tgenabled='O' and not tgisinternal)
    or not exists(select 1 from pg_trigger where tgrelid='public.saldos_puntos'::regclass
    and tgname='devd_saldo_claves' and tgenabled='O' and not tgisinternal) then
    raise exception 'DEVB_PRERREQUISITO_TRIGGERS_D';
  end if;
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then
    raise exception 'DEVB_STORAGE_SIN_RLS';
  end if;
  if exists(select 1 from pg_class where oid in ('public.usuarios'::regclass,'public.eventos'::regclass,
    'public.saldos_puntos'::regclass,'public.solicitudes_devolucion'::regclass) and relforcerowsecurity) then
    raise exception 'DEVB_RLS_FORZADA_REQUIERE_REVISION';
  end if;
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='rol_usuario' and e.enumlabel='recargador')
    or not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='rol_usuario' and e.enumlabel='devolucion') then
    raise exception 'DEVB_FALTAN_ROLES_ENUM';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('devb_conversion','devb_movimientos','devb_movimientos_id_seq',
    'devb_liquidacion_unica','devb_reporte_solicitud','devb_recargas_historial','devb_devoluciones_historial'))
    or exists(select 1 from pg_attribute where not attisdropped and (
    (attrelid='public.recargas'::regclass and attname in ('puntos','tasa')) or
    (attrelid='public.devoluciones'::regclass and attname in ('evento_id','importe_simulado','tasa')) or
    (attrelid='public.solicitudes_devolucion'::regclass and attname in ('liquidada_en','cancelada_en')) or
    (attrelid='public.reportes_recarga'::regclass and attname='solicitud_id')))
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and (p.proname like 'devb_%' or p.proname in ('registrar_recarga','ajustar_recarga','reportar_recarga',
    'registrar_devolucion','liquidar_solicitud_devolucion','consultar_mis_saldos','consultar_saldo_staff',
    'consultar_ticket_extraviado','historial_recargas','mis_reportes_recarga','historial_devoluciones','cancelar_solicitud_devolucion')))
    or exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname in ('devb_evidencias_insert','devb_evidencias_select')) then
    raise exception 'DEVB_INSTALACION_PREVIA_O_COLISION: no reaplicar';
  end if;
  if exists(select 1 from public.devoluciones where solicitud_id is not null group by solicitud_id having count(*)>1) then
    raise exception 'DEVB_LIQUIDACIONES_DUPLICADAS: conciliar sin borrar';
  end if;
  if exists(select 1 from public.devoluciones where solicitud_id is not null) then
    raise exception 'DEVB_LIQUIDACIONES_HEREDADAS: acordar marcacion antes de permitir otra liquidacion';
  end if;
  if exists(select 1 from public.saldos_puntos s where s.saldo<s.reservado or s.reservado<0
    or s.saldo='NaN'::numeric or s.reservado='NaN'::numeric or s.reservado is distinct from (
    select coalesce(sum(d.monto_solicitado),0) from public.solicitudes_devolucion d
    where d.usuario_id=s.usuario_id and d.evento_id=s.evento_id and d.estado in ('en_revision','aprobada')))
    or exists(select 1 from public.solicitudes_devolucion d left join public.saldos_puntos s
    on s.usuario_id=d.usuario_id and s.evento_id=d.evento_id
    where d.estado in ('en_revision','aprobada') and s.id is null) then
    raise exception 'DEVB_RESERVAS_INCONSISTENTES: no se corrigen automaticamente';
  end if;
end $$;

select 'historicos_sin_backfill' observacion,
  (select count(*) from public.recargas) recargas_heredadas,
  (select count(*) from public.devoluciones where solicitud_id is null) devoluciones_sin_solicitud;
select 'operadores_activos_asignados' observacion,r.rol,
  count(distinct u.id) cantidad
from (values ('recargador'),('devolucion')) r(rol)
left join public.usuarios u on u.rol::text=r.rol and u.activo and exists(
  select 1 from public.asignaciones_staff a where a.usuario_id=u.id and a.rol_staff::text=r.rol)
group by r.rol order by r.rol;
select 'plazo_virtual_configurado' observacion,exists(select 1 from public.devc_parametros
  where clave='plazo_devolucion_horas' and valor>0) configurado;
select 'buckets' observacion,id,public,file_size_limit,allowed_mime_types
from storage.buckets where id in ('devoluciones','devb-evidencias');
-- El historial manual/CLI no sustituye el catálogo. Solo se informa si existe, no se altera.
select 'historial_cli_disponible' observacion,to_regclass('supabase_migrations.schema_migrations') is not null disponible;
rollback;
