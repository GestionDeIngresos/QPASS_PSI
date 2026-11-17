-- QPass · Sprint 3 · Dev A · HU 41–45. Aplicar después de sprint3_devA_qr.sql.
begin;
alter table public.registros_acceso add column if not exists solicitud_id uuid;
alter table public.registros_acceso add column if not exists codigo_leido text;
alter table public.registros_acceso add column if not exists observacion text not null default '';
alter table public.registros_acceso add column if not exists eliminado boolean not null default false;
alter table public.registros_acceso add column if not exists version integer not null default 1;
create unique index if not exists accesos_solicitud_unica on public.registros_acceso(supervisor_id,solicitud_id);
create index if not exists accesos_historial on public.registros_acceso(supervisor_id,registrado_en desc);
alter table public.reportes_acceso add column if not exists solicitud_id uuid;
create unique index if not exists reporte_acceso_solicitud on public.reportes_acceso(usuario_id,solicitud_id);
create table if not exists public.auditoria_accesos (
  id bigint generated always as identity primary key,
  registro_id integer not null references public.registros_acceso(id),
  actor_id uuid not null references public.usuarios(id),
  motivo text not null, antes jsonb not null, despues jsonb not null, creado_en timestamptz not null default now()
);
alter table public.registros_acceso enable row level security;
alter table public.auditoria_accesos enable row level security;
alter table public.reportes_acceso enable row level security;
revoke all on public.registros_acceso,public.auditoria_accesos,public.reportes_acceso from anon,authenticated;

create or replace function public.eventos_supervisor()
returns table(id integer,titulo text) language sql stable security definer set search_path='' as $$
  select e.id,e.titulo::text from public.eventos e where e.estado='publicado'
    and public.qpass_autorizado_evento(e.id,array['supervisor']) order by e.fecha_evento desc;
$$;

create or replace function public.registrar_acceso(p_codigo text,p_evento integer,p_permitir boolean,p_foto text,p_solicitud uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_identidad jsonb; v_entrada public.entradas%rowtype; v_previo public.registros_acceso%rowtype; v_id integer;
begin
  if not public.qpass_autorizado_evento(p_evento,array['supervisor']) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_solicitud is null or p_permitir is null then raise exception 'DATOS_INVALIDOS'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':acceso:'||p_solicitud::text,0));
  select * into v_previo from public.registros_acceso where supervisor_id=auth.uid() and solicitud_id=p_solicitud;
  if found then
    if v_previo.codigo_leido is distinct from p_codigo or (v_previo.resultado='permitido')<>p_permitir or v_previo.foto_url is distinct from p_foto
      or not exists(select 1 from public.entradas en join public.tipos_ticket t on t.id=en.tipo_ticket_id where en.id=v_previo.entrada_id and t.evento_id=p_evento)
    then raise exception 'SOLICITUD_REUTILIZADA'; end if;
    return jsonb_build_object('id',v_previo.id,'resultado',v_previo.resultado,'repetido',true);
  end if;
  v_identidad:=public.identificar_qr(p_codigo,p_evento);
  if p_foto is null or split_part(p_foto,'/',1)<>auth.uid()::text or split_part(p_foto,'/',2)<>p_evento::text
    or not exists(select 1 from storage.objects where bucket_id='accesos' and name=p_foto) then raise exception 'FOTO_REQUERIDA'; end if;
  perform c.id from public.compras c join public.entradas en on en.compra_id=c.id where en.id=(v_identidad->>'entradaId')::integer for update of c;
  perform t.id from public.tipos_ticket t join public.entradas en on en.tipo_ticket_id=t.id where en.id=(v_identidad->>'entradaId')::integer for update of t;
  select * into v_entrada from public.entradas where id=(v_identidad->>'entradaId')::integer for update;
  -- Revalidar después de los bloqueos: una consulta anterior no autoriza el ingreso.
  v_identidad:=public.identificar_qr(p_codigo,p_evento);
  if p_permitir then
    if not (v_identidad->>'aptaIngreso')::boolean then raise exception 'ENTRADA_NO_APTA'; end if;
    update public.entradas set estado='usada' where id=v_entrada.id;
  end if;
  insert into public.registros_acceso(supervisor_id,entrada_id,resultado,foto_url,solicitud_id,codigo_leido)
    values(auth.uid(),v_entrada.id,case when p_permitir then 'permitido'::public.resultado_acceso else 'denegado'::public.resultado_acceso end,p_foto,p_solicitud,p_codigo) returning id into v_id;
  return jsonb_build_object('id',v_id,'resultado',case when p_permitir then 'permitido' else 'denegado' end,'repetido',false);
end;
$$;

create or replace function public.historial_accesos(p_evento integer,p_resultado text default '',p_fecha date default null,p_incluir_eliminados boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not public.qpass_autorizado_evento(p_evento,array['supervisor']) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_resultado not in ('','permitido','denegado') then raise exception 'DATOS_INVALIDOS'; end if;
  select coalesce(jsonb_agg(x order by x.registrado_en desc,x.id desc),'[]'::jsonb) into v_result from (
    select a.id,a.resultado,a.registrado_en,a.foto_url,a.observacion,a.eliminado,a.version,u.nombre,
      (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'descripcion',r.descripcion,'estado',r.estado) order by r.creado_en desc),'[]'::jsonb)
       from public.reportes_acceso r where r.registro_acceso_id=a.id and r.usuario_id=auth.uid()) as reportes,
      (select coalesce(jsonb_agg(jsonb_build_object('motivo',au.motivo,'fecha',au.creado_en,'antes',au.antes->>'resultado','despues',au.despues->>'resultado') order by au.creado_en desc),'[]'::jsonb)
       from public.auditoria_accesos au where au.registro_id=a.id) as correcciones
    from public.registros_acceso a join public.entradas en on en.id=a.entrada_id join public.tipos_ticket t on t.id=en.tipo_ticket_id
    join public.usuarios u on u.id=en.usuario_destino_id where t.evento_id=p_evento
      and (a.supervisor_id=auth.uid() or public.qpass_autorizado_evento(null,array[]::text[]))
      and (p_incluir_eliminados or not a.eliminado) and (p_resultado='' or a.resultado::text=p_resultado)
      and (p_fecha is null or (a.registrado_en at time zone 'America/La_Paz')::date=p_fecha)
    order by a.registrado_en desc,a.id desc limit 100
  ) x;
  return v_result;
end;
$$;

create or replace function public.corregir_acceso(p_id integer,p_version integer,p_resultado text,p_observacion text,p_motivo text,p_eliminar boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_reg public.registros_acceso%rowtype; v_after public.registros_acceso%rowtype; v_evento integer; v_entrada public.entradas%rowtype;
begin
  select a.* into v_reg from public.registros_acceso a where id=p_id;
  select t.evento_id into v_evento from public.entradas en join public.tipos_ticket t on t.id=en.tipo_ticket_id where en.id=v_reg.entrada_id;
  if not found or not public.qpass_autorizado_evento(v_evento,array['supervisor']) or
    (v_reg.supervisor_id<>auth.uid() and not public.qpass_autorizado_evento(null,array[]::text[])) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_resultado is null or p_resultado not in ('permitido','denegado') or p_eliminar is null or length(btrim(coalesce(p_motivo,''))) not between 5 and 500 or length(coalesce(p_observacion,''))>1000 then raise exception 'DATOS_INVALIDOS'; end if;
  perform c.id from public.compras c join public.entradas en on en.compra_id=c.id where en.id=v_reg.entrada_id for update of c;
  perform t.id from public.tipos_ticket t join public.entradas en on en.tipo_ticket_id=t.id where en.id=v_reg.entrada_id for update of t;
  select * into v_entrada from public.entradas where id=v_reg.entrada_id for update;
  select * into v_reg from public.registros_acceso where id=p_id for update;
  if v_reg.version is distinct from p_version or v_reg.eliminado then raise exception 'REGISTRO_CAMBIO'; end if;
  if not p_eliminar and p_resultado='permitido' and v_reg.resultado='denegado' then
    if v_entrada.estado<>'activa' or not exists(select 1 from public.compras where id=v_entrada.compra_id and estado_pago='confirmado')
       or not exists(select 1 from public.usuarios where id=v_entrada.usuario_destino_id and activo) then raise exception 'ENTRADA_NO_APTA'; end if;
    update public.entradas set estado='usada' where id=v_entrada.id;
  end if;
  -- Una corrección o borrado NO devuelve el derecho de ingreso de una entrada usada.
  update public.registros_acceso set resultado=p_resultado::public.resultado_acceso,observacion=coalesce(p_observacion,''),eliminado=p_eliminar,version=version+1 where id=p_id returning * into v_after;
  insert into public.auditoria_accesos(registro_id,actor_id,motivo,antes,despues) values(p_id,auth.uid(),btrim(p_motivo),to_jsonb(v_reg),to_jsonb(v_after));
  return true;
end;
$$;

create or replace function public.reportar_acceso(p_id integer,p_descripcion text,p_solicitud uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_evento integer; v_id integer; v_previo public.reportes_acceso%rowtype;
begin
  select t.evento_id into v_evento from public.registros_acceso a join public.entradas en on en.id=a.entrada_id
    join public.tipos_ticket t on t.id=en.tipo_ticket_id where a.id=p_id and a.supervisor_id=auth.uid();
  if not found or not public.qpass_autorizado_evento(v_evento,array['supervisor']) then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_solicitud is null or length(btrim(coalesce(p_descripcion,''))) not between 5 and 2000 then raise exception 'DATOS_INVALIDOS'; end if;
  insert into public.reportes_acceso(registro_acceso_id,usuario_id,descripcion,solicitud_id)
    values(p_id,auth.uid(),btrim(p_descripcion),p_solicitud) on conflict(usuario_id,solicitud_id) do nothing returning id into v_id;
  if v_id is null then
    select * into v_previo from public.reportes_acceso where usuario_id=auth.uid() and solicitud_id=p_solicitud;
    if v_previo.registro_acceso_id<>p_id or v_previo.descripcion<>btrim(p_descripcion) then raise exception 'SOLICITUD_REUTILIZADA'; end if;
    return v_previo.id;
  end if;
  return v_id;
end;
$$;

-- Fotos privadas, ruta <supervisor>/<evento>/<uuid>.<ext>.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('accesos','accesos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists accesos_foto_insert on storage.objects;
create policy accesos_foto_insert on storage.objects for insert to authenticated with check (
  bucket_id='accesos' and split_part(name,'/',1)=auth.uid()::text and
  public.qpass_autorizado_evento(case when split_part(name,'/',2) ~ '^[0-9]{1,9}$' then split_part(name,'/',2)::integer else null end,array['supervisor'])
);
drop policy if exists accesos_foto_select on storage.objects;
create policy accesos_foto_select on storage.objects for select to authenticated using (
  bucket_id='accesos' and public.qpass_autorizado_evento(case when split_part(name,'/',2) ~ '^[0-9]{1,9}$' then split_part(name,'/',2)::integer else null end,array['supervisor'])
);
revoke all on function public.eventos_supervisor() from public,anon;
revoke all on function public.registrar_acceso(text,integer,boolean,text,uuid) from public,anon;
revoke all on function public.historial_accesos(integer,text,date,boolean) from public,anon;
revoke all on function public.corregir_acceso(integer,integer,text,text,text,boolean) from public,anon;
revoke all on function public.reportar_acceso(integer,text,uuid) from public,anon;
grant execute on function public.eventos_supervisor() to authenticated;
grant execute on function public.registrar_acceso(text,integer,boolean,text,uuid) to authenticated;
grant execute on function public.historial_accesos(integer,text,date,boolean) to authenticated;
grant execute on function public.corregir_acceso(integer,integer,text,text,text,boolean) to authenticated;
grant execute on function public.reportar_acceso(integer,text,uuid) to authenticated;
commit;
