-- QPass · Sprint 3 · Dev B · HU 15/16/36–40/46–49
-- Aplicación MANUAL después de D 000..004, A QR/reportes y C devoluciones.
-- Conserva datos. No establece una tasa de conversión ni modifica saldos heredados.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

do $$ begin
  if not exists(select 1 from pg_trigger where tgrelid='public.solicitudes_devolucion'::regclass and tgname='devd_reserva' and not tgisinternal)
    or not exists(select 1 from pg_constraint where conrelid='public.saldos_puntos'::regclass and conname='devd_saldo_cubre_reserva' and convalidated)
    or to_regprocedure('public.crear_solicitud_devolucion(integer,numeric,text)') is null then
    raise exception 'PREREQUISITOS_A_C_D_PENDIENTES';
  end if;
end $$;

create table public.devb_conversion (
  evento_id integer primary key references public.eventos(id),
  bs_por_punto numeric(16,6) not null check(bs_por_punto>0 and bs_por_punto<100000000 and bs_por_punto<>'NaN'::numeric),
  acuerdo text not null check(length(btrim(acuerdo)) between 5 and 500),
  actualizado_en timestamptz not null default now()
);
-- Sin filas predeterminadas: decisión del equipo, no equivalencia inventada.
alter table public.recargas add column puntos numeric(10,2), add column tasa numeric(16,6);
alter table public.recargas add constraint devb_recarga_nueva_valida check(puntos is null or
  (puntos>0 and puntos<>'NaN'::numeric and monto<>'NaN'::numeric and tasa>0 and tasa<>'NaN'::numeric));
alter table public.devoluciones add column evento_id integer references public.eventos(id),
  add column importe_simulado numeric(10,2), add column tasa numeric(16,6);
-- Los históricos sin evento/tasa permanecen sin inferencias.
create unique index devb_liquidacion_unica on public.devoluciones(solicitud_id) where solicitud_id is not null;
alter table public.solicitudes_devolucion add column liquidada_en timestamptz, add column cancelada_en timestamptz;
alter table public.reportes_recarga add column solicitud_id uuid;
create unique index devb_reporte_solicitud on public.reportes_recarga(usuario_id,solicitud_id);

create table public.devb_movimientos (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.usuarios(id),
  usuario_id uuid not null references public.usuarios(id),
  evento_id integer not null references public.eventos(id),
  tipo text not null check(tipo in ('recarga','ajuste','presencial','virtual')),
  solicitud uuid not null,
  payload jsonb not null,
  respuesta jsonb not null,
  delta numeric(10,2) not null,
  saldo_antes numeric(10,2) not null,
  saldo_despues numeric(10,2) not null,
  recarga_id integer references public.recargas(id),
  devolucion_id integer references public.devoluciones(id),
  creado_en timestamptz not null default now(),
  unique(actor_id,solicitud),
  check(saldo_despues=saldo_antes+delta and saldo_despues>=0)
);
create index devb_recargas_historial on public.recargas(recargador_id,evento_id,id desc);
create index devb_devoluciones_historial on public.devoluciones(encargado_id,evento_id,id desc);
alter table public.devb_conversion enable row level security;
alter table public.devb_movimientos enable row level security;
alter table public.recargas enable row level security;
alter table public.devoluciones enable row level security;
alter table public.reportes_recarga enable row level security;
revoke all on public.devb_conversion,public.devb_movimientos,public.recargas,public.devoluciones,
  public.reportes_recarga from public,anon,authenticated;

create function public.devb_inmutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'HISTORICO_FINANCIERO_INMUTABLE'; end $$;
create trigger devb_recarga_inmutable before update or delete on public.recargas for each row execute function public.devb_inmutable();
create trigger devb_devolucion_inmutable before update or delete on public.devoluciones for each row execute function public.devb_inmutable();
create trigger devb_movimiento_inmutable before update or delete on public.devb_movimientos for each row execute function public.devb_inmutable();

-- Extiende el acumulador existente de D: aprobada SIN liquidar aún reserva.
-- Solo una liquidación explícita permite liberar y descontar en la misma transacción.
create or replace function public.devd_mantener_reserva()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_antes numeric:=0; v_despues numeric:=0;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'AISLAMIENTO_NO_SOPORTADO'; end if;
  if tg_op='UPDATE' then
    if new.usuario_id is distinct from old.usuario_id or new.evento_id is distinct from old.evento_id then raise exception 'RESERVA_IDENTIDAD_INMUTABLE'; end if;
    if old.liquidada_en is not null and new is distinct from old then raise exception 'SOLICITUD_YA_PROCESADA'; end if;
    if old.estado='rechazada' and new is distinct from old then raise exception 'SOLICITUD_YA_PROCESADA'; end if;
    if new.liquidada_en is not null and (new.estado<>'aprobada' or new.monto_solicitado is distinct from old.monto_solicitado) then raise exception 'LIQUIDACION_INVALIDA'; end if;
    if old.estado in ('en_revision','aprobada') and old.liquidada_en is null then v_antes:=old.monto_solicitado; end if;
  elsif new.liquidada_en is not null then raise exception 'LIQUIDACION_INVALIDA';
  end if;
  if new.monto_solicitado='NaN'::numeric then raise exception 'MONTO_INVALIDO'; end if;
  if new.estado in ('en_revision','aprobada') and new.liquidada_en is null then v_despues:=new.monto_solicitado; end if;
  if v_despues<>v_antes then
    update public.saldos_puntos set reservado=reservado+v_despues-v_antes
    where usuario_id=new.usuario_id and evento_id=new.evento_id and reservado+v_despues-v_antes between 0 and saldo;
    if not found then raise exception 'SALDO_INSUFICIENTE_PARA_RESERVA'; end if;
  end if;
  return new;
end $$;

-- Igual contrato QR de A; agrega únicamente devolucion sujeto al mismo guard.
create or replace function public.identificar_qr(p_codigo text,p_evento integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id integer; v_origen text:='digital'; v_result jsonb;
begin
  if not public.qpass_autorizado_evento(p_evento,array['supervisor','recargador','ayudante','devolucion']) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_codigo is null or length(p_codigo) not between 1 and 255 or p_evento is null then raise exception 'DATOS_INVALIDOS' using errcode='22023'; end if;
  select id into v_id from public.entradas where codigo_qr=p_codigo;
  if v_id is null then
    v_origen:='fisico';
    select v.entrada_id into v_id from public.vinculos_qr_fisico v join public.lotes_qr_fisico l on l.id=v.lote_id where v.codigo_qr=p_codigo and l.evento_id=p_evento;
  end if;
  select jsonb_build_object('entradaId',en.id,'usuarioId',u.id,'nombre',u.nombre,'eventoId',t.evento_id,
    'origen',v_origen,'estadoEntrada',en.estado,'pagoConfirmado',c.estado_pago='confirmado',
    'aptaIngreso',en.estado='activa' and c.estado_pago='confirmado' and u.activo,
    'identificacionValida',en.estado in ('activa','usada') and c.estado_pago='confirmado' and u.activo)
  into v_result from public.entradas en join public.tipos_ticket t on t.id=en.tipo_ticket_id
  join public.compras c on c.id=en.compra_id join public.usuarios u on u.id=en.usuario_destino_id
  where en.id=v_id and t.evento_id=p_evento;
  if v_result is null then raise exception 'QR_NO_VALIDO_PARA_EVENTO'; end if;
  return v_result;
end $$;

create function public.devb_exigir_staff(p_evento integer,p_rol text)
returns void language plpgsql security definer set search_path='' as $$
declare v_rol text;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'AISLAMIENTO_NO_SOPORTADO'; end if;
  select rol::text into v_rol from public.usuarios where id=auth.uid() and activo for share;
  if v_rol is null or (v_rol<>p_rol and v_rol<>'admin') then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if v_rol<>'admin' then
    perform id from public.asignaciones_staff where usuario_id=auth.uid() and evento_id=p_evento and rol_staff::text=p_rol for share;
    if not found then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  end if;
  perform id from public.eventos where id=p_evento for share;
  if not found then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
end $$;

create function public.devb_identidad_bloqueada(p_codigo text,p_evento integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_inicial jsonb; v_actual jsonb;
begin
  v_inicial:=public.identificar_qr(p_codigo,p_evento);
  -- Orden común con A/D: compra -> tipo ticket -> entrada -> manilla -> usuario -> saldo.
  perform c.id from public.compras c join public.entradas e on e.compra_id=c.id where e.id=(v_inicial->>'entradaId')::integer for share of c;
  perform t.id from public.tipos_ticket t join public.entradas e on e.tipo_ticket_id=t.id where e.id=(v_inicial->>'entradaId')::integer for share of t;
  perform id from public.entradas where id=(v_inicial->>'entradaId')::integer for share;
  perform id from public.vinculos_qr_fisico where codigo_qr=p_codigo for share;
  perform id from public.usuarios where id=(v_inicial->>'usuarioId')::uuid and activo for share;
  if not found then raise exception 'IDENTIFICACION_INVALIDA'; end if;
  v_actual:=public.identificar_qr(p_codigo,p_evento);
  if v_actual->'usuarioId' is distinct from v_inicial->'usuarioId' or v_actual->'entradaId' is distinct from v_inicial->'entradaId'
    or (v_actual->>'identificacionValida')::boolean is distinct from true then raise exception 'IDENTIFICACION_INVALIDA'; end if;
  return v_actual;
end $$;

create function public.devb_reintento(p_solicitud uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op public.devb_movimientos%rowtype;
begin
  if p_solicitud is null then raise exception 'DATOS_INVALIDOS'; end if;
  perform pg_advisory_xact_lock(hashtextextended('devb:'||auth.uid()::text||':'||p_solicitud::text,0));
  select * into v_op from public.devb_movimientos where actor_id=auth.uid() and solicitud=p_solicitud;
  if found then
    if v_op.payload is distinct from p_payload then raise exception 'SOLICITUD_REUTILIZADA'; end if;
    return v_op.respuesta;
  end if;
  return null;
end $$;

create function public.devb_tasa(p_evento integer) returns numeric language plpgsql security definer set search_path='' as $$
declare v_tasa numeric;
begin
  select bs_por_punto into v_tasa from public.devb_conversion where evento_id=p_evento for share;
  if not found then raise exception 'CONVERSION_NO_CONFIGURADA'; end if;
  return v_tasa;
end $$;

create function public.devb_eventos(p_rol text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if p_rol not in ('recargador','devolucion') or not exists(select 1 from public.usuarios where id=auth.uid() and activo and (rol::text=p_rol or rol='admin')) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'titulo',e.titulo,'tasa',c.bs_por_punto::text) order by e.id desc),'[]') into v_result
  from public.eventos e left join public.devb_conversion c on c.evento_id=e.id
  where public.qpass_autorizado_evento(e.id,array[p_rol]);
  return v_result;
end $$;

create function public.consultar_saldo_staff(p_evento integer,p_codigo text,p_rol text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_i jsonb; v_result jsonb;
begin
  if p_rol not in ('recargador','devolucion') or p_rol is null then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  perform public.devb_exigir_staff(p_evento,p_rol);
  v_i:=public.identificar_qr(p_codigo,p_evento);
  if (v_i->>'identificacionValida')::boolean is distinct from true then raise exception 'IDENTIFICACION_INVALIDA'; end if;
  select jsonb_build_object('nombre',v_i->>'nombre','entradaId',v_i->'entradaId','saldo',coalesce(s.saldo,0)::text,
    'reservado',coalesce(s.reservado,0)::text,'disponible',coalesce(s.saldo-s.reservado,0)::text) into v_result
  from (values(1)) x(n) left join public.saldos_puntos s on s.usuario_id=(v_i->>'usuarioId')::uuid and s.evento_id=p_evento;
  return v_result;
end $$;

create function public.registrar_recarga(p_evento integer,p_codigo text,p_monto numeric,p_solicitud uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; v_r jsonb; v_i jsonb; v_tasa numeric; v_puntos numeric; v_s public.saldos_puntos%rowtype; v_id integer;
begin
  perform public.devb_exigir_staff(p_evento,'recargador');
  if p_monto is null or p_monto<=0 or p_monto>99999999.99 or p_monto='NaN'::numeric or p_monto<>round(p_monto,2)
    or p_codigo is null or length(p_codigo) not between 1 and 255 then raise exception 'DATOS_INVALIDOS'; end if;
  v_payload:=jsonb_build_object('tipo','recarga','evento',p_evento,'monto',p_monto,'qr',encode(sha256(convert_to(p_codigo,'UTF8')),'hex'));
  v_r:=public.devb_reintento(p_solicitud,v_payload); if v_r is not null then return v_r; end if;
  if not exists(select 1 from public.eventos where id=p_evento and estado='publicado' and (fecha_fin is null or fecha_fin>=now())) then raise exception 'EVENTO_NO_DISPONIBLE'; end if;
  v_tasa:=public.devb_tasa(p_evento); v_puntos:=p_monto/v_tasa;
  if v_puntos<>round(v_puntos,2) or v_puntos>99999999.99 or v_puntos<=0 then raise exception 'CONVERSION_INEXACTA'; end if;
  v_i:=public.devb_identidad_bloqueada(p_codigo,p_evento);
  insert into public.saldos_puntos(usuario_id,evento_id,saldo) values((v_i->>'usuarioId')::uuid,p_evento,0) on conflict(usuario_id,evento_id) do nothing;
  select * into v_s from public.saldos_puntos where usuario_id=(v_i->>'usuarioId')::uuid and evento_id=p_evento for update;
  if v_s.saldo+v_puntos>99999999.99 then raise exception 'SALDO_FUERA_DE_RANGO'; end if;
  insert into public.recargas(recargador_id,usuario_id,evento_id,monto,puntos,tasa) values(auth.uid(),v_s.usuario_id,p_evento,p_monto,v_puntos,v_tasa) returning id into v_id;
  update public.saldos_puntos set saldo=saldo+v_puntos where id=v_s.id;
  v_r:=jsonb_build_object('id',v_id,'referencia','QR-'||v_id,'puntos',v_puntos::numeric(10,2)::text,'importe',p_monto::numeric(10,2)::text,'saldo',(v_s.saldo+v_puntos)::numeric(10,2)::text,'simulada',true);
  insert into public.devb_movimientos(actor_id,usuario_id,evento_id,tipo,solicitud,payload,respuesta,delta,saldo_antes,saldo_despues,recarga_id)
  values(auth.uid(),v_s.usuario_id,p_evento,'recarga',p_solicitud,v_payload,v_r,v_puntos,v_s.saldo,v_s.saldo+v_puntos,v_id);
  return v_r;
end $$;

create function public.ajustar_recarga(p_recarga integer,p_monto_correcto numeric,p_motivo text,p_solicitud uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_c public.recargas%rowtype; v_s public.saldos_puntos%rowtype; v_delta numeric; v_actual numeric; v_nuevo numeric; v_payload jsonb; v_r jsonb;
begin
  select * into v_c from public.recargas where id=p_recarga;
  if not found then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  perform public.devb_exigir_staff(v_c.evento_id,'recargador');
  if v_c.recargador_id<>auth.uid() and not public.es_admin() then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_monto_correcto is null or p_monto_correcto<0 or p_monto_correcto>99999999.99 or p_monto_correcto='NaN'::numeric or p_monto_correcto<>round(p_monto_correcto,2)
    or p_motivo is null or length(btrim(p_motivo)) not between 5 and 500 then raise exception 'DATOS_INVALIDOS'; end if;
  v_payload:=jsonb_build_object('tipo','ajuste','recarga',p_recarga,'monto',p_monto_correcto,'motivo',btrim(p_motivo));
  v_r:=public.devb_reintento(p_solicitud,v_payload); if v_r is not null then return v_r; end if;
  perform id from public.usuarios where id=v_c.usuario_id and activo for share;
  if not found then raise exception 'CUENTA_INACTIVA'; end if;
  perform id from public.recargas where id=p_recarga for update;
  if v_c.puntos is null or v_c.tasa is null then raise exception 'RECARGA_HEREDADA_SIN_TASA'; end if;
  v_nuevo:=p_monto_correcto/v_c.tasa;
  if v_nuevo<>round(v_nuevo,2) or v_nuevo>99999999.99 then raise exception 'CONVERSION_INEXACTA'; end if;
  select v_c.puntos+coalesce(sum(delta),0) into v_actual from public.devb_movimientos where recarga_id=p_recarga and tipo='ajuste';
  v_delta:=v_nuevo-v_actual;
  select * into v_s from public.saldos_puntos where usuario_id=v_c.usuario_id and evento_id=v_c.evento_id for update;
  if not found or v_s.saldo+v_delta<v_s.reservado then raise exception 'SALDO_CONSUMIDO_O_RESERVADO'; end if;
  if v_s.saldo+v_delta>99999999.99 then raise exception 'SALDO_FUERA_DE_RANGO'; end if;
  update public.saldos_puntos set saldo=saldo+v_delta where id=v_s.id;
  v_r:=jsonb_build_object('id',p_recarga,'referencia','AJ-'||p_recarga,'puntos',v_delta::numeric(10,2)::text,'importe',p_monto_correcto::numeric(10,2)::text,'saldo',(v_s.saldo+v_delta)::numeric(10,2)::text,'simulada',true);
  insert into public.devb_movimientos(actor_id,usuario_id,evento_id,tipo,solicitud,payload,respuesta,delta,saldo_antes,saldo_despues,recarga_id)
  values(auth.uid(),v_c.usuario_id,v_c.evento_id,'ajuste',p_solicitud,v_payload,v_r,v_delta,v_s.saldo,v_s.saldo+v_delta,p_recarga);
  return v_r;
end $$;

create function public.reportar_recarga(p_recarga integer,p_descripcion text,p_solicitud uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_c public.recargas%rowtype; v_id integer; v_previa public.reportes_recarga%rowtype;
begin
  select * into v_c from public.recargas where id=p_recarga;
  if not found then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  perform public.devb_exigir_staff(v_c.evento_id,'recargador');
  if v_c.recargador_id<>auth.uid() and not public.es_admin() then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_solicitud is null or p_descripcion is null or length(btrim(p_descripcion)) not between 5 and 2000 then raise exception 'DATOS_INVALIDOS'; end if;
  perform pg_advisory_xact_lock(hashtextextended('devb-reporte:'||auth.uid()::text||p_solicitud::text,0));
  select * into v_previa from public.reportes_recarga where usuario_id=auth.uid() and solicitud_id=p_solicitud;
  if found then
    if v_previa.recarga_id<>p_recarga or v_previa.descripcion<>btrim(p_descripcion) then raise exception 'SOLICITUD_REUTILIZADA'; end if;
    return v_previa.id;
  end if;
  insert into public.reportes_recarga(recarga_id,usuario_id,descripcion,solicitud_id) values(p_recarga,auth.uid(),btrim(p_descripcion),p_solicitud) returning id into v_id;
  return v_id;
end $$;

-- Storage separado del QR bancario de C. Objetos inmutables por intento y tipo.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('devb-evidencias','devb-evidencias',false,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy devb_evidencias_insert on storage.objects for insert to authenticated with check(
  bucket_id='devb-evidencias' and split_part(name,'/',1)=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[1-9][0-9]{0,8}/[0-9a-f-]{36}/(comprobante|foto)\.(png|jpg|webp)$'
  and public.qpass_autorizado_evento(case when split_part(name,'/',2) ~ '^[1-9][0-9]{0,8}$' then split_part(name,'/',2)::integer end,array['devolucion'])
);
create policy devb_evidencias_select on storage.objects for select to authenticated using(
  bucket_id='devb-evidencias' and exists(select 1 from public.usuarios where id=auth.uid() and activo and rol in ('devolucion','admin'))
  and split_part(name,'/',1)=auth.uid()::text
  and public.qpass_autorizado_evento(case when split_part(name,'/',2) ~ '^[1-9][0-9]{0,8}$' then split_part(name,'/',2)::integer end,array['devolucion'])
);
-- Sin UPDATE/DELETE; una respuesta perdida puede recuperar el objeto, no reemplazarlo.
create function public.devb_archivo(p_ruta text,p_evento integer,p_solicitud uuid,p_tipo text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(p_ruta ~ ('^'||auth.uid()::text||'/'||p_evento::text||'/'||p_solicitud::text||'/'||p_tipo||'\.(png|jpg|webp)$')
    and exists(select 1 from storage.objects where bucket_id='devb-evidencias' and name=p_ruta),false);
$$;

create function public.registrar_devolucion(p_evento integer,p_codigo text,p_puntos numeric,p_comprobante text,p_foto text,p_solicitud uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; v_r jsonb; v_i jsonb; v_s public.saldos_puntos%rowtype; v_tasa numeric; v_bs numeric; v_id integer;
begin
  perform public.devb_exigir_staff(p_evento,'devolucion');
  if p_puntos is null or p_puntos<=0 or p_puntos>99999999.99 or p_puntos='NaN'::numeric or p_puntos<>round(p_puntos,2)
    or p_codigo is null or length(p_codigo) not between 1 and 255 then raise exception 'DATOS_INVALIDOS'; end if;
  v_payload:=jsonb_build_object('tipo','presencial','evento',p_evento,'puntos',p_puntos,'qr',encode(sha256(convert_to(p_codigo,'UTF8')),'hex'),'comprobante',p_comprobante,'foto',p_foto);
  v_r:=public.devb_reintento(p_solicitud,v_payload); if v_r is not null then return v_r; end if;
  if not public.devb_archivo(p_comprobante,p_evento,p_solicitud,'comprobante') or not public.devb_archivo(p_foto,p_evento,p_solicitud,'foto') then raise exception 'EVIDENCIA_INVALIDA'; end if;
  v_tasa:=public.devb_tasa(p_evento); v_bs:=p_puntos*v_tasa;
  if v_bs<>round(v_bs,2) or v_bs>99999999.99 then raise exception 'CONVERSION_INEXACTA'; end if;
  v_i:=public.devb_identidad_bloqueada(p_codigo,p_evento);
  select * into v_s from public.saldos_puntos where usuario_id=(v_i->>'usuarioId')::uuid and evento_id=p_evento for update;
  if not found or v_s.saldo-v_s.reservado<p_puntos then raise exception 'SALDO_INSUFICIENTE'; end if;
  insert into public.devoluciones(usuario_id,encargado_id,evento_id,monto,importe_simulado,tasa,comprobante_url,foto_usuario_url)
  values(v_s.usuario_id,auth.uid(),p_evento,p_puntos,v_bs,v_tasa,p_comprobante,p_foto) returning id into v_id;
  update public.saldos_puntos set saldo=saldo-p_puntos where id=v_s.id;
  v_r:=jsonb_build_object('id',v_id,'referencia','QD-'||v_id,'puntos',p_puntos::numeric(10,2)::text,'importe',v_bs::numeric(10,2)::text,'saldo',(v_s.saldo-p_puntos)::numeric(10,2)::text,'simulada',true);
  insert into public.devb_movimientos(actor_id,usuario_id,evento_id,tipo,solicitud,payload,respuesta,delta,saldo_antes,saldo_despues,devolucion_id)
  values(auth.uid(),v_s.usuario_id,p_evento,'presencial',p_solicitud,v_payload,v_r,-p_puntos,v_s.saldo,v_s.saldo-p_puntos,v_id);
  return v_r;
end $$;

create function public.liquidar_solicitud_devolucion(p_solicitud integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sol public.solicitudes_devolucion%rowtype; v_s public.saldos_puntos%rowtype; v_tasa numeric; v_bs numeric; v_id integer; v_r jsonb; v_clave uuid;
begin
  select * into v_sol from public.solicitudes_devolucion where id=p_solicitud;
  if not found then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  perform public.devb_exigir_staff(v_sol.evento_id,'devolucion');
  perform id from public.usuarios where id=v_sol.usuario_id and activo for share;
  if not found then raise exception 'CUENTA_INACTIVA'; end if;
  select * into v_sol from public.solicitudes_devolucion where id=p_solicitud for update;
  if v_sol.liquidada_en is not null then
    select m.respuesta into v_r from public.devb_movimientos m join public.devoluciones d on d.id=m.devolucion_id where d.solicitud_id=p_solicitud;
    if v_r is null then raise exception 'LIQUIDACION_INCONSISTENTE'; end if;
    return v_r;
  end if;
  if v_sol.estado not in ('en_revision','aprobada') then raise exception 'SOLICITUD_YA_PROCESADA'; end if;
  v_tasa:=public.devb_tasa(v_sol.evento_id); v_bs:=v_sol.monto_solicitado*v_tasa;
  if v_bs<>round(v_bs,2) or v_bs>99999999.99 then raise exception 'CONVERSION_INEXACTA'; end if;
  select * into v_s from public.saldos_puntos where usuario_id=v_sol.usuario_id and evento_id=v_sol.evento_id for update;
  if not found or v_s.reservado<v_sol.monto_solicitado or v_s.saldo<v_sol.monto_solicitado then raise exception 'RESERVA_INCONSISTENTE'; end if;
  -- Trigger D extendido libera primero; débito e histórico pertenecen al mismo commit.
  update public.solicitudes_devolucion set estado='aprobada',liquidada_en=now() where id=p_solicitud;
  update public.saldos_puntos set saldo=saldo-v_sol.monto_solicitado where id=v_s.id;
  insert into public.devoluciones(solicitud_id,usuario_id,encargado_id,evento_id,monto,importe_simulado,tasa,comprobante_url)
  values(p_solicitud,v_sol.usuario_id,auth.uid(),v_sol.evento_id,v_sol.monto_solicitado,v_bs,v_tasa,'SIMULADO-SOL-'||p_solicitud) returning id into v_id;
  v_r:=jsonb_build_object('id',v_id,'referencia','QD-'||v_id,'puntos',v_sol.monto_solicitado::text,'importe',v_bs::numeric(10,2)::text,'saldo',(v_s.saldo-v_sol.monto_solicitado)::numeric(10,2)::text,'simulada',true);
  v_clave:=gen_random_uuid();
  insert into public.devb_movimientos(actor_id,usuario_id,evento_id,tipo,solicitud,payload,respuesta,delta,saldo_antes,saldo_despues,devolucion_id)
  values(auth.uid(),v_sol.usuario_id,v_sol.evento_id,'virtual',v_clave,jsonb_build_object('solicitud',p_solicitud),v_r,-v_sol.monto_solicitado,v_s.saldo,v_s.saldo-v_sol.monto_solicitado,v_id);
  return v_r;
end $$;

create function public.consultar_mis_saldos() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r jsonb;
begin
  if not exists(select 1 from public.usuarios where id=auth.uid() and activo) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('eventoId',s.evento_id,'evento',e.titulo,'saldo',s.saldo::text,'reservado',s.reservado::text,'disponible',(s.saldo-s.reservado)::text) order by s.evento_id desc),'[]') into v_r
  from public.saldos_puntos s join public.eventos e on e.id=s.evento_id where s.usuario_id=auth.uid();
  return v_r;
end $$;

-- El cliente solo recibe confirmación de propiedad de SU manilla, sin PII de terceros.
create function public.consultar_ticket_extraviado(p_codigo text,p_evento integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id integer; v_r jsonb;
begin
  if not exists(select 1 from public.usuarios where id=auth.uid() and activo) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_codigo is null or length(p_codigo) not between 1 and 255 then raise exception 'DATOS_INVALIDOS'; end if;
  select en.id,jsonb_build_object('entradaId',en.id,'evento',e.titulo,'estado',en.estado,'propio',v.usuario_id=auth.uid()) into v_id,v_r
  from public.vinculos_qr_fisico v join public.lotes_qr_fisico l on l.id=v.lote_id join public.entradas en on en.id=v.entrada_id
  join public.tipos_ticket t on t.id=en.tipo_ticket_id join public.eventos e on e.id=t.evento_id
  where v.codigo_qr=p_codigo and l.evento_id=p_evento and t.evento_id=p_evento and v.usuario_id=en.usuario_destino_id
    and (v.usuario_id=auth.uid() or public.qpass_autorizado_evento(p_evento,array['supervisor','recargador','devolucion']));
  if v_id is null then return null; end if;
  if (v_r->>'propio')::boolean then return v_r; end if;
  -- Staff ve solo nombre/entrada/evento/estado: sin CI, correo, UUID ni QR bancario.
  return v_r||jsonb_build_object('nombre',(select u.nombre from public.entradas en join public.usuarios u on u.id=en.usuario_destino_id where en.id=v_id));
end $$;

create function public.historial_recargas(p_evento integer,p_antes integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r jsonb;
begin
  perform public.devb_exigir_staff(p_evento,'recargador');
  select coalesce(jsonb_agg(x.dato order by x.id desc),'[]') into v_r from (
    select r.id,jsonb_build_object('id',r.id,'nombre',u.nombre,'monto',r.monto::text,'puntos',r.puntos::text,'fecha',r.creado_en,
      'ajustes',coalesce((select jsonb_agg(jsonb_build_object('delta',m.delta::text,'motivo',m.payload->>'motivo','fecha',m.creado_en) order by m.id) from public.devb_movimientos m where m.recarga_id=r.id and m.tipo='ajuste'),'[]')) dato
    from public.recargas r join public.usuarios u on u.id=r.usuario_id
    where r.evento_id=p_evento and r.recargador_id=auth.uid() and (p_antes is null or r.id<p_antes) order by r.id desc limit 25
  ) x;
  return v_r;
end $$;

create function public.mis_reportes_recarga(p_antes integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r jsonb;
begin
  if not exists(select 1 from public.usuarios where id=auth.uid() and activo and rol in ('recargador','admin')) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x.dato order by x.id desc),'[]') into v_r from (
    select rr.id,jsonb_build_object('id',rr.id,'recargaId',rr.recarga_id,'descripcion',rr.descripcion,'estado',rr.estado,'fecha',rr.creado_en) dato
    from public.reportes_recarga rr join public.recargas r on r.id=rr.recarga_id where rr.usuario_id=auth.uid()
    and public.qpass_autorizado_evento(r.evento_id,array['recargador']) and (p_antes is null or rr.id<p_antes) order by rr.id desc limit 100
  ) x;
  return v_r;
end $$;

create function public.historial_devoluciones(p_evento integer,p_antes integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r jsonb;
begin
  perform public.devb_exigir_staff(p_evento,'devolucion');
  select coalesce(jsonb_agg(x.dato order by x.id desc),'[]') into v_r from (
    select d.id,jsonb_build_object('id',d.id,'nombre',u.nombre,'puntos',d.monto::text,'importe',d.importe_simulado::text,'fecha',d.procesado_en,'virtual',d.solicitud_id is not null,
      'comprobante',case when d.solicitud_id is null then d.comprobante_url else null end,'foto',d.foto_usuario_url) dato
    from public.devoluciones d join public.usuarios u on u.id=d.usuario_id
    where d.encargado_id=auth.uid() and coalesce(d.evento_id,(select s.evento_id from public.solicitudes_devolucion s where s.id=d.solicitud_id))=p_evento
    and (p_antes is null or d.id<p_antes) order by d.id desc limit 25
  ) x;
  return v_r;
end $$;

-- Firma compatible de C. La ruta privada es la clave idempotente del intento.
-- Se conserva plazo, titularidad, monto y reserva; una aprobada liquidada ya no bloquea una solicitud posterior.
create or replace function public.crear_solicitud_devolucion(p_evento integer,p_monto numeric,p_qr_ruta text)
returns integer language plpgsql security definer set search_path='' as $$
declare v_plazo integer; v_fin timestamptz; v_saldo public.saldos_puntos%rowtype; v_previa public.solicitudes_devolucion%rowtype; v_id integer;
begin
  perform id from public.usuarios where id=auth.uid() and activo for share;
  if not found then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_monto is null or p_monto<=0 or p_monto>99999999.99 or p_monto='NaN'::numeric or p_monto<>round(p_monto,2) then raise exception 'DATOS_INVALIDOS' using errcode='22023'; end if;
  if p_qr_ruta is null or p_qr_ruta not like auth.uid()::text||'/'||p_evento::text||'/%'
    or not exists(select 1 from storage.objects where bucket_id='devoluciones' and name=p_qr_ruta) then raise exception 'QR_INVALIDO'; end if;
  select * into v_saldo from public.saldos_puntos where usuario_id=auth.uid() and evento_id=p_evento for update;
  if not found then raise exception 'SIN_SALDO'; end if;
  select * into v_previa from public.solicitudes_devolucion where usuario_id=auth.uid() and evento_id=p_evento and qr_bancario_url=p_qr_ruta order by id limit 1;
  if found then
    if v_previa.monto_solicitado<>p_monto then raise exception 'SOLICITUD_REUTILIZADA'; end if;
    return v_previa.id;
  end if;
  select valor into v_plazo from public.devc_parametros where clave='plazo_devolucion_horas';
  if not found then raise exception 'PLAZO_NO_CONFIGURADO'; end if;
  select fecha_fin into v_fin from public.eventos where id=p_evento;
  if v_fin is null or now()<v_fin then raise exception 'EVENTO_NO_FINALIZADO'; end if;
  if now()>v_fin+v_plazo*interval '1 hour' then raise exception 'FUERA_DE_PLAZO'; end if;
  if exists(select 1 from public.solicitudes_devolucion where usuario_id=auth.uid() and evento_id=p_evento and estado in ('en_revision','aprobada') and liquidada_en is null) then raise exception 'SOLICITUD_PENDIENTE'; end if;
  if p_monto>v_saldo.saldo-v_saldo.reservado then raise exception 'SALDO_INSUFICIENTE'; end if;
  insert into public.solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url,estado)
  values(auth.uid(),p_evento,p_monto,p_qr_ruta,'en_revision') returning id into v_id;
  return v_id;
end $$;

create or replace function public.devc_mis_solicitudes_devolucion()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r jsonb;
begin
  if not exists(select 1 from public.usuarios where id=auth.uid() and activo) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'eventoId',s.evento_id,'evento',e.titulo,'monto',s.monto_solicitado::text,
    'estado',s.estado,'creadoEn',s.creado_en,'qrRuta',s.qr_bancario_url,'liquidada',s.liquidada_en is not null,'cancelada',s.cancelada_en is not null) order by s.id desc),'[]') into v_r
  from public.solicitudes_devolucion s join public.eventos e on e.id=s.evento_id where s.usuario_id=auth.uid();
  return v_r;
end $$;

create function public.cancelar_solicitud_devolucion(p_solicitud integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_s public.solicitudes_devolucion%rowtype;
begin
  if not exists(select 1 from public.usuarios where id=auth.uid() and activo) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  select * into v_s from public.solicitudes_devolucion where id=p_solicitud and usuario_id=auth.uid() for update;
  if not found then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if v_s.cancelada_en is not null then return; end if;
  if v_s.estado<>'en_revision' then raise exception 'SOLICITUD_YA_PROCESADA'; end if;
  update public.solicitudes_devolucion set estado='rechazada',cancelada_en=now() where id=p_solicitud;
end $$;
revoke all on function public.cancelar_solicitud_devolucion(integer) from public,anon,authenticated,service_role;
grant execute on function public.cancelar_solicitud_devolucion(integer) to authenticated;

-- Rechazar conserva la función C y libera por el mismo acumulador D.
-- Se conservan políticas/grants de A/C: solo se cierran los RPC nuevos explícitamente.
do $$ declare f record; begin
  for f in select p.oid::regprocedure firma,p.proname nombre from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'devb_%' or p.proname in ('registrar_recarga','ajustar_recarga','reportar_recarga','registrar_devolucion','liquidar_solicitud_devolucion','consultar_mis_saldos','consultar_saldo_staff','consultar_ticket_extraviado','historial_recargas','mis_reportes_recarga','historial_devoluciones'))
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.firma);
    if f.nombre in ('devb_eventos','registrar_recarga','ajustar_recarga','reportar_recarga','registrar_devolucion','liquidar_solicitud_devolucion','consultar_mis_saldos','consultar_saldo_staff','consultar_ticket_extraviado','historial_recargas','mis_reportes_recarga','historial_devoluciones') then execute format('grant execute on function %s to authenticated',f.firma); end if;
  end loop;
end $$;
commit;
