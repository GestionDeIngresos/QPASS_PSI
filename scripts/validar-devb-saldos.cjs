/* eslint-disable @typescript-eslint/no-require-imports -- SQL aislado con fixtures; nunca Supabase remoto. */
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const {
  recrearCatalogo,
  sembrar,
  usuario,
  migraciones
} = require('./devd-catalogo-fixture.cjs')

async function preparar(db) {
  await recrearCatalogo(db)
  await sembrar(db)
  for (const m of migraciones)
    await db.exec(fs.readFileSync('supabase/migrations/' + m, 'utf8'))
  await db.exec(`create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;
    update usuarios set rol='recargador' where id='${usuario(2)}';
    update usuarios set rol='devolucion' where id='${usuario(6)}';
    insert into asignaciones_staff(usuario_id,evento_id,rol_staff) values
      ('${usuario(2)}',1,'recargador'),('${usuario(6)}',1,'devolucion');
    insert into negocios_eventos(negocio_id,evento_id,activo) values(1,1,true),(2,1,true);`)
  await db.exec(
    fs.readFileSync('supabase/sprint3_devC_devoluciones.sql', 'utf8')
  )
  await db.exec(
    fs.readFileSync('supabase/migrations/202611170001_devb_saldos.sql', 'utf8')
  )
}
const clave = (n) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
async function main() {
  let db, pg
  const postgres = process.argv.includes('--postgres')
  if (postgres) {
    const url = new URL(process.env.QPASS_TEST_DATABASE_URL || '')
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/qpass_devb_test\w*$/.test(url.pathname)
    )
      throw new Error('Solo base local NUEVA qpass_devb_test*.')
    const { Client } = require(process.env.QPASS_PG_MODULE || 'pg')
    pg = new Client({ connectionString: url.href })
    await pg.connect()
    if (
      (
        await pg.query(
          "select count(*)::int n from pg_tables where schemaname='public'"
        )
      ).rows[0].n
    )
      throw new Error('Base no vacía. No se borra ningún objeto.')
    db = {
      exec: (s) => pg.query(s),
      query: (s, a) => pg.query(s, a),
      close: () => pg.end()
    }
  } else {
    const modulePath =
      process.env.QPASS_PGLITE_MODULE ||
      path.resolve('.next/devb-tools/node_modules/@electric-sql/pglite')
    const { PGlite } = require(modulePath)
    db = new PGlite()
  }
  let total = 0
  const test = async (nombre, fn) => {
    await fn()
    total++
    console.log('PASS ' + nombre)
  }
  const actor = async (n) =>
    db.exec(
      `reset role; set test.uid='${n ? usuario(n) : ''}'; set role ${n ? 'authenticated' : 'anon'}`
    )
  const admin = async () => db.exec('reset role')
  const q = async (sql, args) => (await db.query(sql, args)).rows[0]
  const fallo = (sql, args, code) =>
    assert.rejects(
      () => db.query(sql, args),
      (e) => e.message.includes(code)
    )
  const recargar = (n, monto = '10.00', codigo = 'QR-REGALO', evento = 1) =>
    q('select registrar_recarga($1,$2,$3,$4) r', [
      evento,
      codigo,
      monto,
      clave(n)
    ])
  const evidencias = async (n) => {
    const prefix = `${usuario(6)}/1/${clave(n)}`
    await db.query(
      "insert into storage.objects(bucket_id,name) values('devb-evidencias',$1),('devb-evidencias',$2)",
      [prefix + '/comprobante.jpg', prefix + '/foto.jpg']
    )
    return [prefix + '/comprobante.jpg', prefix + '/foto.jpg']
  }
  const devolver = (n, puntos, files, codigo = 'QR-REGALO') =>
    q('select registrar_devolucion(1,$1,$2,$3,$4,$5) r', [
      codigo,
      puntos,
      ...files,
      clave(n)
    ])
  try {
    await preparar(db)
    await test('migración conserva saldo único total y reservas D, sin tasa inventada', async () => {
      assert.equal(
        (await q('select count(*)::int n from devb_conversion')).n,
        0
      )
      assert.deepEqual(
        await q(
          'select saldo::text saldo,reservado::text reservado from saldos_puntos'
        ),
        { saldo: '100.00', reservado: '0.00' }
      )
    })
    await actor(2)
    await test('recarga sin tasa falla sin escribir histórico ni saldo', async () => {
      await fallo(
        'select registrar_recarga(1,$1,10,$2)',
        ['QR-REGALO', clave(1)],
        'CONVERSION_NO_CONFIGURADA'
      )
      await admin()
      assert.equal((await q('select count(*)::int n from recargas')).n, 0)
      await actor(2)
    })
    await admin()
    await db.exec(
      "insert into devb_conversion values(1,2.5,'Acuerdo ficticio exclusivo de prueba',now())"
    )
    await actor(2)
    await test('QR usado identifica y recarga exacta simulada es atómica', async () => {
      const { r } = await recargar(1)
      assert.equal(r.puntos, '4.00')
      assert.equal(r.saldo, '104.00')
      assert.equal(r.simulada, true)
    })
    await test('reintento recupera respuesta y payload distinto se rechaza', async () => {
      assert.deepEqual((await recargar(1)).r, (await recargar(1)).r)
      await fallo(
        'select registrar_recarga(1,$1,20,$2)',
        ['QR-REGALO', clave(1)],
        'SOLICITUD_REUTILIZADA'
      )
    })
    await test('QR ajeno, inválido o sin pago no recarga', async () => {
      for (const c of ['NO-EXISTE', 'QR-OTRO', 'QR-PENDIENTE'])
        await fallo(
          'select registrar_recarga(1,$1,10,$2)',
          [c, clave(2)],
          c === 'QR-PENDIENTE'
            ? 'IDENTIFICACION_INVALIDA'
            : 'QR_NO_VALIDO_PARA_EVENTO'
        )
      await fallo(
        'select registrar_recarga(2,$1,10,$2)',
        ['QR-OTRO', clave(2)],
        'SIN_PERMISOS'
      )
    })
    await test('precisión, NaN, negativos y conversión inexacta no redondean silenciosamente', async () => {
      for (const monto of ['NaN', '-1', '0', '1.001'])
        await fallo(
          'select registrar_recarga(1,$1,$2,$3)',
          ['QR-REGALO', monto, clave(2)],
          'DATOS_INVALIDOS'
        )
      await fallo(
        'select registrar_recarga(1,$1,0.01,$2)',
        ['QR-REGALO', clave(2)],
        'CONVERSION_INEXACTA'
      )
    })
    await test('ajuste explícito deja recarga original intacta y audita delta', async () => {
      const recarga = (await recargar(1)).r.id
      const { r } = await q('select ajustar_recarga($1,5,$2,$3) r', [
        recarga,
        'Importe corregido por error',
        clave(3)
      ])
      assert.equal(r.puntos, '-2.00')
      assert.equal(r.saldo, '102.00')
      assert.equal(
        (
          await q('select ajustar_recarga($1,5,$2,$3) r', [
            recarga,
            'Importe corregido por error',
            clave(3)
          ])
        ).r.saldo,
        '102.00'
      )
      await admin()
      assert.equal(
        (
          await q('select monto::text monto from recargas where id=$1', [
            recarga
          ])
        ).monto,
        '10.00'
      )
      await actor(2)
    })
    await test('reporte idempotente entra a administración; resolver no modifica saldo', async () => {
      const id = (await recargar(1)).r.id
      const a = await q('select reportar_recarga($1,$2,$3) id', [
        id,
        'Revisar importe registrado',
        clave(4)
      ])
      assert.equal(
        (
          await q('select reportar_recarga($1,$2,$3) id', [
            id,
            'Revisar importe registrado',
            clave(4)
          ])
        ).id,
        a.id
      )
      assert.equal(
        (await q('select mis_reportes_recarga() r')).r[0].estado,
        'pendiente'
      )
      await actor(1)
      assert.ok(
        (
          await db.query("select * from listar_reportes_admin('recarga','','')")
        ).rows.some((r) => r.id === a.id)
      )
      await q("select resolver_reporte_admin('recarga',$1)", [a.id])
      await actor(2)
      assert.equal(
        (await q('select mis_reportes_recarga() r')).r[0].estado,
        'solucionado'
      )
      await admin()
      assert.equal(
        (await q('select saldo::text s from saldos_puntos')).s,
        '102.00'
      )
      await actor(2)
    })
    await test('recargador no puede devolver ni leer evidencias de devoluciones', async () => {
      await fallo(
        'select registrar_devolucion(1,$1,1,$2,$3,$4)',
        ['QR-REGALO', 'x', 'y', clave(5)],
        'SIN_PERMISOS'
      )
      await fallo(
        "insert into storage.objects values('devb-evidencias',$1)",
        [`${usuario(2)}/1/${clave(5)}/foto.jpg`],
        'row-level security'
      )
    })
    await actor(6)
    await test('encargado identifica QR usado; evento ajeno y recarga denegados', async () => {
      assert.equal(
        (await q("select consultar_saldo_staff(1,'QR-REGALO','devolucion') r"))
          .r.disponible,
        '102.00'
      )
      await fallo(
        "select consultar_saldo_staff(2,'QR-OTRO','devolucion')",
        [],
        'SIN_PERMISOS'
      )
      await fallo(
        'select registrar_recarga(1,$1,10,$2)',
        ['QR-REGALO', clave(5)],
        'SIN_PERMISOS'
      )
    })
    const files = await evidencias(6)
    await test('evidencias faltantes, ajenas y saldo insuficiente no liquidan', async () => {
      await fallo(
        'select registrar_devolucion(1,$1,1,$2,$3,$4)',
        ['QR-REGALO', 'x', files[1], clave(6)],
        'EVIDENCIA_INVALIDA'
      )
      await fallo(
        'select registrar_devolucion(1,$1,103,$2,$3,$4)',
        ['QR-REGALO', ...files, clave(6)],
        'SALDO_INSUFICIENTE'
      )
    })
    await test('presencial descuenta una vez y conserva comprobante/foto privados', async () => {
      const a = (await devolver(6, '2', files)).r
      assert.equal(a.saldo, '100.00')
      assert.equal(a.importe, '5.00')
      assert.deepEqual((await devolver(6, '2', files)).r, a)
      const h = (await q('select historial_devoluciones(1) r')).r
      assert.equal(h[0].foto, files[1])
      assert.equal(h[0].comprobante, files[0])
    })
    await admin()
    await db.exec(
      `insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url) values('${usuario(5)}',1,90,'fixture/qr')`
    )
    await actor(6)
    const files2 = await evidencias(7)
    await test('reserva virtual impide presencial y venta; corrección no consume reservas', async () => {
      await fallo(
        'select registrar_devolucion(1,$1,11,$2,$3,$4)',
        ['QR-REGALO', ...files2, clave(7)],
        'SALDO_INSUFICIENTE'
      )
      await actor(3)
      await fallo(
        'select cobrar_venta(1,1,\'QR-REGALO\',\'[{"producto_id":2,"cantidad":2}]\',$1,20)',
        [clave(8)],
        'SALDO_INSUFICIENTE'
      )
      await admin()
      await db.exec(
        'update solicitudes_devolucion set monto_solicitado=99 where id=1'
      )
      await actor(2)
      await fallo(
        'select ajustar_recarga(1,0,$1,$2)',
        ['Anulación con saldo reservado', clave(9)],
        'SALDO_CONSUMIDO_O_RESERVADO'
      )
      await admin()
      await db.exec(
        'update solicitudes_devolucion set monto_solicitado=90 where id=1'
      )
    })
    await actor(6)
    await test('liquidación virtual libera reserva y debita exactamente una vez', async () => {
      const a = (await q('select liquidar_solicitud_devolucion(1) r')).r
      assert.equal(a.saldo, '10.00')
      assert.deepEqual(
        (await q('select liquidar_solicitud_devolucion(1) r')).r,
        a
      )
      await admin()
      assert.deepEqual(
        await q(
          'select saldo::text saldo,reservado::text reservado from saldos_puntos'
        ),
        { saldo: '10.00', reservado: '0.00' }
      )
      assert.equal(
        (
          await q(
            'select count(*)::int n from devoluciones where solicitud_id=1'
          )
        ).n,
        1
      )
      await actor(6)
      await fallo(
        'select rechazar_solicitud_devolucion(1)',
        [],
        'SOLICITUD_YA_PROCESADA'
      )
    })
    await test('venta D usa disponible después de recarga y liquidación B', async () => {
      await actor(3)
      const r = await q(
        'select cobrar_venta(1,1,\'QR-REGALO\',\'[{"producto_id":1,"cantidad":2}]\',$1,2.5) r',
        [clave(10)]
      )
      assert.equal(r.r.total, '2.50')
      await actor(2)
      assert.equal((await recargar(11)).r.saldo, '11.50')
    })
    await test('ajuste hacia abajo con saldo consumido es rechazado', async () => {
      await actor(3)
      await q(
        'select cobrar_venta(1,1,\'QR-REGALO\',\'[{"producto_id":2,"cantidad":1}]\',$1,10)',
        [clave(12)]
      )
      await actor(2)
      await fallo(
        'select ajustar_recarga(1,0,$1,$2)',
        ['Saldo utilizado en venta', clave(13)],
        'SALDO_CONSUMIDO_O_RESERVADO'
      )
    })
    await actor(5)
    await test('cliente consulta solo sus saldos, no registros financieros ni helper interno', async () => {
      assert.equal(
        (await q('select consultar_mis_saldos() r')).r[0].disponible,
        '1.50'
      )
      await fallo('select * from recargas', [], 'permission denied')
      await fallo('select devb_tasa(1)', [], 'permission denied')
      await fallo('update saldos_puntos set saldo=999', [], 'permission denied')
    })
    await admin()
    await db.exec(`insert into lotes_qr_fisico(evento_id,cantidad,generado_por) values(1,1,'${usuario(1)}');
      insert into vinculos_qr_fisico(lote_id,codigo_qr,usuario_id,entrada_id) values(1,'FISICO-PERDIDO','${usuario(5)}',1);`)
    await actor(4)
    await test('cliente ajeno no identifica propietario físico; personal recibe DTO limitado', async () => {
      assert.equal(
        (await q("select consultar_ticket_extraviado('FISICO-PERDIDO',1) r")).r,
        null
      )
      await actor(5)
      const propio = (
        await q("select consultar_ticket_extraviado('FISICO-PERDIDO',1) r")
      ).r
      assert.equal(propio.propio, true)
      assert.equal(propio.nombre, undefined)
      await actor(2)
      const staff = (
        await q("select consultar_ticket_extraviado('FISICO-PERDIDO',1) r")
      ).r
      assert.equal(staff.nombre, 'Prueba 5')
      assert.equal(staff.usuarioId, undefined)
      assert.equal(staff.correo, undefined)
    })
    await test('históricos financieros inmutables incluso ante escritura privilegiada accidental', async () => {
      await admin()
      await fallo(
        'update recargas set monto=1 where id=1',
        [],
        'HISTORICO_FINANCIERO_INMUTABLE'
      )
      await fallo(
        'delete from devoluciones where solicitud_id=1',
        [],
        'HISTORICO_FINANCIERO_INMUTABLE'
      )
      await fallo(
        'update devb_movimientos set delta=0',
        [],
        'HISTORICO_FINANCIERO_INMUTABLE'
      )
    })
    await test('crear solicitud C conserva plazo, valida propiedad y es idempotente por ruta', async () => {
      await admin()
      await db.exec(
        "update eventos set fecha_fin=now()-interval '1 hour' where id=1"
      )
      await actor(5)
      const ruta = `${usuario(5)}/1/${clave(20)}.jpg`
      await db.query("insert into storage.objects values('devoluciones',$1)", [
        ruta
      ])
      await fallo(
        'select crear_solicitud_devolucion(1,1,$1)',
        [ruta],
        'PLAZO_NO_CONFIGURADO'
      )
      await admin()
      await db.exec(
        "insert into devc_parametros(clave,valor) values('plazo_devolucion_horas',72)"
      )
      await actor(5)
      const s = await q('select crear_solicitud_devolucion(1,1,$1) id', [ruta])
      assert.equal(
        (await q('select crear_solicitud_devolucion(1,1,$1) id', [ruta])).id,
        s.id
      )
      await fallo(
        'select crear_solicitud_devolucion(1,1.1,$1)',
        [ruta],
        'SOLICITUD_REUTILIZADA'
      )
      await actor(4)
      await fallo(
        'select crear_solicitud_devolucion(1,1,$1)',
        [ruta],
        'QR_INVALIDO'
      )
      await actor(5)
    })
    await test('cancelar una solicitud propia libera reserva una vez sin reabrirla', async () => {
      await actor(5)
      const ss = (await q('select devc_mis_solicitudes_devolucion() r')).r
      const s = ss.find((s) => s.estado === 'en_revision')
      assert.ok(s)
      await q('select cancelar_solicitud_devolucion($1)', [s.id])
      await q('select cancelar_solicitud_devolucion($1)', [s.id])
      await admin()
      assert.equal(
        (await q('select reservado::text r from saldos_puntos')).r,
        '0.00'
      )
      await fallo(
        "update solicitudes_devolucion set estado='en_revision' where id=$1",
        [s.id],
        'SOLICITUD_YA_PROCESADA'
      )
    })
    await test('rechazo C libera reservas y no altera saldo ni cierra otras solicitudes', async () => {
      await actor(5)
      const ruta = `${usuario(5)}/1/${clave(21)}.jpg`
      await db.query("insert into storage.objects values('devoluciones',$1)", [
        ruta
      ])
      const { id } = await q('select crear_solicitud_devolucion(1,1,$1) id', [
        ruta
      ])
      await actor(6)
      await q('select rechazar_solicitud_devolucion($1)', [id])
      await q('select rechazar_solicitud_devolucion($1)', [id])
      await admin()
      assert.deepEqual(
        await q(
          'select saldo::text saldo,reservado::text reservado from saldos_puntos'
        ),
        { saldo: '1.50', reservado: '0.00' }
      )
    })
    await test('Storage limita carpetas, evento y operador; otra cuenta no lee evidencias', async () => {
      await actor(6)
      await fallo(
        "insert into storage.objects values('devb-evidencias',$1)",
        [`${usuario(6)}/2/${clave(22)}/foto.jpg`],
        'row-level security'
      )
      await fallo(
        "insert into storage.objects values('devb-evidencias',$1)",
        [`${usuario(2)}/1/${clave(22)}/foto.jpg`],
        'row-level security'
      )
      await actor(2)
      assert.equal(
        (
          await q(
            "select count(*)::int n from storage.objects where bucket_id='devb-evidencias'"
          )
        ).n,
        0
      )
      await actor(6)
      assert.equal(
        (
          await q(
            "select count(*)::int n from storage.objects where bucket_id='devb-evidencias'"
          )
        ).n,
        4
      )
    })
    await test('otro recargador del mismo evento no ajusta ni reporta recargas ajenas', async () => {
      await admin()
      await db.exec(`update usuarios set rol='recargador' where id='${usuario(4)}';
        update asignaciones_staff set rol_staff='recargador' where usuario_id='${usuario(4)}'`)
      await actor(4)
      assert.equal((await q('select historial_recargas(1) r')).r.length, 0)
      await fallo(
        'select ajustar_recarga(1,0,$1,$2)',
        ['Ajuste no autorizado', clave(24)],
        'SIN_PERMISOS'
      )
      await fallo(
        'select reportar_recarga(1,$1,$2)',
        ['Reporte no autorizado', clave(25)],
        'SIN_PERMISOS'
      )
    })
    await test('fallo tras débito revierte saldo, devolución e idempotencia; mismo intento puede completarse', async () => {
      await admin()
      const antes = await q(
        'select saldo::text saldo,(select count(*)::int from devoluciones) cantidad from saldos_puntos'
      )
      await db.exec(`create function public.fixture_devb_fallo() returns trigger language plpgsql as $$begin
        if current_setting('test.devb_fallo',true)='on' then raise exception 'FALLO_MOVIMIENTO'; end if; return new; end $$;
        create trigger fixture_devb_fallo before insert on public.devb_movimientos for each row execute function public.fixture_devb_fallo();`)
      await actor(6)
      const files = await evidencias(23)
      await db.exec("set test.devb_fallo='on'")
      await fallo(
        'select registrar_devolucion(1,$1,0.5,$2,$3,$4)',
        ['QR-REGALO', ...files, clave(23)],
        'FALLO_MOVIMIENTO'
      )
      await db.exec("set test.devb_fallo='off'")
      await admin()
      assert.deepEqual(
        await q(
          'select saldo::text saldo,(select count(*)::int from devoluciones) cantidad from saldos_puntos'
        ),
        antes
      )
      await actor(6)
      assert.equal((await devolver(23, '0.5', files)).r.saldo, '1.00')
    })
    await actor(0)
    await test('anon denegado y cuentas inactivas no operan', async () => {
      await fallo('select consultar_mis_saldos()', [], 'permission denied')
      await admin()
      await db.exec(`update usuarios set activo=false where id='${usuario(2)}'`)
      await actor(2)
      await fallo('select devb_eventos($1)', ['recargador'], 'SIN_PERMISOS')
      await fallo(
        'select registrar_recarga(1,$1,10,$2)',
        ['QR-REGALO', clave(1)],
        'SIN_PERMISOS'
      )
    })
    await test('comprobación posterior de solo lectura confirma invariantes y ACL', async () => {
      await admin()
      const resultados = await db.exec(
        fs.readFileSync('supabase/verificacion_devb_saldos.sql', 'utf8')
      )
      for (const r of Array.isArray(resultados) ? resultados : [resultados])
        for (const fila of r.rows ?? [])
          if ('correcto' in fila) assert.equal(fila.correcto, true, fila.prueba)
    })
    console.log(
      `${total} pruebas SQL Dev B aprobadas (${postgres ? 'PostgreSQL local' : 'PGlite aislado'}). Sin conexión a Supabase.`
    )
  } finally {
    await db.close()
  }
}
module.exports = { preparar, clave }
if (require.main === module)
  main().catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
