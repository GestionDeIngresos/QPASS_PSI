/* eslint-disable @typescript-eslint/no-require-imports -- Configuración exclusiva de pruebas aisladas. */
const path = require('node:path')
const config = Object.freeze(require('./fixtures/devb-desarrollo.json'))

async function configurarConversionPrueba(db, eventos) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('TASA_TEMPORAL_PROHIBIDA_EN_PRODUCCION')
  const {
    rows: [destino]
  } = await db.query(
    'select current_database() nombre,host(inet_server_addr()) servidor'
  )
  let memoria = false
  if (destino.servidor === null) {
    const { PGlite } = require(
      process.env.QPASS_PGLITE_MODULE ||
        path.resolve('.next/devb-tools/node_modules/@electric-sql/pglite')
    )
    memoria = db instanceof PGlite
  }
  if (
    !memoria &&
    (!['127.0.0.1', '::1'].includes(destino.servidor) ||
      !/^qpass_devb_test\w*$/.test(destino.nombre))
  ) {
    throw new Error('TASA_TEMPORAL_SOLO_BASE_LOCAL_DE_PRUEBAS')
  }
  for (const evento of eventos) {
    if (!Number.isSafeInteger(evento) || evento < 1)
      throw new Error('EVENTO_FIXTURE_INVALIDO')
    const { rows } = await db.query(
      'select bs_por_punto::text tasa,acuerdo from public.devb_conversion where evento_id=$1',
      [evento]
    )
    if (
      rows.length &&
      (rows[0].tasa !== config.bsPorPunto ||
        rows[0].acuerdo !== config.referencia)
    ) {
      throw new Error('CONFIGURACION_EXISTENTE_NO_SE_SOBRESCRIBE')
    }
    await db.query(
      'insert into public.devb_conversion(evento_id,bs_por_punto,acuerdo) values($1,$2,$3) on conflict(evento_id) do nothing',
      [evento, config.bsPorPunto, config.referencia]
    )
  }
}
module.exports = { config, configurarConversionPrueba }
