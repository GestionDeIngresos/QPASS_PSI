-- QPass · Sprint 3 · Dev D · HU 14
-- Requiere esquema base (reportes_entrada existente), usuarios.activo y las
-- funciones de administración de sprint3_devA_reportes.sql. No ejecutar remoto
-- sin revisión/autorización. No depende de aplicar la migración de HU 9.
begin;
do $$ begin
  if to_regclass('public.reportes_entrada') is null then
    raise exception 'Falta reportes_entrada del esquema base; no se crea una tabla alternativa.';
  end if;
end $$;
alter table public.reportes_entrada add column if not exists solicitud_id uuid;
create unique index if not exists reportes_entrada_usuario_solicitud_unica
  on public.reportes_entrada(usuario_id,solicitud_id);
alter table public.reportes_entrada enable row level security;
-- Evitar INSERT directo con usuario/estado manipulados y lecturas ajenas.
-- Admin de A accede por SECURITY DEFINER; verificar su propietario y privilegios.
-- Se conservan todas las políticas existentes, sin agregar una permisiva.
revoke all on public.reportes_entrada from public,anon,authenticated;

create or replace function public.reportar_entrada_propia(p_entrada integer,p_descripcion text,p_solicitud uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_descripcion text := regexp_replace(coalesce(p_descripcion,''),'^[[:space:]]+|[[:space:]]+$','','g');
  v_id integer; v_previo public.reportes_entrada%rowtype; v_entrada record;
begin
  if v_uid is null then raise exception 'NO_AUTH' using errcode='42501'; end if;
  perform id from public.usuarios where id=v_uid and activo for share;
  if not found then raise exception 'CUENTA_INACTIVA' using errcode='42501'; end if;
  if p_entrada is null or p_entrada<1 or p_solicitud is null or length(v_descripcion) not between 5 and 2000 then
    raise exception 'DATOS_INVALIDOS' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reporte-entrada:' || v_uid::text || ':' || p_solicitud::text,0));
  select * into v_previo from public.reportes_entrada where usuario_id=v_uid and solicitud_id=p_solicitud;
  if found then
    if v_previo.entrada_id is distinct from p_entrada or v_previo.descripcion is distinct from v_descripcion then
      raise exception 'SOLICITUD_REUTILIZADA' using errcode='22023';
    end if;
    return v_previo.id;
  end if;
  -- Comprador O destinatario; ninguna información QR se devuelve al navegador.
  -- Se admite reportar entradas usadas/reportadas/anuladas: reportar no las cambia.
  select en.id,en.estado,en.codigo_qr into v_entrada from public.entradas en
    join public.compras c on c.id=en.compra_id
    where en.id=p_entrada and c.estado_pago='confirmado'
      and (c.comprador_id=v_uid or en.usuario_destino_id=v_uid)
    -- Solo bloquear entrada: no tomar compra después de entrada, ya que A usa
    -- compra -> ticket -> entrada para registrar accesos/vincular manillas.
    for share of en;
  if not found then raise exception 'ENTRADA_NO_AUTORIZADA' using errcode='42501'; end if;
  insert into public.reportes_entrada(entrada_id,usuario_id,descripcion,estado,solicitud_id)
    values(p_entrada,v_uid,v_descripcion,'pendiente',p_solicitud) returning id into v_id;
  -- Detectar triggers heredados que intenten invalidar la entrada al reportar.
  if not exists(select 1 from public.entradas where id=p_entrada
    and estado is not distinct from v_entrada.estado and codigo_qr is not distinct from v_entrada.codigo_qr) then
    raise exception 'REPORTE_ALTERA_ENTRADA';
  end if;
  if not exists(select 1 from public.reportes_entrada where id=v_id and usuario_id=v_uid
    and entrada_id=p_entrada and descripcion=v_descripcion and estado='pendiente' and solicitud_id=p_solicitud) then
    raise exception 'REPORTE_INCONSISTENTE';
  end if;
  return v_id;
end;
$$;

create or replace function public.consultar_mis_reportes_entrada()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_resultado jsonb;
begin
  if not exists(select 1 from public.usuarios where id=v_uid and activo) then
    raise exception 'SIN_PERMISOS' using errcode='42501';
  end if;
  select jsonb_build_object(
    'entradas',coalesce((select jsonb_agg(x order by x.id desc) from (
      select en.id,e.titulo as evento,t.nombre as tipo_entrada
      from public.entradas en join public.compras c on c.id=en.compra_id
        join public.tipos_ticket t on t.id=en.tipo_ticket_id join public.eventos e on e.id=t.evento_id
      where c.estado_pago='confirmado' and (c.comprador_id=v_uid or en.usuario_destino_id=v_uid)
      order by en.id desc limit 100
    ) x),'[]'::jsonb),
    'reportes',coalesce((select jsonb_agg(x order by x.creado_en desc,x.id desc) from (
      select r.id,r.entrada_id,r.descripcion,r.estado,r.creado_en,e.titulo as evento
      from public.reportes_entrada r join public.entradas en on en.id=r.entrada_id
        join public.tipos_ticket t on t.id=en.tipo_ticket_id join public.eventos e on e.id=t.evento_id
      where r.usuario_id=v_uid order by r.creado_en desc,r.id desc limit 100
    ) x),'[]'::jsonb)
  ) into v_resultado;
  return v_resultado;
end;
$$;
revoke all on function public.reportar_entrada_propia(integer,text,uuid) from public,anon;
revoke all on function public.consultar_mis_reportes_entrada() from public,anon;
grant execute on function public.reportar_entrada_propia(integer,text,uuid) to authenticated;
grant execute on function public.consultar_mis_reportes_entrada() to authenticated;
commit;
