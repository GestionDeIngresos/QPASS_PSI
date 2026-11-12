-- QPass - Sprint 3 - Dev A - Edicion segura de tickets y mapa. Requiere Sprint 2 Dev A.
begin;
alter table public.eventos add column if not exists version_edicion bigint not null default 1;
alter table public.tipos_ticket add column if not exists version_edicion bigint not null default 1;
create or replace function public.incrementar_version_edicion() returns trigger language plpgsql set search_path='' as $$
begin new.version_edicion:=old.version_edicion+1; return new; end; $$;
drop trigger if exists evento_version on public.eventos;
create trigger evento_version before update on public.eventos for each row execute function public.incrementar_version_edicion();
drop trigger if exists ticket_version on public.tipos_ticket;
create trigger ticket_version before update on public.tipos_ticket for each row execute function public.incrementar_version_edicion();
create or replace function public.guardar_evento_completo(
  p_evento_id      integer,                  -- null = crear evento nuevo
  p_organizador_id uuid,                     -- solo al crear
  p_estado         public.estado_evento,     -- null = no cambiar (al crear es obligatorio)
  p_datos          jsonb,
  p_tickets        jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id integer;
  t    jsonb;
begin
  if p_evento_id is not null then
    perform id from public.eventos where id=p_evento_id for update;
    if not found then raise exception 'Evento no encontrado o sin permisos.'; end if;
    if not exists(select 1 from public.eventos where id=p_evento_id and version_edicion::text=p_datos->>'version_edicion') then
      raise exception 'El evento cambio mientras lo editabas. Recarga antes de guardar.';
    end if;
    perform id from public.tipos_ticket where evento_id=p_evento_id order by id for update;
    for t in select * from jsonb_array_elements(p_tickets) loop
      if t->>'id' is not null and not exists(select 1 from public.tipos_ticket where id=(t->>'id')::integer and evento_id=p_evento_id and version_edicion::text=t->>'version_edicion') then
        raise exception 'Los tickets o el cupo cambiaron mientras editabas. Recarga antes de guardar.';
      end if;
    end loop;
  end if;
  if p_evento_id is null then
    if p_organizador_id is null or p_estado is null then
      raise exception 'Faltan el organizador o el estado del evento.';
    end if;
    insert into eventos (organizador_id, categoria_id, titulo, descripcion, foto_url, ubicacion,
                         mapa_url, fecha_evento, fecha_fin, tipo_acceso, estado)
    values (p_organizador_id, nullif(p_datos->>'categoria_id','')::integer, p_datos->>'titulo',
            nullif(p_datos->>'descripcion',''), nullif(p_datos->>'foto_url',''), p_datos->>'ubicacion',
            nullif(p_datos->>'mapa_url',''), (p_datos->>'fecha_evento')::timestamptz,
            (p_datos->>'fecha_fin')::timestamptz, (p_datos->>'tipo_acceso')::tipo_acceso_evento, p_estado)
    returning id into v_id;
  else
    update eventos set
      categoria_id = nullif(p_datos->>'categoria_id','')::integer,
      titulo       = p_datos->>'titulo',
      descripcion  = nullif(p_datos->>'descripcion',''),
      foto_url     = nullif(p_datos->>'foto_url',''),
      ubicacion    = p_datos->>'ubicacion',
      mapa_url     = nullif(p_datos->>'mapa_url',''),
      fecha_evento = (p_datos->>'fecha_evento')::timestamptz,
      fecha_fin    = (p_datos->>'fecha_fin')::timestamptz,
      tipo_acceso  = (p_datos->>'tipo_acceso')::tipo_acceso_evento,
      estado       = coalesce(p_estado, estado)
    where id = p_evento_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Evento no encontrado o sin permisos para editarlo.';
    end if;
  end if;

  -- quita los tickets que ya no vienen (si tienen ventas, la FK lo impide y todo se revierte)
  delete from tipos_ticket
  where evento_id = v_id
    and id not in (select (x->>'id')::integer from jsonb_array_elements(p_tickets) x where x->>'id' is not null);

  for t in select * from jsonb_array_elements(p_tickets) loop
    if t->>'id' is not null then
      update tipos_ticket set
        nombre = t->>'nombre',
        descripcion = nullif(t->>'descripcion',''),
        precio = (t->>'precio')::numeric,
        cantidad_disponible = (t->>'cantidad_disponible')::integer,
        limite_por_usuario = (t->>'limite_por_usuario')::integer
      where id = (t->>'id')::integer and evento_id = v_id;
    else
      insert into tipos_ticket (evento_id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario)
      values (v_id, t->>'nombre', nullif(t->>'descripcion',''), (t->>'precio')::numeric,
              (t->>'cantidad_disponible')::integer, (t->>'limite_por_usuario')::integer);
    end if;
  end loop;

  return v_id;
end;
$$;
revoke all on function public.guardar_evento_completo(integer, uuid, public.estado_evento, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_evento_completo(integer, uuid, public.estado_evento, jsonb, jsonb) to authenticated;
commit;
