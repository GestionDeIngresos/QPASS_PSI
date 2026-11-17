-- QPass · Sprint 3 · Dev A · Simulación sin dinero real
-- Requiere compras_politicas_y_funcion.sql. Esta migración NO integra un banco.
begin;
create table if not exists public.intentos_compra_prueba (
  usuario_id uuid not null references public.usuarios(id),
  solicitud_id uuid not null,
  seleccion jsonb not null,
  respuesta jsonb not null,
  creado_en timestamptz not null default now(),
  primary key(usuario_id,solicitud_id)
);
alter table public.intentos_compra_prueba enable row level security;
revoke all on public.intentos_compra_prueba from anon,authenticated;

create or replace function public.comprar_entradas_prueba(
  p_evento_id text, p_lineas jsonb, p_correo_destino text,
  p_solicitud_id uuid, p_resultado text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_seleccion jsonb; v_anterior public.intentos_compra_prueba%rowtype; v_respuesta jsonb;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  if p_solicitud_id is null or p_resultado is null or p_resultado not in ('aprobado','rechazado','vencido') then raise exception 'PRUEBA_INVALIDA'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas)<>'array' then raise exception 'LINEAS_INVALIDAS'; end if;
  v_seleccion := jsonb_build_object('evento',p_evento_id,'lineas',p_lineas,
    'destino',lower(btrim(coalesce(p_correo_destino,''))),'resultado',p_resultado);
  -- Serializa reintentos de una misma solicitud, sin mezclar usuarios.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_solicitud_id::text,0));
  select * into v_anterior from public.intentos_compra_prueba where usuario_id=v_uid and solicitud_id=p_solicitud_id;
  if found then
    if v_anterior.seleccion<>v_seleccion then raise exception 'SOLICITUD_REUTILIZADA'; end if;
    return v_anterior.respuesta;
  end if;
  if p_resultado='aprobado' then
    v_respuesta := public.comprar_entradas(p_evento_id,p_lineas,p_correo_destino) || jsonb_build_object('modo','prueba');
  else
    v_respuesta := jsonb_build_object('modo','prueba','error',case when p_resultado='rechazado' then 'PAGO_PRUEBA_RECHAZADO' else 'PAGO_PRUEBA_VENCIDO' end);
  end if;
  insert into public.intentos_compra_prueba(usuario_id,solicitud_id,seleccion,respuesta)
    values(v_uid,p_solicitud_id,v_seleccion,v_respuesta);
  return v_respuesta;
end;
$$;
revoke all on function public.comprar_entradas_prueba(text,jsonb,text,uuid,text) from public,anon;
grant execute on function public.comprar_entradas_prueba(text,jsonb,text,uuid,text) to authenticated;
commit;
