/* eslint-disable @typescript-eslint/no-require-imports -- Solo base PostgreSQL LOCAL nueva; nunca restablece bases. */
const path = require('node:path'),
  assert = require('node:assert/strict')
const { preparar, clave } = require('./validar-devb-saldos.cjs')
const { usuario } = require('./devd-catalogo-fixture.cjs')
async function main() {
  const cadena = process.env.QPASS_TEST_DATABASE_URL
  if (!cadena) {
    console.log(
      'SKIP: falta PostgreSQL local y QPASS_TEST_DATABASE_URL para una base NUEVA qpass_devb_test*. No se probaron carreras reales.'
    )
    return
  }
  const url = new URL(cadena)
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/qpass_devb_test\w*$/.test(url.pathname)
  )
    throw new Error('Solo loopback y base NUEVA qpass_devb_test*.')
  const { Client } = require(
    process.env.QPASS_PG_MODULE ||
      path.resolve('.next/devb-tools/node_modules/pg')
  )
  const principal = new Client({ connectionString: cadena }),
    a = new Client({ connectionString: cadena }),
    b = new Client({ connectionString: cadena })
  let total = 0
  const one = async (sql, args) => (await principal.query(sql, args)).rows[0]
  async function iniciar(c, n) {
    await c.query('begin')
    await c.query("set local statement_timeout='10s'")
    await c.query(
      `set local test.uid='${usuario(n)}';set local role authenticated`
    )
  }
  const esperar = (p) =>
    p.then(
      (value) => ({ value }),
      (error) => ({ error })
    )
  async function bloqueo(pid) {
    const fin = Date.now() + 5000
    while (Date.now() < fin) {
      if (
        (
          await one(
            'select wait_event_type from pg_stat_activity where pid=$1',
            [pid]
          )
        ).wait_event_type === 'Lock'
      )
        return
      await new Promise((r) => setTimeout(r, 20))
    }
    throw new Error('La segunda conexión no esperó un bloqueo real.')
  }
  const recarga = (c, n) =>
    c.query("select registrar_recarga(1,'QR-REGALO',10,$1) r", [clave(n)])
  const venta = (c, n) =>
    c.query(
      'select cobrar_venta(1,1,\'QR-REGALO\',\'[{"producto_id":1,"cantidad":2}]\',$1,2.5) r',
      [clave(n)]
    )
  const evidencias = async (n) => {
    const root = `${usuario(6)}/1/${clave(n)}`
    await principal.query(
      "insert into storage.objects values('devb-evidencias',$1),('devb-evidencias',$2)",
      [root + '/comprobante.jpg', root + '/foto.jpg']
    )
    return [root + '/comprobante.jpg', root + '/foto.jpg']
  }
  const devolucion = (c, n, puntos, files) =>
    c.query("select registrar_devolucion(1,'QR-REGALO',$1,$2,$3,$4) r", [
      puntos,
      ...files,
      clave(n)
    ])
  const caso = async (nombre, fn) => {
    try {
      await fn()
      total++
      console.log('PASS ' + nombre)
    } finally {
      await Promise.all([a.query('rollback'), b.query('rollback')])
    }
  }
  try {
    await Promise.all([principal.connect(), a.connect(), b.connect()])
    assert.equal(
      (
        await one(
          "select count(*)::int n from pg_tables where schemaname='public'"
        )
      ).n,
      0,
      'Base no vacía; no se borran objetos.'
    )
    const db = {
      exec: (s) => principal.query(s),
      query: (s, args) => principal.query(s, args)
    }
    await preparar(db)
    await principal.query(
      "insert into devb_conversion values(1,2.5,'Acuerdo ficticio solo de concurrencia',now())"
    )
    const pid = (await b.query('select pg_backend_pid() pid')).rows[0].pid
    await caso(
      'dos recargas iguales esperan idempotencia y acreditan una vez',
      async () => {
        await iniciar(a, 2)
        await iniciar(b, 2)
        const first = (await recarga(a, 101)).rows[0].r
        const pending = esperar(recarga(b, 101))
        await bloqueo(pid)
        await a.query('commit')
        const second = await pending
        assert.ifError(second.error)
        assert.deepEqual(second.value.rows[0].r, first)
        await b.query('commit')
        assert.equal(
          (await one('select saldo::text s from saldos_puntos')).s,
          '104.00'
        )
      }
    )
    await caso(
      'dos recargas distintas serializan saldo sin perder acreditaciones',
      async () => {
        await iniciar(a, 2)
        await iniciar(b, 2)
        await recarga(a, 102)
        const pending = esperar(recarga(b, 103))
        await bloqueo(pid)
        await a.query('commit')
        assert.ifError((await pending).error)
        await b.query('commit')
        assert.equal(
          (await one('select saldo::text s from saldos_puntos')).s,
          '112.00'
        )
      }
    )
    await caso(
      'recarga simultánea con venta conserva ambos movimientos',
      async () => {
        await iniciar(a, 2)
        await iniciar(b, 3)
        await recarga(a, 104)
        const pending = esperar(venta(b, 105))
        await bloqueo(pid)
        await a.query('commit')
        assert.ifError((await pending).error)
        await b.query('commit')
        assert.equal(
          (await one('select saldo::text s from saldos_puntos')).s,
          '113.50'
        )
      }
    )
    await caso(
      'venta simultánea con devolución conserva débitos y evidencias',
      async () => {
        const files = await evidencias(106)
        await iniciar(a, 3)
        await iniciar(b, 6)
        await venta(a, 107)
        const pending = esperar(devolucion(b, 106, 10, files))
        await bloqueo(pid)
        await a.query('commit')
        assert.ifError((await pending).error)
        await b.query('commit')
        assert.equal(
          (await one('select saldo::text s from saldos_puntos')).s,
          '101.00'
        )
      }
    )
    await caso(
      'reserva C simultánea impide gastar puntos por devolución presencial',
      async () => {
        await principal.query(
          "update eventos set fecha_fin=now()-interval '1 hour' where id=1;insert into devc_parametros values('plazo_devolucion_horas',72,now())"
        )
        const ruta = `${usuario(5)}/1/${clave(108)}.jpg`
        await principal.query(
          "insert into storage.objects values('devoluciones',$1)",
          [ruta]
        )
        const files = await evidencias(109)
        await iniciar(a, 5)
        await iniciar(b, 6)
        await a.query('select crear_solicitud_devolucion(1,100,$1)', [ruta])
        const pending = esperar(devolucion(b, 109, 2, files))
        await bloqueo(pid)
        await a.query('commit')
        const r = await pending
        assert.match(r.error?.message ?? '', /SALDO_INSUFICIENTE/)
        await b.query('rollback')
        assert.deepEqual(
          await one(
            'select saldo::text saldo,reservado::text reservado from saldos_puntos'
          ),
          { saldo: '101.00', reservado: '100.00' }
        )
      }
    )
    await caso(
      'dos liquidaciones virtuales esperan la misma solicitud y descuentan una vez',
      async () => {
        const { id } = await one(
          "select id from solicitudes_devolucion where estado='en_revision'"
        )
        await iniciar(a, 6)
        await iniciar(b, 6)
        const first = (
          await a.query('select liquidar_solicitud_devolucion($1) r', [id])
        ).rows[0].r
        const pending = esperar(
          b.query('select liquidar_solicitud_devolucion($1) r', [id])
        )
        await bloqueo(pid)
        await a.query('commit')
        const second = await pending
        assert.ifError(second.error)
        assert.deepEqual(second.value.rows[0].r, first)
        await b.query('commit')
        assert.deepEqual(
          await one(
            'select saldo::text saldo,reservado::text reservado from saldos_puntos'
          ),
          { saldo: '1.00', reservado: '0.00' }
        )
        assert.equal(
          (
            await one(
              'select count(*)::int n from devoluciones where solicitud_id=$1',
              [id]
            )
          ).n,
          1
        )
      }
    )
    console.log(
      `${total} carreras reales aprobadas en PostgreSQL local con espera de bloqueos observada. Base de prueba conservada.`
    )
  } finally {
    await Promise.allSettled([a.end(), b.end(), principal.end()])
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
