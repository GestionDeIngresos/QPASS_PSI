-- QPass · Sprint 3 · Dev D · HU 9
-- Requiere compras_politicas_y_funcion.sql, sprint3_devA_pagos_prueba.sql
-- y sprint2_devC_usuarios.sql. No ejecutar en Supabase compartido sin coordinación.
-- Nueva fachada: conserva intactas las implementaciones de A/C y delega la
-- transacción y la idempotencia al simulador existente. Aplicar DESPUÉS de ellas.
begin;

create or replace function public.comprar_entradas_terceros_prueba(
  p_evento_id text, p_lineas jsonb, p_correo_destino text,
  p_solicitud_id uuid, p_resultado text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_correo text := lower(btrim(coalesce(p_correo_destino,'')));
  v_destino uuid;
  v_respuesta jsonb;
  v_seleccion jsonb;
  v_usuario record;
  v_coincidencias integer := 0;
  v_compra_id public.compras.id%type;
  v_entradas bigint;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  -- SHARE también serializa desactivaciones mientras se concreta la compra.
  perform id from public.usuarios where id=v_uid and activo for share;
  if not found then raise exception 'CUENTA_INACTIVA'; end if;
  if p_solicitud_id is null or p_resultado is null or p_resultado not in ('aprobado','rechazado','vencido') then
    raise exception 'PRUEBA_INVALIDA';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas)<>'array' then raise exception 'LINEAS_INVALIDAS'; end if;

  -- Mismo orden/clave de bloqueo y selección que el contrato de Dev A.
  -- Recuperar una respuesta previa ANTES de revalidar cupo/fecha/destinatario.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_solicitud_id::text,0));
  v_seleccion := jsonb_build_object('evento',p_evento_id,'lineas',p_lineas,'destino',v_correo,'resultado',p_resultado);
  select seleccion,respuesta into v_seleccion,v_respuesta
    from public.intentos_compra_prueba where usuario_id=v_uid and solicitud_id=p_solicitud_id;
  if found then
    if v_seleccion <> jsonb_build_object('evento',p_evento_id,'lineas',p_lineas,'destino',v_correo,'resultado',p_resultado) then
      raise exception 'SOLICITUD_REUTILIZADA';
    end if;
    if v_respuesta ? 'destinatario' and v_respuesta->>'destinatario' is not null then
      v_respuesta := jsonb_set(v_respuesta,'{destinatario}','"Otra persona"'::jsonb);
    end if;
    return v_respuesta;
  end if;

  if jsonb_array_length(p_lineas) not between 1 and 10 then raise exception 'LINEAS_INVALIDAS'; end if;
  if exists(select 1 from jsonb_array_elements(p_lineas) l where
    jsonb_typeof(l->'tipo_ticket_id') is distinct from 'string'
    or length(l->>'tipo_ticket_id') not between 1 and 64
    or jsonb_typeof(l->'cantidad') is distinct from 'number'
    or case when (l->>'cantidad') ~ '^[0-9]{1,3}$' then (l->>'cantidad')::integer else 0 end not between 1 and 10
  ) or (select count(distinct l->>'tipo_ticket_id') from jsonb_array_elements(p_lineas) l) <> jsonb_array_length(p_lineas) then
    raise exception 'LINEAS_INVALIDAS';
  end if;
  v_destino := v_uid;
  if p_correo_destino is not null and v_correo='' then raise exception 'CORREO_INVALIDO'; end if;
  if v_correo<>'' then
    if length(v_correo)>254 or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'CORREO_INVALIDO'; end if;
    -- C busca lower(correo) sin filtrar activo. Contar TODAS las coincidencias,
    -- incluso inactivas, y bloquear las filas existentes. No asumir unicidad.
    for v_usuario in select id,activo from public.usuarios
      where lower(correo)=v_correo order by id for share
    loop
      v_coincidencias := v_coincidencias + 1;
      v_destino := v_usuario.id;
      if v_usuario.activo is distinct from true then raise exception 'DESTINATARIO_NO_VALIDO'; end if;
    end loop;
    if v_coincidencias<>1 then raise exception 'DESTINATARIO_NO_VALIDO'; end if;
    if v_destino=v_uid then raise exception 'DESTINATARIO_ES_COMPRADOR'; end if;
  end if;
  if not exists(select 1 from public.eventos where id::text=p_evento_id and estado='publicado' and fecha_evento>now()) then
    raise exception 'EVENTO_NO_DISPONIBLE';
  end if;
  if exists(select 1 from jsonb_array_elements(p_lineas) l where not exists(
    select 1 from public.tipos_ticket t where t.id::text=l->>'tipo_ticket_id' and t.evento_id::text=p_evento_id
  )) then raise exception 'TIPO_INVALIDO'; end if;
  -- A conserva aprobado/rechazado/vencido, respuesta persistida y transacción.
  -- C conserva precios/cargos, cupo atómico y límite por comprador.
  v_respuesta := public.comprar_entradas_prueba(p_evento_id,p_lineas,nullif(v_correo,''),p_solicitud_id,p_resultado);
  if p_resultado='aprobado' then
    -- Una fila nueva con el mismo correo podría aparecer después de la búsqueda.
    -- No bloqueamos toda usuarios ni cambiamos C: verificamos su resultado ANTES
    -- de devolver/confirmar. RAISE revierte compra, entradas, cupo e intento de A.
    select id into v_compra_id from public.compras
      where id::text=(v_respuesta->>'compra_id') and comprador_id=v_uid and estado_pago='confirmado';
    if not found then raise exception 'COMPRA_INCONSISTENTE'; end if;
    select count(*) into v_entradas from public.entradas where compra_id=v_compra_id;
    if v_entradas=0 or v_entradas<>(select sum((l->>'cantidad')::integer) from jsonb_array_elements(p_lineas) l)
      or exists(select 1 from public.entradas where compra_id=v_compra_id and usuario_destino_id is distinct from v_destino) then
      raise exception 'DESTINATARIO_NO_COINCIDE';
    end if;
  end if;
  if v_respuesta ? 'destinatario' and v_respuesta->>'destinatario' is not null then
    v_respuesta := jsonb_set(v_respuesta,'{destinatario}','"Otra persona"'::jsonb);
  end if;
  return v_respuesta;
end;
$$;
revoke all on function public.comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text) from public,anon;
grant execute on function public.comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text) to authenticated;
-- Las funciones anteriores quedan internas: evita saltarse el simulador o los
-- controles de cuentas activas. Su propietario puede seguir ejecutándolas.
revoke execute on function public.comprar_entradas(text,jsonb,text) from public,anon,authenticated;
revoke execute on function public.comprar_entradas_prueba(text,jsonb,text,uuid,text) from public,anon,authenticated;

-- El comprador recibe un resumen autorizado, nunca QR ni identidad del destino.
create or replace function public.consultar_compra_propia(p_compra_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_compra public.compras%rowtype; v_resultado jsonb;
begin
  if not exists(select 1 from public.usuarios where id=auth.uid() and activo) then return null; end if;
  select * into v_compra from public.compras where id::text=p_compra_id and comprador_id=auth.uid();
  if not found then return null; end if;
  select jsonb_build_object(
    'id',v_compra.id::text,'subtotal',v_compra.subtotal,'cargos_servicio',v_compra.cargos_servicio,
    'total',v_compra.total,'estado_pago',v_compra.estado_pago,'comprobante_url',v_compra.comprobante_url,'creado_en',v_compra.creado_en,
    'para_terceros',exists(select 1 from public.entradas where compra_id=v_compra.id and usuario_destino_id<>auth.uid()),
    'entradas',coalesce((select jsonb_agg(jsonb_build_object(
      'id',en.id::text,'compra_id',en.compra_id::text,'estado',en.estado,'creado_en',en.creado_en,
      -- El catálogo actual no es un precio histórico. No presentarlo como tal.
      'tipo_ticket',jsonb_build_object('id',t.id::text,'nombre',t.nombre,'precio',null),
      'evento',jsonb_build_object('id',e.id::text,'titulo',e.titulo,'foto_url',e.foto_url,'ubicacion',e.ubicacion,'fecha_evento',e.fecha_evento,'tipo_acceso',e.tipo_acceso)
    ) order by en.id) from public.entradas en join public.tipos_ticket t on t.id=en.tipo_ticket_id
      join public.eventos e on e.id=t.evento_id where en.compra_id=v_compra.id),'[]'::jsonb)
  ) into v_resultado;
  return v_resultado;
end;
$$;
revoke all on function public.consultar_compra_propia(text) from public,anon;
grant execute on function public.consultar_compra_propia(text) to authenticated;

-- Se reemplaza la política anterior, no se agrega otra permisiva (se sumarían).
-- QR/control de acceso de A usa SECURITY DEFINER y no cambia su contrato.
alter table public.entradas enable row level security;
drop policy if exists entradas_select_comprador_o_destinatario on public.entradas;
create policy entradas_select_comprador_o_destinatario on public.entradas for select to authenticated
using (usuario_destino_id=(select auth.uid()) and exists(select 1 from public.usuarios where id=(select auth.uid()) and activo));
commit;
