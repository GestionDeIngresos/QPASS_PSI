# QPass · Dev B · Diagnóstico del error en Mis saldos

Fecha: 17/11/2026. Rama Bullain; sin cambios de código de aplicación ni despliegues remotos durante este diagnóstico.

## Causa comprobada

La página `app/mi-cuenta/saldos/page.tsx` llama a `leerMisSaldos()` de `lib/saldos/server.ts`. Esa función valida una cuenta activa y ejecuta:

```ts
supabase.rpc('consultar_mis_saldos')
```

La firma coincide con `public.consultar_mis_saldos()` sin parámetros, definida en `supabase/migrations/202611170001_devb_saldos.sql`. No se encontró un nombre equivocado ni parámetros incompatibles en el código local.

La API remota configurada devolvió **HTTP 404 / PGRST202**: no encuentra esa función sin parámetros en la caché de esquema. La comprobación fue GET de solo lectura, sin sesión de cliente, sin recuperar saldos ni filas personales. No se ejecutaron POST, DDL, cambios de permisos ni recargas/devoluciones remotas.

El log `.next/dev/logs/next-development.log` contiene una aparición del error seguro lanzado por `leerMisSaldos`: «No se pudieron consultar tus saldos. Comprueba la migración de Dev B.». El código actual no registra los detalles de Supabase en ese mensaje; la comprobación remota adicional permitió identificar PGRST202 sin exponer cookies, claves, correos o saldos.

Ese error se propaga al error boundary de la ruta, que reutiliza `components/saldos/ErrorCaja.tsx`; por eso aparece «No se pudo cargar el módulo». El error no significa que el cliente necesite rol admin ni que debamos crearle un saldo ficticio.

## Evidencia adicional del esquema remoto

Consultas GET con limit=0, usando acceso de servidor internamente y sin devolver filas personales:

| Comprobación | Resultado |
|---|---|
| saldos_puntos.saldo y reservado | HTTP 200: existen |
| recargas.puntos | HTTP 400 / 42703: columna ausente |
| solicitudes_devolucion.liquidada_en | HTTP 400 / 42703: columna ausente |
| devb_conversion | HTTP 404 / PGRST205: tabla no disponible en la API |

La base expuesta no coincide con la migración B completa. La explicación más probable es el despliegue B pendiente/incompleto. PGRST202 también puede aparecer por una caché desactualizada o una firma diferente: sin acceso SQL directo no se afirma haber consultado pg_proc ni el historial remoto de migraciones. El nuevo SQL de diagnóstico permite distinguir esos casos antes de cambiar nada.

Referencias primarias: [errores de PostgREST](https://docs.postgrest.org/en/stable/references/errors.html), [GET/HEAD en transacciones de solo lectura](https://docs.postgrest.org/en/stable/references/transactions.html).

## Lo que necesita HU16

1. Tablas existentes usuarios/eventos/saldos_puntos y sus columnas usadas por la consulta, incluida reservado.
2. Función exacta `public.consultar_mis_saldos()` que devuelva jsonb.
3. Cuenta de sesión existente y perfil activo; el perfil cliente es válido.
4. EXECUTE para authenticated; sin permiso público/anónimo de ejecución.
5. Función SECURITY DEFINER con search_path vacío y filtro `s.usuario_id = auth.uid()`; así no necesita conceder SELECT general sobre saldos al navegador.
6. API de Supabase con la firma actualizada en su caché.

No requiere configurar la tasa 1:1 ni efectuar una recarga. Si el usuario no tiene filas de saldo, la RPC debe devolver `[]` y la página mostrar «No tienes saldos registrados.». Eso es un resultado válido.

No se obtuvo un error 42501/SIN_PERMISOS; el bloqueo identificado está antes de resolver la función. La lectura administrativa de columnas no certifica las políticas del cliente: sus grants/RLS deben revisarse en catálogo y mediante la sesión real después del despliegue. No se cambian RLS ni claves para eludir el error.

## Instrucciones y SQL preparado, sin ejecutar en Supabase

### 1. Confirmar el entorno

El proyecto configurado coincide con el inventario compartido anterior; no está acreditado como Supabase aislado de aceptación. El responsable debe identificar el entorno de pruebas antes de aplicar cambios de esquema. No se modificó .env.local.

### 2. Ejecutar únicamente el diagnóstico de catálogos

Un responsable puede revisar `supabase/diagnostico_devb_hu16_solo_lectura.sql` en SQL Editor. Usa BEGIN READ ONLY y ROLLBACK; no lee filas de negocio, no invoca la RPC, no cambia RLS y funciona aunque falten objetos B.

Interpretación de la fila de RPC:

- rpc_existe=false: la función no está creada bajo la firma esperada. Revisar el despliegue B.
- rpc_existe=true y authenticated_puede_ejecutar=false: revisar el grant de la migración.
- rpc_existe=true, permisos correctos y API aún PGRST202: revisar esquema expuesto y caché de PostgREST antes de recrear objetos.
- Configuración esperada: devuelve_jsonb=true, security_definer=true, search_path_vacio=true, authenticated_puede_ejecutar=true y anon_puede_ejecutar=false.

La consulta también informa RLS y los tres prerrequisitos que verifica B. No sustituye revisar todo el catálogo ni acredita por sí sola la semántica del cuerpo de una función existente.

### 3. Revisar el SQL de solución existente

El SQL de creación de la RPC, su validación de cuenta activa, filtro de propietario y grants ya está incluido en `supabase/migrations/202611170001_devb_saldos.sql`. **No hace falta otro sistema de saldos ni una corrección del componente React.**

La secuencia de despliegue completa sigue siendo: A QR/reportes y base de usuarios activa; D 000–004; C devoluciones; B 202611170001. Revisar lo ya instalado y aplicar únicamente lo pendiente en el entorno acordado. No volver a ejecutar D 003 si reservado y sus objetos ya existen; no reinstalar SQL base ni seeds.

No se preparó un parche que cree solo la función fuera de esa secuencia: la migración B original usa CREATE FUNCTION y una creación suelta podría hacer fallar su aplicación completa posterior. Si el equipo necesita separar HU16 del resto de B, debe preparar una migración incremental coordinada y validarla antes; no copiar fragmentos aislados al proyecto compartido.

Si el catálogo demuestra que la función ya existe correctamente y solo falta refrescar la caché, el responsable puede valorar esta operación administrativa separada, **no ejecutada aquí**:

```sql
NOTIFY pgrst, 'reload schema';
```

Refrescar la caché no crea una función ni columnas ausentes.

### 4. Verificar después del despliegue autorizado

Primero repetir el diagnóstico de catálogos. Una vez aplicada la migración B completa, revisar `supabase/verificacion_devb_saldos.sql`. Este último exige objetos B y no sirve como verificación previa sobre el esquema actual.

Después, desde la cuenta cliente activa, usar Reintentar o recargar `/mi-cuenta/saldos`. Debe aparecer el saldo propio o el estado vacío normal. Probar también otra cuenta para verificar que no obtiene saldos ajenos. No hace falta registrar movimientos monetarios para comprobar HU16.

## Riesgos de aplicar la solución

La función de consulta no actualiza saldos, pero es SECURITY DEFINER: conservar auth.uid(), la validación de activo y los grants limitados es esencial para no exponer saldos ajenos.

La migración B completa tiene alcance mayor que HU16: agrega tablas/columnas, índices, triggers de inmutabilidad, permisos y amplía el mantenimiento de reservas compartido con C/D. Puede afectar escritores antiguos que actualicen directamente esas tablas; sus índices pueden rechazar históricos duplicados y sus bloqueos pueden fallar por timeout si el proyecto está ocupado. Debe coordinarse y validarse con los compañeros sobre un entorno aislado antes de trasladarla a la base compartida.

No se ejecutó ninguna migración, NOTIFY, cambio de permisos, creación de usuarios ni operación monetaria remota. No se reemplazó la consulta con datos inventados ni una service role en el navegador.

## Validación local de esta entrega

- Tres comprobaciones PGlite del nuevo SQL de diagnóstico: esquema vacío; esquema con D instalado y sin RPC B; esquema con B completo y firma/grants correctos. Las tres aprobaron.
- `node scripts/validar-devb-saldos.cjs`: 27 casos SQL aprobados en memoria, incluidos saldos propios y denegación de acceso directo/ajeno.
- `node scripts/validar-devb-app.cjs`: 17 casos de aplicación aprobados con fixtures/mocks explícitos.
- No hubo cambios TypeScript/React ni de la migración original; no se necesitó corregir el componente ni repetir el build para estos dos archivos de diagnóstico.
- No se verificó el historial remoto ni se declaró resuelta la página contra Supabase compartido. Sigue pendiente el despliegue/revisión de catálogo por el responsable.
