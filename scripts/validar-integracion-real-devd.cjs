/* eslint-disable @typescript-eslint/no-require-imports -- Pruebas SQL sobre catálogo real con filas ficticias. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const catalogo = require('../docs/integracion-supabase/qpass_catalogo_supabase_2026-11-16.json');
const { recrearCatalogo, sembrar, usuario, migraciones } = require('./devd-catalogo-fixture.cjs');
async function main() {
  let db;
  const postgres = process.argv.includes('--postgres');
  if (postgres) {
    const url = new URL(process.env.QPASS_TEST_DATABASE_URL || '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/qpass_devd_test\w*$/.test(url.pathname)) throw new Error('Solo base nueva qpass_devd_test* en loopback.');
    const { Client } = require(process.env.QPASS_PG_MODULE || 'pg');
    const cliente = new Client({ connectionString: url.href }); await cliente.connect();
    const filas = await cliente.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    if (filas.rows[0].n !== 0) { await cliente.end(); throw new Error('Base de prueba no vacía; no se borran objetos.'); }
    db = { exec: sql => cliente.query(sql), query: (sql, args) => cliente.query(sql, args), close: () => cliente.end() };
  } else {
    const { PGlite } = require(process.env.QPASS_PGLITE_MODULE || '@electric-sql/pglite');
    db = new PGlite();
  }
  let total = 0;
  const q = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const uid = async n => db.exec(`reset role; set test.uid='${n ? usuario(n) : ''}'; set role ${n ? 'authenticated' : 'anon'}`);
  const admin = async () => db.exec('reset role');
  const fallo = async (sql, args, codigo) => assert.rejects(() => db.query(sql, args), e => e.message.includes(codigo));
  const prueba = async (nombre, fn) => { await fn(); total++; console.log(`PASS ${nombre}`); };
  const solicitud = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const lineas = [{ producto_id: 1, cantidad: 2 }];
  const cobrar = (n = 1, ls = lineas, esperado = '2.50', qr = 'QR-REGALO', negocio = 1) => q('select cobrar_venta(1,$1,$2,$3,$4,$5) as venta', [negocio, qr, JSON.stringify(ls), solicitud(n), esperado]);
  try {
    await recrearCatalogo(db); await sembrar(db);
    await prueba('catálogo completo reconstruido: funciones, RLS, ACL, índices y triggers', async () => {
      assert.equal((await q("select count(*)::int as n from pg_policies where schemaname='public'")).n, 27);
    });
    for (const m of migraciones) await db.exec(fs.readFileSync(`supabase/migrations/${m}`, 'utf8'));
    await prueba('migraciones 000..004 compilan y conservan datos previos', async () => {
      assert.equal((await q('select count(*)::int n from entradas')).n, 3);
    });
    await prueba('comprador sin QR directo y resumen sin QR, destino ni precio actual', async () => {
      await uid(2);
      assert.equal((await q('select count(*)::int n from entradas')).n, 0);
      const r = (await q("select consultar_compra_propia('1') c")).c;
      assert.equal(r.entradas.length, 2); assert.equal(r.para_terceros, true);
      assert.doesNotMatch(JSON.stringify(r), /QR-REGALO|codigo_qr|usuario_destino_id/);
      assert.equal(r.entradas[0].tipo_ticket.precio, null);
    });
    await prueba('destinatario sí lee su QR, otro usuario no lee compra', async () => {
      await uid(5); assert.equal((await q("select codigo_qr from entradas where id=1")).codigo_qr, 'QR-REGALO');
      assert.equal((await q("select consultar_compra_propia('1') c")).c, null);
    });
    await prueba('comprador/destinatario crean reportes idempotentes; cada uno lee los propios', async () => {
      for (const n of [2, 5]) {
        await uid(n);
        const args = [1, 'Problema de prueba', solicitud(n)];
        const r = await q('select reportar_entrada_propia($1,$2,$3) id', args);
        assert.equal((await q('select reportar_entrada_propia($1,$2,$3) id', args)).id, r.id);
        await fallo('select reportar_entrada_propia($1,$2,$3)', [1, 'Otro problema', solicitud(n)], 'SOLICITUD_REUTILIZADA');
        const datos = (await q('select consultar_mis_reportes_entrada() datos')).datos;
        assert.equal(datos.reportes.length, 1); assert.doesNotMatch(JSON.stringify(datos), /codigo_qr|QR-REGALO/);
      }
      await uid(6); await fallo('select reportar_entrada_propia(1,$1,$2)', ['No autorizado', solicitud(6)], 'ENTRADA_NO_AUTORIZADA');
    });
    await prueba('resolución Admin A preservada y QR/estado sin cambios', async () => {
      await uid(1); assert.equal((await q("select resolver_reporte_admin('entrada',1) ok")).ok, true);
      assert.equal((await q("select count(*)::int n from listar_reportes_admin('entrada','','')")).n, 2);
      await uid(2); assert.equal((await q('select consultar_mis_reportes_entrada() d')).d.reportes[0].estado, 'solucionado');
      await admin(); assert.equal((await q('select estado from entradas where id=1')).estado, 'usada');
    });
    await prueba('contratos originales de A conservan EXECUTE', async () => {
      const r = await q("select has_function_privilege('authenticated','public.comprar_entradas_prueba(text,jsonb,text,uuid,text)','EXECUTE') ok");
      assert.equal(r.ok, true);
      for (const f of catalogo.funciones) {
        const real = await q("select pg_get_functiondef(p.oid) definicion from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1", [f.nombre]);
        const normalizar = texto => texto.replace(/\s+/g, ' ').trim();
        assert.equal(normalizar(real.definicion), normalizar(f.definicion), `Cuerpo existente modificado: ${f.nombre}`);
      }
    });
    await prueba('sin habilitación explícita no hay catálogo vendible ni cobro', async () => {
      await uid(3); assert.equal((await q('select consultar_catalogo_ayudante(1) c')).c.negocios.length, 0);
      await assert.rejects(() => cobrar(), /NEGOCIO_NO_AUTORIZADO/);
      await admin(); await db.exec('insert into negocios_eventos(negocio_id,evento_id,activo) values(1,1,true),(2,1,true)');
    });
    await prueba('catálogo autorizado y precios decimales textuales', async () => {
      await uid(3); const c = (await q('select consultar_catalogo_ayudante(1) c')).c;
      assert.equal(c.negocios.length, 2); assert.equal(c.productos[0].precioEnPuntos, '1.25');
      await uid(4); assert.equal((await q('select consultar_catalogo_ayudante(1) c')).c.negocios.length, 1);
    });
    await prueba('reservar bloquea gastable; aprobar conserva reserva', async () => {
      await admin(); await db.exec(`insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url) values('${usuario(5)}',1,90,'fixture/qr')`);
      await uid(3); const s = (await q("select consultar_saldo_venta(1,1,'QR-REGALO') s")).s;
      assert.equal(s.gastable, '10.00');
      await admin(); await db.exec("update solicitudes_devolucion set estado='aprobada' where id=1");
      assert.equal((await q('select reservado::text r from saldos_puntos')).r, '90.00');
    });
    let venta;
    await prueba('QR usada válida; venta/líneas/débito atómicos y precios de servidor', async () => {
      await uid(3); venta = (await cobrar()).venta;
      assert.equal(venta.total, '2.50'); assert.equal(venta.items[0].precioUnitarioHistorico, '1.25');
      assert.equal(venta.ayudanteId, usuario(3)); assert.doesNotMatch(JSON.stringify(venta), /QR-REGALO|cliente_id|qr_sha256/);
      await admin(); assert.equal((await q('select saldo::text s from saldos_puntos')).s, '97.50');
    });
    await prueba('reintento tras cambio de precios devuelve exactamente la respuesta persistida', async () => {
      await admin(); await db.exec('update productos set precio=8, nombre=\'Nuevo\' where id=1');
      await uid(3); assert.deepEqual((await cobrar()).venta, venta);
      await assert.rejects(() => cobrar(1, [{ producto_id: 1, cantidad: 1 }], '1.25'), /SOLICITUD_REUTILIZADA/);
      await assert.rejects(() => cobrar(1, [{ producto_id: 3, cantidad: 1 }], '5', 'QR-REGALO', 2), /SOLICITUD_REUTILIZADA/);
    });
    await prueba('saldo reservado impide venta aunque saldo total alcance', async () => {
      await assert.rejects(() => cobrar(7, lineas, '16'), /SALDO_INSUFICIENTE/);
      await admin(); assert.equal((await q('select count(*)::int n from ventas')).n, 1);
    });
    await prueba('precio cambiado, producto ajeno y payload manipulados se rechazan', async () => {
      await uid(3);
      await assert.rejects(() => cobrar(8), /PRECIO_CAMBIO/);
      await assert.rejects(() => cobrar(9, [{ producto_id: 3, cantidad: 1 }], '5'), /PRODUCTO_NO_DISPONIBLE/);
      await assert.rejects(() => cobrar(10, [{ producto_id: 1, cantidad: 1, precio: 0 }], '0'), /LINEAS_INVALIDAS/);
      await assert.rejects(() => cobrar(11, [{ producto_id: 1, cantidad: 0 }], '0'), /LINEAS_INVALIDAS/);
      await assert.rejects(() => cobrar(12, [lineas[0], lineas[0]], '32'), /PRODUCTO_REPETIDO/);
    });
    await prueba('QR pendiente, ajeno a evento o anulado no permite cobrar', async () => {
      await assert.rejects(() => cobrar(13, lineas, '16', 'QR-PENDIENTE'), /QR_NO_VALIDO_PARA_VENTA/);
      await assert.rejects(() => cobrar(14, lineas, '16', 'QR-OTRO'), /QR_NO_VALIDO_PARA_EVENTO/);
      await admin(); await db.exec("update entradas set estado='anulada' where id=1"); await uid(3);
      await assert.rejects(() => cobrar(15, lineas, '16'), /QR_NO_VALIDO_PARA_VENTA/);
      assert.deepEqual((await cobrar()).venta, venta); // respuesta perdida no depende de un QR ahora anulado
      await admin(); await db.exec("update entradas set estado='usada' where id=1");
    });
    await prueba('historial/detalle/resumen propios y precios históricos inmutables', async () => {
      await uid(3);
      assert.deepEqual((await q('select consultar_detalle_venta(1,$1) v', [Number(venta.id)])).v, venta);
      assert.equal((await q('select consultar_resumen_ventas(1) r')).r.puntosCobrados, '2.50');
      const h = (await q("select consultar_historial_ventas(1,null,null,null,'',null,1) h")).h;
      assert.deepEqual(h.ventas[0], venta); assert.equal(h.siguienteCursor, null);
      await uid(4); assert.equal((await q('select consultar_detalle_venta(1,$1) v', [Number(venta.id)])).v, null);
      assert.equal((await q('select consultar_resumen_ventas(1) r')).r.cantidadConfirmadas, 0);
    });
    await prueba('escrituras directas y helpers privados denegados incluso con defaults amplios', async () => {
      for (const tabla of ['ventas', 'venta_items', 'saldos_puntos', 'solicitudes_devolucion']) await fallo(`select * from ${tabla}`, [], 'permission denied');
      await fallo('select devd_venta_dto(1)', [], 'permission denied');
      await fallo('update productos set precio=0 where id=1', [], 'permission denied');
      await uid(0); await fallo('select consultar_catalogo_ayudante(1)', [], 'permission denied');
    });
    await prueba('una política permisiva adicional no expone QR al comprador', async () => {
      await admin(); await db.exec('create policy fixture_permisiva on entradas for select to authenticated using(true)');
      await uid(2); assert.equal((await q('select count(*)::int n from entradas')).n, 0);
    });
    await prueba('cuenta o asignación desactivada impide cobrar y leer ventas', async () => {
      await admin(); await db.exec(`update ayudantes set activo=false where usuario_id='${usuario(3)}' and negocio_id=1`);
      await uid(3); await assert.rejects(() => cobrar(16, lineas, '16'), /NEGOCIO_NO_AUTORIZADO/);
      assert.equal((await q('select consultar_detalle_venta(1,$1) v', [Number(venta.id)])).v, null);
      await admin(); await db.exec(`update ayudantes set activo=true where usuario_id='${usuario(3)}' and negocio_id=1; update usuarios set activo=false where id='${usuario(3)}'`);
      await uid(3); await assert.rejects(() => cobrar(17, lineas, '16'), /SIN_PERMISOS/);
      await admin(); await db.exec(`update usuarios set activo=true where id='${usuario(3)}'`);
    });
    await prueba('reservas no pueden exceder saldo y débito privilegiado tampoco las gasta', async () => {
      await admin();
      await fallo(`insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url) values('${usuario(5)}',1,20,'fixture/qr')`, [], 'SALDO_INSUFICIENTE_PARA_RESERVA');
      await fallo('update saldos_puntos set saldo=1', [], 'devd_saldo_cubre_reserva');
      await fallo('update saldos_puntos set reservado=0', [], 'RESERVADO_SOLO_POR_SOLICITUD');
      await fallo('update saldos_puntos set evento_id=2', [], 'SALDO_IDENTIDAD_INMUTABLE');
      await db.exec("update solicitudes_devolucion set estado='rechazada' where id=1");
      assert.equal((await q('select reservado::text r from saldos_puntos')).r, '0.00');
    });
    await prueba('paginación con cursor y filtros locales no recorta métricas globales', async () => {
      await uid(3); await db.exec('begin');
      await cobrar(70, [{ producto_id: 1, cantidad: 1 }], '8');
      await cobrar(71, [{ producto_id: 1, cantidad: 1 }], '8');
      const h = (await q("select consultar_historial_ventas(1,null,null,null,'',null,1) h")).h;
      assert.equal(h.ventas.length, 1); assert.ok(h.siguienteCursor);
      const h2 = (await q("select consultar_historial_ventas(1,null,null,null,'',$1,1) h", [Number(h.siguienteCursor)])).h;
      assert.notEqual(h2.ventas[0].id, h.ventas[0].id);
      const resumen = (await q('select consultar_resumen_ventas(1) r')).r;
      assert.equal(resumen.cantidadConfirmadas, 3); assert.equal(resumen.puntosCobrados, '18.50');
      const manana = (await q("select consultar_historial_ventas(1,((now() at time zone 'America/La_Paz')::date+1),null,null,'',null,25) h")).h;
      assert.equal(manana.ventas.length, 0);
      await db.exec('rollback'); await admin();
    });
    await prueba('ventas confirmadas y sus líneas no admiten alteración posterior', async () => {
      await fallo('update ventas set total=0 where id=1', [], 'VENTA_CONFIRMADA_INMUTABLE');
      await fallo("update venta_items set producto_nombre_historico='Falso' where venta_id=1", [], 'VENTA_CONFIRMADA_INMUTABLE');
    });
    await prueba('QR físico vinculado identifica y cobra sin consumir entrada; rollback íntegro', async () => {
      await uid(1);
      await admin(); await db.exec(`update eventos set tipo_acceso='qr_fisico' where id=1;
        insert into entradas(compra_id,tipo_ticket_id,usuario_destino_id,codigo_qr) values(1,1,'${usuario(5)}','QR-FISICO-DIGITAL')`);
      await uid(1); const lote = (await q('select generar_lote_qr(1,1,$1) id', [solicitud(99)])).id;
      const cod = (await q('select consultar_lote_qr($1) l', [lote])).l.codigos[0].codigo;
      await q("select vincular_manilla($1,'QR-FISICO-DIGITAL','5')", [cod]);
      await uid(3); await db.exec('begin');
      const r = (await cobrar(99, lineas, '16', cod)).venta;
      assert.equal(r.total, '16.00'); await db.exec('rollback');
      await admin(); assert.equal((await q("select estado from entradas where codigo_qr='QR-FISICO-DIGITAL'")).estado, 'activa');
      assert.equal((await q('select saldo::text s from saldos_puntos')).s, '97.50');
    });
    await prueba('HU9 delega al simulador real de A y conserva idempotencia/rechazos', async () => {
      await uid(2); const args = ['1', JSON.stringify([{ tipo_ticket_id: '1', cantidad: 1 }]), 'u6@test.local', solicitud(30), 'aprobado'];
      const compra = (await q('select comprar_entradas_terceros_prueba($1,$2,$3,$4,$5) c', args)).c;
      assert.equal(compra.destinatario, 'Otra persona');
      assert.deepEqual((await q('select comprar_entradas_terceros_prueba($1,$2,$3,$4,$5) c', args)).c, compra);
      const rechazado = (await q('select comprar_entradas_terceros_prueba($1,$2,$3,$4,$5) c', [...args.slice(0, 3), solicitud(31), 'rechazado'])).c;
      assert.equal(rechazado.error, 'PAGO_PRUEBA_RECHAZADO');
      await uid(6); assert.equal((await q('select count(*)::int n from entradas')).n, 1);
    });
    await prueba('fallo al finalizar venta revierte también líneas y débito', async () => {
      await admin();
      await db.exec(`create function fixture_fallo() returns trigger language plpgsql as $$begin raise exception 'FALLO_FINAL'; end$$;
        create trigger fixture_fallo before update on ventas for each row execute function fixture_fallo();`);
      await uid(3); await assert.rejects(() => cobrar(20, lineas, '16'), /FALLO_FINAL/);
      await admin(); assert.equal((await q('select saldo::text s from saldos_puntos')).s, '97.50');
      assert.equal((await q('select count(*)::int n from ventas')).n, 1);
      assert.equal((await q('select count(*)::int n from venta_items')).n, 1);
    });
    await prueba('verificación posterior de solo lectura compila y ejecuta', async () => {
      await db.exec(fs.readFileSync('supabase/devD_integracion_30_verificacion_real_solo_lectura.sql', 'utf8'));
    });
    console.log(`${total} pruebas SQL aprobadas en ${postgres ? 'PostgreSQL local' : 'PGlite en memoria'}. Esta suite usa una conexión.`);
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
