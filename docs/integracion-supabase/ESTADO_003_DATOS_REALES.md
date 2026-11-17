# Migración 003 — resultado de lecturas reales

**Resultado: no hay bloqueo por datos históricos; instalar infraestructura y
activar cobros son decisiones diferentes.** 003 es técnicamente viable sobre
el estado vacío observado, condicionada a una comprobación SQL de metadatos actuales,
respaldo y ventana sin escritores financieros. No hay todavía evidencia suficiente
para declarar aprobada la unidad precio/puntos o el contrato de devoluciones B/C.

Rama: **Aliaga**. Se leyeron AGENTS.md, 003, catálogo real e informes finales.
El usuario confirma aplicación real de 000–002 y pruebas principales de HU4/9/13/14.
No se repitieron ni modificaron esas versiones.

## Evidencia de esta consulta

Proyecto configurado: `gnpqyrypallnloltwceu.supabase.co`.
Captura: **16/11/2026 23:22, America/La_Paz** (`2026-11-17T03:22:18.126Z`).
Se realizaron **22 peticiones GET/HEAD**, usando la clave de servidor cuyo rol se
verificó como privilegiado; no se usó una sesión anónima para concluir ceros con RLS.
No hubo POST, RPC, autenticación de usuarios ni escrituras remotas.

Solo se guardaron agregados y metadatos en `auditoria-003-datos-reales.json`:
sin claves, nombres, UUID de usuarios, QR, correos o filas financieras individuales.
Las peticiones HTTP son independientes, no una instantánea transaccional. Se
volvieron a comprobar los conteos; la captura no sustituye la comprobación dentro
de una ventana de aplicación sin actividad concurrente.

| Tabla comercial/financiera | Filas reales observadas |
| --- | ---: |
| negocios | 0 |
| productos | 0 |
| ayudantes | 0 |
| saldos_puntos | 0 |
| solicitudes_devolucion | 0 |
| devoluciones | 0 |
| recargas | 0 |
| ventas | 0 |
| venta_items | 0 |

`asignaciones_staff` tiene **2 filas**. Esto no acredita asignación comercial:
no hay ninguna fila en ayudantes ni ningún negocio. No se inventan relaciones
negocio-evento a partir del rol staff o de compras de entradas.

## Condiciones cumplidas y pendientes

| Comprobación | Resultado |
| --- | --- |
| Dependencia HU9/HU14 | El usuario confirma 000–002; la API expone las cuatro RPC de D correspondientes. |
| Precio y puntos | `productos.precio` es numeric(10,2) en el catálogo y numeric en la API; no hay productos. El esquema no declara moneda ni conversión. La equivalencia directa con puntos de 004 sigue siendo una propuesta. |
| Devoluciones pendientes/aprobadas | **0 en_revision, 0 aprobada, 0 rechazada y 0 devoluciones**. La puerta DEVOLUCIONES_HEREDADAS no está bloqueada por los datos observados. |
| Saldo gastable actual | No hay saldos, columna reservado expuesta ni RPC financiera de saldo/cobro expuesta. El catálogo anterior tampoco tiene funciones/triggers financieros. No hay un cálculo actual acreditado: saldo−reservado será la fórmula propuesta después de 003/004. |
| Negocios-eventos | No existe esa relación explícita en el catálogo y negocios_eventos no está expuesta en la API actual. 003 la crea vacía, con activo=false. C debe confirmar sus pares reales antes de habilitarlos. |
| Ayudantes comerciales | **0 activos** porque la tabla ayudantes está vacía. Faltan negocio, usuario/rol/cuenta activos y asignaciones comercial/staff válidas por evento. |
| Conciliación de datos anteriores | Ninguna cuenta/solicitud/venta existente de estas tablas requiere conciliación según las lecturas. No se extiende esa conclusión a futuros movimientos o escritores externos desconocidos. |

## Qué cambios necesita 003

**No se justifica modificar importes, rellenar ventas históricas ni eliminar guards.**
No encontré una discrepancia de datos que exija cambiar la migración para inicializar
este módulo vacío. Deben mantenerse:

- La inicialización de reservado desde solicitudes activas, sin tocar saldo.
- Los guards ante devoluciones, reservas sin saldo o mayores al saldo.
- RLS, revocaciones de escritura, locks e idempotencia preparada para 004.
- negocios_eventos vacío y sin habilitación automática.

Antes de uso real deben acordarse precio/puntos y devolución pagada. Si B define
que saldo ya representa dinero gastable o descuenta reservas al solicitarlas,
hay que adaptar el protocolo y su inicialización ANTES de que existan movimientos;
no restar reservas por segunda vez. Si B/C aceptan la propuesta conservadora, no
hace falta cambiar esa semántica en 003, pero sí completar la liquidación para
permitir devoluciones pagadas o excluir explícitamente ese flujo del piloto.

Con escritores concurrentes, la comprobación de devoluciones de 003 no toma un
lock sobre devoluciones. La ventana sin escritores evita esa carrera. Si el
equipo necesita instalación sin esa pausa, habría que extender la serialización
a devoluciones y revisar todo el orden de locks antes de aplicarla; no basta
quitar el guard o confiar en el flag de la UI.

## ¿Puede modificar incorrectamente saldos o reservas?

003 **no actualiza saldo**. Agrega reservado, lo inicializa y agrega una constraint.
Con **0 saldos y 0 solicitudes**, el UPDATE de inicialización afecta **0 cuentas**:
no hay puntos existentes que descontar o reservar por segunda vez en esta captura.
No significa que ese estado no pueda cambiar antes de instalar.

Sí cambia el esquema, permisos y comportamiento de escrituras futuras, y toma
locks DDL sobre tablas. Si otro miembro empieza a introducir saldos/devoluciones
durante la instalación, hay que detener avance y volver a evaluar. Mantener
QPASS_COMERCIO_REAL apagada no desactiva los triggers que 003 instala.

## Antes de continuar con 004

1. Respaldo y ventana sin escritores B/C/administrativos; no volver a aplicar 000–002.
2. Ejecutar `supabase/verificacion-devd/pre_003_estado_actual_solo_lectura.sql` con
   acceso de catálogo. Confirmar conteos, tipos, índices, unicidad de saldo,
   RLS/ACL, ausencia de objetos 003 preexistentes y de nuevos triggers/RPC financieros.
   Revisar cualquier diferencia antes de aplicar. Esta consulta quedó preparada
   y probada localmente; **no se ejecutó en Supabase**.
3. Si los metadatos coinciden y el módulo sigue vacío, 003 puede instalarse como
   infraestructura sin activar ventas. Verificar después con `03_tras_003.sql`.
4. Revisar/aplicar únicamente la **004 corregida** y sus hashes de
   `manifest-hu61-corregida.json`, después de 003 y sin habilitar aún pares comerciales.
5. Antes del primer cobro, decidir la unidad precio/puntos, el protocolo B de
   saldo/recargas/reservas/devoluciones y la relación C de negocio/evento. Crear
   catálogo y asignaciones reales por los flujos autorizados, sin inventar datos.
6. Probar en clon/piloto con JWT normales y fondos de prueba autorizados: permisos,
   saldo gastable, idempotencia, reservas, concurrencia, historial y comprobante.
   Solo entonces habilitar pares reales y QPASS_COMERCIO_REAL=true.

## Límite del acceso y validación local

No hay conexión SQL, credenciales PostgreSQL ni herramienta Supabase SQL configuradas.
La service role de la Data API permite leer tablas, no enviar SQL arbitrario.
Por eso las filas y columnas actuales se comprobaron en vivo por API, mientras
que cuerpos de funciones, triggers y RLS completos siguen dependiendo del catálogo
exportado y de la consulta SQL preparada. No se creó ningún RPC de inspección.

Se agregaron `auditar-003-solo-lectura.cjs`, su evidencia agregada, la consulta
pre003 y `validar-auditoria-003.cjs`. Pasaron **5 pruebas locales**: métodos GET/HEAD,
rechazo de rol/host/error, paginación incompleta, cálculo decimal exacto sin PII y
ejecución de la consulta READ ONLY sobre el catálogo reconstruido con 000–002.
ESLint de los scripts pasó. No cambió aplicación ni ninguna migración 000–004.

No se ejecutaron cambios remotos, commit o push. Se detiene el trabajo con este resultado.
