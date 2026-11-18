# QPASS — Dev D — propuesta de integración con catálogo real

> Actualización: 004 incorpora la [corrección de inmutabilidad HU61](CORRECCION_HU61_INMUTABILIDAD.md).
> Usar los hashes de `manifest-hu61-corregida.json`. 003 continúa pendiente de
> coordinación B/C; esta actualización no habilita cobros ni aplica SQL remoto.

Rama comprobada: **Aliaga**. Preparación local del 16/11/2026, America/La_Paz.
**No se aplicó SQL remoto, no se hizo commit ni push.** Este documento sustituye
las conclusiones pendientes de catálogo de `INFORME_PREVIO.md`.

## Evidencia revisada

Fuente: `qpass_catalogo_supabase_2026-11-16.json`, aportado por el usuario.
SHA-256: `dbee7ad1fa7f95ea7741d7e61eca365f174caa1087adc781f58c9718574c4a07`.
Captura: 16/11/2026 19:33:11, Bolivia; PostgreSQL **17.11**, transacción READ ONLY.

Se procesaron todas las secciones: 48 relaciones (25 tablas y 23 secuencias),
25 funciones con cuerpos y ACL, 56 índices, 27 políticas, 4 triggers públicos,
143 dependencias, 602 permisos de tabla, 2.372 permisos de columna, 6 entradas
de privilegios predeterminados, 29 valores de enums y 0 vistas.
`auditoria-catalogo-devd.json` conserva el análisis por objeto y hashes de funciones.
`node scripts/auditar-catalogo-devd.cjs --guardar` lo reproduce sin red.

La comparación del cuerpo normalizado encuentra coincidencias locales para 20
funciones. No encuentra coincidencia textual para `eliminar_evento_sin_ventas`,
`estadisticas_evento`, `evento_tiene_entradas`, `handle_new_user` y
`proteger_campos_evento`; se conservan sus definiciones reales. Esto no equivale
a afirmar que las cinco tengan diferencias funcionales: no se reinstalan para
resolver diferencias de formato o versiones. Las RPC de compra, QR, accesos y
reportes de A utilizadas por D sí tienen cuerpo local coincidente.

Hallazgos que cambian la integración anterior:

- Las nueve tablas confirmadas existen. `ventas.ayudante_id` es integer y
  referencia a `ayudantes.id`; la sesión utiliza `ayudantes.usuario_id` UUID.
- Precios, líneas, saldos y montos son `numeric(10,2)`. `venta_items.precio_unitario`
  y `ventas.total` ya existen y se reutilizan.
- `saldos_puntos(usuario_id,evento_id)` es único y tiene CHECK de no negatividad.
- `negocios.estado` es boolean. No existe relación negocio-evento en las columnas,
  restricciones o funciones. No se deduce esa relación desde ventas antiguas.
- Comercio, saldo y devoluciones tienen RLS activado **sin políticas**. Sus amplios
  GRANT actuales no autorizan filas con roles normales; sí incluyen privilegios
  de tabla que conviene reducir. No existen RPC financieras ni triggers de débito.
- Los cuatro triggers públicos afectan a eventos, tickets y usuarios; ninguno
  modifica entradas, reportes de entradas ni puntos.
- `entradas_select_comprador_o_destinatario` permite actualmente que el comprador
  consulte el QR de un regalo. Es la única política sobre entradas del catálogo.
- `reportes_entrada` no tiene `solicitud_id`. Admin A consulta y resuelve por
  SECURITY DEFINER, propietario postgres; su contrato no depende de RLS de lectura.
- Default ACL concede permisos a anon, authenticated y service_role para objetos
  nuevos. Cada helper/RPC nuevo necesita REVOKE explícito; no basta revocar PUBLIC.
- No hay semántica implementada de reserva o liquidación de devoluciones. El
  catálogo describe esquema y código; no prueba que no existan datos o escritores
  administrativos externos. La migración comprueba las precondiciones sobre datos.

## 1. SQL para HU 9 y HU 14

| Migración | Resultado |
| --- | --- |
| `202611160000_devd_precondiciones.sql` | Valida tipos críticos, propietario/RLS, unicidad de saldo, RPC de A y ausencia de nuevos triggers financieros antes de modificar objetos. |
| `202611160001_devd_hu9.sql` | Crea la fachada de compra para terceros y el resumen propio sin QR. Ajusta la política existente a destinatario activo y agrega un límite RESTRICTIVE para impedir que otra política permisiva reabra QR de regalos. |
| `202611160002_devd_hu14.sql` | Agrega solicitud UUID e índice único por autor/solicitud. Crea reporte idempotente y lectura propia autorizada; comprueba que reportar no altere QR/estado. Conserva resolución y estados de Admin A. |

El comprador mantiene el resumen de la compra, entradas e importes persistidos.
El resumen no expone QR ni identidad del destinatario; tampoco presenta un precio
actual como histórico. El destinatario activo sí puede leer sus entradas/QR.

Comprador y destinatario pueden reportar una entrada de compra confirmada. Cada
uno consulta sus propios reportes, sin leer reportes del otro. Consultar un
reporte también verifica la relación actual con la entrada. Reintentar la misma
solicitud y descripción devuelve el mismo ID; cambiar la selección la rechaza.
Reportar no invalida la entrada ni consume ingreso. Admin A conserva sus funciones.

**Diferencia respecto a los SQL antiguos de D:** 001 conserva cuerpos, firmas y
EXECUTE actuales de `comprar_entradas` y `comprar_entradas_prueba`. La fachada D
agrega controles de cuenta/destino; esos controles adicionales no se imponen a
clientes que siguen invocando las funciones antiguas. Es una decisión explícita
de compatibilidad. Las antiguas no devuelven QR; la protección de lectura está en
RLS. Unificar después los puntos de compra requiere coordinación A/C.

Usar estas versiones revisadas. **No aplicar además** los viejos
`sprint3_devD_compra_terceros.sql`, `sprint3_devD_reportes_entrada.sql` ni
`devD_integracion_10_historicos_ventas.BORRADOR.sql`: contienen alternativas de
permisos/columnas y no forman parte de este orden.

## 2. SQL para HU 59–63 e implementación de aplicación

| Archivo | Resultado |
| --- | --- |
| `202611160003_devd_comercio_base.sql` | Amplía tablas existentes, agrega relación negocio-evento, índices, acumulado de reserva y barreras de escritura/lectura. No habilita negocios. |
| `202611160004_devd_comercio_rpc.sql` | Catálogo, consulta QR/saldo, cobro transaccional, resumen, detalle, historial paginado e inmutabilidad de ventas confirmadas. |
| `lib/ayudante/comercio-server.ts` | Adaptador real con sesión normal, DTO explícito y validación de actor/evento/negocio/históricos. |
| `app/ayudante/ventas/nueva/actions.ts` | Validación de entradas, autorización, llamada al cobro SQL y distinción rechazo/resultado incierto. |
| `components/ayudante/VentaIntegrada.tsx` | Selección, lectura QR por cámara o texto, saldo gastable, confirmación, reintento de la misma solicitud y comprobante. |

Las pantallas existentes de catálogo (HU 60), resumen (HU 59), detalle/comprobante
(HU 62) e historial (HU 63) usan RPC reales cuando `QPASS_COMERCIO_REAL=true`.
El flag es de servidor, está apagado por defecto y no se modificó `.env.local`.
No es una barrera de seguridad SQL: una RPC expuesta sigue exigiendo permisos,
asignaciones y negocio-evento habilitado aunque el flag esté apagado.

HU 61 ejecuta, dentro de una única llamada/transacción:

1. Validación de sesión, cuenta/rol ayudante, evento staff, negocio activo,
   ayudante comercial activo y habilitación explícita negocio-evento.
2. Bloqueo por UUID de solicitud y cobrador. Canoniza líneas por producto y
   guarda una huella SHA-256 del QR, nunca el QR bruto. Misma solicitud/selección
   devuelve exactamente la respuesta persistida antes de revalidar precios/QR.
3. Para una venta nueva, comprueba evento publicado y no finalizado si hay
   `fecha_fin`. Reutiliza `identificar_qr` de A y vuelve a validarlo bajo bloqueos.
   Una entrada usada al ingresar puede identificar para vender; anulada,
   reportada o compra no confirmada no pueden hacerlo. No consume la entrada.
4. Conserva orden relativo de A: compra → ticket → entrada → manilla. Bloquea
   autorizaciones durante el cobro, y productos por ID antes del saldo.
5. Recalcula precios desde productos bloqueados. Rechaza cantidades inválidas,
   productos duplicados/ajenos/no disponibles y precios inyectados. Compara el
   total recalculado con el total que el ayudante aceptó; cambio de precio exige
   revisar catálogo. Precio y punto se equiparan solo en esta propuesta v1.
6. Bloquea la fila única de saldo. Exige `saldo - reservado >= total`.
7. Inserta venta y líneas con nombres/precios históricos, debita saldo, guarda
   confirmación y respuesta. Cualquier error revierte todo. Después se impiden
   cambios a venta confirmada y sus líneas.

En la UI, un fallo de red mantiene UUID y selección bloqueados en la página para
reintentar. Un error PostgreSQL conocido acredita rechazo transaccional y permite
corregir. El intento está en memoria de esa página: ante cierre/recarga con
resultado incierto, revisar historial antes de iniciar otra operación. No se
guardan QR o saldo en almacenamiento del navegador.

## 3. Modificaciones concretas de tablas

| Tabla existente | Adición |
| --- | --- |
| `reportes_entrada` | `solicitud_id uuid NULL` e índice único `(usuario_id,solicitud_id)`. |
| `ventas` | `solicitud_id uuid`, `solicitud_payload jsonb`, `confirmada_en timestamptz`, `negocio_nombre_historico text`, `entrada_id integer` FK, `cobrador_id uuid` FK y `respuesta jsonb`; todos NULL para filas anteriores. |
| `venta_items` | `producto_nombre_historico text NULL`. Reutiliza cantidad y precio_unitario. |
| `saldos_puntos` | `reservado numeric(10,2) NOT NULL DEFAULT 0`, inicializado con solicitudes activas, CHECK de cobertura/no NaN y protección contra cambio de identidad/escritura accidental del acumulado. |
| `solicitudes_devolucion` | Sin columnas nuevas. Trigger INSERT/UPDATE mantiene reserva y bloquea la misma fila de saldo; impide mover titular/evento. No permite borrado. |
| `negocios`, `productos`, `ayudantes` | Sin columnas nuevas; lectura autorizada y reducción de privilegios directos. |

Única tabla nueva: **`negocios_eventos(negocio_id,evento_id,activo,contrato)`**, PK
compuesta, dos FK, RLS y activo=false por defecto. Resuelve una relación realmente
ausente y permite reutilizar un negocio en varios eventos. Requiere acuerdo con
C; no se duplican tablas de negocio, producto, ayudante, saldo, venta o líneas.

Índices comerciales: idempotencia `(cobrador_id,solicitud_id)`, historial confirmado,
líneas por venta, productos por negocio y solicitudes activas por usuario/evento.
No se duplica el índice único de saldos ya existente.

No hay backfill de ventas confirmadas, precios o nombres históricos. Las ventas
anteriores quedan sin certificar y fuera de las lecturas nuevas hasta conciliación.
La inicialización de `reservado` no modifica `saldo` ni debita puntos existentes.

## 4. RPC y permisos

Todas las nuevas RPC tienen `SECURITY DEFINER`, propietario esperado postgres,
`search_path=''`, revocación explícita de permisos predeterminados y sesión como
identidad. No reciben usuario/cliente/cobrador como autoridad del navegador.

| RPC pública | Uso |
| --- | --- |
| `comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text)` | HU 9, fachada sobre simulador A. Sigue siendo pago de prueba. |
| `consultar_compra_propia(text)` | Resumen del comprador sin QR. |
| `reportar_entrada_propia(integer,text,uuid)` | HU 14, creación idempotente. |
| `consultar_mis_reportes_entrada()` | Entradas reportables y reportes propios. |
| `consultar_catalogo_ayudante(integer)` | Negocios y productos autorizados. |
| `consultar_saldo_venta(integer,integer,text)` | Nombre, saldo, reservado y gastable tras validar QR/negocio. Es informativo; no reserva un cobro. |
| `cobrar_venta(integer,integer,text,jsonb,uuid,numeric)` | HU 61. Líneas `{producto_id,cantidad}`, máximo 50 productos y cantidad 1–999; UUID por operación. |
| `consultar_resumen_ventas(integer)` | Agregado de TODO el alcance autorizado, fechas de Bolivia; independiente de la página. |
| `consultar_detalle_venta(integer,integer)` | Solo venta confirmada del propio cobrador, evento y negocio actuales. |
| `consultar_historial_ventas(integer,date,date,integer,text,integer,integer)` | Fechas inclusivas locales, negocio/referencia, cursor de ID descendente y página 1–100; UI usa 25. |

Helper booleano de RLS `devd_negocio_autorizado(integer,integer)`: EXECUTE para
authenticated, devuelve solo autorización del solicitante. Los helpers DTO,
visibilidad de venta y triggers no tienen EXECUTE para los roles de API.
El id de ayudante comercial integer se conserva en SQL; el DTO `ayudanteId`
usa UUID del cobrador guardado en `cobrador_id`, conforme al modelo de la app.

Las lecturas comerciales son del **propio cobrador**, con asignaciones activas
actuales. Dueño o admin no reciben implícitamente ventas de otros ayudantes.
Una revocación de asignación también revoca historial/reintentos de ese negocio.
Si se necesita acceso histórico tras una baja, requiere otra regla acordada.

## 5. RLS y barreras de acceso

- Entradas: política existente pasa a destinatario activo y límite RESTRICTIVE.
  El comprador obtiene resumen exclusivamente por la RPC sin QR. Las RPC
  definer de A siguen funcionando sin depender de esa política.
- Reportes: revoca acceso de tabla a PUBLIC/anon/authenticated. Política de
  lectura propia preparada; **no se concede SELECT directo**, se usa DTO de RPC.
  Se conservan las políticas anteriores y las RPC administrativas de A.
- Catálogo: SELECT únicamente de negocios, productos, ayudantes propios y
  negocio-evento que satisfacen rol/cuenta/staff/negocio/asignación activa.
- Ventas, líneas, saldos y solicitudes: sin GRANT directo a authenticated/anon,
  sin políticas permisivas de escritura. Las lecturas de aplicación pasan por RPC
  con autorización explícita y proyección sin cliente/QR/payload interno.
- No se desactiva RLS. Los propietarios/roles con BYPASSRLS siguen siendo
  privilegiados; `service_role` ya tenía escritura en las tablas existentes y no
  se usa desde el flujo de cobro. B/C deben revisar sus escritores privilegiados.

La política restrictiva limita la combinación de políticas permisivas según la
[documentación de RLS de PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
El protocolo utiliza [bloqueos de fila y transacción](https://www.postgresql.org/docs/17/explicit-locking.html);
los triggers financieros son VOLATILE, conforme a la
[visibilidad de cambios de funciones PostgreSQL](https://www.postgresql.org/docs/17/xfunc-volatility.html).

## 6. Riesgos y compatibilidad pendientes de coordinación

**No hay contrato B/C aprobado.** La propuesta es ejecutable y probada localmente,
pero estas decisiones deben revisarse antes de habilitarla:

1. **Reservas v1:** saldo representa total no descontado; `en_revision` y
   `aprobada` reservan el monto completo; `rechazada` libera. La inicialización
   aborta si hay devoluciones existentes, reservas sin saldo o monto reservado
   superior al saldo. No se reparan datos automáticamente ni se suman saldos.
2. **Liquidación B:** aprobar no libera fondos. Este paquete NO implementa el
   pago de una devolución ni su liquidación, ni libera automáticamente reservas
   desde `devoluciones`. Tras un pago deben coordinarse estado/evidencia, liberación
   y débito en una única transacción mediante una futura ampliación revisada;
   no marcar una devolución pagada como rechazada para liberar fondos. Hasta
   entonces los puntos aprobados permanecen protegidos y pueden quedar reservados
   de más. No conectar escritores de devolución con este modelo sin ese acuerdo.
3. **Escritores B/C:** reservas cambian mediante solicitudes; saldo se debita con
   `saldo=saldo-monto` bajo el cerrojo común. No sobrescribir `reservado` ni guardar
   un saldo calculado fuera de la transacción. La profundidad de trigger detecta
   errores de escritura; la seguridad se basa en ACL/RLS y RPC, no en ese valor.
   Nuevas recargas/devoluciones deben respetar las mismas claves y orden de bloqueo.
4. **Unidad y descuentos:** v1 interpreta `productos.precio` directamente en
   puntos y no aplica conversión, impuestos ni descuentos. C/B deben confirmar
   esa unidad. Tipos de vista antiguos que decían precisión desconocida quedan
   supersedidos por numeric(10,2), sin afirmar que la equivalencia esté aprobada.
5. **Relación comercial:** C debe revisar `negocios_eventos` y dar de alta solo
   pares reales. No se habilitan automáticamente negocios por dueño o venta previa.
6. **Datos y consumidores antiguos:** columnas aditivas pueden afectar consumidores
   de tipos compuestos/SELECT *. Revisar volumen y tiempos de índices/bloqueos en
   un clon; lock_timeout=3s y statement_timeout=30s pueden abortar en bases grandes.
   Las migraciones son versionadas de una aplicación; no reinstalarlas completas
   sobre sí mismas. 000 detecta el esquema previo, no es una comprobación posterior.
7. **A:** sus funciones, firmas y ACL permanecen; entrada usada sigue identificando
   para venta. Reportes siguen pendiente/solucionado. No reejecutar SQL antiguo de
   A/C que pueda restaurar permisos/políticas. `es_admin()` real no comprueba activo;
   se conserva su conducta existente y ese endurecimiento queda para A.
8. **HU 4 y HU 13:** no necesitan tablas nuevas. Se verificaron recuperación
   aislada y generación/decodificación QR del PDF. SMTP, redirects de Auth,
   sesión real, cámara e impresión requieren aceptación en entorno autorizado.
9. **Clientes y corte:** mantener el flag apagado no impide llamadas RPC directas.
   Para un corte efectivo desactivar `negocios_eventos.activo`. Un cobro ya en
   curso termina antes de que se confirme la desactivación gracias a los bloqueos.

## 7. Orden de aplicación propuesto

No se ejecutó ninguno de estos pasos en Supabase. Revisar primero archivos y
hashes de `manifest-devd.json`; no usar `supabase db push` a ciegas.

1. Confirmar proyecto destino y revisión de A/B/C de las decisiones anteriores.
   El JSON no incluye project_ref: verificarlo en el SQL Editor/entorno de destino.
2. Obtener respaldo consistente de esquema/datos/ACL con herramientas autorizadas.
   Confirmar si hay backup/PITR disponible y probar restauración en un clon.
   Conservar el catálogo original y sacar uno nuevo con 00; comparar deriva.
3. Ensayar 000 → 001 → 002 → 003 → 004 en el clon, con datos sintéticos y controles
   de migración. No ejecutar seeds de estos tests en el proyecto compartido.
4. Obtener revisión del usuario de estos scripts exactos. Aplicar, como postgres,
   cada archivo en ese orden. Cada uno usa BEGIN/COMMIT; ante error verificar
   ROLLBACK de esa sesión. No saltarse precondiciones ni eliminar guards.
5. Ejecutar `devD_integracion_30_verificacion_real_solo_lectura.sql` y capturar
   nuevamente 00. Comparar cuerpos/ACL de A y comprobar las políticas/índices nuevos.
6. Tras acordar unidad/reservas/asignaciones, registrar pares negocio-evento reales
   mediante una operación administrativa revisada. El paquete no contiene DML
   que habilite pares automáticamente. Validar cuentas propias/ajenas en el clon.
7. Habilitar `QPASS_COMERCIO_REAL=true` en el entorno de aplicación revisado y
   desplegar sus cambios. Probar compra para terceros, reportes, venta, reintento,
   historial y comprobante. Empezar con un negocio/evento de prueba autorizado.
8. Solo después ampliar el alcance y conectar escritores de B/C que respeten el
   protocolo. Ninguna pantalla pendiente bloqueó la implementación local de D.

## 8. Verificación, pruebas ejecutadas y recuperación

Validaciones ejecutadas localmente con datos ficticios y sin credenciales remotas:

| Prueba | Resultado |
| --- | --- |
| Reconstrucción del catálogo + migraciones 000–004 y verificación 30 | 26 escenarios SQL en PGlite y 26 en PostgreSQL 17.11 local. |
| Concurrencia PostgreSQL 17.11 con conexiones independientes | 5 escenarios: misma solicitud, dos cobros distintos, cobro vs reserva en ambos órdenes y rollback. |
| `validar-comercio-app-devd.cjs` | 17 escenarios de acciones, adaptadores, autorización y UI ante resultado incierto. |
| `validar-guardas-comercio-devd.cjs` | 5 escenarios: backfill sin débito, exceso de reservas, saldo ausente, devolución heredada y deriva de tipo; verifica rollback de DDL. |
| `validar-compra-terceros.cjs` / `validar-reportes-entrada.cjs` | 33 / 31 escenarios aislados existentes. |
| `validar-carrito-ayudante.cjs` / `validar-lecturas-ventas.cjs` / `validar-base-ayudante.cjs` | 31 / 30 / 22 escenarios aislados existentes, incluidos flag apagado y denegación por rol. |
| `validar-recuperacion.cjs` / `validar-ticket-pdf.cjs` | 18 escenarios de Auth simulado y 5 casos PDF/QR real generado y decodificado. |
| `validar-preparacion-integracion.cjs` | 6 escenarios de inventario/borrador anterior. |
| `npx tsc --noEmit`, `npm run build`, `npm run lint`, `git diff --check` | Correctos. Lint conserva una advertencia previa por Button sin uso; build avisa de deprecación previa de middleware. |

La base de prueba se reconstruye desde TODO el catálogo, incluidas funciones
reales de A, RLS, ACL, índices y triggers; luego se agregan filas ficticias.
Auth y storage tienen fixtures locales mínimos, no servicios Supabase reales.
Las pruebas no equivalen a aceptación de PostgREST, sesión, cámara, correo o carga
con datos reales. Los scripts antiguos de QR/pagos SQL dependen de un dump
`ARCHIVOS CONTEXTO IA/qpass-bd 1.sql` ausente; la suite nueva cubre esos recorridos
pertinentes utilizando el catálogo aportado, sin fabricar aquel archivo faltante.

Reproducción sin cambiar dependencias de la app:

```powershell
# Módulos de validación instalados fuera del repositorio.
$env:QPASS_PGLITE_MODULE='C:/ruta/validacion/node_modules/@electric-sql/pglite'
node scripts/validar-integracion-real-devd.cjs
node scripts/validar-guardas-comercio-devd.cjs
node scripts/validar-comercio-app-devd.cjs

# Dos bases nuevas/vacías distintas en PostgreSQL LOCAL desechable.
$env:QPASS_PG_MODULE='C:/ruta/validacion/node_modules/pg'
$env:QPASS_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55439/qpass_devd_test_full'
node scripts/validar-integracion-real-devd.cjs --postgres
$env:QPASS_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55439/qpass_devd_test_race'
node scripts/validar-concurrencia-devd.cjs
```

Los runners PostgreSQL rechazan hosts remotos, nombres de base ajenos al prefijo
de prueba y tablas públicas previas. No borran tablas ni bases para reintentar.
Se utilizó PostgreSQL **17.11**, igual a la versión de catálogo; servidor de prueba
detenido al finalizar. No se añadieron dependencias a package.json/package-lock.

Comprobaciones posteriores: todos los contadores de inconsistencia de 30 deben
ser cero; revisar además ausencia de escrituras/EXECUTE indebidos para anon y
authenticated, helper privado denegado, comprador sin QR, destinatario con QR,
reporte propio/ajeno, resolución A, negocio/evento ajeno, productos cambiados,
saldo reservado, cobros simultáneos, respuesta perdida, precios históricos,
paginación y métricas independientes de página. Las filas heredadas sin evidencia
pueden existir, pero deben seguir fuera de las ventas confirmadas nuevas.

Recuperación propuesta, sin eliminar datos ni reabrir permisos inseguros:

1. Mantener/desactivar el flag y desactivar administrativamente los pares
   negocio-evento afectados. Esperar las transacciones ya iniciadas y revisar
   solicitudes/resultados persistidos antes de reintentar cobros.
2. Una migración fallida revierte su transacción; las versiones anteriores que
   ya hicieron COMMIT permanecen. Corregir hacia delante con otra versión después
   de comparar catálogo. No quitar columnas/triggers con datos ni reinstalar el
   SQL antiguo para recuperar la funcionalidad.
3. Conservar ventas y líneas confirmadas, QR y reportes. No reescribir históricos
   ni ajustar saldo/reservado manualmente. Para corregir dinero, conciliación
   aprobada y operación compensatoria trazable en una migración/RPC posterior.
4. Si hay un fallo mayor, ensayar restauración del backup/PITR en un entorno
   separado y reconciliar las operaciones posteriores al respaldo antes de
   cambiar de entorno. No restaurar encima de nuevas ventas sin esa conciliación.

Las nueve HU no se declaran aceptadas en Supabase: quedan preparados código y
SQL de D, pruebas locales y decisiones de integración explícitas para revisión.
