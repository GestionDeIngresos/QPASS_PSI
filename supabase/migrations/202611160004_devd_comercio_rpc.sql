-- RPC de aplicación. Sin claves administrativas ni confianza en precios cliente.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' or current_setting('session_replication_role')<>'origin'
    or exists(select 1 from pg_roles where rolname='service_role' and rolsuper)
    or has_parameter_privilege('service_role','session_replication_role','SET')
    or pg_has_role('service_role','postgres','SET') or pg_has_role('service_role','postgres','USAGE')
    or exists(select 1 from pg_class where oid in ('public.ventas'::regclass,'public.venta_items'::regclass)
      and pg_get_userbyid(relowner)<>'postgres') then
    raise exception 'CONFIGURACION_FINANCIERA_INSEGURA: revisar propietario, rol y triggers';
  end if;
end $$;
-- BYPASSRLS no omite triggers. Quitar las vías administrativas heredadas que
-- sí podrían vaciar tablas sin triggers de fila o reemplazar estas barreras.
revoke truncate,trigger on public.ventas,public.venta_items from service_role;

create or replace function public.devd_venta_visible(p_venta integer,p_evento integer)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ventas v join public.ayudantes a on a.id=v.ayudante_id
    where v.id=p_venta and v.evento_id=p_evento and v.confirmada_en is not null
      and v.cobrador_id=auth.uid() and a.usuario_id=auth.uid() and a.negocio_id=v.negocio_id
      and public.devd_negocio_autorizado(p_evento,v.negocio_id));
$$;
revoke all on function public.devd_venta_visible(integer,integer) from public,anon,authenticated,service_role;

create or replace function public.devd_venta_dto(p_venta integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',v.id::text,'referencia','QV-'||v.id,'estado','confirmada',
    'fecha',to_char(v.creado_en at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'eventoId',v.evento_id,'negocioId',v.negocio_id::text,
    'ayudanteId',v.cobrador_id::text,'negocioNombreHistorico',v.negocio_nombre_historico,
    'total',v.total::text,'items',(select coalesce(jsonb_agg(jsonb_build_object(
      'productoId',i.producto_id::text,'nombreHistorico',i.producto_nombre_historico,
      'cantidad',i.cantidad,'precioUnitarioHistorico',i.precio_unitario::text,
      'subtotal',(i.cantidad*i.precio_unitario)::text) order by i.producto_id),'[]'::jsonb)
      from public.venta_items i where i.venta_id=v.id))
  from public.ventas v where v.id=p_venta;
$$;
revoke all on function public.devd_venta_dto(integer) from public,anon,authenticated,service_role;

create or replace function public.consultar_catalogo_ayudante(p_evento integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_resultado jsonb;
begin
  if not exists(select 1 from public.usuarios where id=auth.uid() and activo and rol='ayudante')
    or not public.qpass_autorizado_evento(p_evento,array['ayudante']) then
    raise exception 'SIN_PERMISOS' using errcode='42501';
  end if;
  select jsonb_build_object('eventoId',p_evento,
    'negocios',coalesce((select jsonb_agg(jsonb_build_object('id',n.id::text,'nombre',n.nombre,
      'eventoId',p_evento) order by n.id) from public.negocios n
      where public.devd_negocio_autorizado(p_evento,n.id)),'[]'::jsonb),
    'productos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id::text,
      'negocioId',p.negocio_id::text,'nombre',p.nombre,'precioEnPuntos',p.precio::text,
      'disponibleParaVenta',p.disponible and p.precio<>'NaN'::numeric) order by p.id)
      from public.productos p where public.devd_negocio_autorizado(p_evento,p.negocio_id)),'[]'::jsonb))
    into v_resultado;
  return v_resultado;
end $$;

create or replace function public.consultar_saldo_venta(p_evento integer,p_negocio integer,p_codigo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_identidad jsonb; v_resultado jsonb;
begin
  if not public.devd_negocio_autorizado(p_evento,p_negocio) then
    raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  v_identidad:=public.identificar_qr(p_codigo,p_evento);
  if (v_identidad->>'identificacionValida')::boolean is distinct from true then
    raise exception 'QR_NO_VALIDO_PARA_VENTA'; end if;
  select jsonb_build_object('entradaId',v_identidad->'entradaId','nombre',v_identidad->>'nombre',
    'saldo',s.saldo::text,'reservado',s.reservado::text,'gastable',(s.saldo-s.reservado)::text)
    into v_resultado from public.saldos_puntos s
    where s.usuario_id=(v_identidad->>'usuarioId')::uuid and s.evento_id=p_evento;
  if v_resultado is null then raise exception 'SALDO_NO_DISPONIBLE'; end if;
  return v_resultado;
end $$;

create or replace function public.cobrar_venta(
  p_evento integer,p_negocio integer,p_codigo text,p_lineas jsonb,
  p_solicitud uuid,p_total_esperado numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_ayudante integer; v_identidad jsonb; v_revalidada jsonb;
  v_payload jsonb; v_lineas jsonb; v_previa public.ventas%rowtype;
  v_saldo public.saldos_puntos%rowtype; v_total numeric:=0; v_id integer;
  v_linea record; v_producto public.productos%rowtype; v_negocio public.negocios%rowtype;
  v_precio numeric; v_cantidad integer; v_productos jsonb:='[]'; v_respuesta jsonb;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'AISLAMIENTO_NO_SOPORTADO'; end if;
  if v_uid is null then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_evento is null or p_negocio is null or p_solicitud is null
    or p_codigo is null or length(p_codigo) not between 1 and 255
    or p_total_esperado is null or p_total_esperado<0 or p_total_esperado>99999999.99
    or p_total_esperado='NaN'::numeric or p_total_esperado<>round(p_total_esperado,2)
    or jsonb_typeof(p_lineas) is distinct from 'array' then raise exception 'DATOS_INVALIDOS'; end if;
  if jsonb_array_length(p_lineas) not between 1 and 50 then raise exception 'LINEAS_INVALIDAS'; end if;
  for v_linea in select value as dato from jsonb_array_elements(p_lineas) loop
    if jsonb_typeof(v_linea.dato) is distinct from 'object' then raise exception 'LINEAS_INVALIDAS'; end if;
    if (select count(*) from jsonb_object_keys(v_linea.dato))<>2
      or coalesce(v_linea.dato->>'producto_id','') !~ '^[1-9][0-9]{0,8}$'
      or jsonb_typeof(v_linea.dato->'cantidad') is distinct from 'number'
      or coalesce(v_linea.dato->>'cantidad','') !~ '^[1-9][0-9]{0,2}$' then raise exception 'LINEAS_INVALIDAS'; end if;
  end loop;
  if (select count(distinct (x->>'producto_id')::integer) from jsonb_array_elements(p_lineas) x)
    <>jsonb_array_length(p_lineas) then raise exception 'PRODUCTO_REPETIDO'; end if;
  select jsonb_agg(jsonb_build_object('producto_id',(x->>'producto_id')::integer,
    'cantidad',(x->>'cantidad')::integer) order by (x->>'producto_id')::integer)
    into v_lineas from jsonb_array_elements(p_lineas) x;
  v_payload:=jsonb_build_object('evento',p_evento,'negocio',p_negocio,'lineas',v_lineas,
    'qr_sha256',encode(sha256(convert_to(p_codigo,'UTF8')),'hex'),'total_esperado',p_total_esperado);
  perform pg_advisory_xact_lock(hashtextextended('devd:venta:'||v_uid::text||':'||p_solicitud::text,0));

  -- Bloquear autorizaciones frente a bajas concurrentes. Se permite más de un negocio.
  perform u.id from public.usuarios u where u.id=v_uid and u.activo and u.rol='ayudante' for share;
  if not found then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  perform s.id from public.asignaciones_staff s where s.usuario_id=v_uid and s.evento_id=p_evento
    and s.rol_staff='ayudante' for share;
  if not found then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  select * into v_negocio from public.negocios where id=p_negocio and estado for share;
  if not found then raise exception 'NEGOCIO_NO_AUTORIZADO' using errcode='42501'; end if;
  perform negocio_id from public.negocios_eventos where negocio_id=p_negocio and evento_id=p_evento and activo for share;
  if not found then raise exception 'NEGOCIO_NO_AUTORIZADO' using errcode='42501'; end if;
  select id into v_ayudante from public.ayudantes where usuario_id=v_uid and negocio_id=p_negocio and activo for share;
  if not found then raise exception 'NEGOCIO_NO_AUTORIZADO' using errcode='42501'; end if;

  -- Respuesta perdida: recuperar ANTES de volver a validar QR/precios/saldo.
  select * into v_previa from public.ventas where cobrador_id=v_uid and solicitud_id=p_solicitud;
  if found then
    if v_previa.solicitud_payload is distinct from v_payload then raise exception 'SOLICITUD_REUTILIZADA'; end if;
    if v_previa.confirmada_en is null or v_previa.respuesta is null then raise exception 'VENTA_INCONSISTENTE'; end if;
    return v_previa.respuesta;
  end if;

  perform id from public.eventos where id=p_evento and estado='publicado'
    and (fecha_fin is null or fecha_fin>=now()) for share;
  if not found then raise exception 'EVENTO_NO_DISPONIBLE'; end if;
  v_identidad:=public.identificar_qr(p_codigo,p_evento);
  -- Orden relativo compartido con A: compra -> ticket -> entrada -> manilla.
  -- SHARE permite ventas paralelas; el saldo serializa los débitos distintos.
  perform c.id from public.compras c join public.entradas en on en.compra_id=c.id
    where en.id=(v_identidad->>'entradaId')::integer for share of c;
  perform t.id from public.tipos_ticket t join public.entradas en on en.tipo_ticket_id=t.id
    where en.id=(v_identidad->>'entradaId')::integer for share of t;
  perform id from public.entradas where id=(v_identidad->>'entradaId')::integer for share;
  perform id from public.vinculos_qr_fisico where codigo_qr=p_codigo for share;
  perform id from public.usuarios where id=(v_identidad->>'usuarioId')::uuid and activo for share;
  if not found then raise exception 'QR_NO_VALIDO_PARA_VENTA'; end if;
  v_revalidada:=public.identificar_qr(p_codigo,p_evento);
  if v_revalidada->'entradaId' is distinct from v_identidad->'entradaId'
    or v_revalidada->'usuarioId' is distinct from v_identidad->'usuarioId'
    or (v_revalidada->>'identificacionValida')::boolean is distinct from true then
    raise exception 'QR_NO_VALIDO_PARA_VENTA'; end if;

  -- Productos bloqueados por id en orden común; jamás usar precios del cliente.
  for v_producto in select p.* from public.productos p where p.id in
    (select (x->>'producto_id')::integer from jsonb_array_elements(v_lineas) x)
    order by p.id for share
  loop
    if v_producto.negocio_id<>p_negocio or not v_producto.disponible or v_producto.precio='NaN'::numeric then
      raise exception 'PRODUCTO_NO_DISPONIBLE'; end if;
    select (x->>'cantidad')::integer into v_cantidad from jsonb_array_elements(v_lineas) x
      where (x->>'producto_id')::integer=v_producto.id;
    v_precio:=v_producto.precio;
    v_total:=v_total+v_precio*v_cantidad;
    v_productos:=v_productos||jsonb_build_array(jsonb_build_object('id',v_producto.id,
      'nombre',v_producto.nombre,'cantidad',v_cantidad,'precio',v_precio));
  end loop;
  if jsonb_array_length(v_productos)<>jsonb_array_length(v_lineas) then raise exception 'PRODUCTO_NO_DISPONIBLE'; end if;
  if v_total>99999999.99 then raise exception 'TOTAL_FUERA_DE_RANGO'; end if;
  if v_total<>p_total_esperado then raise exception 'PRECIO_CAMBIO'; end if;
  select * into v_saldo from public.saldos_puntos where usuario_id=(v_revalidada->>'usuarioId')::uuid
    and evento_id=p_evento for update;
  if not found then raise exception 'SALDO_NO_DISPONIBLE'; end if;
  if v_saldo.saldo-v_saldo.reservado<v_total then raise exception 'SALDO_INSUFICIENTE'; end if;

  insert into public.ventas(ayudante_id,cobrador_id,cliente_id,evento_id,negocio_id,total,
    solicitud_id,solicitud_payload,negocio_nombre_historico,entrada_id)
  values(v_ayudante,v_uid,(v_revalidada->>'usuarioId')::uuid,p_evento,p_negocio,v_total,
    p_solicitud,v_payload,v_negocio.nombre,(v_revalidada->>'entradaId')::integer) returning id into v_id;
  insert into public.venta_items(venta_id,producto_id,cantidad,precio_unitario,producto_nombre_historico)
    select v_id,(x->>'id')::integer,(x->>'cantidad')::integer,(x->>'precio')::numeric,x->>'nombre'
    from jsonb_array_elements(v_productos) x;
  update public.saldos_puntos set saldo=saldo-v_total where id=v_saldo.id;
  v_respuesta:=public.devd_venta_dto(v_id);
  update public.ventas set confirmada_en=now(),respuesta=v_respuesta where id=v_id;
  return v_respuesta;
end $$;

create or replace function public.consultar_detalle_venta(p_evento integer,p_venta integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.devd_venta_visible(p_venta,p_evento) then return null; end if;
  return public.devd_venta_dto(p_venta);
end $$;

create or replace function public.consultar_resumen_ventas(p_evento integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_resultado jsonb; v_hoy date:=(now() at time zone 'America/La_Paz')::date;
begin
  if not exists(select 1 from public.usuarios where id=auth.uid() and activo and rol='ayudante')
    or not public.qpass_autorizado_evento(p_evento,array['ayudante']) then
    raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  select jsonb_build_object('ventasDia',count(*) filter(where (v.creado_en at time zone 'America/La_Paz')::date=v_hoy),
    'ventasMes',count(*) filter(where date_trunc('month',v.creado_en at time zone 'America/La_Paz')=date_trunc('month',v_hoy::timestamp)),
    'puntosCobrados',coalesce(sum(v.total),0)::text,'cantidadConfirmadas',count(*)) into v_resultado
    from public.ventas v where v.evento_id=p_evento and v.cobrador_id=auth.uid()
      and public.devd_venta_visible(v.id,p_evento);
  return v_resultado;
end $$;

create or replace function public.consultar_historial_ventas(
  p_evento integer,p_desde date default null,p_hasta date default null,
  p_negocio integer default null,p_referencia text default '',p_antes integer default null,p_limite integer default 25
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_ids integer[]; v_resultado jsonb; v_catalogo jsonb;
begin
  v_catalogo:=public.consultar_catalogo_ayudante(p_evento);
  if p_limite is null or p_limite not between 1 and 100 or p_referencia is null
    or length(p_referencia)>80 or (p_desde is not null and p_hasta is not null and p_desde>p_hasta)
    or (p_antes is not null and p_antes<1) then raise exception 'DATOS_INVALIDOS'; end if;
  -- Cursor de id descendente, estable e independiente de fechas iguales.
  select array_agg(x.id order by x.id desc) into v_ids from (
    select v.id from public.ventas v where v.evento_id=p_evento and v.cobrador_id=auth.uid()
      and public.devd_venta_visible(v.id,p_evento)
      and (p_negocio is null or v.negocio_id=p_negocio)
      and (p_desde is null or v.creado_en>=p_desde::timestamp at time zone 'America/La_Paz')
      and (p_hasta is null or v.creado_en<(p_hasta+1)::timestamp at time zone 'America/La_Paz')
      and (p_referencia='' or position(lower(p_referencia) in lower('QV-'||v.id))>0)
      and (p_antes is null or v.id<p_antes) order by v.id desc limit p_limite+1
  ) x;
  select jsonb_build_object('ventas',coalesce((select jsonb_agg(public.devd_venta_dto(id) order by id desc)
    from unnest(v_ids[1:p_limite]) id),'[]'::jsonb),'negocios',v_catalogo->'negocios',
    'siguienteCursor',case when cardinality(v_ids)>p_limite then v_ids[p_limite]::text else null end)
    into v_resultado;
  return v_resultado;
end $$;

-- Default ACL del catálogo concede EXECUTE a anon/authenticated/service_role:
-- revocar explícitamente cada RPC, después otorgar solo los clientes previstos.
revoke all on function public.consultar_catalogo_ayudante(integer),
  public.consultar_saldo_venta(integer,integer,text),public.cobrar_venta(integer,integer,text,jsonb,uuid,numeric),
  public.consultar_detalle_venta(integer,integer),public.consultar_resumen_ventas(integer),
  public.consultar_historial_ventas(integer,date,date,integer,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.consultar_catalogo_ayudante(integer),
  public.consultar_saldo_venta(integer,integer,text),public.cobrar_venta(integer,integer,text,jsonb,uuid,numeric),
  public.consultar_detalle_venta(integer,integer),public.consultar_resumen_ventas(integer),
  public.consultar_historial_ventas(integer,date,date,integer,text,integer,integer) to authenticated;

-- Valida la imagen NEW al confirmar y el estado persistido al cerrar la
-- transacción. VOLATILE usa un snapshot fresco tras esperar el bloqueo común.
create or replace function public.devd_validar_venta_confirmada(p_venta public.ventas)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_total numeric; v_items jsonb; v_respuesta jsonb; v_cantidad bigint;
begin
  if p_venta.confirmada_en is null then return; end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'AISLAMIENTO_NO_SOPORTADO'; end if;
  select count(*),sum(i.cantidad*i.precio_unitario),jsonb_agg(jsonb_build_object(
    'productoId',i.producto_id::text,'nombreHistorico',i.producto_nombre_historico,
    'cantidad',i.cantidad,'precioUnitarioHistorico',i.precio_unitario::text,
    'subtotal',(i.cantidad*i.precio_unitario)::text) order by i.producto_id)
    into v_cantidad,v_total,v_items from public.venta_items i where i.venta_id=p_venta.id;
  if v_cantidad=0 then raise exception 'VENTA_SIN_LINEAS'; end if;
  if p_venta.total is null or p_venta.total<0 or p_venta.total='NaN'::numeric
    or p_venta.total is distinct from v_total then raise exception 'VENTA_TOTAL_INCONSISTENTE'; end if;
  if exists(select 1 from public.venta_items i join public.productos p on p.id=i.producto_id
    where i.venta_id=p_venta.id and (i.cantidad<=0 or i.precio_unitario<0 or i.precio_unitario='NaN'::numeric
      or nullif(btrim(i.producto_nombre_historico),'') is null or p.negocio_id<>p_venta.negocio_id))
    or exists(select 1 from public.venta_items i where i.venta_id=p_venta.id group by producto_id having count(*)>1)
    or nullif(btrim(p_venta.negocio_nombre_historico),'') is null then
    raise exception 'VENTA_HISTORICO_INCONSISTENTE'; end if;
  v_respuesta:=jsonb_build_object('id',p_venta.id::text,'referencia','QV-'||p_venta.id,'estado','confirmada',
    'fecha',to_char(p_venta.creado_en at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'eventoId',p_venta.evento_id,'negocioId',p_venta.negocio_id::text,
    'ayudanteId',p_venta.cobrador_id::text,'negocioNombreHistorico',p_venta.negocio_nombre_historico,
    'total',p_venta.total::text,'items',v_items);
  if p_venta.respuesta is distinct from v_respuesta then raise exception 'VENTA_RESPUESTA_INCONSISTENTE'; end if;
end $$;
revoke all on function public.devd_validar_venta_confirmada(public.ventas) from public,anon,authenticated,service_role;

create or replace function public.devd_proteger_venta_confirmada()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_ids integer[]; v_padre record; v_bloqueadas integer:=0;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'AISLAMIENTO_NO_SOPORTADO'; end if;
  if tg_table_name='ventas' then
    -- UPDATE/DELETE ya bloquean esta cabecera antes de llamar al trigger.
    if tg_op<>'INSERT' then
      if old.confirmada_en is not null then raise exception 'VENTA_CONFIRMADA_INMUTABLE'; end if;
      if tg_op='UPDATE' and new.id is distinct from old.id then raise exception 'VENTA_ID_INMUTABLE'; end if;
    end if;
    if tg_op<>'DELETE' then perform public.devd_validar_venta_confirmada(new); end if;
  else
    if tg_op='INSERT' then v_ids:=array[new.venta_id];
    elsif tg_op='DELETE' then v_ids:=array[old.venta_id];
    else v_ids:=array[old.venta_id,new.venta_id]; end if;
    -- Un mismo cerrojo por venta para INSERT/UPDATE/DELETE de líneas y confirmación.
    -- Si se mueve una línea, bloquear ambos padres por id ascendente.
    for v_padre in select id,confirmada_en from public.ventas where id=any(v_ids) order by id for update loop
      v_bloqueadas:=v_bloqueadas+1;
      if v_padre.confirmada_en is not null then raise exception 'VENTA_CONFIRMADA_INMUTABLE'; end if;
    end loop;
    if array_position(v_ids,null) is not null or v_bloqueadas<>(select count(distinct id) from unnest(v_ids) id) then
      raise exception 'VENTA_NO_ENCONTRADA' using errcode='23503'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.devd_proteger_venta_confirmada() from public,anon,authenticated,service_role;
create trigger devd_venta_inmutable before insert or update or delete on public.ventas
for each row execute function public.devd_proteger_venta_confirmada();
create trigger devd_items_inmutables before insert or update or delete on public.venta_items
for each row execute function public.devd_proteger_venta_confirmada();
alter table public.ventas add constraint devd_confirmacion_completa check(confirmada_en is null or
  (solicitud_id is not null and cobrador_id is not null and solicitud_payload is not null
   and respuesta is not null and negocio_nombre_historico is not null and entrada_id is not null));

-- Defensa al COMMIT ante sentencias compuestas, otros triggers o cambios de
-- orden dentro de la misma transacción. No cambia los permisos de los clientes.
create or replace function public.devd_comprobar_venta_al_cierre()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare v_ids integer[]; v_venta public.ventas%rowtype;
begin
  if tg_table_name='ventas' then v_ids:=array[new.id];
  elsif tg_op='INSERT' then v_ids:=array[new.venta_id];
  elsif tg_op='DELETE' then v_ids:=array[old.venta_id];
  else v_ids:=array[old.venta_id,new.venta_id]; end if;
  for v_venta in select * from public.ventas where id=any(v_ids) order by id for update loop
    perform public.devd_validar_venta_confirmada(v_venta);
  end loop;
  return null;
end $$;
revoke all on function public.devd_comprobar_venta_al_cierre() from public,anon,authenticated,service_role;
create constraint trigger devd_venta_coherente_al_cierre after insert or update on public.ventas
deferrable initially deferred for each row execute function public.devd_comprobar_venta_al_cierre();
create constraint trigger devd_items_coherentes_al_cierre after insert or update or delete on public.venta_items
deferrable initially deferred for each row execute function public.devd_comprobar_venta_al_cierre();
-- Si hubo escritores privilegiados entre 003 y 004, no instalar sobre una
-- confirmación ya inconsistente ni certificarla/repararla automáticamente.
do $$ declare v_venta public.ventas%rowtype; begin
  for v_venta in select * from public.ventas where confirmada_en is not null order by id for update loop
    perform public.devd_validar_venta_confirmada(v_venta);
  end loop;
end $$;
commit;
