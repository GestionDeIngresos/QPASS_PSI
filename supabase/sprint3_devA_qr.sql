-- QPass · Sprint 3 · Dev A · QR físicos e identificación compartida
-- Requiere esquema base, Dev A/Dev C Sprint 2 (usuarios.activo).
begin;
alter table public.lotes_qr_fisico add column if not exists solicitud_id uuid;
create unique index if not exists lotes_qr_solicitud_unica on public.lotes_qr_fisico(solicitud_id);
alter table public.vinculos_qr_fisico alter column carnet_identidad drop not null;
alter table public.vinculos_qr_fisico add column if not exists entrada_id integer references public.entradas(id);
create unique index if not exists manilla_por_entrada on public.vinculos_qr_fisico(entrada_id) where entrada_id is not null;
alter table public.lotes_qr_fisico enable row level security;
alter table public.vinculos_qr_fisico enable row level security;
revoke all on public.lotes_qr_fisico, public.vinculos_qr_fisico from anon, authenticated;

create or replace function public.qpass_autorizado_evento(p_evento integer, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios u where u.id = auth.uid() and u.activo
    and (u.rol::text = 'admin' or (u.rol::text = any(p_roles) and exists (
      select 1 from public.asignaciones_staff a where a.usuario_id = u.id
      and a.evento_id = p_evento and a.rol_staff = u.rol
    )))
  );
$$;

create or replace function public.generar_lote_qr(p_evento integer, p_cantidad integer, p_solicitud uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_lote public.lotes_qr_fisico%rowtype;
begin
  if not public.qpass_autorizado_evento(p_evento, array[]::text[]) then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad not between 1 and 200 or p_solicitud is null then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  if not exists(select 1 from public.eventos where id=p_evento and tipo_acceso='qr_fisico') then
    raise exception 'EVENTO_NO_FISICO';
  end if;
  insert into public.lotes_qr_fisico(evento_id,cantidad,generado_por,solicitud_id)
  values(p_evento,p_cantidad,auth.uid(),p_solicitud) on conflict(solicitud_id) do nothing returning * into v_lote;
  if v_lote.id is null then
    select * into v_lote from public.lotes_qr_fisico where solicitud_id=p_solicitud;
    if v_lote.evento_id<>p_evento or v_lote.cantidad<>p_cantidad or v_lote.generado_por<>auth.uid() then
      raise exception 'SOLICITUD_REUTILIZADA';
    end if;
    return v_lote.id;
  end if;
  insert into public.vinculos_qr_fisico(lote_id,codigo_qr)
  select v_lote.id,'QPF-' || upper(replace(gen_random_uuid()::text,'-','')) from generate_series(1,p_cantidad);
  return v_lote.id;
end;
$$;

create or replace function public.consultar_lote_qr(p_lote integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lote public.lotes_qr_fisico%rowtype; v_result jsonb;
begin
  if not public.qpass_autorizado_evento(null,array[]::text[]) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  select * into v_lote from public.lotes_qr_fisico where id=p_lote;
  if not found then raise exception 'LOTE_NO_ENCONTRADO'; end if;
  select jsonb_build_object('id',v_lote.id,'eventoId',v_lote.evento_id,'cantidad',v_lote.cantidad,
    'evento',e.titulo,'codigos',(select coalesce(jsonb_agg(jsonb_build_object(
      'codigo',v.codigo_qr,'vinculado',v.entrada_id is not null) order by v.id),'[]'::jsonb)
      from public.vinculos_qr_fisico v where v.lote_id=p_lote)) into v_result
    from public.eventos e where e.id=v_lote.evento_id;
  return v_result;
end;
$$;

create or replace function public.vincular_manilla(p_codigo text, p_entrada_codigo text, p_carnet text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_entrada public.entradas%rowtype; v_manilla public.vinculos_qr_fisico%rowtype; v_evento integer; v_lote_evento integer;
begin
  if not public.qpass_autorizado_evento(null,array[]::text[]) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  -- Orden común: compra -> ticket -> entrada -> manilla.
  perform c.id from public.compras c join public.entradas en on en.compra_id=c.id
    where en.codigo_qr=p_entrada_codigo for update of c;
  perform t.id from public.tipos_ticket t join public.entradas en on en.tipo_ticket_id=t.id
    where en.codigo_qr=p_entrada_codigo for update of t;
  select * into v_entrada from public.entradas where codigo_qr=p_entrada_codigo for update;
  if not found then raise exception 'ENTRADA_NO_ENCONTRADA'; end if;
  if v_entrada.estado<>'activa' or not exists(select 1 from public.compras where id=v_entrada.compra_id and estado_pago='confirmado') then
    raise exception 'ENTRADA_NO_VALIDA';
  end if;
  select t.evento_id into v_evento from public.tipos_ticket t join public.eventos e on e.id=t.evento_id
    where t.id=v_entrada.tipo_ticket_id and e.tipo_acceso='qr_fisico';
  if v_evento is null then raise exception 'EVENTO_NO_FISICO'; end if;
  if p_carnet is null or btrim(p_carnet)='' or not exists(select 1 from public.usuarios
    where id=v_entrada.usuario_destino_id and activo and carnet_identidad=btrim(p_carnet)) then
    raise exception 'IDENTIDAD_NO_COINCIDE';
  end if;
  select * into v_manilla from public.vinculos_qr_fisico where codigo_qr=p_codigo for update;
  if not found then raise exception 'MANILLA_NO_ENCONTRADA'; end if;
  select evento_id into v_lote_evento from public.lotes_qr_fisico where id=v_manilla.lote_id;
  if v_lote_evento<>v_evento then raise exception 'EVENTO_NO_COINCIDE'; end if;
  if v_manilla.entrada_id=v_entrada.id and v_manilla.usuario_id=v_entrada.usuario_destino_id then return v_entrada.id; end if;
  if v_manilla.entrada_id is not null or v_manilla.usuario_id is not null then raise exception 'MANILLA_YA_VINCULADA'; end if;
  if exists(select 1 from public.vinculos_qr_fisico where entrada_id=v_entrada.id) then raise exception 'ENTRADA_YA_VINCULADA'; end if;
  update public.vinculos_qr_fisico set entrada_id=v_entrada.id,usuario_id=v_entrada.usuario_destino_id,
    carnet_identidad=btrim(p_carnet),vinculado_en=now() where id=v_manilla.id;
  return v_entrada.id;
end;
$$;

create or replace function public.identificar_qr(p_codigo text, p_evento integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id integer; v_origen text := 'digital'; v_result jsonb;
begin
  if not public.qpass_autorizado_evento(p_evento,array['supervisor','recargador','ayudante']) then
    raise exception 'SIN_PERMISOS' using errcode='42501';
  end if;
  if p_codigo is null or length(p_codigo)>255 or p_evento is null then raise exception 'DATOS_INVALIDOS' using errcode='22023'; end if;
  select id into v_id from public.entradas where codigo_qr=p_codigo;
  if v_id is null then
    v_origen := 'fisico';
    select v.entrada_id into v_id from public.vinculos_qr_fisico v join public.lotes_qr_fisico l on l.id=v.lote_id
      where v.codigo_qr=p_codigo and l.evento_id=p_evento;
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
end;
$$;
revoke all on function public.qpass_autorizado_evento(integer,text[]) from public,anon;
revoke all on function public.generar_lote_qr(integer,integer,uuid) from public,anon;
revoke all on function public.consultar_lote_qr(integer) from public,anon;
revoke all on function public.vincular_manilla(text,text,text) from public,anon;
revoke all on function public.identificar_qr(text,integer) from public,anon;
grant execute on function public.qpass_autorizado_evento(integer,text[]) to authenticated;
grant execute on function public.generar_lote_qr(integer,integer,uuid) to authenticated;
grant execute on function public.consultar_lote_qr(integer) to authenticated;
grant execute on function public.vincular_manilla(text,text,text) to authenticated;
grant execute on function public.identificar_qr(text,integer) to authenticated;
commit;
