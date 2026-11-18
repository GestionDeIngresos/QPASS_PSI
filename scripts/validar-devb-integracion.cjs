/* eslint-disable @typescript-eslint/no-require-imports -- SQL real solo en PostgreSQL local o PGlite aislado. */
const path = require('node:path'),
  fs = require('node:fs'),
  assert = require('node:assert/strict')
const { preparar, clave } = require('./validar-devb-saldos.cjs')
const { usuario } = require('./devd-catalogo-fixture.cjs')
const {
  config,
  configurarConversionPrueba
} = require('./devb-config-pruebas.cjs')
async function main() {
  const postgres = process.argv.includes('--postgres')
  let db
  if (postgres) {
    const url = new URL(process.env.QPASS_TEST_DATABASE_URL || '')
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      !/^\/qpass_devb_test\w*$/.test(url.pathname)
    )
      throw new Error('Solo PostgreSQL local NUEVO qpass_devb_test*.')
    const { Client } = require(
      process.env.QPASS_PG_MODULE ||
        path.resolve('.next/devb-tools/node_modules/pg')
    )
    const c = new Client({ connectionString: url.href })
    await c.connect()
    db = {
      exec: (s) => c.query(s),
      query: (s, a) => c.query(s, a),
      close: () => c.end()
    }
    if (
      (
        await db.query(
          "select count(*)::int n from pg_tables where schemaname='public'"
        )
      ).rows[0].n
    ) {
      await db.close()
      throw new Error('Base no vacía. No se borra ni restablece.')
    }
  } else {
    const { PGlite } = require(
      process.env.QPASS_PGLITE_MODULE ||
        path.resolve('.next/devb-tools/node_modules/@electric-sql/pglite')
    )
    db = new PGlite()
  }
  let total = 0
  const test = async (n, f) => {
    await f()
    total++
    console.log('PASS ' + n)
  }
  const q = async (s, a) => (await db.query(s, a)).rows[0]
  const actor = async (n) =>
    db.exec(`reset role;set test.uid='${usuario(n)}';set role authenticated`)
  const admin = () => db.exec('reset role')
  const fail = (s, a, error) =>
    assert.rejects(
      () => db.query(s, a),
      (e) => e.message.includes(error)
    )
  const saldo = async () => {
    await admin()
    return q(
      'select saldo::text saldo,reservado::text reservado from saldos_puntos where usuario_id=$1 and evento_id=1',
      [usuario(7)]
    )
  }
  const recarga = () =>
    q("select registrar_recarga(1,'QR-INTEGRAL',50,$1) r", [clave(201)])
  const comprobante = `${usuario(6)}/1/${clave(202)}/comprobante.jpg`,
    foto = `${usuario(6)}/1/${clave(202)}/foto.jpg`
  const devolver = () =>
    q("select registrar_devolucion(1,'QR-INTEGRAL',20,$1,$2,$3) r", [
      comprobante,
      foto,
      clave(202)
    ])
  try {
    await preparar(db)
    await test('tasa temporal centralizada 1:1 no modifica saldos ni registros heredados', async () => {
      const antes = await q('select saldo::text saldo from saldos_puntos')
      await configurarConversionPrueba(db, [1])
      assert.equal(
        (await q('select bs_por_punto::text tasa from devb_conversion')).tasa,
        '1.000000'
      )
      assert.deepEqual(
        await q('select saldo::text saldo from saldos_puntos'),
        antes
      )
      assert.equal((await q('select count(*)::int n from recargas')).n, 0)
    })
    await db.query('insert into auth.users values($1,$2,$3)', [
      usuario(7),
      'integral@test.local',
      { nombre: 'Cliente integral', carnet_identidad: '7' }
    ])
    await db.query(
      "insert into entradas(compra_id,tipo_ticket_id,usuario_destino_id,codigo_qr,estado) values(1,1,$1,'QR-INTEGRAL','usada')",
      [usuario(7)]
    )
    await actor(2)
    await test('HU36 QR usado identifica sin consumir acceso y comienza sin saldo', async () => {
      const r = (
        await q("select consultar_saldo_staff(1,'QR-INTEGRAL','recargador') r")
      ).r
      assert.equal(r.disponible, '0')
      assert.equal(r.nombre, 'Cliente integral')
    })
    let recargaOriginal, devolucionOriginal, ventaOriginal
    await test('HU37 Bs 50 acreditan exactamente 50 puntos y guardan tasa histórica', async () => {
      recargaOriginal = (await recarga()).r
      assert.equal(recargaOriginal.puntos, '50.00')
      assert.equal(recargaOriginal.saldo, '50.00')
      await admin()
      assert.deepEqual(
        await q(
          'select monto::text monto,puntos::text puntos,tasa::text tasa from recargas'
        ),
        { monto: '50.00', puntos: '50.00', tasa: '1.000000' }
      )
    })
    await test('venta D consume 15 puntos del saldo recargado por B', async () => {
      await actor(3)
      ventaOriginal = (
        await q(
          `select cobrar_venta(1,1,'QR-INTEGRAL','[{"producto_id":1,"cantidad":12}]',$1,15) r`,
          [clave(203)]
        )
      ).r
      assert.equal(ventaOriginal.total, '15.00')
      assert.deepEqual(await saldo(), { saldo: '35.00', reservado: '0.00' })
    })
    await test('HU48 devolver 20 puntos registra Bs 20, comprobante y foto y deja 15 puntos', async () => {
      await actor(6)
      await db.query(
        "insert into storage.objects values('devb-evidencias',$1),('devb-evidencias',$2)",
        [comprobante, foto]
      )
      devolucionOriginal = (await devolver()).r
      assert.equal(devolucionOriginal.importe, '20.00')
      assert.equal(devolucionOriginal.saldo, '15.00')
      assert.deepEqual(await saldo(), { saldo: '15.00', reservado: '0.00' })
    })
    await test('repetir recarga y devolución devuelve originales sin alterar saldo final', async () => {
      await actor(2)
      assert.deepEqual((await recarga()).r, recargaOriginal)
      await actor(6)
      assert.deepEqual((await devolver()).r, devolucionOriginal)
      assert.deepEqual(await saldo(), { saldo: '15.00', reservado: '0.00' })
      assert.deepEqual(
        await q(
          'select (select count(*)::int from recargas) recargas,(select count(*)::int from devoluciones) devoluciones'
        ),
        { recargas: 1, devoluciones: 1 }
      )
    })
    await test('D también recupera su venta idempotente después de la devolución B', async () => {
      await actor(3)
      assert.deepEqual(
        (
          await q(
            `select cobrar_venta(1,1,'QR-INTEGRAL','[{"producto_id":1,"cantidad":12}]',$1,15) r`,
            [clave(203)]
          )
        ).r,
        ventaOriginal
      )
      assert.deepEqual(await saldo(), { saldo: '15.00', reservado: '0.00' })
    })
    await test('rechaza gasto mayor al disponible y no altera el saldo', async () => {
      await actor(3)
      await fail(
        `select cobrar_venta(1,1,'QR-INTEGRAL','[{"producto_id":1,"cantidad":13}]',$1,16.25)`,
        [clave(204)],
        'SALDO_INSUFICIENTE'
      )
      assert.deepEqual(await saldo(), { saldo: '15.00', reservado: '0.00' })
    })
    await test('HU38/49 historiales propios reflejan recarga 50 y devolución 20 con evidencias', async () => {
      await actor(2)
      assert.equal(
        (await q('select historial_recargas(1) r')).r[0].puntos,
        '50.00'
      )
      await actor(6)
      const fila = (await q('select historial_devoluciones(1) r')).r[0]
      assert.equal(fila.importe, '20.00')
      assert.equal(fila.comprobante, comprobante)
      assert.equal(fila.foto, foto)
    })
    await test('HU16 cliente solo lee su saldo final 15 por evento', async () => {
      await actor(7)
      const saldos = (await q('select consultar_mis_saldos() r')).r
      assert.equal(saldos.length, 1)
      assert.equal(saldos[0].eventoId, 1)
      assert.equal(saldos[0].disponible, '15.00')
    })
    let solicitud
    await test('C reserva 10 puntos y B/D respetan el disponible 5', async () => {
      await admin()
      await db.exec(
        `update eventos set fecha_fin=now()-interval '1 hour' where id=1;insert into devc_parametros values('plazo_devolucion_horas',${config.plazoHorasFixture},now())`
      )
      await actor(7)
      const ruta = `${usuario(7)}/1/${clave(205)}.jpg`
      await db.query("insert into storage.objects values('devoluciones',$1)", [
        ruta
      ])
      solicitud = (
        await q('select crear_solicitud_devolucion(1,10,$1) id', [ruta])
      ).id
      const s = (await q('select consultar_mis_saldos() r')).r[0]
      assert.equal(s.reservado, '10.00')
      assert.equal(s.disponible, '5.00')
      await admin()
      await db.exec(
        "update eventos set fecha_fin=now()+interval '1 day' where id=1"
      )
      await actor(3)
      await fail(
        `select cobrar_venta(1,1,'QR-INTEGRAL','[{"producto_id":2,"cantidad":1}]',$1,10)`,
        [clave(206)],
        'SALDO_INSUFICIENTE'
      )
    })
    await test('cancelar solicitud C libera reserva una vez sin descontar saldo', async () => {
      await actor(7)
      await q('select cancelar_solicitud_devolucion($1)', [solicitud])
      await q('select cancelar_solicitud_devolucion($1)', [solicitud])
      assert.deepEqual(await saldo(), { saldo: '15.00', reservado: '0.00' })
    })
    await test('ajuste y reporte conservan histórico y no usan la tasa actual para corregir', async () => {
      await actor(2)
      const id = recargaOriginal.id
      const reporte = (
        await q('select reportar_recarga($1,$2,$3) id', [
          id,
          'Verificar importe de prueba',
          clave(207)
        ])
      ).id
      assert.equal(
        (await q('select mis_reportes_recarga() r')).r[0].estado,
        'pendiente'
      )
      await actor(1)
      await q("select resolver_reporte_admin('recarga',$1)", [reporte])
      await actor(2)
      assert.equal(
        (await q('select mis_reportes_recarga() r')).r[0].estado,
        'solucionado'
      )
      await admin()
      await db.exec(
        'update devb_conversion set bs_por_punto=2 where evento_id=1'
      )
      await actor(2)
      const ajuste = (
        await q('select ajustar_recarga($1,55,$2,$3) r', [
          id,
          'Corrección explícita de prueba',
          clave(208)
        ])
      ).r
      assert.equal(ajuste.puntos, '5.00')
      assert.equal(ajuste.saldo, '20.00')
      await admin()
      assert.equal((await q('select tasa::text t from recargas')).t, '1.000000')
    })
    await test('configuración temporal no sobrescribe una tasa ya configurada', async () => {
      await admin()
      await assert.rejects(
        () => configurarConversionPrueba(db, [1]),
        /CONFIGURACION_EXISTENTE_NO_SE_SOBRESCRIBE/
      )
    })
    await test('verificación SQL posterior conserva invariantes y permisos', async () => {
      const r = await db.exec(
        fs.readFileSync('supabase/verificacion_devb_saldos.sql', 'utf8')
      )
      for (const result of Array.isArray(r) ? r : [r])
        for (const fila of result.rows ?? [])
          if ('correcto' in fila) assert.equal(fila.correcto, true, fila.prueba)
    })
    console.log(
      `${total} pruebas de integración de saldo 1:1 aprobadas en ${postgres ? 'PostgreSQL local REAL' : 'PGlite aislado'}. No se probó Supabase remoto ni Storage API.`
    )
  } finally {
    await db.close()
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
