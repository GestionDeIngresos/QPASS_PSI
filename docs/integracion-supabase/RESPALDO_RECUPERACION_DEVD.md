# Respaldo y recuperación antes de 000–004

Procedimiento para ejecución FUTURA por el responsable del entorno. **No ejecutado
en esta revisión.** No incluye borrado de tablas, --clean, desactivación de RLS ni
restauración automática encima del proyecto compartido.

## Preparación y punto de recuperación T0

1. Registrar proyecto/ref, rama Aliaga, hashes de las cinco versiones, versión
   PostgreSQL y responsable de restauración. No confundir el catálogo de public
   con un backup de datos o una copia completa de Auth/Storage.
2. Abrir Database / Backups del proyecto y comprobar qué respaldo o punto PITR está
   REALMENTE disponible, su fecha, retención y posibilidad de restaurar a otro
   proyecto. No dar por habilitado el servicio. Seleccionar y registrar T0.
3. Reservar ventana de mantenimiento: pausar escritores de B/C, compras, recargas,
   devoluciones, tareas y herramientas administrativas. Mantener flag apagado y
   pares comerciales deshabilitados. Registrar transacciones pendientes y esperar
   su cierre; no matar sesiones sin revisarlas.
4. Conservar un catálogo 00 nuevo y el exportado original, configuración de Auth,
   URLs, SMTP, buckets/políticas y cualquier personalización fuera de public. Guardar
   evidencias y respaldos cifrados fuera del repositorio y restringidos al responsable.
5. Confirmar copia separada de archivos de Storage necesarios. Los respaldos de
   base no incluyen los objetos físicos de Storage. Referencia:
   [Supabase Backups](https://supabase.com/docs/guides/platform/backups).

## Copia lógica adicional con herramientas PostgreSQL

Requiere clientes pg_dump/pg_dumpall/pg_restore/psql 17 compatibles instalados;
las dependencias de validación del repositorio no los sustituyen. Preparar un
archivo privado pg_service.conf con servicio qpass_origen (host, port, dbname,
user y SSL), y un pgpass.conf protegido. No pegar contraseñas en consola, URLs
de comandos, informes o variables impresas.

Ejemplo de configuración SIN contraseña:

```ini
[qpass_origen]
host=HOST_ORIGEN_CONFIRMADO
port=5432
dbname=postgres
user=USUARIO_DE_CONEXION_CONFIRMADO
sslmode=require
```

Usar la conexión directa o pooler en modo sesión verificada para ese proyecto.
El usuario exacto puede variar. Los nombres siguientes son rutas de ejemplo;
el operador debe reemplazarlas antes de ejecutar.

```powershell
$env:PGSERVICEFILE='C:/QPASS-respaldos/config/pg_service.conf'
$env:PGPASSFILE='C:/QPASS-respaldos/config/pgpass.conf'
$qpassRespaldo='C:/QPASS-respaldos/T0-confirmado'
New-Item -ItemType Directory -Path $qpassRespaldo -ErrorAction Stop | Out-Null

# Una sola captura consistente de la base; conserva datos/esquema/ACL.
pg_dump --dbname=service=qpass_origen --format=custom --lock-wait-timeout=3s --file="$qpassRespaldo/database.dump"
if ($LASTEXITCODE -ne 0) { throw 'Backup de base fallido: no aplicar migraciones.' }

# Copia complementaria de public para inspección/reconstrucción dirigida.
# No es un backup independiente de Auth/Storage ni reemplaza database.dump.
pg_dump --dbname=service=qpass_origen --schema=public --format=custom --lock-wait-timeout=3s --file="$qpassRespaldo/public.dump"
if ($LASTEXITCODE -ne 0) { throw 'Backup public fallido: revisar antes de continuar.' }

# Roles globales: puede exigir permisos que el proyecto gestionado no concede.
pg_dumpall --dbname=service=qpass_origen --database=postgres --roles-only --no-role-passwords --file="$qpassRespaldo/roles.sql"
if ($LASTEXITCODE -ne 0) { throw 'Roles sin exportar: acordar alternativa gestionada; no asumir copia completa.' }

pg_restore --list "$qpassRespaldo/database.dump" | Set-Content -LiteralPath "$qpassRespaldo/database.toc.txt" -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Archivo no legible; no continuar.' }
Get-ChildItem -LiteralPath $qpassRespaldo -File | Get-FileHash -Algorithm SHA256 |
  Export-Csv -LiteralPath "$qpassRespaldo/hashes.csv" -NoTypeInformation
```

Estos comandos leen el origen. Un fallo de permisos/dump deja una copia parcial
que no se considera válida. No retirar schemas o ACL para ocultar el fallo y
declarar éxito. pg_dump ofrece una captura consistente de una base y pg_dumpall
se usa para objetos globales, según
[PostgreSQL 17](https://www.postgresql.org/docs/17/app-pgdump.html).

## Ensayo obligatorio de restauración

Ruta preferida si el plan y el backup disponible lo permiten:

1. En Backups, seleccionar T0 y **Restore to a new project**; revisar destino y
   costos antes de confirmar. No seleccionar el proyecto original como destino.
2. Esperar finalización y guardar ref del proyecto restaurado. No conectar aún la
   aplicación productiva ni escritores automáticos al destino.
3. Restaurar/verificar por separado configuraciones y objetos no copiados, tales
   como archivos de Storage y ajustes externos de Auth. Comparar catálogo, roles,
   políticas, propietarios y datos comerciales contra T0.
4. Comprobar usuarios de prueba, QR, resumen del comprador y listado/resolución
   Admin A. Registrar conteos e importes sin publicarlos en el repositorio.
5. Ensayar las versiones aprobadas y sus consultas en este clon. Guardar duración,
   errores, resultado de las pruebas y evidencia de recuperación antes de autorizar
   la aplicación al entorno real.

La disponibilidad y el alcance de esa ruta deben confirmarse en el proyecto:
[Supabase: restaurar a un proyecto nuevo](https://supabase.com/docs/guides/platform/clone-project).

Si se requiere restauración lógica, un responsable debe preparar un destino vacío
y compatible con roles/extensiones/schemas gestionados. Nunca ejecutar roles.sql
indiscriminadamente contra roles Supabase existentes. Una vez validado ese destino,
la restauración lógica de la copia completa utiliza:

```powershell
# qpass_recuperacion debe apuntar a un destino NUEVO y comprobado, nunca al origen.
# El responsable prepara roles/extensions antes, sin reemplazar los roles gestionados.
pg_restore --dbname=service=qpass_recuperacion --single-transaction --exit-on-error --no-owner "$qpassRespaldo/database.dump"
if ($LASTEXITCODE -ne 0) { throw 'Restauración incompleta; no conectar aplicación ni modificar origen.' }
```

`--no-owner` requiere restaurar como el propietario esperado (postgres) y comprobar
después los propietarios; no omite ACL. No se emplea --no-acl, --clean ni desactivación
de triggers. Una copia completa de schemas gestionados puede requerir adaptación
por el administrador de Supabase: si no restaura así en el ensayo, no improvisar
en producción; usar recuperación gestionada o un procedimiento específico probado.
El destino no se declara recuperado solo porque pg_restore --list funcionó.

## Ejecución controlada y fallo antes de COMMIT

Después de resolver los hallazgos del informe final y obtener revisión del paquete:

1. Mantener ventana de mantenimiento y guardar catálogo/contador base.
2. Ejecutar cada archivo aprobado completo, con ON_ERROR_STOP si se usa psql:

```powershell
psql --dbname=service=qpass_origen --no-psqlrc --set=ON_ERROR_STOP=1 --file='supabase/migrations/202611160000_devd_precondiciones.sql'
if ($LASTEXITCODE -ne 0) { throw 'Detener aplicación. No ejecutar 001.' }
```

3. Ejecutar la consulta de verificación correspondiente y 90_funciones_originales;
   registrar resultados, hash y versión. No avanzar si falta un objeto o correcto=false.
4. Si una versión falla, su transacción pendiente se revierte al cerrar la conexión;
   en SQL Editor verificar/ejecutar ROLLBACK de ESA sesión. Versiones anteriores con
   COMMIT permanecen. Reintentar solo la versión fallida completa después de resolver
   la causa y confirmar el estado; no repetir 000–004 en bloque ni ejecutar fragmentos.

## Fallo después de COMMIT o después de empezar ventas

1. Poner la aplicación en mantenimiento, apagar el flag y, si 003 está instalada,
   desactivar los pares negocio-evento afectados mediante operación administrativa
   revisada. Pausar todos los otros writers privilegiados B/C. El flag solo no
   corta llamadas RPC directas.
2. Esperar transacciones en curso. Capturar catálogo, versión aplicada, solicitudes,
   respuesta persistida y evidencia de saldo/venta antes de reintentar. No producir
   otra UUID para una venta cuyo resultado todavía es incierto.
3. Conservar ventas/líneas/reportes/QR y las columnas/triggers instalados. Corregir
   hacia delante con otra versión; no volver a políticas antiguas que expongan QR,
   quitar constraints o ajustar saldos/reservas manualmente para continuar.
4. Si se necesita recuperación mayor, restaurar T0 en OTRO proyecto. Extraer y
   conciliar operaciones confirmadas posteriores a T0 antes de decidir el cambio
   de destino. Sin replay/compensación trazable, un respaldo anterior perdería esas
   operaciones: no restaurarlo encima del proyecto con nuevas ventas.
5. Validar permisos, invariantes, compras/reportes de A y conciliación financiera.
   El cambio de destino y la reapertura requieren revisión del responsable y del
   usuario. Mientras no exista esa evidencia, mantener los cobros apagados.
