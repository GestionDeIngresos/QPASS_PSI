/* eslint-disable @typescript-eslint/no-require-imports -- Condiciones previas, solo base en memoria. */
const fs = require('node:fs'), assert = require('node:assert/strict');
const { PGlite } = require(process.env.QPASS_PGLITE_MODULE || '@electric-sql/pglite');
const { recrearCatalogo, sembrar, usuario } = require('./devd-catalogo-fixture.cjs');
const base = fs.readFileSync('supabase/migrations/202611160003_devd_comercio_base.sql', 'utf8');
const pre = fs.readFileSync('supabase/migrations/202611160000_devd_precondiciones.sql', 'utf8');
async function main() {
  let total = 0;
  const casos = [
    { nombre: 'inicializa reservas existentes sin volver a debitar saldo', setup: `insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url) values('${usuario(5)}',1,90,'fixture/qr')` },
    { nombre: 'rechaza reservas heredadas mayores al saldo y revierte TODO el DDL', setup: `insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url) values('${usuario(5)}',1,110,'fixture/qr')`, error: 'RESERVAS_SUPERAN_SALDO' },
    { nombre: 'rechaza solicitud sin saldo sin crear puntos artificiales', setup: `insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url) values('${usuario(6)}',2,20,'fixture/qr')`, error: 'RESERVAS_SIN_SALDO' },
    { nombre: 'rechaza devoluciones existentes que requieren conciliación B', setup: `insert into devoluciones(usuario_id,encargado_id,monto) values('${usuario(5)}','${usuario(1)}',1)`, error: 'DEVOLUCIONES_HEREDADAS' },
    { nombre: 'detecta deriva de tipo antes de instalar cambios', setup: 'alter table productos alter column precio type numeric(12,2)', error: 'DERIVA_COLUMNA', pre: true },
  ];
  for (const caso of casos) {
    const db = new PGlite();
    try {
      await recrearCatalogo(db); await sembrar(db); await db.exec(caso.setup);
      if (caso.error) {
        await assert.rejects(() => db.exec(caso.pre ? pre : base), e => e.message.includes(caso.error));
        await db.exec('rollback');
        assert.equal((await db.query("select to_regclass('public.negocios_eventos') tabla")).rows[0].tabla, null);
        assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='saldos_puntos' and column_name='reservado'")).rows[0].n, 0);
      } else {
        await db.exec(base);
        assert.deepEqual((await db.query('select saldo::text saldo,reservado::text reservado from saldos_puntos')).rows[0], { saldo: '100.00', reservado: '90.00' });
      }
      assert.equal((await db.query('select saldo::text saldo from saldos_puntos')).rows[0].saldo, '100.00');
      total++; console.log(`PASS ${caso.nombre}`);
    } finally { await db.close(); }
  }
  console.log(`${total} pruebas de precondiciones y recuperación transaccional aprobadas.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
