-- ════════════════════════════════════════════════════════════════
-- QPass · Sprint 1 · Dev C
-- Compra de entradas: RLS de compras/entradas + función transaccional.
-- Ejecutar UNA vez en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
-- ════════════════════════════════════════════════════════════════

-- ─── 0) codigo_qr único (red de seguridad a nivel de BD) ─────────
create unique index if not exists ux_entradas_codigo_qr
  on public.entradas (codigo_qr);

-- ─── 1) COMPRAS: cada quien ve solo lo suyo ──────────────────────
alter table public.compras enable row level security;

drop policy if exists "compras_select_propias" on public.compras;
create policy "compras_select_propias"
  on public.compras
  for select
  to authenticated
  using (comprador_id = (select auth.uid()));

-- El comprador solo puede insertar una compra SUYA y nunca ya "confirmada":
-- así nadie puede autoconfirmarse un pago desde el navegador.
-- (El flujo real de compra NO depende de esta política: usa comprar_entradas().)
drop policy if exists "compras_insert_propias" on public.compras;
create policy "compras_insert_propias"
  on public.compras
  for insert
  to authenticated
  with check (
    comprador_id = (select auth.uid())
    and estado_pago = 'pendiente'
  );

revoke all on public.compras from anon;
grant select, insert on public.compras to authenticated;

-- ─── 2) ENTRADAS: las ve quien la compró o a quien va dirigida ───
-- Sin política de INSERT/UPDATE: las entradas solo las crea comprar_entradas().
alter table public.entradas enable row level security;

drop policy if exists "entradas_select_comprador_o_destinatario" on public.entradas;
create policy "entradas_select_comprador_o_destinatario"
  on public.entradas
  for select
  to authenticated
  using (
    usuario_destino_id = (select auth.uid())
    or exists (
      select 1
      from public.compras c
      where c.id = entradas.compra_id
        and c.comprador_id = (select auth.uid())
    )
  );

revoke all on public.entradas from anon;
grant select on public.entradas to authenticated;

-- ─── 3) TIPOS_TICKET: el cupo NO se descuenta desde el cliente ───
-- Dev B ya dio solo SELECT público. NO des UPDATE a authenticated:
-- el descuento lo hace comprar_entradas() (security definer).

-- ─── 4) FUNCIÓN TRANSACCIONAL ────────────────────────────────────
-- Una llamada = una transacción: o se crea TODO (compra + entradas +
-- descuento de cupo) o no se crea NADA (cualquier RAISE revierte todo).
--
-- p_evento_id      id del evento (texto; se compara con id::text)
-- p_lineas         [{"tipo_ticket_id": "...", "cantidad": 2}, ...]
-- p_correo_destino null / '' = compra para sí mismo; correo = para otra persona
--
-- Errores (message): NO_AUTH, EVENTO_NO_DISPONIBLE, LINEAS_INVALIDAS,
-- TIPO_INVALIDO, SIN_CUPO, LIMITE_EXCEDIDO, CORREO_INVALIDO,
-- DESTINATARIO_NO_REGISTRADO, DESTINATARIO_ES_COMPRADOR
create or replace function public.comprar_entradas(
  p_evento_id      text,
  p_lineas         jsonb,
  p_correo_destino text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ─── ZONA EDITABLE: reglas de negocio ──────────────────────────
  c_tasa_cargos    constant numeric := 0.07; -- 7 % (mantener igual que lib/compras/calculo.ts)
  c_max_lineas     constant int     := 10;   -- tipos de ticket distintos por compra
  c_max_por_linea  constant int     := 10;   -- entradas por tipo en una compra
  -- ───────────────────────────────────────────────────────────────

  v_uid              uuid := auth.uid();
  v_correo           text := lower(btrim(coalesce(p_correo_destino, '')));
  v_destino_id       uuid;
  v_destino_nombre   text;
  v_evento_id        public.eventos.id%type;
  v_compra_id        public.compras.id%type;
  v_linea            record;
  v_ticket           record;
  v_ya_comprados     int;
  v_subtotal         numeric := 0;
  v_cargos           numeric;
  v_total            numeric;
  v_n_entradas       int := 0;
  v_i                int;
begin
  -- 1) Debe haber sesión. comprador_id SIEMPRE es auth.uid(), nunca un parámetro.
  if v_uid is null then
    raise exception 'NO_AUTH';
  end if;

  -- 2) El evento debe estar publicado y no haber pasado.
  select e.id into v_evento_id
  from public.eventos e
  where e.id::text = p_evento_id
    and e.estado = 'publicado'
    and e.fecha_evento > now();
  if not found then
    raise exception 'EVENTO_NO_DISPONIBLE';
  end if;

  -- 3) Validar las líneas (el JSON viene del navegador: no se confía).
  if p_lineas is null
     or jsonb_typeof(p_lineas) <> 'array'
     or jsonb_array_length(p_lineas) not between 1 and c_max_lineas then
    raise exception 'LINEAS_INVALIDAS';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lineas) l
    where jsonb_typeof(l -> 'tipo_ticket_id') is distinct from 'string'
       or jsonb_typeof(l -> 'cantidad') is distinct from 'number'
       or case when (l ->> 'cantidad') ~ '^[0-9]{1,3}$'
               then (l ->> 'cantidad')::int
               else 0
          end not between 1 and c_max_por_linea
  ) then
    raise exception 'LINEAS_INVALIDAS';
  end if;

  if (select count(distinct l ->> 'tipo_ticket_id') from jsonb_array_elements(p_lineas) l)
     <> jsonb_array_length(p_lineas) then
    raise exception 'LINEAS_INVALIDAS'; -- mismo tipo repetido
  end if;

  -- 4) Destinatario: para mí, o buscar su UUID por correo.
  if v_correo = '' then
    v_destino_id := v_uid;
  else
    if length(v_correo) > 254 or v_correo !~ '^[^@\s]+@[^@\s]+$' then
      raise exception 'CORREO_INVALIDO';
    end if;

    select u.id, u.nombre into v_destino_id, v_destino_nombre
    from public.usuarios u
    where lower(u.correo) = v_correo
    limit 1;

    if not found then
      raise exception 'DESTINATARIO_NO_REGISTRADO';
    end if;
    if v_destino_id = v_uid then
      raise exception 'DESTINATARIO_ES_COMPRADOR';
    end if;
  end if;

  -- 5) Crear la compra en "pendiente" (los totales se fijan al final).
  insert into public.compras (comprador_id, subtotal, cargos_servicio, total, estado_pago)
  values (v_uid, 0, 0, 0, 'pendiente')
  returning id into v_compra_id;

  -- 6) Por cada tipo de ticket: descuento ATÓMICO de cupo + una fila por entrada.
  --    Se recorren ordenadas por id para que dos compras simultáneas bloqueen
  --    las filas en el mismo orden (evita deadlocks).
  for v_linea in
    select l ->> 'tipo_ticket_id' as tipo_id,
           (l ->> 'cantidad')::int as cantidad
    from jsonb_array_elements(p_lineas) l
    order by 1
  loop
    -- UPDATE ... WHERE cantidad_disponible >= cantidad: si dos compras compiten
    -- por el último cupo, la segunda espera el lock y NO encuentra fila.
    update public.tipos_ticket t
       set cantidad_disponible = t.cantidad_disponible - v_linea.cantidad
     where t.id::text = v_linea.tipo_id
       and t.evento_id = v_evento_id
       and t.cantidad_disponible >= v_linea.cantidad
    returning t.id, t.nombre, t.precio, t.limite_por_usuario
      into v_ticket;

    if not found then
      select t.nombre into v_ticket
      from public.tipos_ticket t
      where t.id::text = v_linea.tipo_id and t.evento_id = v_evento_id;

      if found then
        raise exception 'SIN_CUPO' using detail = v_ticket.nombre;
      end if;
      raise exception 'TIPO_INVALIDO';
    end if;

    -- Límite por usuario (cuenta lo que ya compró; ya tenemos el lock de la fila,
    -- así que dos compras del mismo usuario no pueden saltarse el límite).
    if v_ticket.limite_por_usuario is not null then
      select count(*) into v_ya_comprados
      from public.entradas e
      join public.compras c on c.id = e.compra_id
      where c.comprador_id = v_uid
        and e.tipo_ticket_id = v_ticket.id
        and e.estado <> 'anulada'
        and c.estado_pago <> 'fallido';

      if v_ya_comprados + v_linea.cantidad > v_ticket.limite_por_usuario then
        raise exception 'LIMITE_EXCEDIDO'
          using detail = v_ticket.nombre,
                hint   = greatest(v_ticket.limite_por_usuario - v_ya_comprados, 0)::text;
      end if;
    end if;

    -- Una fila en "entradas" por cada ticket, con su propio codigo_qr único
    -- (122 bits aleatorios: no adivinable; el índice único es la red de seguridad).
    for v_i in 1..v_linea.cantidad loop
      insert into public.entradas (compra_id, tipo_ticket_id, usuario_destino_id, codigo_qr, estado)
      values (
        v_compra_id,
        v_ticket.id,
        v_destino_id,
        'QP-' || upper(replace(gen_random_uuid()::text, '-', '')),
        'activa'
      );
    end loop;

    -- El precio sale de la BD, jamás del navegador.
    v_subtotal   := v_subtotal + v_ticket.precio * v_linea.cantidad;
    v_n_entradas := v_n_entradas + v_linea.cantidad;
  end loop;

  -- 7) Totales + PAGO SIMULADO.
  --    ▼▼▼ Cuando exista la pasarela real, reemplaza este bloque: aquí se
  --    cobraría y, según el resultado, 'confirmado' o 'fallido'. ▼▼▼
  v_cargos := round(v_subtotal * c_tasa_cargos, 2);
  v_total  := v_subtotal + v_cargos;

  update public.compras
     set subtotal        = v_subtotal,
         cargos_servicio = v_cargos,
         total           = v_total,
         estado_pago     = 'confirmado'
   where id = v_compra_id;

  return jsonb_build_object(
    'compra_id',       v_compra_id,
    'entradas',        v_n_entradas,
    'subtotal',        v_subtotal,
    'cargos_servicio', v_cargos,
    'total',           v_total,
    'destinatario',    v_destino_nombre  -- null si compró para sí mismo
  );
end;
$$;

-- Solo usuarios con sesión pueden ejecutarla.
revoke all on function public.comprar_entradas(text, jsonb, text) from public, anon;
grant execute on function public.comprar_entradas(text, jsonb, text) to authenticated;
