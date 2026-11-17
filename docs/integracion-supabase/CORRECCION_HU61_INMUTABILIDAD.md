# HU 61 — corrección de concurrencia en la migración 004

Rama verificada: **Aliaga**. Se leyó AGENTS.md y el informe de revisión final.
Cambios y pruebas exclusivamente locales; sin SQL remoto, commit o push.
Esta entrega sustituye el estado «requiere corrección por R1» de 004.
**003 continúa bloqueada para producción por coordinación financiera B/C.**

## 1. Reproducción y causa

Antes de modificar 004 se ejecutó el caso de la revisión anterior sobre una base
PostgreSQL **17.11** local, reconstruida desde el catálogo real y con datos ficticios.
Se reprodujo exactamente: cabecera confirmada **2.50**, suma de líneas **3.75**.

El trigger consultaba confirmada_en sin bloquear la cabecera. Mientras una conexión
confirmaba una venta pendiente previamente visible, service_role podía insertar
otra línea viendo la versión antigua pendiente. La confirmación tampoco comparaba
la suma ni validaba la respuesta persistida. BYPASSRLS no era la causa: faltaba
exclusión entre cambios de líneas y confirmación.

No se reprodujo un débito duplicado en cobrar_venta. El defecto afectaba escritores
privilegiados que separasen cabecera/líneas/confirmación entre transacciones.

## 2. Solución

Se corrigió `supabase/migrations/202611160004_devd_comercio_rpc.sql`:

1. **Cabecera como cerrojo común.** INSERT, UPDATE y DELETE de venta_items bloquean
   su venta mediante SELECT FOR UPDATE antes de consultar confirmada_en. UPDATE
   de cabecera ya obtiene su bloqueo antes del trigger de confirmación. Los locks
   se conservan hasta terminar la transacción. Si una línea cambia de venta, se
   bloquean ambos padres en orden ascendente; no puede tocar un padre confirmado.
2. **Validación al confirmar.** El nuevo helper privado
   `devd_validar_venta_confirmada(public.ventas)` exige líneas, suma exacta, precios
   finitos/no negativos, cantidades válidas, nombres históricos no vacíos, productos
   del negocio, ausencia de producto duplicado y DTO persistido exactamente coherente
   con cabecera y líneas. No sustituye precios históricos por el catálogo actual.
3. **Estado final de transacción.** El nuevo helper privado
   `devd_comprobar_venta_al_cierre()` y dos constraint triggers DEFERRABLE INITIALLY
   DEFERRED vuelven a comprobar cabecera, líneas y respuesta al COMMIT. Cubren
   sentencias compuestas y otros triggers que actúen después de la validación inicial.
   Un error en ese punto revierte también el débito y los otros cambios de la transacción.
4. **Inmutabilidad.** Una venta confirmada y sus líneas no permiten INSERT de líneas,
   UPDATE, DELETE ni movimientos hacia/desde otra venta. El ID de una cabecera
   pendiente tampoco puede cambiar. Una cabecera insertada ya confirmada debe
   cumplir todos los invariantes; no puede usar el INSERT para saltarse la validación.
5. **Snapshots.** Estos escritores admiten READ COMMITTED. Se rechazan REPEATABLE
   READ/SERIALIZABLE en los triggers para no decidir con snapshots anteriores al
   bloqueo. Los helpers de integridad son VOLATILE y obtienen lecturas frescas.
6. **Respuesta estable.** El DTO serializa fecha en UTC con precisión de microsegundos.
   Cambiar la zona de sesión entre confirmación y COMMIT no altera la comparación.
   La respuesta idempotente guardada y el contrato JSON de la app se conservan.
7. **Instalación segura.** Antes de instalar, 004 exige aplicador/propietario postgres,
   modo de triggers origin y service_role sin superusuario, capacidad de asumir
   postgres o permiso SET sobre session_replication_role. Revoca a service_role
   los privilegios TRUNCATE/TRIGGER de ventas y venta_items; no ejecuta un vaciado
   ni otorga permisos nuevos. Al final valida todas las confirmaciones que pudieran
   existir entre 003 y 004; si son inconsistentes revierte TODO el DDL de 004 sin
   repararlas/certificarlas automáticamente.

Referencias de PostgreSQL 17: [bloqueos](https://www.postgresql.org/docs/17/explicit-locking.html),
[snapshots de funciones](https://www.postgresql.org/docs/17/xfunc-volatility.html) y
[constraint triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html).

## 3. Resultados de las carreras

| Orden | Resultado corregido |
| --- | --- |
| Confirmación primero, INSERT después | La línea espera. Tras COMMIT de la confirmación se rechaza como VENTA_CONFIRMADA_INMUTABLE. Total y líneas permanecen **2.50 / 2.50**. |
| INSERT/UPDATE/DELETE de línea primero | La confirmación espera. Al liberarse la cabecera ve las líneas actuales y rechaza el total viejo o la venta sin líneas. Permanece pendiente. |
| Confirmación primero, UPDATE/DELETE después | La modificación espera y luego se rechaza. |
| Operación de línea hace rollback | La confirmación puede continuar con las líneas originales. |
| Dos movimientos opuestos entre ventas pendientes | Bloquean ambos padres por ID, se serializan y completan sin violar la inmutabilidad. |
| Trigger posterior modifica NEW.total | La comprobación diferida falla al COMMIT y revierte confirmación y débito. |

Se mantienen el bloqueo de saldo, reservado, precios recalculados, unicidad
cobrador/solicitud, selección canónica y respuesta persistida de cobrar_venta.
No se cambiaron las migraciones 000–003, las políticas RLS ni las 25 funciones
originales del catálogo, incluidas todas las funciones de Dev A.

## 4. Archivos modificados y agregados

| Archivo | Cambio |
| --- | --- |
| `supabase/migrations/202611160004_devd_comercio_rpc.sql` | Exclusión por cabecera, validadores inmediatos/diferidos, UTC y límites de service_role. |
| `supabase/verificacion-devd/04_tras_004.sql` | Verifica helpers nuevos sin EXECUTE de API, constraint triggers diferidos, privilegios de service_role y respuesta completa. |
| `supabase/devD_integracion_30_verificacion_real_solo_lectura.sql` | Detecta discrepancia entre el DTO completo y la respuesta persistida. |
| `scripts/validar-inmutabilidad-hu61.cjs` — nuevo | 19 escenarios PostgreSQL reales sobre concurrencia, integridad, rollback y permisos. |
| `scripts/revisar-final-migraciones-devd.cjs` | La reproducción anterior pasa a regresión: exige bloqueo/rechazo y suma 2.50; usa el manifiesto vigente. |
| `REVISION_FINAL_MIGRACIONES_DEVD.md`, `ENTREGA_REAL_DEVD_2026-11-16.md` | Actualización de estado y enlace a esta corrección; conservan evidencia histórica del fallo. |
| `manifest-hu61-corregida.json` — nuevo | Hashes del paquete vigente. Los manifiestos anteriores se conservan como evidencia de versiones anteriores, no para aplicar la nueva 004. |

No cambió código de aplicación, package.json, package-lock ni configuración .env.

## 5. Pruebas obligatorias

| Prueba | Resultado |
| --- | --- |
| Reproducción ANTES de la corrección | Defecto 2.50 / 3.75 reproducido en PostgreSQL 17.11. |
| `validar-integracion-real-devd.cjs --postgres` | **26 escenarios aprobados**, incluidas idempotencia, reserva, rollback completo, QR, HU9, HU14 y funciones A intactas. |
| `validar-concurrencia-devd.cjs` | **5 carreras aprobadas** con conexiones independientes: reintento, dos cobros, cobro/reserva en ambos órdenes y rollback. |
| `validar-inmutabilidad-hu61.cjs` | **19 escenarios aprobados**, incluido el caso original, ambos órdenes de bloqueo, modificaciones posteriores, movimientos, CTE, SET CONSTRAINTS, aislamiento y fallo al COMMIT. |
| `revisar-final-migraciones-devd.cjs` | **16 comprobaciones aprobadas**: etapas/consultas, permisos, funciones originales, reejecución con rollback y regresión R1 corregida. |
| `validar-comercio-app-devd.cjs` | **17 escenarios aprobados**: acciones/adaptadores, reintentos y bandera apagada. |
| TypeScript, lint y build | Aprobados. Lint conserva la advertencia previa de Button sin uso; build conserva el aviso previo de middleware obsoleto. |

Las suites PostgreSQL aceptan únicamente loopback, bases nuevas con prefijo
qpass_devd_test y sin tablas públicas previas. No eliminan bases/tablas para
reintentar. No se usaron credenciales Supabase. El servidor temporal se detuvo
al finalizar. No se afirma aceptación remota, prueba de carga o restauración real.

Para repetir las nuevas pruebas, usar bases locales NUEVAS distintas:

```powershell
$env:QPASS_PG_MODULE='C:/ruta/validacion/node_modules/pg'
$env:QPASS_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55439/qpass_devd_test_nueva_inmutabilidad'
node scripts/validar-inmutabilidad-hu61.cjs
$env:QPASS_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55439/qpass_devd_test_nueva_revision'
node scripts/revisar-final-migraciones-devd.cjs
```

## 6. service_role y administradores

- service_role conserva el DML comercial anterior: BYPASSRLS **no** evita estos
  triggers. Sus operaciones ordinarias sobre confirmadas se rechazan. No tiene
  EXECUTE de los validadores privados ni puede vaciar las dos tablas/reemplazar
  sus triggers con los permisos que deja 004.
- service_role sigue pudiendo cambiar precios o saldo mediante escrituras
  privilegiadas y crear ventas pendientes. El débito autorizado y atómico debe
  seguir pasando por cobrar_venta; esta corrección garantiza coherencia de ventas
  confirmadas, no demuestra que cualquier writer externo debite correctamente.
- postgres/propietario/superusuario puede alterar funciones, desactivar triggers,
  cambiar replicación o permisos. Ningún trigger de la aplicación puede impedir
  una intervención administrativa que quite deliberadamente esas barreras.
  Los DML normales del propietario sí pasan por las comprobaciones.
- READ COMMITTED es parte del contrato. Los writers B/C que usen otro aislamiento,
  cambien IDs o requieran modificar comprobantes después de confirmar deben
  coordinar otro contrato, sin desactivar estas protecciones para hacerlo funcionar.

## 7. Estado de aplicación

**El defecto original ya no se reproduce. 004 queda técnicamente corregida y lista
para revisión/aplicación inicial después de 003, no para habilitar producción por sí sola.**

Esta edición de 004 es correcta porque no se aplicó ninguna migración remota.
Si apareciera evidencia de una 004 anterior ya aplicada en otro entorno, no
reescribir historial ni repetir el archivo encima: preparar una migración sucesora.
Las versiones siguen siendo de una aplicación, no un script repetible por fragmentos.

003 sigue pendiente de:

1. Acuerdo B sobre saldo total, reservas en_revision/aprobada, liberación por rechazo
   y liquidación atómica de devoluciones pagadas; o exclusión explícita y controlada
   de ese flujo durante un piloto.
2. Acuerdo C/B sobre unidad precio/puntos, negocios-eventos, permisos y writers
   privilegiados que respeten el cerrojo común. No se declara aprobado el contrato.
3. Conciliación de devoluciones heredadas, reservas sin saldo o superiores al saldo.
   Sus guards siguen intactos y no se han consultado filas reales desde aquí.
4. Respaldo recuperable/ensayo en clon, catálogo sin deriva, permisos vía API/JWT
   normales y verificación posterior. Mantener QPASS_COMERCIO_REAL apagada y pares
   comerciales sin habilitar hasta resolver esas condiciones.

No se ejecutó ninguna migración remota ni se hizo commit o push.
