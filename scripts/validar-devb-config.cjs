/* eslint-disable @typescript-eslint/no-require-imports -- Guardas de configuración, mocks explícitos, sin base remota. */
const assert = require('node:assert/strict')
const {
  config,
  configurarConversionPrueba
} = require('./devb-config-pruebas.cjs')
async function main() {
  let total = 0
  const test = async (n, f) => {
    await f()
    total++
    console.log('PASS ' + n)
  }
  await test('equivalencia temporal centralizada y etiquetada sin valor de producción', async () => {
    assert.equal(config.entorno, 'desarrollo_pruebas_aisladas')
    assert.equal(config.bsPorPunto, '1.000000')
    assert.match(config.referencia, /TEMPORAL.*pendiente de aprobación/)
  })
  await test('NODE_ENV production rechaza configurar antes de hacer consultas', async () => {
    const anterior = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await assert.rejects(
        () =>
          configurarConversionPrueba(
            {
              query() {
                throw new Error('NO_DEBE_CONSULTAR')
              }
            },
            [1]
          ),
        /TASA_TEMPORAL_PROHIBIDA_EN_PRODUCCION/
      )
    } finally {
      if (anterior === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = anterior
    }
  })
  await test('nombre de base principal y servidor remoto se rechazan sin escrituras', async () => {
    for (const destino of [
      { nombre: 'produccion', servidor: '127.0.0.1' },
      { nombre: 'qpass_devb_test', servidor: '10.0.0.5' }
    ]) {
      let consultas = 0
      await assert.rejects(
        () =>
          configurarConversionPrueba(
            {
              query: async () => {
                consultas++
                return { rows: [destino] }
              }
            },
            [1]
          ),
        /TASA_TEMPORAL_SOLO_BASE_LOCAL_DE_PRUEBAS/
      )
      assert.equal(consultas, 1)
    }
  })
  console.log(
    `${total} guardas de tasa temporal aprobadas con mocks explícitos. Sin escrituras remotas.`
  )
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
