# QPass · Sprint 3 · Contrato y coordinación de Dev C

**Desarrollador:** Jhonatan Aguilar (Dev C) · Rama: `Aguilar`
**Fecha:** 17/11/2026 · HU: 17, 50, 51 (parcial), 52–58

---

## 1. Orden de aplicación del SQL de Dev C

Los tres archivos ya están aplicados en Supabase. Deben reaplicarse en este orden
si se reinstala el proyecto desde cero:

| # | Archivo | Prerequisito |
|---|---------|--------------|
| 1 | `202611160003_devd_comercio_base.sql` | Dev D — base de comercio |
| 2 | `supabase/sprint3_devC_negocios.sql` | requiere el anterior |
| 3 | `supabase/sprint3_devC_ayudantes.sql` | requiere los dos anteriores |
| 4 | `supabase/sprint3_devC_devoluciones.sql` | requiere `sprint3_devA_qr.sql` y el de Dev D |

`sprint3_devC_devoluciones.sql` requiere además que `sprint3_devA_qr.sql` esté
aplicado (define `qpass_autorizado_evento`, usada en la política de storage y en
las RPCs del encargado).

---

## 2. Para Dev D — catálogo y asignaciones

### 2.1 Vínculo negocio–evento

`crear_negocio` utiliza `negocios_eventos` como tabla de vínculo. Al crear un
negocio se inserta una fila con `activo = true` para el evento donde el admin
asignó al propietario en `asignaciones_staff` (`rol_staff = 'negocio'`). Un
propietario sin esa asignación recibe `SIN_EVENTO_ASIGNADO`.

### 2.2 Activación y desactivación de negocios

El campo `negocios.estado` (boolean) controla si el negocio puede operar.
Desactivarlo (`estado = false`) corta las ventas porque `devd_negocio_autorizado`
(definida por D) devuelve false. El historial de ventas y los productos se
conservan. `editar_negocio` acepta `p_estado boolean` para esta operación.

### 2.3 Productos

Columnas: `nombre`, `descripcion`, `precio` (numeric 10,2 en puntos, ≥ 0, máximo
2 decimales, validado con `p_precio != round(p_precio, 2)`), `disponible`.
La validación de precio está alineada con la propuesta v1 de Dev D
(`reservas_conservadoras_v1` en `negocios_eventos.contrato`).

### 2.4 Flujo de registro de ayudante

1. El servidor crea la cuenta en Auth con la service role key y fija `rol = 'ayudante'`.
2. Con la sesión del dueño se llama a `vincular_ayudante(p_usuario, p_negocios)`.
3. La función inserta en `asignaciones_staff` (`rol_staff = 'ayudante'` para el
   evento del dueño) y en `ayudantes(negocio_id, usuario_id, activo = true)`.

Desactivar un ayudante (`editar_ayudante` con `p_activo = false`) pone
`ayudantes.activo = false` y conserva el historial de ventas.
Eliminar solo es posible si no hay ventas; si las hay, la UI sugiere desactivar.

### 2.5 Restricciones al eliminar

| Operación | Error si hay ventas |
|-----------|---------------------|
| `eliminar_negocio` | `NEGOCIO_CON_VENTAS` — sugerir desactivar con `editar_negocio` |
| `eliminar_producto` | `PRODUCTO_CON_VENTAS` — sugerir `disponible = false` |
| `eliminar_ayudante` | `AYUDANTE_CON_VENTAS` — sugerir `editar_ayudante` con `p_activo = false` |

`eliminar_negocio` borra primero `negocios_eventos` (sin cascade desde negocios);
`productos` y `ayudantes` caen por `ON DELETE CASCADE`.

### 2.6 Pendiente de Dev D: consulta de ventas del mes

La tarjeta "Ventas del Mes" del dashboard `/negocio` muestra `—` con el comentario
`Pendiente: conectar con la consulta de ventas por negocio de Dev D`.

**Solicitado a D:** una RPC o query que devuelva el total de ventas confirmadas
agrupadas por `negocio_id` del dueño y por mes (hora de Bolivia, `America/La_Paz`).
Punto de integración: `app/negocio/page.tsx`.

---

## 3. Para Dev B — devoluciones virtuales

### 3.1 Lo que implementa C

| RPC | Descripción |
|-----|-------------|
| `crear_solicitud_devolucion` | Crea la solicitud si el evento ya finalizó y el plazo está vigente. El monto (`disponible = saldo - reservado`) se calcula en el servidor, nunca se acepta del browser. Valida que el QR exista en el bucket privado `devoluciones` y pertenezca al par `usuario_id/evento_id`. Bloquea la fila de `saldos_puntos` para evitar solicitudes concurrentes. Una sola solicitud `en_revision` o `aprobada` por usuario y evento. El trigger `devd_mantener_reserva` (D) actualiza `reservado` al insertar. |
| `devc_mis_solicitudes_devolucion` | Historial del cliente autenticado. |
| `listar_solicitudes_devolucion` | Bandeja del encargado; filtro por estado. |
| `rechazar_solicitud_devolucion` | Idempotente si ya está rechazada. El trigger de D libera la reserva al actualizar el estado. |

### 3.2 Lo que falta de Dev B

La operación de **aceptar/liquidar** una solicitud. El stub actual en
`app/devolucion/solicitudes/actions.ts` retorna un mensaje de pendiente.

**Punto de conexión:** `export async function aceptarSolicitud(solicitudId: number)`
en `app/devolucion/solicitudes/actions.ts`. B debe implementar ahí (o reemplazar el
stub con) la lógica que:

1. Pasa el estado a `'aprobada'`.
2. Descuenta el saldo, libera la reserva y registra en `devoluciones` con un
   comprobante simulado.
3. Es idempotente: no procesa una solicitud ya aprobada.

La operación de base de datos para este flujo (nombre, firma y errores) la
define B como parte de su núcleo de saldo y devoluciones; C solo la invoca desde
`aceptarSolicitud` (ver referencia al pie de `sprint3_devC_devoluciones.sql`).

### 3.3 Prevención de doble liquidación

La devolución presencial de B debe calcular el saldo disponible como
`saldo - reservado`, **no** como `saldo` a secas. Los puntos con `reservado > 0`
están comprometidos por una solicitud virtual `en_revision` y no deben liquidarse
por la vía presencial.

### 3.4 Integración del panel del encargado

`/devolucion/solicitudes` no tiene layout propio; cuando B cree
`app/devolucion/layout.tsx` esa página quedará automáticamente dentro de su panel.
B debe agregar el enlace "Solicitudes Virtuales" a su menú de navegación.

---

## 4. Para Dev A — archivos compartidos modificados

Solo se agregaron entradas; no se eliminó ni cambió nada existente.

| Archivo | Qué se agregó |
|---------|---------------|
| `middleware.ts` | `'/negocio'` y `'/devolucion'` en `RUTAS_PROTEGIDAS` |
| `components/OcultarEnPanel.tsx` | Prefijo `'/negocio'` para ocultar el header público en el panel de negocio |
| `components/MenuCuenta.tsx` | Rol `negocio` → `{ href: '/negocio', etiqueta: 'Panel de negocio' }`; rol `devolucion` → `{ href: '/devolucion/solicitudes', etiqueta: 'Solicitudes virtuales' }`; enlace común `{ href: '/mi-cuenta/devoluciones', etiqueta: 'Mis devoluciones' }` |

---

## 5. Plazo de devolución

Almacenado en `public.devc_parametros` (`clave = 'plazo_devolucion_horas'`,
`valor integer > 0`). La tabla tiene RLS habilitado sin grants a `anon` ni
`authenticated`; solo las funciones `SECURITY DEFINER` de C pueden leerla.

**Sin valor cargado**, `devc_eventos_devolucion_cliente` devuelve todos los eventos
con `habilitado = false` y `venceEn = null`; `crear_solicitud_devolucion` rechaza
con `PLAZO_NO_CONFIGURADO`.

**SQL para cargarlo cuando el equipo acuerde el valor** (`N` = horas):

```sql
insert into public.devc_parametros(clave, valor)
values ('plazo_devolucion_horas', N)
on conflict (clave) do update
  set valor = excluded.valor,
      actualizado_en = now();
```

---

## 6. Tabla de RPC de Dev C

### sprint3_devC_negocios.sql

| RPC | Parámetros | Retorno | Errores |
|-----|-----------|---------|---------|
| `devc_dueno_activo` | — | `boolean` | — |
| `devc_es_dueno` | `p_negocio integer` | `boolean` | — |
| `crear_negocio` | `p_nombre text, p_descripcion text` | `integer` (id) | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)`, `SIN_EVENTO_ASIGNADO` |
| `editar_negocio` | `p_negocio integer, p_nombre text, p_descripcion text, p_estado boolean` | `void` | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)` |
| `eliminar_negocio` | `p_negocio integer` | `void` | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)`, `NEGOCIO_CON_VENTAS` |
| `crear_producto` | `p_negocio integer, p_nombre text, p_descripcion text, p_precio numeric, p_disponible boolean` | `integer` (id) | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)` |
| `editar_producto` | `p_producto integer, p_nombre text, p_descripcion text, p_precio numeric, p_disponible boolean` | `void` | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)` |
| `eliminar_producto` | `p_producto integer` | `void` | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)`, `PRODUCTO_CON_VENTAS` |

### sprint3_devC_ayudantes.sql

| RPC | Parámetros | Retorno | Errores |
|-----|-----------|---------|---------|
| `vincular_ayudante` | `p_usuario uuid, p_negocios integer[]` | `void` | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)`, `USUARIO_NO_AYUDANTE`, `AYUDANTE_DE_OTRO_DUENO`, `SIN_EVENTO_ASIGNADO`, `AYUDANTE_CON_OTRO_EVENTO` |
| `editar_ayudante` | `p_usuario uuid, p_nombre text, p_negocios integer[], p_activo boolean` | `void` | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)` |
| `eliminar_ayudante` | `p_usuario uuid` | `void` | `SIN_PERMISOS(42501)`, `AYUDANTE_CON_VENTAS` |
| `listar_ayudantes_dueno` | — | `jsonb` `[{usuarioId, nombre, correo, activo, negocios:[{id,nombre,activo}]}]` | `SIN_PERMISOS(42501)` |

### sprint3_devC_devoluciones.sql

| RPC | Parámetros | Retorno | Errores |
|-----|-----------|---------|---------|
| `devc_eventos_devolucion_cliente` | — | `jsonb` `[{eventoId, titulo, fechaFin, saldo, reservado, disponible, venceEn, habilitado}]` | `SIN_PERMISOS(42501)` |
| `crear_solicitud_devolucion` | `p_evento integer, p_monto numeric, p_qr_ruta text` | `integer` (id solicitud) | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)`, `PLAZO_NO_CONFIGURADO`, `EVENTO_NO_FINALIZADO`, `FUERA_DE_PLAZO`, `QR_INVALIDO`, `SIN_SALDO`, `SOLICITUD_PENDIENTE`, `SALDO_INSUFICIENTE` |
| `devc_mis_solicitudes_devolucion` | — | `jsonb` `[{id, eventoId, evento, monto, estado, creadoEn, qrRuta}]` | `SIN_PERMISOS(42501)` |
| `devc_eventos_encargado` | — | `jsonb` `[{id, titulo}]` | `SIN_PERMISOS(42501)` |
| `listar_solicitudes_devolucion` | `p_evento integer, p_estado text` | `jsonb` `[{id, solicitante, correo, monto, estado, creadoEn, qrRuta}]` | `SIN_PERMISOS(42501)`, `DATOS_INVALIDOS(22023)` |
| `rechazar_solicitud_devolucion` | `p_solicitud integer` | `void` | `SIN_PERMISOS(42501)`, `SOLICITUD_YA_PROCESADA` |

---

## 7. Pendientes y dependencias

| Ítem | Responsable | Estado |
|------|-------------|--------|
| Aceptar/liquidar solicitud de devolución | Dev B | Pendiente — stub en `app/devolucion/solicitudes/actions.ts` |
| Ventas del mes por negocio (hora Bolivia) | Dev D | Pendiente — `app/negocio/page.tsx` muestra `—` |
| Cargar `plazo_devolucion_horas` en `devc_parametros` | Equipo | Sin valor; sin él, `crear_solicitud_devolucion` responde `PLAZO_NO_CONFIGURADO` |
| Recargas de puntos para pruebas de devolución | Dev B | Necesarias para probar el flujo completo de HU 17 |
