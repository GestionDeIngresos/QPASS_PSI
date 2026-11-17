# HU 9 — Compra para terceros

## Alcance y contratos

Se conserva el formulario de compra, `CompraInput`, `solicitudId`, `resultadoPrueba` y los resultados aprobado/rechazado/vencido. Un solo destinatario registrado y activo recibe todas las entradas de una solicitud. El comprador conserva la operación y comprobante; no se envía correo de entrega: el destinatario consulta su cuenta.

La nueva migración `supabase/sprint3_devD_compra_terceros.sql` NO se ejecutó en Supabase. Debe revisarse y aplicarse coordinadamente con el despliegue del código; sin ella las nuevas RPC no existen y las restricciones nuevas tampoco estarán vigentes.

Orden requerido: esquema base, compras_politicas_y_funcion.sql, Sprint 2 de usuarios (`usuarios.activo`), sprint3_devA_pagos_prueba.sql y finalmente la migración de D. No repetir después los scripts antiguos que restauran permisos o políticas más amplias sin revisar esta integración.

## Por qué una fachada SQL nueva

No se reemplazan las funciones de A ni C. `comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text)` valida sesión, comprador activo, selección, destinatario activo, evento publicado/futuro y tipos del evento, y delega al simulador de A. Este sigue delegando la compra aprobada a C para calcular precios/cargos, cupo y límite por comprador. No se crea una segunda operación de compra.

Se conservan bloqueo transaccional y registro de intentos existentes. El reintento idéntico recupera la respuesta antes de volver a validar fecha/cupo/destino, incluso si el evento terminó o ya no queda cupo; el comprador sí debe seguir activo. Una selección diferente con la misma clave falla. La respuesta pública conserva `destinatario: string | null`, con etiqueta genérica en lugar del nombre personal. No se lista ni consulta públicamente usuarios.

Se revoca ejecución directa de `comprar_entradas` y `comprar_entradas_prueba` a anon/authenticated/public; permanecen como operaciones internas. Es un cambio de punto de entrada público intencional: todos los callers deben usar la fachada. Revisar propietarios/permisos de las funciones al aplicar; la fachada debe poder ejecutar las funciones internas. Los scripts anteriores que invocaban directamente el simulador como authenticated requieren adaptación a este nuevo límite de permisos.

Las funciones existentes mantienen los precios/cargos calculados en SQL, cupo atómico y límite por **comprador**, tal como el contrato de C. No se cambia a límite por destinatario. Rechazado/vencido no crean compra ni entrada ni descuentan cupo. El estado y la respuesta se conservan en `intentos_compra_prueba`.

## Autorización y presentación

- Mis Compras separa entradas recibidas de compras pagadas; ambas consultas verifican sesión activa y el usuario solicitado en servidor.
- La política conocida de lectura de entradas pasa a permitir solo al destinatario activo. No se agrega una política permisiva adicional. Esto reduce el permiso anterior del comprador para leer QR de regalos.
- `consultar_compra_propia(text)` es una RPC SECURITY DEFINER con search_path vacío, comprobación explícita de comprador y cuenta activa. Devuelve detalle de operación sin códigos QR ni datos de identidad del destinatario, aunque las entradas no sean del comprador.
- La confirmación muestra textos distintos para sí mismo/terceros. Reutiliza el comprobante existente. El tipo de resumen de compra ya no contiene `codigo_qr`; el tipo de entrada descargable de HU 13 se conserva.
- La identificación/control QR de A no cambia: sus RPC SECURITY DEFINER mantienen sus comprobaciones propias. Hay que validar su integración real después de aplicar la política.
- Auditar todas las políticas remotas: otras políticas permisivas SELECT/ALL sobre entradas podrían ampliar acceso. No se eliminan políticas ajenas a ciegas.

## Persistencia de idempotencia

Antes de llamar al servidor, se almacena solicitudId en sessionStorage, por comprador/evento/hash SHA-256 de la selección normalizada y ordenada. No se guarda correo ni selección en texto. Tras perder respuesta o recargar, reintroducir la misma selección reutiliza la clave. Cambiar selección genera otra; volver a una selección incierta conserva su clave previa.

La clave se elimina solo al recibir éxito inequívoco. Una nueva compra intencional posterior puede usar otra clave. El servidor decide comprador por auth.uid(), no por el ID usado para separar almacenamiento. Si el almacenamiento está bloqueado se impide enviar, evitando cobros de prueba sin una clave persistida. Cerrar la pestaña/borrar almacenamiento u otro dispositivo no conserva esta garantía: comprobar Mis Compras antes de repetir. No hay garantía de deduplicar solicitudes distintas por intención humana.

## Verificación local

```text
node scripts/validar-compra-terceros.cjs
node scripts/validar-recuperacion.cjs
node scripts/validar-ticket-pdf.cjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Las pruebas de HU 9 ejecutan la acción/consultas/persistencia con respuestas simuladas, incluyendo terceros, cuentas inactivas, parámetros inválidos, errores de cupo/límite y pagos, aislamiento de consultas y reintentos tras recarga. La inspección de SQL es ESTÁTICA: no demuestra ejecución, atomicidad, RLS ni concurrencia. En este entorno no hay PGlite/PostgreSQL disponible y falta el esquema base que requieren los scripts SQL anteriores. No se instalaron dependencias.

## Pruebas funcionales pendientes (entorno de prueba autorizado)

1. Preparar cuentas de prueba activas A/B/C y un evento futuro publicado con tipos/cupo conocidos. Confirmar modo mock desactivado. Aplicar la migración solo tras autorización y revisión del líder.
2. A compra para B. Resultado aprobado: A conserva comprobante y totales; B recibe entradas. A ve la compra pagada pero no el QR en interfaz ni en respuestas de consulta de entradas. La confirmación indica entrega a la cuenta del destinatario.
3. B abre Mis Compras y descarga su entrada. C no ve entrada ni comprobante de A. B tampoco obtiene el comprobante de A por conocer su ID. Repetir por consultas directas autenticadas en herramientas de prueba sin compartir tokens.
4. Probar correo inválido, inexistente, propio y cuenta inactiva. No deben generarse entradas; inexistente/inactiva comparten mensaje genérico. Probar también comprador inactivo con sesión previa y mediante RPC.
5. Probar evento no publicado/finalizado, tipo ajeno, cantidad inválida/duplicada, cupo insuficiente y límite alcanzado. Verificar rechazo y ausencia de efectos parciales.
6. Aprobar: verificar precios/cargos/totales desde BD. Rechazar/vencer con solicitudes nuevas: comprobar cero compras/entradas nuevas y cupo intacto, con intento persistido.
7. En pruebas controladas conservar solicitudId: repetir idéntico debe devolver la operación anterior, sin duplicar entradas/descuento; cambiar destino, líneas o resultado con esa misma clave debe fallar. Probar además respuesta perdida + recarga + misma selección.
8. Ejecutar dos conexiones PostgreSQL simultáneas con la misma solicitud y con el último cupo; debe existir una única operación por clave y ningún cupo negativo. Probar desactivación concurrente de comprador/destino.
9. Como authenticated y anon, comprobar que las dos funciones antiguas no pueden invocarse directamente. Como usuario válido, la fachada sí debe funcionar.
10. Reaplicar la migración en base aislada y comprobar que no duplica políticas/objetos ni modifica datos. Recorrer QR físicos/control de acceso de A y PDFs de HU 13 como regresión.

No se ha validado el flujo remoto ni se declara cerrada la historia. Falta verificar esquema/propietarios/privilegios y todas las políticas remotas. La corrección siguiente retira los precios actuales del comprobante; no modifica el generador de entradas/QR de HU 13.

## Corrección de consistencia del destinatario

La fachada de D mantiene la firma de A/C y no supone unicidad de `lower(correo)`:

1. Para compras nuevas, recorre y bloquea con FOR SHARE todas las cuentas que coincidan con la misma expresión `lower(correo)` usada por C. Exige exactamente una coincidencia activa; una duplicada inactiva también impide comprar. No elige arbitrariamente una cuenta.
2. Para compra propia, fija como destino esperado `auth.uid()`.
3. Delega al simulador existente. Si el pago fue aprobado, antes de retornar comprueba que la compra sea del comprador y esté confirmada, que el número de entradas coincida con las cantidades solicitadas y que TODAS tengan el UUID esperado.
4. Una asignación diferente provoca `DESTINATARIO_NO_COINCIDE`. La excepción no se captura dentro de la fachada: debe revertir toda esa llamada SQL, incluidos compra, entradas, cupo y el intento insertado por A. `COMPRA_INCONSISTENTE` rechaza una respuesta que no corresponda a una compra confirmada del comprador.

FOR SHARE no impide insertar nuevas cuentas duplicadas. La comprobación final es la defensa ante esa carrera: si C resuelve otra cuenta, no se confirma la operación. No se bloquea toda usuarios, no se añade una restricción global ni se reemplaza C.

Los intentos ya persistidos conservan la recuperación idempotente anterior; no crean entradas nuevas. Esta corrección NO certifica ni reasigna destinatarios de compras antiguas, porque no existe un UUID esperado histórico en el contrato original del intento. La conciliación de posibles datos previos requiere evidencia y coordinación; no se modifica su información.

### Pruebas SQL adicionales en entorno descartable

- Compra válida con correo único; compra para sí mismo; comprador/destino inactivo.
- Dos usuarios con correos equivalentes por mayúsculas: rechazar sin efectos, tanto si ambos están activos como si uno está inactivo. Solo preparar el caso si el esquema aislado permite esos duplicados; nunca quitar una restricción real para fabricar el caso.
- En una prueba controlada de rollback, forzar que una entrada se inserte para un UUID distinto mediante un trigger EXCLUSIVO de la base descartable de pruebas (sin editar A/C ni el esquema compartido). Debe fallar toda la llamada; comparar compras, entradas, cupo e intentos antes/después. Retirar ese dispositivo de prueba antes de la regresión normal.
- Con conexiones independientes, provocar un duplicado que aparezca entre búsqueda y compra y verificar que ninguna operación confirmada termine en otro UUID. Puede rechazarse o confirmar solo al UUID validado.
- Repetir una solicitud exitosa cuando ya no quede cupo y después de cambiar el correo del destinatario: recuperar la misma compra, sin reasignar entradas ni generar otra.

Las comprobaciones locales de la SQL son estáticas. No equivalen a ejecutar estos casos ni a probar rollback/concurrencia en PostgreSQL.

## Comprobante: importes persistidos y propuesta histórica

La RPC conserva subtotal, cargos y total de `compras`, junto a su estado de pago. Deja de leer `tipos_ticket.precio` como si fuera histórico y devuelve null en ese campo. La consulta TypeScript también neutraliza el precio de respuestas antiguas y construye un DTO explícito, sin trasladar QR ni identidades agregadas accidentalmente a la respuesta.

Confirmación y PDF de comprobante señalan que el precio unitario histórico no está disponible; no reparten el subtotal entre entradas ni muestran el catálogo actual como evidencia. El cambio en `lib/compras/pdf.ts` se limita a `generarComprobantePdf`; `generarTicketPdf` y su contrato de HU 13 permanecen intactos.

**Propuesta pendiente de A/C/líder:** acordar un snapshot inmutable por entrada o línea, asociado a compra/entrada y con precio unitario, moneda, cantidad y origen de evidencia. Para compras futuras, capturarlo en la misma transacción que la compra usando los precios efectivamente usados por C, con permisos de escritura solo internos y unicidad por entrada/línea. No puede registrarse después en una operación independiente. Validar suma de líneas contra subtotal persistido. Para compras antiguas, aceptar únicamente evidencia histórica verificable; si no existe, mantener “no disponible”. No se crea ni se rellena esa estructura sin acordar el contrato.

## Permisos y preparación del ensayo aislado

No se cambian los GRANT/REVOKE de la versión anterior: authenticated ejecuta las dos funciones de D; PUBLIC/anon no. Las operaciones antiguas permanecen sin ejecución pública directa. Tampoco se cambió nuevamente la política de entradas ni se desactivó RLS.

Antes del ensayo, obtener el esquema base completo y comprobar `pg_proc` (firmas, propietario, SECURITY DEFINER y search_path), `pg_roles`, permisos efectivos de ejecución entre D → A → C, privilegios sobre tablas/secuencias y si hay FORCE RLS. No basta con que la RPC nueva tenga GRANT para authenticated: su propietario debe poder ejecutar A, y el propietario de A debe poder ejecutar C.

Revisar todas las políticas de entradas/compras/usuarios, incluidas SELECT/ALL permisivas, privilegios heredados y sobrecargas de las funciones antiguas. No asumir que los REVOKE de estas firmas eliminan permisos sobre otras firmas. Conservar el estado anterior de ACL/políticas para poder comparar en el ensayo. No restaurar permisos públicos para hacer pasar pruebas antiguas.

Aplicar solo en instancia descartable autorizada, con propietarios compatibles y tras todas las dependencias; comprobar que aplicar dos veces no cambia datos. Probar como authenticated real, como anon y mediante el frontend; no validar aislamiento solo con el propietario o service role. Ejecutar luego regresión de A con fixtures compatibles con la nueva entrada pública: los scripts originales de A se conservan sin editar y no prueban D por sí solos.
