# Revisión pre-003: inventario individual pendiente

> Actualización 17/11/2026: ya se recibió y revisó el CSV de 77 firmas. Este
> documento conserva el estado anterior. La decisión vigente y la clasificación
> individual están en [CIERRE_REVISION_FUNCIONES_PRE003.md](CIERRE_REVISION_FUNCIONES_PRE003.md).

Rama verificada: Aliaga. AGENTS.md leído. No se cambia el detector ni 003/004.

**Conclusión: PENDIENTE POR UNA CONDICIÓN ESPECÍFICA: obtener y revisar las firmas
y motivos de las 77 funciones indeterminadas antes de acreditar control de los
escritores reales.** Los conteos RIESGO=0, REVISION=77, SIN RELACION DETECTADA=61
son resultados comunicados por el usuario, no una exportación individual revisada.
No se convierten NULL en TRUE ni se declara que las 77 funciones sean infraestructura.

## Evidencia disponible y límites

| Categoría | Evidencia y conclusión acotada |
| --- | --- |
| Confirmado | 003 agrega y rellena reservado, instala triggers activos de reserva y revoca permisos sobre tablas comerciales. Estos efectos suceden aunque QPASS_COMERCIO_REAL esté apagado. service_role conserva DML: el flag no congela servicios externos. |
| Descartado en el snapshot | Las 25 funciones public y cuatro triggers del catálogo del 16/11 no contienen un débito comercial propio identificado. listar_reportes_admin lee recargas; resolver_reporte_admin resuelve reportes y no liquida devoluciones. No se afirma que este inventario histórico cubra las 77 firmas actuales. |
| Infraestructura conocida | Los cuerpos oficiales previamente revisados de grant_pg_graphql_access/grant_pg_net_access configuran objetos/permisos; apply_rls/cast realizan evaluación RLS/conversión dinámica. No prueban por sí solos un débito financiero. Tampoco se acredita que los cuerpos remotos coincidan ni se eximen sus rutas indirectas. |
| Escritores preparados, todavía no aplicados | devd_mantener_reserva de 003 actualiza reservado; cobrar_venta de 004 crea venta/líneas y debita saldo. Son parte del diseño futuro, no hallazgos de funciones remotas ya instaladas. |
| Servicios locales | Las rutas de cobro y lecturas comerciales comparan QPASS_COMERCIO_REAL con el literal true. En .env.local no está declarada. La búsqueda en app/lib no identificó DML financiero directo; hay acciones administrativas con service_role sobre usuarios/asignaciones. No existe supabase/functions en el repositorio; eso no demuestra ausencia de Edge Functions desplegadas, tareas o servicios de B/C. |
| Indeterminado | Firmas/cuerpos actuales de las 77 funciones, callers con privilegios, configuración desplegada, trabajos/servicios externos y alcance de sus escrituras. La captura agregada guardada de tablas vacías es histórica, no un estado financiero actual garantizado. |

## Exportación necesaria, sin modificar el detector

Ejecutar completo como postgres en Supabase SQL Editor:
`supabase/verificacion-devd/detalle_funciones_pre003.sql`.

Es una única SELECT de catálogos, sin datos de usuarios ni credenciales. Devuelve
solo correcto IS NULL, una fila por función (incluidas sus sobrecargas), con:
esquema, nombre, firma, clasificacion, motivo y relacion_financiera_detectada.
La última columna enumera destinos financieros de las mismas aristas ya utilizadas
por el detector; una ruta no demuestra escritura. Cuando no se resuelve una ruta,
se informa expresamente, sin atribuir seguridad al SQL dinámico.

En la tabla de resultados utilizar la opción de exportar/descargar CSV y guardar
el resultado completo, con cabeceras, en:
`docs/integracion-supabase/detalle_funciones_pre003.csv`.

El número de filas de datos debe ser 77 si los objetos no cambiaron desde la
consulta informada. Si difiere, no recortar ni rellenar: ejecutar nuevamente el
detector y comparar REVISION con la exportación nueva, evitando cambios de objetos
entre ambas lecturas. Las cabeceras del CSV no cuentan como función; no contar
líneas físicas si un campo contiene saltos de línea. No ejecutar migraciones para
obtener este inventario.

## Reutilización y pruebas

scripts/generar-detalle-funciones-pre003.cjs copia literalmente los CTEs de
relaciones y clasificación del detector. --check comprueba igualdad textual del
archivo generado; no se han creado criterios nuevos. La proyección adicional
de destinos financieros no modifica la clasificación ni filtra funciones extra.

Pasaron 28 pruebas en PostgreSQL local 17.11 anterior a 003 y 28 en PGlite.
En cada evaluación se comparan número de filas del detalle y REVISION del detector,
se comprueban las seis columnas, clase REVISION y firmas sin duplicados. Ambas
consultas se ejecutan bajo BEGIN READ ONLY / ROLLBACK. ESLint de los dos scripts
pasó. Esta coincidencia local no equivale a haber verificado las 77 firmas remotas.

## Condiciones para instalar solo infraestructura

003 puede evaluarse para ese alcance sin habilitar cobros, pero no es un cambio
inerte. Antes de ejecutarla deben estar acreditadas estas condiciones:

1. Resolver el inventario individual y establecer qué escritores quedan activos,
   pausados o fuera de alcance con responsables B/C. Si hay un escritor
   indeterminado que pueda mover fondos, no declarar esta condición cumplida.
2. Confirmar de nuevo datos y metadatos actuales: módulo vacío o conciliación
   explícita de saldo/reservas, ausencia de devoluciones que disparen el guard,
   ausencia de instalación parcial y revisión de cambios respecto al catálogo.
3. Confirmar respaldo recuperable y ventana sin escritores financieros, incluidos
   devoluciones, recargas, servicios service_role y tareas administrativas. 003
   bloquea solicitudes/saldos, pero su guard de devoluciones no bloquea esa tabla.
4. Mantener QPASS_COMERCIO_REAL distinto de true en el despliegue, no aplicar 004
   en este paso ni crear pares negocio/evento activos. El estado local del flag
   no acredita el entorno desplegado.
5. Acordar que los flujos financieros permanezcan detenidos después de 003 hasta
   aceptar la semántica de reserva/liquidación y las revocaciones de permisos.
   Apagar la UI no evita que los nuevos triggers afecten a futuras solicitudes.
6. Aplicar el archivo completo en ventana de mantenimiento, conservando sus
   timeouts/guards; ante fallo, rollback y detener. Validar con 03_tras_003.sql,
   regresión de HU4/9/13/14, saldo conservado y permisos B/C esperados. No repetir
   000–002. La recuperación después de COMMIT debe planificarse con el respaldo;
   no improvisar borrados de columnas/tablas para volver atrás.

Los acuerdos de precio/puntos y autorizaciones comerciales pueden seguir pendientes
solo si se ha acordado expresamente mantener toda operación financiera excluida.
Las pruebas de cobro, idempotencia y reservas y el contrato B/C son requisitos
adicionales antes de 004/activación, no condiciones satisfechas por tablas vacías.

No se ejecutaron consultas ni modificaciones remotas, commits o push en esta revisión.
