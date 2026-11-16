# QPass · Sprint 3 · Dev D · HU 59, 62 y 63

## Alcance local

Preparación de lecturas del módulo Ayudante. No hay adaptador de ventas conectado,
RPC nueva, SQL, cobro, débito de puntos ni datos de demostración en estas pantallas.
El carrito de HU 60 no genera una venta ni un comprobante.

Rutas:

- `/ayudante`: cuatro métricas, actualmente no disponibles.
- `/ayudante/historial`: filtros y listado preparado, actualmente no disponibles.
- `/ayudante/ventas/[ventaId]`: detalle preparado.
- `/ayudante/ventas/[ventaId]/comprobante`: comprobante HTML preparado; no exporta PDF.

Un ID sintácticamente válido muestra disponibilidad pendiente, sin afirmar que la
venta exista o pertenezca al usuario. Un ID inválido devuelve `notFound` después
del control de acceso. No hay enlaces a ventas de ejemplo en producción.

## Autorización

Las páginas reutilizan `obtenerContextoAyudante`; cada lectura de servidor vuelve a
exigir `exigirEventoAyudante`. Se conservan sesión, cuenta activa, rol ayudante y
asignación de evento no ambigua. No se modifica el guard existente ni RLS.

El futuro adaptador debe construir el alcance desde la sesión y las asignaciones
comerciales verificadas en servidor, nunca desde parámetros del navegador. El
criterio preparado es venta del propio ayudante, mismo evento y negocio autorizado.
Un permiso para consultar ventas de otros ayudantes requeriría un contrato explícito.

`validarVentaConfirmada` comprueba estado, actor, evento, negocio autorizado, ID
esperado, fecha con zona explícita y líneas históricas consistentes. Su tipo
`VentaAutorizada` expresa una validación local; no sustituye consultas autorizadas,
RLS ni pruebas reales en PostgreSQL. No conectar las vistas directamente a objetos
del navegador ni eludir el validador mediante conversiones de tipos.

## Contratos propuestos, no esquema de base de datos

`lib/ayudante/ventas-types.ts` extiende los tipos de vista existentes sin cambiar los
contratos compartidos. `FuenteLecturaVentas` es un puerto interno de aplicación,
no una firma RPC acordada con Dev B/C. Su conexión queda pendiente.

El DTO de lectura requiere ID, referencia, instante, estado confirmado normalizado,
actor, evento, negocio y nombre histórico del negocio, total confirmado y líneas
con producto, nombre histórico, cantidad, precio unitario histórico y subtotal.
El literal `confirmada` es del DTO; no presupone un enum o columna SQL existente.

Los puntos son cadenas decimales no negativas; se suman/comparan con aritmética
entera escalada. No se recalculan precios usando el catálogo actual. Se rechazan
históricos ausentes e inconsistencias entre cantidad, precio histórico, subtotal y
total. Si existen descuentos, impuestos o ajustes, B/C deben acordar su representación
histórica antes de conectar: el contrato actual exige total igual a suma de líneas.

El adaptador de detalle debe validar también el ID solicitado. El de historial
debe validar cada registro y devolver únicamente negocios autorizados. Una colección
conocida y vacía puede representar cero ventas; ausencia de conexión nunca representa
cero. Las funciones de servidor actuales devuelven exclusivamente `pendiente`.

## Fechas y métricas

Zona única: `America/La_Paz`, independiente de la zona del servidor o navegador.
Las fechas de filtros incluyen todo el día local; se validan calendario e intervalo.
Los instantes necesitan zona explícita. La presentación usa hora de 24 horas.

Las tarjetas de ventas del día y mes representan cantidades de ventas confirmadas.
Total de puntos cobrados y cantidad confirmada abarcan el conjunto completo del
alcance autorizado. El adaptador debe acordar este alcance y evitar calcular métricas
globales a partir de una página filtrada o paginada. Se rechazan IDs duplicados al
resumir. Los filtros de negocio, fechas y referencia no habilitan autorización.

## Dependencias pendientes de Dev B y Dev C

- Esquema y tipos reales de `ventas`/`venta_items`, relaciones, IDs y estados.
- Registro transaccional confirmado de cobro (HU 61), sin confiar en precios cliente.
- Persistencia inmutable de nombres, cantidades, precios y totales históricos.
- Asignaciones comerciales y permisos de lectura por ayudante, evento y negocio.
- RLS y consultas de solo lectura autorizadas para detalle, historial y métricas.
- Paginación, límites, índices y tratamiento de ajustes/anulaciones cuando se acuerden.

Dev B debe confirmar saldo/cobro y significado de venta confirmada; Dev C, catálogo,
negocios y asignaciones. El reparto definitivo del esquema transaccional debe
confirmarse con ambos. No se modifica ningún contrato de A/B/C en esta preparación.

## Verificación local y pruebas reales pendientes

Pruebas aisladas: `node scripts/validar-lecturas-ventas.cjs`. Usan registros ficticios
exclusivamente dentro del script; cubren alcance ajeno, estado no confirmado,
inactividad, rutas pendientes, históricos, fechas de Bolivia, filtros y ausencia
de cobros. También se conserva `node scripts/validar-base-ayudante.cjs`.

Comprobación manual actual:

1. Entrar con ayudante activo y evento asignado; abrir dashboard e historial.
2. Confirmar cuatro indicadores no disponibles y filtros deshabilitados; ninguna
   venta se presenta como real. Revisar móvil y escritorio.
3. Abrir detalle y comprobante con un ID de prueba; deben mostrar indisponibilidad,
   nunca datos, precios o estado confirmado deducidos de ese ID.
4. Revisar acceso sin sesión, con rol distinto, cuenta inactiva y sin evento.
5. Confirmar que HU 60 sigue independiente y no ofrece cobro operativo.

Cuando exista adaptador, probar con dos cuentas y ventas realmente confirmadas:
negación cruzada de IDs y negocios; comprobante coherente con registros persistidos;
cambios posteriores del catálogo sin alterar históricos; filtros en límites de día,
mes y año bolivianos; paginación sin alterar métricas; rechazo de ventas pendientes,
anuladas o con líneas incompletas. Estas pruebas y RLS real siguen pendientes.

La preparación local no demuestra integración con Supabase ni completa las tres HU.

Resultados locales de esta preparación:

| Verificación | Resultado |
| --- | --- |
| `node scripts/validar-lecturas-ventas.cjs` | 30 pruebas aprobadas |
| `node scripts/validar-base-ayudante.cjs` | 22 pruebas aprobadas |
| `node scripts/validar-base-ayudante.cjs --browser` | 10 escenarios de fixtures aprobados a 390/1280 px, incluidos dashboard e historial; no sesión real |
| `npx tsc --noEmit` | Aprobada |
| `npm run lint` | Sin errores; advertencia existente de `Button` sin uso en `app/eventos/[id]/page.tsx` |
| `npm run build` | Aprobada en Next.js 16.3.7; aviso existente de deprecación de `middleware` |
| `git diff --check` | Sin errores de whitespace; avisos de conversión LF/CRLF de Git |

El detalle y comprobante tienen pruebas de renderizado aisladas; su revisión visual
en navegador con operaciones reales sigue pendiente, junto a las pruebas de RLS.
