-- QPass · Sprint 3 · Dev C · HU 53–56
-- Gestión de negocios y productos del propietario.
-- Requiere 202611160003_devd_comercio_base.sql ya aplicado:
--   crea negocios_eventos, revoca escrituras directas sobre negocios/productos,
--   define devd_negocio_autorizado y hace grant select al rol authenticated.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ─── 1) Helper: propietario activo con rol 'negocio' ─────────────────────────
create or replace function public.devc_dueno_activo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and activo and rol = 'negocio'
  );
$$;
revoke all on function public.devc_dueno_activo() from public, anon;
grant execute on function public.devc_dueno_activo() to authenticated;

-- Helper: propietario de un negocio concreto — evita que las políticas de
-- negocios_eventos y productos consulten negocios bajo RLS, cortando el ciclo
-- de recursión infinita con devd_negocios_select de Dev D.
create or replace function public.devc_es_dueno(p_negocio integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.negocios
    where id = p_negocio and dueno_id = auth.uid()
  ) and public.devc_dueno_activo();
$$;
revoke all on function public.devc_es_dueno(integer) from public, anon;
grant execute on function public.devc_es_dueno(integer) to authenticated;

-- ─── 2) Políticas SELECT adicionales (no tocan las de Dev D) ─────────────────
-- negocios: el dueño ve los suyos.
drop policy if exists devc_negocios_dueno on public.negocios;
create policy devc_negocios_dueno on public.negocios for select to authenticated
  using (dueno_id = auth.uid() and public.devc_dueno_activo());

-- productos: el dueño ve los de sus negocios.
drop policy if exists devc_productos_dueno on public.productos;
create policy devc_productos_dueno on public.productos for select to authenticated
  using (public.devc_es_dueno(productos.negocio_id));

-- negocios_eventos: el dueño ve las filas de sus negocios.
drop policy if exists devc_negocios_eventos_dueno on public.negocios_eventos;
create policy devc_negocios_eventos_dueno on public.negocios_eventos for select to authenticated
  using (public.devc_es_dueno(negocios_eventos.negocio_id));

-- ─── 3) RPCs de negocios y productos ─────────────────────────────────────────

-- 3a) crear_negocio: vincula el negocio al evento asignado al propietario.
create or replace function public.crear_negocio(p_nombre text, p_descripcion text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_negocio_id integer;
  v_evento_id  integer;
  v_nombre     text := btrim(p_nombre);
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if v_nombre is null or length(v_nombre) < 1 or length(v_nombre) > 120 then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  -- El negocio se vincula al evento donde el admin asignó al propietario.
  select evento_id into v_evento_id
    from public.asignaciones_staff
    where usuario_id = auth.uid() and rol_staff = 'negocio';
  if not found then
    raise exception 'SIN_EVENTO_ASIGNADO';
  end if;
  insert into public.negocios (dueno_id, nombre, descripcion, estado)
    values (auth.uid(), v_nombre, p_descripcion, true)
    returning id into v_negocio_id;
  insert into public.negocios_eventos (negocio_id, evento_id, activo)
    values (v_negocio_id, v_evento_id, true);
  return v_negocio_id;
end;
$$;

-- 3b) editar_negocio: estado=false desactiva sin borrar historial.
create or replace function public.editar_negocio(
  p_negocio     integer,
  p_nombre      text,
  p_descripcion text,
  p_estado      boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_nombre text := btrim(p_nombre);
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if p_negocio is null or v_nombre is null or length(v_nombre) < 1
     or length(v_nombre) > 120 or p_estado is null then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  update public.negocios
    set nombre = v_nombre, descripcion = p_descripcion, estado = p_estado
    where id = p_negocio and dueno_id = auth.uid();
  if not found then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
end;
$$;

-- 3c) eliminar_negocio: bloquea la fila, rechaza si hay ventas.
create or replace function public.eliminar_negocio(p_negocio integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id integer;
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if p_negocio is null then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  select id into v_id from public.negocios
    where id = p_negocio and dueno_id = auth.uid() for update;
  if not found then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if exists (select 1 from public.ventas where negocio_id = p_negocio) then
    raise exception 'NEGOCIO_CON_VENTAS';
  end if;
  -- negocios_eventos no tiene cascade desde negocios; se borra primero.
  delete from public.negocios_eventos where negocio_id = p_negocio;
  -- productos y ayudantes caen por ON DELETE CASCADE de negocios.
  delete from public.negocios where id = p_negocio;
end;
$$;

-- 3d) crear_producto.
create or replace function public.crear_producto(
  p_negocio     integer,
  p_nombre      text,
  p_descripcion text,
  p_precio      numeric,
  p_disponible  boolean
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_producto_id integer;
  v_nombre      text := btrim(p_nombre);
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if p_negocio is null or v_nombre is null or length(v_nombre) < 1
     or length(v_nombre) > 120 or p_precio is null
     or p_precio = 'NaN'::numeric or p_precio < 0
     or p_precio != round(p_precio, 2) or p_disponible is null then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.negocios
    where id = p_negocio and dueno_id = auth.uid()
  ) then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  insert into public.productos (negocio_id, nombre, descripcion, precio, disponible)
    values (p_negocio, v_nombre, p_descripcion, p_precio, p_disponible)
    returning id into v_producto_id;
  return v_producto_id;
end;
$$;

-- 3e) editar_producto.
create or replace function public.editar_producto(
  p_producto    integer,
  p_nombre      text,
  p_descripcion text,
  p_precio      numeric,
  p_disponible  boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_nombre text := btrim(p_nombre);
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if p_producto is null or v_nombre is null or length(v_nombre) < 1
     or length(v_nombre) > 120 or p_precio is null
     or p_precio = 'NaN'::numeric or p_precio < 0
     or p_precio != round(p_precio, 2) or p_disponible is null then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  update public.productos
    set nombre = v_nombre, descripcion = p_descripcion,
        precio = p_precio, disponible = p_disponible
    where id = p_producto
      and negocio_id in (
        select id from public.negocios where dueno_id = auth.uid()
      );
  if not found then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
end;
$$;

-- 3f) eliminar_producto: bloquea la fila, rechaza si hay venta_items.
create or replace function public.eliminar_producto(p_producto integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_negocio_id integer;
begin
  if not public.devc_dueno_activo() then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if p_producto is null then
    raise exception 'DATOS_INVALIDOS' using errcode = '22023';
  end if;
  select p.negocio_id into v_negocio_id
    from public.productos p
    where p.id = p_producto
      and exists (
        select 1 from public.negocios n
        where n.id = p.negocio_id and n.dueno_id = auth.uid()
      )
    for update;
  if not found then
    raise exception 'SIN_PERMISOS' using errcode = '42501';
  end if;
  if exists (select 1 from public.venta_items where producto_id = p_producto) then
    raise exception 'PRODUCTO_CON_VENTAS';
  end if;
  delete from public.productos where id = p_producto;
end;
$$;

-- ─── Revoke / grant ───────────────────────────────────────────────────────────
revoke all on function public.crear_negocio(text, text) from public, anon;
revoke all on function public.editar_negocio(integer, text, text, boolean) from public, anon;
revoke all on function public.eliminar_negocio(integer) from public, anon;
revoke all on function public.crear_producto(integer, text, text, numeric, boolean) from public, anon;
revoke all on function public.editar_producto(integer, text, text, numeric, boolean) from public, anon;
revoke all on function public.eliminar_producto(integer) from public, anon;
grant execute on function public.crear_negocio(text, text) to authenticated;
grant execute on function public.editar_negocio(integer, text, text, boolean) to authenticated;
grant execute on function public.eliminar_negocio(integer) to authenticated;
grant execute on function public.crear_producto(integer, text, text, numeric, boolean) to authenticated;
grant execute on function public.editar_producto(integer, text, text, numeric, boolean) to authenticated;
grant execute on function public.eliminar_producto(integer) to authenticated;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- REFERENCIA RÁPIDA
-- ─────────────────────────────────────────────────────────────────────────────
-- Orden de aplicación:
--   1. 202611160003_devd_comercio_base.sql  (Dev D — ya aplicado)
--   2. sprint3_devC_negocios.sql            (este archivo)
--
-- Helpers (SECURITY DEFINER, solo rol authenticated):
--
--   devc_dueno_activo() → boolean
--     True si auth.uid() tiene activo=true y rol='negocio'.
--
--   devc_es_dueno(p_negocio integer) → boolean
--     True si el negocio pertenece a auth.uid() y devc_dueno_activo().
--     Se usa en las políticas de productos y negocios_eventos para evitar
--     que éstas consulten negocios bajo RLS, cortando el ciclo de recursión
--     infinita con devd_negocios_select de Dev D.
--
-- RPCs (todas SECURITY DEFINER, solo rol authenticated):
--
--   crear_negocio(p_nombre text, p_descripcion text) → integer
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023), SIN_EVENTO_ASIGNADO
--
--   editar_negocio(p_negocio integer, p_nombre text,
--                  p_descripcion text, p_estado boolean) → void
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023)
--
--   eliminar_negocio(p_negocio integer) → void
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023), NEGOCIO_CON_VENTAS
--     (si hay ventas la UI debe sugerir desactivar con editar_negocio)
--
--   crear_producto(p_negocio integer, p_nombre text, p_descripcion text,
--                  p_precio numeric, p_disponible boolean) → integer
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023)
--
--   editar_producto(p_producto integer, p_nombre text, p_descripcion text,
--                   p_precio numeric, p_disponible boolean) → void
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023)
--
--   eliminar_producto(p_producto integer) → void
--     Errores: SIN_PERMISOS(42501), DATOS_INVALIDOS(22023), PRODUCTO_CON_VENTAS
--     (si hay venta_items la UI debe sugerir marcar disponible=false)
--
-- Precio: numeric; se valida >= 0, no NaN, máximo 2 decimales.
-- El precio se almacena en puntos según la propuesta v1 de Dev D
--   (reservas_conservadoras_v1 en negocios_eventos.contrato).
-- ═════════════════════════════════════════════════════════════════════════════
