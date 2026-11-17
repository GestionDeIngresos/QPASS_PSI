-- QPass · Sprint 3 · Dev A · HU 29
-- Requiere esquema base y sprint2_devA_admin_eventos.sql (es_admin).
-- No modifica políticas de inserción de reportes de B/D.
begin;
create index if not exists idx_reportes_entrada_estado on public.reportes_entrada(estado, creado_en desc);
create index if not exists idx_reportes_recarga_estado on public.reportes_recarga(estado, creado_en desc);
create index if not exists idx_reportes_acceso_estado on public.reportes_acceso(estado, creado_en desc);

create or replace function public.listar_reportes_admin(
  p_tipo text default '', p_estado text default '', p_busqueda text default ''
) returns table (
  id integer, tipo text, descripcion text, estado text, creado_en timestamptz,
  usuario text, correo text, evento text
) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.es_admin() then
    raise exception 'No tienes permisos de administrador.' using errcode = '42501';
  end if;
  if p_tipo not in ('', 'entrada', 'recarga', 'acceso')
     or p_estado not in ('', 'pendiente', 'solucionado') then
    raise exception 'Filtros inválidos.' using errcode = '22023';
  end if;
  return query
  select r.id, r.tipo, r.descripcion, r.estado, r.creado_en, u.nombre::text, u.correo::text, e.titulo::text
  from (
    select re.id, 'entrada'::text as tipo, re.descripcion, re.estado::text, re.creado_en, re.usuario_id, tt.evento_id
    from public.reportes_entrada re
    join public.entradas en on en.id = re.entrada_id
    join public.tipos_ticket tt on tt.id = en.tipo_ticket_id
    union all
    select rr.id, 'recarga'::text, rr.descripcion, rr.estado::text, rr.creado_en, rr.usuario_id, rc.evento_id
    from public.reportes_recarga rr join public.recargas rc on rc.id = rr.recarga_id
    union all
    select ra.id, 'acceso'::text, ra.descripcion, ra.estado::text, ra.creado_en, ra.usuario_id, tt.evento_id
    from public.reportes_acceso ra
    join public.registros_acceso ac on ac.id = ra.registro_acceso_id
    join public.entradas en on en.id = ac.entrada_id
    join public.tipos_ticket tt on tt.id = en.tipo_ticket_id
  ) r
  join public.usuarios u on u.id = r.usuario_id
  join public.eventos e on e.id = r.evento_id
  where (p_tipo = '' or r.tipo = p_tipo)
    and (p_estado = '' or r.estado = p_estado)
    and (coalesce(p_busqueda, '') = '' or position(lower(left(p_busqueda, 80)) in lower(
      r.descripcion || ' ' || u.nombre || ' ' || u.correo || ' ' || e.titulo)) > 0)
  order by r.creado_en desc, r.tipo, r.id desc
  limit 100;
end;
$$;

create or replace function public.resolver_reporte_admin(p_tipo text, p_id integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.es_admin() then
    raise exception 'No tienes permisos de administrador.' using errcode = '42501';
  end if;
  if p_tipo = 'entrada' then
    update public.reportes_entrada set estado = 'solucionado' where id = p_id;
  elsif p_tipo = 'recarga' then
    update public.reportes_recarga set estado = 'solucionado' where id = p_id;
  elsif p_tipo = 'acceso' then
    update public.reportes_acceso set estado = 'solucionado' where id = p_id;
  else
    raise exception 'Tipo de reporte inválido.' using errcode = '22023';
  end if;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.listar_reportes_admin(text,text,text) from public, anon;
revoke all on function public.resolver_reporte_admin(text,integer) from public, anon;
grant execute on function public.listar_reportes_admin(text,text,text) to authenticated;
grant execute on function public.resolver_reporte_admin(text,integer) to authenticated;
commit;
