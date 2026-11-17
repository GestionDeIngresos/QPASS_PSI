# Revisión de las 77 funciones exportadas — 17/11/2026

**Decisión: PENDIENTE POR UNA CONDICIÓN OPERATIVA ESPECÍFICA: acreditar respaldo
recuperable y coordinación B/C para mantener detenidos los escritores financieros.**

003 es técnicamente viable para instalar solo infraestructura si se cumplen las
condiciones descritas abajo. No se acredita todavía esa preparación operativa.
No se identifica en las 77 filas un escritor financiero confirmado que obligue
a corregir 003. Tampoco se convierte el resultado NULL del detector en TRUE.

Rama: Aliaga. AGENTS.md leído. El CSV contiene las 77 funciones REVISION; no
incluye cuerpos, hashes de cuerpos, ACL completas ni el inventario de servicios.
Las 61 funciones sin relación detectada no forman parte de este CSV. La revisión
contrasta las firmas/metadatos exportados con el catálogo de QPass del 16/11,
001 aplicada según el usuario y fuentes primarias de las implementaciones estándar.
No se afirma haber verificado los binarios ni cuerpos actuales remotos.

## Resultado individual y alcance

La clasificación manual utiliza las tres categorías solicitadas. «Sin relación
financiera demostrable» significa que las firmas, el vínculo de extensión y el
comportamiento documentado/cuerpo disponible no muestran un acceso a ventas,
venta_items, saldos_puntos, solicitudes_devolucion, devoluciones o recargas.
No significa que la función sea inocua en todos los sentidos: una compra de
entradas sí escribe importes en compras; un reset de estadísticas tiene efectos;
una función criptográfica puede participar en un cobro sin ser quien lo realiza.

| Grupo examinado | Sin relación financiera demostrable | Escritor financiero confirmado | Requiere revisión adicional |
| --- | ---: | ---: | ---: |
| pgcrypto: 36 firmas de cifrado, hash, PGP y aleatoriedad | 36 | 0 | 0 |
| uuid-ossp: 10 firmas de generación/constantes UUID | 10 | 0 | 0 |
| pg_stat_statements: lectura/información/reset de estadísticas | 3 | 0 | 0 |
| Hooks GraphQL: grant_pg_graphql_access, set_graphql_placeholder | 0 | 0 | 2 |
| QPass: cuatro funciones de compra de entradas/lotes y listar_reportes_admin | 4 | 0 | 1 |
| Realtime: 12 firmas | 0 | 0 | 12 |
| Storage: cuatro firmas de búsqueda/listado | 0 | 0 | 4 |
| Vault: tres primitivas criptográficas y dos operaciones de secretos | 3 | 0 | 2 |
| **Total** | **56** | **0** | **21** |

Las 56 clasificaciones no se basan solo en pertenecer a un esquema de Supabase:
se contrastaron la operación específica, firma, extensión registrada y semántica
documentada o cuerpo disponible. Los detalles y fuentes por firma están en
clasificacion_manual_funciones_pre003.csv y en la tabla al final de este informe.

## Relación real con QPass

- **listar_reportes_admin** es la única fila con destino financiero estático
  exportado: public.recargas. El cuerpo del catálogo une reportes_recarga con
  recargas para obtener evento_id, con autorización administrativa. No modifica
  saldo, no crea una devolución y no la liquida. Tiene relación financiera de
  lectura y se mantiene en revisión adicional para contrastar el cuerpo actual
  si se requiere certificación de despliegue; no se etiqueta como escritor.
- **comprar_entradas → comprar_entradas_prueba → fachada de terceros:** los cuerpos
  disponibles muestran escritura de compras, entradas, cupo de tipos_ticket e
  intentos_compra_prueba, según la dirección de delegación fachada → prueba → compra.
  No escriben ventas comerciales, saldos o solicitudes/devoluciones. La compra
  genera QR con gen_random_uuid: una llamada a una primitiva opaca explica una
  cadena de incertidumbre sin demostrar un débito de puntos.
- **generar_lote_qr:** inserta lotes_qr_fisico/vinculos_qr_fisico y usa UUID. No
  acredita un vínculo con las tablas financieras comerciales.
- **resolver_reporte_admin**, fuera de este CSV, actualiza estados de reportes
  según el catálogo; resolver un reporte de recarga no equivale a devolver puntos.
  No se modifica el flujo administrativo de Dev A.
- Los cuatro triggers públicos exportados en el catálogo afectan a eventos,
  tipos_ticket y usuarios; sus cuerpos disponibles no debitan puntos. El CSV no
  exporta todos los triggers actuales: esa observación histórica no sustituye
  un inventario actual. Las FK financieras hacia eventos/usuarios no muestran
  cascadas de borrado en ese snapshot; venta_items sí depende con CASCADE de ventas.

## Qué significa revisar las otras rutas

| Ruta | Evidencia disponible y revisión concreta |
| --- | --- |
| GraphQL | El hook concede permisos y crea el wrapper; el placeholder crea una respuesta cuando la extensión no está disponible. No se demuestra DML financiero en los cuerpos de referencia. Faltan cuerpos actuales y alcance de grants/wrapper/RLS para descartar mutaciones posteriores por clientes. |
| apply_rls, cast, check_equality_op y filtros | Procesan WAL, valores, tipos y comparaciones. No se ha encontrado DML comercial explícito. El tipo/operador o una política evaluada puede invocar funciones; faltan destinos y definiciones actuales para cerrar rutas indirectas. |
| list_changes/list_changes_sync | Lectura/procesamiento de replicación puede avanzar slots y transmitir cambios financieros si se publican. Eso no es un débito, pero requiere revisar publicaciones, políticas y la cadena apply_rls. |
| authorize, send/send_binary y broadcast_changes | La implementación de referencia prueba permisos o inserta mensajes en realtime.messages, y broadcast_changes construye notificaciones. Es escritura de infraestructura, no venta financiera confirmada. Revisar triggers/políticas de mensajes y consumidores que pudieran ejecutar operaciones. |
| Storage | Las búsquedas/listados estándar no son cobros. No hay cuerpos actuales en el CSV para cerrar SQL dinámico, políticas/funciones o posibles expresiones invocadas. Leer un comprobante/QR bancario no implica modificar su saldo. |
| Vault create_secret/update_secret | La referencia inserta/actualiza vault.secrets, no tablas comerciales. Falta comprobar quién consume esos secretos y las automatizaciones autorizadas. No se leen ni exportan valores secretos durante esta revisión. |

La revisión adicional de estas 21 filas no equivale a 21 vulnerabilidades. No se
puede probar que sean escritores financieros usando este CSV. Con una congelación
completa del módulo y ningún flujo comercial habilitado, esas dudas pueden quedar
registradas antes de activar operaciones; si no se puede contener una ruta, hay
que resolverla antes de instalar infraestructura que pueda afectarla.

En app/lib se revisaron llamadas RPC y DML: el cobro usa sesión normal y la RPC
cobrar_venta; las acciones y lecturas comerciales comparan QPASS_COMERCIO_REAL
con el literal true. Los usos locales identificados de service_role administran
usuarios/asignaciones, no realizan DML financiero directo. Esto no inventaría
ausencia de servicios desplegados: Edge Functions, cron, webhooks, consumidores
Realtime y servicios privados de B/C no están acreditados por el CSV/repositorio.

## Riesgos cerrados y abiertos

- **Descartados dentro de la evidencia:** tratar hash, cifrado, UUID o estadísticas
  como escritores financieros solo por ser C; confundir la compra de entradas
  con ventas comerciales; confundir lectura de reportes con liquidación.
- **Confirmados sobre 003:** añade y rellena reservado; instala triggers que se
  ejecutan con el flag apagado; revoca permisos a clientes sobre siete tablas;
  mantiene service_role privilegiado; toma locks DDL e índices no concurrentes.
  Puede afectar flujos B/C que usen DML directo y lecturas actuales revocadas.
- **Indeterminados:** rutas indirectas de las 21 firmas, cuerpos actuales frente
  a referencias, escritores externos, estado del flag desplegado y confirmación
  actual de ausencia/conciliación de movimientos. RIESGO=0 es ausencia de DML
  detectado, no demostración de ausencia absoluta de escritores.

## Condiciones antes de ejecutar 003 como infraestructura

1. **Respaldo recuperable:** identificar proyecto y punto anterior a 003; conservar
   esquema, datos, políticas, ACL, funciones y triggers. Verificar restauración
   en un clon aislado y registrar resultado/responsable. Ninguna confirmación de
   respaldo o prueba de restauración se recibió en esta tarea.
2. **Coordinación B/C para congelación efectiva:** identificar y detener escritores
   de ventas/items/saldos/solicitudes/devoluciones/recargas, incluidos service_role,
   tareas y administración. Acordar que permanezcan detenidos después de 003 hasta
   aceptar el contrato de reservas. Confirmar que las revocaciones no rompan un
   flujo en uso. Si hay un consumidor indeterminado activo, resolverlo primero.
3. **Datos y metadatos actuales:** volver a comprobar los controles de esquema y
   que no hay instalación parcial. Para este alcance sin contrato aprobado,
   mantener el módulo financiero vacío, o conciliar y aprobar explícitamente
   todos los movimientos existentes. La captura guardada de tablas vacías es
   del 16/11 local; no se reutiliza como estado presente garantizado.
4. **Reservas:** 003 propone reservar el total en_revision/aprobada sin bajar saldo.
   No ejecutar una inicialización sobre saldos ya descontados por B. Su guard
   aborta ante devoluciones existentes; no bloquear esa condición con cambios
   improvisados. La pausa de escritores debe cubrir devoluciones porque 003
   comprueba esa tabla sin tomar el lock explícito aplicado a saldos/solicitudes.
5. **Alcance apagado:** confirmar QPASS_COMERCIO_REAL distinto de true en el entorno
   desplegado; no aplicar 004 en esta operación ni habilitar pares negocio/evento.
   El valor local ausente o false no acredita el despliegue. El flag no es una
   barrera SQL y no desactiva los triggers de reserva.
6. **Aplicación y comprobación:** aplicar solo el archivo 003 completo, manteniendo
   BEGIN/COMMIT, guards y timeouts. Ante error, rollback y detener. Tras éxito,
   ejecutar 03_tras_003.sql, comprobar saldo conservado, reservas coherentes,
   permisos y pares inactivos; repetir los flujos HU4/9/13/14 de A/D. No repetir
   000–002 ni continuar automáticamente con 004.

Antes de habilitar operaciones, B debe acordar saldo total/gastable, reserva,
recargas y liquidación de devoluciones; B/C deben acordar precio/puntos y C la
relación negocio/evento, catálogo y ayudantes. Esos contratos pueden diferirse
para instalar infraestructura únicamente si todos esos flujos quedan excluidos
y congelados explícitamente. No están aprobados por esta revisión.

## Recuperación

Antes de COMMIT, un error en el archivo transaccional obliga a rollback y detener.
Después de COMMIT, mantener cobros/escritores apagados y validar el alcance del
incidente antes de restaurar. Restaurar primero en clon y usar el respaldo/punto
de recuperación acordado; una restauración completa puede perder cambios
posteriores de A/B/C, por lo que exige coordinación. No se prepara un DROP de
columnas/tablas ni una reversión destructiva improvisada.

## Validaciones de esta revisión

Se comprobaron 77 registros y 77 firmas únicas, 56/0/21 en las categorías manuales
y un solo vínculo estático a tablas financieras en el CSV. Se conserva la firma
completa en el CSV de clasificación, incluso los OUT extensos de estadísticas.
Se contrastan hashes de 003/004 con manifest-hu61-corregida.json. No se modifica
el detector ni se ejecutan funciones exportadas, consultas SQL remotas, commits
o push. No se repiten pruebas SQL de implementación: no hay cambios ejecutables.

## Fuentes primarias y evidencia local

- P: [PostgreSQL 17 pgcrypto](https://www.postgresql.org/docs/17/pgcrypto.html).
- U: [PostgreSQL 17 uuid-ossp](https://www.postgresql.org/docs/17/uuid-ossp.html).
- S: [PostgreSQL 17 pg_stat_statements](https://www.postgresql.org/docs/17/pgstatstatements.html).
- V: [Vault SQL de referencia](https://github.com/supabase/vault/blob/main/supabase_vault.sql) y [código criptográfico](https://github.com/supabase/vault/blob/main/src/crypto_aead_det_xchacha20.c).
- G: [Supabase postgres schema-17](https://github.com/supabase/postgres/blob/develop/migrations/schema-17.sql).
- R: [Realtime authorize](https://github.com/supabase/realtime/blob/main/priv/repo/tenant_schema/realtime/functions/authorize.sql), [send_binary](https://github.com/supabase/realtime/blob/main/priv/repo/tenant_schema/realtime/functions/send_binary.sql) y cuerpos oficiales preservados en fixture-supabase-realtime-003.json. No se declara inspeccionada la implementación actual de todas las otras firmas Realtime/Storage.
- Q: qpass_catalogo_supabase_2026-11-16.json, 001, CSV aportado y código local app/lib.

## Clasificación de cada firma

La tabla siguiente conserva el orden del CSV original. Las abreviaturas son
**SIN** = Sin relación financiera demostrable; **REV** = Requiere revisión
adicional. No hay escritores financieros confirmados en esta exportación.
Las firmas OUT extensas se abrevian aquí; el CSV de clasificación las preserva.

| # | Firma | Clase | Fundamento individual | Evidencia |
| --- | --- | --- | --- | --- |
| 1 | extensions.armor(bytea) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 2 | extensions.armor(bytea, text[], text[]) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 3 | extensions.crypt(text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 4 | extensions.dearmor(text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 5 | extensions.decrypt(bytea, bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 6 | extensions.decrypt_iv(bytea, bytea, bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 7 | extensions.digest(bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 8 | extensions.digest(text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 9 | extensions.encrypt(bytea, bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 10 | extensions.encrypt_iv(bytea, bytea, bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 11 | extensions.gen_random_bytes(integer) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 12 | extensions.gen_random_uuid() | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 13 | extensions.gen_salt(text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 14 | extensions.gen_salt(text, integer) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 15 | extensions.grant_pg_graphql_access() | REV | Hook de objetos/permisos GraphQL: referencia sin DML financiero explícito; revisar wrapper/placeholder real, permisos y posibles mutaciones posteriores. | G; CSV y referencia de Supabase postgres |
| 16 | extensions.hmac(bytea, bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 17 | extensions.hmac(text, text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 18 | extensions.pg_stat_statements(showtext boolean; OUT abreviados, ver CSV) | SIN | Lee estadísticas/metadatos de ejecución; no vuelve a ejecutar las consultas observadas ni altera saldos. | S; firma y extensión registrada del CSV |
| 19 | extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) | SIN | Lee estadísticas/metadatos de ejecución; no vuelve a ejecutar las consultas observadas ni altera saldos. | S; firma y extensión registrada del CSV |
| 20 | extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) | SIN | Restablece estadísticas de consultas, con efectos de observabilidad; no ejecuta las consultas registradas ni cambia importes de negocio. | S; firma y extensión registrada del CSV |
| 21 | extensions.pgp_armor_headers(text, OUT key text, OUT value text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 22 | extensions.pgp_key_id(bytea) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 23 | extensions.pgp_pub_decrypt(bytea, bytea) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 24 | extensions.pgp_pub_decrypt(bytea, bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 25 | extensions.pgp_pub_decrypt(bytea, bytea, text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 26 | extensions.pgp_pub_decrypt_bytea(bytea, bytea) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 27 | extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 28 | extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 29 | extensions.pgp_pub_encrypt(text, bytea) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 30 | extensions.pgp_pub_encrypt(text, bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 31 | extensions.pgp_pub_encrypt_bytea(bytea, bytea) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 32 | extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 33 | extensions.pgp_sym_decrypt(bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 34 | extensions.pgp_sym_decrypt(bytea, text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 35 | extensions.pgp_sym_decrypt_bytea(bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 36 | extensions.pgp_sym_decrypt_bytea(bytea, text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 37 | extensions.pgp_sym_encrypt(text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 38 | extensions.pgp_sym_encrypt(text, text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 39 | extensions.pgp_sym_encrypt_bytea(bytea, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 40 | extensions.pgp_sym_encrypt_bytea(bytea, text, text) | SIN | Primitiva documentada de hash/cifrado/PGP/aleatoriedad sobre argumentos; no recibe relación ni ejecuta DML de QPass. No confundir su uso por una RPC con escritura propia. | P; firma y extensión registrada del CSV |
| 41 | extensions.set_graphql_placeholder() | REV | Hook de objetos/permisos GraphQL: referencia sin DML financiero explícito; revisar wrapper/placeholder real, permisos y posibles mutaciones posteriores. | G; CSV y referencia de Supabase postgres |
| 42 | extensions.uuid_generate_v1() | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 43 | extensions.uuid_generate_v1mc() | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 44 | extensions.uuid_generate_v3(namespace uuid, name text) | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 45 | extensions.uuid_generate_v4() | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 46 | extensions.uuid_generate_v5(namespace uuid, name text) | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 47 | extensions.uuid_nil() | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 48 | extensions.uuid_ns_dns() | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 49 | extensions.uuid_ns_oid() | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 50 | extensions.uuid_ns_url() | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 51 | extensions.uuid_ns_x500() | SIN | Generación UUID o constante de namespace documentada; no consulta ni modifica cuentas, ventas o devoluciones. | U; firma y extensión registrada del CSV |
| 52 | public.comprar_entradas(p_evento_id text, p_lineas jsonb, p_correo_destino text) | SIN | Escribe compras, entradas y cupo de tipos_ticket; usa gen_random_uuid para QR. No escribe las tablas comerciales de 003 en el cuerpo exportado. | Q; cuerpo de catálogo o 001, llamadas y triggers del snapshot revisados |
| 53 | public.comprar_entradas_prueba(p_evento_id text, p_lineas jsonb, p_correo_destino text, p_solicitud_id uuid, p_resultado text) | SIN | Delegación a comprar_entradas e inserción en intentos_compra_prueba. El destino opaco UUID no demuestra débito de puntos. | Q; cuerpo de catálogo o 001, llamadas y triggers del snapshot revisados |
| 54 | public.comprar_entradas_terceros_prueba(p_evento_id text, p_lineas jsonb, p_correo_destino text, p_solicitud_id uuid, p_resultado text) | SIN | Fachada de 001: valida comprador/destinatario y delega a comprar_entradas_prueba; no crea ventas comerciales ni mueve saldo. | Q; cuerpo de catálogo o 001, llamadas y triggers del snapshot revisados |
| 55 | public.generar_lote_qr(p_evento integer, p_cantidad integer, p_solicitud uuid) | SIN | Inserta lotes_qr_fisico y vinculos_qr_fisico; usa UUID para códigos. No mueve saldo. | Q; cuerpo de catálogo o 001, llamadas y triggers del snapshot revisados |
| 56 | public.listar_reportes_admin(p_tipo text, p_estado text, p_busqueda text) | REV | Vínculo real de LECTURA con recargas para obtener evento_id del reporte. El cuerpo disponible no escribe ni liquida; la exportación no prueba identidad del cuerpo actual. | Q; CSV + cuerpo completo del catálogo |
| 57 | realtime.apply_rls(wal jsonb, max_record_bytes integer) | REV | WAL y comprobaciones RLS dinámicas: determinar relación recibida y funciones/políticas invocadas. | R; CSV y cuerpo oficial de referencia revisado |
| 58 | realtime.authorize(role_name text, topic_name text, claims text, sub text, headers text, read_extensions text[], write_extensions text[], OUT read_allowed boolean[], OUT write_allowed boolean[]) | REV | Referencia oficial: pruebas INSERT/SELECT de realtime.messages revertidas en bloque de excepción. Revisar políticas y triggers actuales, sin equiparar mensajes a puntos. | R; CSV y cuerpo oficial de referencia revisado |
| 59 | realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) | REV | Notificación de cambios: verificar cuerpo, trigger que la llama y consumidores capaces de ejecutar operaciones. | CSV; cadena indeterminada, sin cuerpo actual disponible |
| 60 | realtime.cast(val text, type_ regtype) | REV | Conversión dinámica de tipo recibido: revisar funciones de entrada/casts implicados; IMMUTABLE no acredita por sí solo ausencia de efectos. | R; CSV y cuerpo oficial de referencia revisado |
| 61 | realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) | REV | Comparación dinámica con tipo/operador recibido: revisar operadores, casts y funciones invocadas, incluida cada sobrecarga. | CSV; cadena indeterminada, sin cuerpo actual disponible |
| 62 | realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) | REV | Comparación dinámica con tipo/operador recibido: revisar operadores, casts y funciones invocadas, incluida cada sobrecarga. | CSV; cadena indeterminada, sin cuerpo actual disponible |
| 63 | realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) | REV | Cadena hacia comparaciones dinámicas: revisar check_equality_op y tipos de filtros. | CSV; cadena indeterminada, sin cuerpo actual disponible |
| 64 | realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) | REV | Replicación/WAL: revisar publicaciones, slots, apply_rls y consumidores. Avanzar un slot no es debitar un saldo. | CSV; cadena indeterminada, sin cuerpo actual disponible |
| 65 | realtime.list_changes_sync(publication name, slot_name name, max_changes integer, max_record_bytes integer) | REV | Cadena de replicación no resuelta por el CSV: revisar cuerpo actual, publicación/slot y dependencias. | CSV; cadena indeterminada, sin cuerpo actual disponible |
| 66 | realtime.send(payload jsonb, event text, topic text, private boolean) | REV | Envío de mensajes: verificar SQL dinámico, destino, triggers/políticas de realtime.messages y consumidores externos. | CSV; cadena indeterminada, sin cuerpo actual disponible |
| 67 | realtime.send_binary(payload bytea, event text, topic text, private boolean) | REV | Referencia oficial: SET LOCAL dinámico e INSERT en realtime.messages. Revisar políticas, triggers y consumidores; no hay DML comercial confirmado. | R; CSV y cuerpo oficial de referencia revisado |
| 68 | realtime.subscription_check_filters() | REV | Validación de filtros y conversiones: revisar la cadena de tipos/comparaciones y el trigger asociado. | CSV; cadena indeterminada, sin cuerpo actual disponible |
| 69 | storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer, start_after text, next_token text, sort_order text, noncurrent_versions text, delete_markers text, next_token_archived_at timestamp with time zone, next_token_version text) | REV | Función de listado/búsqueda según firma; CSV sin vínculo financiero estático. Faltan cuerpo de esta versión, SQL dinámico, políticas y expresiones invocadas para descartar accesos indirectos. | CSV; no se presume seguridad por esquema |
| 70 | storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text, noncurrent_versions text, delete_markers text) | REV | Función de listado/búsqueda según firma; CSV sin vínculo financiero estático. Faltan cuerpo de esta versión, SQL dinámico, políticas y expresiones invocadas para descartar accesos indirectos. | CSV; no se presume seguridad por esquema |
| 71 | storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text, noncurrent_versions text, delete_markers text, p_start_after_version text) | REV | Función de listado/búsqueda según firma; CSV sin vínculo financiero estático. Faltan cuerpo de esta versión, SQL dinámico, políticas y expresiones invocadas para descartar accesos indirectos. | CSV; no se presume seguridad por esquema |
| 72 | storage.search_v2(prefix text, bucket_name text, limits integer, levels integer, start_after text, sort_order text, sort_column text, sort_column_after text, noncurrent_versions text, delete_markers text, start_after_archived_at timestamp with time zone, start_after_version text, start_after_is_continuation boolean) | REV | Función de listado/búsqueda según firma; CSV sin vínculo financiero estático. Faltan cuerpo de esta versión, SQL dinámico, políticas y expresiones invocadas para descartar accesos indirectos. | CSV; no se presume seguridad por esquema |
| 73 | vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) | SIN | Primitiva AEAD/nonce: referencia SQL enlaza al código criptográfico C; opera sobre datos/clave/nonce sin destino de tabla financiera. | V; firma y extensión registrada del CSV |
| 74 | vault._crypto_aead_det_encrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) | SIN | Primitiva AEAD/nonce: referencia SQL enlaza al código criptográfico C; opera sobre datos/clave/nonce sin destino de tabla financiera. | V; firma y extensión registrada del CSV |
| 75 | vault._crypto_aead_det_noncegen() | SIN | Primitiva AEAD/nonce: referencia SQL enlaza al código criptográfico C; opera sobre datos/clave/nonce sin destino de tabla financiera. | V; firma y extensión registrada del CSV |
| 76 | vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) | REV | Referencia escribe vault.secrets, no saldos/ventas. Revisar triggers y consumidores del secreto que puedan autorizar servicios financieros; no inspeccionar valores secretos. | V; referencia SQL de ambas operaciones y CSV |
| 77 | vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) | REV | Referencia escribe vault.secrets, no saldos/ventas. Revisar triggers y consumidores del secreto que puedan autorizar servicios financieros; no inspeccionar valores secretos. | V; referencia SQL de ambas operaciones y CSV |
