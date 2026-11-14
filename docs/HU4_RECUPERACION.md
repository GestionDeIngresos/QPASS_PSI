# HU 4 — Recuperación de contraseña

## Flujo implementado

- `/forgot-password` valida y recorta el correo. La confirmación es neutral para cuentas existentes e inexistentes. Los fallos de red/servicio y límites permiten reintentar.
- `resetPasswordForEmail` recibe `redirectTo: window.location.origin + '/reset-password'`.
- El `createBrowserClient` de `@supabase/ssr` instalado usa PKCE y detecta la URL automáticamente. No se añadió callback ni un segundo intercambio de código.
- `/reset-password` espera inicialización y `PASSWORD_RECOVERY`. Una sesión normal por sí sola no habilita el formulario. Los errores de URL o inicialización muestran enlace inválido, vencido o utilizado sin afirmar cuál fue la causa.
- La misma pestaña puede reanudar el formulario durante un máximo de 15 minutos, limitado además por la expiración de sesión observada. `sessionStorage` solo guarda usuario y vencimiento: es contexto de interfaz, no autorización ni prueba criptográfica. Supabase valida la sesión y la actualización; se consulta `getUser` también antes de guardar.
- La contraseña exige al menos ocho caracteres, contenido distinto de espacios y confirmación idéntica. La política remota puede exigir más; sus rechazos se muestran sin dar éxito.
- Tras actualizar se limpian los campos y el contexto, y se ejecuta `signOut({ scope: 'local' })`. Si falla, se puede reintentar el cierre sin repetir el cambio de contraseña. El enlace a login solo se ofrece tras cerrar correctamente y hace una navegación completa para leer las cookies actuales.
- El middleware existente deja públicas ambas rutas y mantiene el filtro de login para usuarios autenticados. No fue necesario modificarlo.

## Configuración requerida en Supabase (no aplicada desde esta tarea)

En Authentication / URL Configuration:

| Entorno | Site URL | Redirect URL permitida |
| --- | --- | --- |
| Desarrollo por defecto | `http://localhost:3000` | `http://localhost:3000/reset-password` |
| Producción | `https://<dominio-real>` | `https://<dominio-real>/reset-password` |
| Preview u otro puerto | Origen concreto del entorno | `<origen-concreto>/reset-password` |

Los valores con `<...>` son ejemplos para sustituir, no URLs utilizables. Autorizar cada origen usado; `127.0.0.1` y `localhost` son distintos. Mantener el mismo origen desde solicitud hasta apertura del enlace para conservar el verificador PKCE. No cambiar la plantilla a un flujo `token_hash` sin adaptar y probar la aplicación.

Revisar la plantilla **Reset Password** y su enlace de confirmación, SMTP/remitente, entrega y spam, límites de envío, caducidad del enlace y política de contraseña. Los 15 minutos de contexto local no configuran la caducidad del token en Supabase.

## Verificación local

Ejecutar desde la raíz:

```text
node scripts/validar-recuperacion.cjs
npx tsc --noEmit
npm run lint
npm run build
```

El script ejecuta los componentes reales transpilados con TypeScript usando hooks y Auth simulados, sin red ni dependencias nuevas. Comprueba formularios, respuestas neutrales, errores, recuperación, cierre, reintentos y concurrencia de envío. No sustituye React en navegador, el intercambio PKCE ni un recorrido real con correo.

## Pruebas manuales pendientes

1. Solicitar correo de una cuenta de prueba y uno no registrado; comparar respuesta neutral y comprobar entrega real.
2. Abrir un enlace nuevo en el mismo navegador y origen: esperar validación, cambiar contraseña y comprobar que solo después del cierre aparece login.
3. Iniciar sesión con la nueva contraseña; comprobar que la anterior falla. Confirmar que login no redirige prematuramente por cookies de recuperación.
4. Abrir enlace vencido, alterado y reutilizado, con y sin otra sesión abierta; no habilitar el formulario por una sesión normal. No registrar tokens ni enlaces completos en evidencias.
5. Probar ausencia de verificador PKCE en otro navegador/dispositivo; debe pedir otro enlace. Probar recarga en la misma pestaña y contexto vencido.
6. Simular red caída al solicitar, actualizar y cerrar sesión; no confundir contraseña ya guardada con cierre pendiente. Tras pérdida de respuesta al actualizar, el resultado remoto puede ser incierto: comprobar con la cuenta de prueba.
7. Verificar diseño móvil/escritorio, teclado, lector de pantalla y navegador con almacenamiento restringido. Sin almacenamiento, el flujo actual funciona, pero recargar requiere otro enlace.

**Estado:** implementación local verificable; aceptación integral pendiente del recorrido real en Supabase. No hay migraciones ni cambios de configuración remota.
