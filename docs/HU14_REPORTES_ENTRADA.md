# HU 14 — Reportes de entradas

## Alcance y contrato comprobado

La pantalla `/mis-compras` añade un panel independiente para seleccionar una entrada, describir un problema y consultar el estado de los reportes propios. Se reutilizan Textarea/Button y el estilo oscuro/neón. No se altera el listado/QR/PDF de entradas ni el flujo de compra.

El contrato local de Dev A (`supabase/sprint3_devA_reportes.sql`) utiliza `reportes_entrada.id`, `entrada_id`, `usuario_id`, `descripcion`, `estado` y `creado_en`; Admin reconoce `pendiente`/`solucionado`. No está disponible el DDL base completo, por lo que faltan verificar tipos, FK, default/identity de id, nullability, triggers y privilegios remotos. No se crea otra tabla ni se inventa el esquema base.

La migración nueva exige `reportes_entrada` existente y añade únicamente `solicitud_id uuid` y el índice único `(usuario_id, solicitud_id)`. Los reportes anteriores conservan sus datos y solicitud nula; no se rellenan ni deduplican. Si existe una columna incompatible o duplicados con claves no nulas, detener el ensayo y coordinar, sin borrar información.

## Autorización de entradas regaladas

**Criterio implementado:** comprador y destinatario activos pueden reportar una entrada de una compra confirmada. Para una compra propia ambas identidades coinciden. Se permite reportar entradas usadas, reportadas o anuladas, sin cambiar su estado. El usuario debe tener relación real de comprador o destinatario; ser admin no habilita crear reportes de entradas ajenas.

Cada persona ve solo los reportes que ella envió; ni comprador ni destinatario ven las descripciones del otro. Admin mantiene su vista global. La selección para el comprador utiliza únicamente ID, evento y tipo de entrada, sin QR ni identidad del destinatario. No se amplían permisos sobre `entradas` ni se modifica la migración HU 9.

Esta decisión permite al comprador gestionar problemas de sus regalos sin recibir QR. El líder debe ratificar la regla de negocio; si decide que solo el destinatario reporta, habrá que ajustar conjuntamente listado y autorización SQL, no solo ocultar un botón.

## RPC propias de D

- `reportar_entrada_propia(p_entrada integer, p_descripcion text, p_solicitud uuid) → integer`: sesión y cuenta activa desde auth.uid(), autorización por comprador/destinatario y compra confirmada, descripción normalizada de 5–2000 caracteres, estado fijado en pendiente. No acepta usuario_id/estado del cliente.
- `consultar_mis_reportes_entrada() → jsonb`: usuario activo, hasta 100 entradas autorizadas y 100 reportes propios más recientes; devuelve metadatos mínimos y estados, sin QR/correos/UUID del destinatario.
- Ambas son SECURITY DEFINER con search_path vacío; EXECUTE solo para authenticated, revocado a PUBLIC/anon.

Se habilita RLS y se revocan los accesos directos a `reportes_entrada` de PUBLIC/anon/authenticated, para impedir inserciones con identidad/estado falsificados y lecturas ajenas. No se eliminan ni reemplazan políticas existentes. Es un cambio de ACL de esta tabla que requiere comprobar propietarios: las RPC de A/D deben tener los permisos internos necesarios. No resolver problemas de permisos concediendo escritura pública otra vez. Verificar herencia de roles, otras RPC y posibles sobrecargas remotas.

## Idempotencia y QR

La UI bloquea envíos simultáneos y persiste un UUID antes del envío, por usuario y hash de entrada/descripción normalizada. No guarda la descripción en texto en sessionStorage. Misma selección tras recarga/respuesta perdida recupera la misma solicitud; SQL serializa por usuario/UUID y conserva unicidad. Una clave reutilizada con entrada/descripción diferente falla. Un reintento de un reporte ya solucionado devuelve su ID sin volverlo pendiente.

Tras éxito se conserva la clave. El botón “Nuevo reporte” inicia explícitamente otra solicitud y permite un problema nuevo, incluso con texto similar. Claves distintas pueden crear reportes distintos: no es una restricción de un solo reporte por entrada. Cerrar pestaña/borrar almacenamiento u otro dispositivo no conserva el UUID; revisar historial antes de repetir. Se requiere localhost/HTTPS para Web Crypto y almacenamiento habilitado.

La función no actualiza entradas, vínculos QR ni compras. Conserva internamente estado/código de la entrada y comprueba después de insertar que no cambiaron; si un trigger heredado los altera, lanza error para revertir la llamada. También verifica que el reporte insertado conserve usuario, entrada, descripción, estado pendiente y solicitud. Esto requiere pruebas PostgreSQL reales; no se afirma que los triggers remotos hayan sido inspeccionados.

Los reintentos y el historial recuperan reportes del autor aunque después deje de ser destinatario; no crean otra entrada ni revelan datos de otros autores. No hay actualización automática en tiempo real: usar “Actualizar estado de reportes” o recargar.

## Integración con Admin de A

No se modifican `listar_reportes_admin`, `resolver_reporte_admin`, `/admin/reportes` ni sus acciones. La inserción en la misma tabla permite que A liste el reporte de tipo entrada y lo resuelva como solucionado. D consulta ese mismo estado, sin duplicar su administración.

Dependencias: esquema base, usuarios.activo de Sprint 2, es_admin() y el módulo de reportes de A con sus dependencias de recargas/accesos. Comprobar que todo esté aplicado y sus propietarios puedan leer/modificar reportes tras el cambio de ACL. HU 14 no requiere aplicar la migración de HU 9, aunque esa historia mantiene su propia validación pendiente.

Si las RPC faltan o fallan, solo el panel de reportes muestra indisponibilidad; se conserva la consulta existente de compras. No se habilita un modo mock de envío ni se declara éxito sin respuesta SQL válida.

## Verificación automatizada

```text
node scripts/validar-reportes-entrada.cjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

El script comprueba validación, sesión/cuenta activa, parámetros falsificados ignorados, errores y confirmaciones, persistencia por cuenta/entrada/descripción, DTO sin QR/correo, degradación sin RPC y render de formulario/estados. La SQL se inspecciona estáticamente; no se ejecutan migraciones ni se prueba RLS, rollback, Admin o concurrencia reales. No se instalaron dependencias; faltan PGlite/PostgreSQL y esquema base completo para los scripts SQL previos.

## Pruebas manuales pendientes (Supabase aislado autorizado)

1. Obtener DDL real y registrar propietarios, políticas/ACL, defaults, restricciones, índices y triggers de reportes_entrada. Confirmar tipos enteros compatibles con A y solicitud UUID. Aplicar la migración de D solo con autorización; reaplicarla y comprobar conservación de reportes previos y ausencia de objetos duplicados.
2. Con comprador A y destinatario B, preparar entradas confirmadas propias y regaladas en eventos de prueba. Abrir Mis Compras como A, seleccionar entrada/evento y enviar una descripción válida. Debe aparecer confirmación e historial pendiente; el QR y estado de entrada deben permanecer exactamente iguales.
3. Como B, reportar su entrada regalada: crear un reporte propio independiente. A/B no deben ver los reportes del otro ni identidades privadas nuevas. Una cuenta ajena no debe listar ni reportar las entradas de A/B, incluso con ID conocido o invocación directa de RPC.
4. Sin sesión o con cuenta inactiva, rechazar creación/listado. Probar descripción vacía/espacios/saltos de línea, menor de 5 o mayor de 2000, entrada inexistente y compra no confirmada. Probar usuario_id/estado falsificados: no deben influir. No alterar cuentas del entorno compartido para preparar los casos.
5. Doble clic, pérdida de respuesta y recarga con los mismos datos: un reporte por clave. Misma UUID con descripción/entrada distintas: rechazar. Dos conexiones con la misma UUID: un solo registro. Verificar que una UUID de otro usuario no permite leer ni modificar su reporte.
6. Como admin de prueba, abrir `/admin/reportes?tipo=entrada`, buscar y ver el reporte pendiente. Resolverlo mediante el botón existente. Como autor, actualizar el panel: debe mostrar solucionado. Repetir la solicitud original y comprobar que no regresa a pendiente.
7. Como usuario ordinario/anon, intentar insertar o editar directamente estado/usuario en la tabla: denegar. Confirmar que los GRANT revocados no impidan las RPC internas de A/D. No usar únicamente SQL Editor o service role para comprobar aislamiento.
8. Revisar triggers: en una base descartable, un trigger de prueba que cambie estado/código durante la inserción debe causar rollback completo y no dejar reporte ni entrada alterada. No introducir ese dispositivo de prueba en el esquema compartido.
9. Probar móvil/escritorio, mensajes de error y almacenamiento bloqueado. Sin migración, Mis Compras debe seguir cargando y el panel señalar indisponibilidad. Con más de 100 elementos se indica el límite; paginación adicional queda pendiente si el backlog la exige.

**Estado:** implementación local preparada; integración, migración repetible ejecutada, permisos efectivos y recorrido comprador/admin pendientes. No se declara HU 14 terminada ni se avanza al módulo de Ayudante.
