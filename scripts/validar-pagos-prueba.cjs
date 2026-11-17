/* eslint-disable @typescript-eslint/no-require-imports -- Script Node de validación fuera del bundle. */
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { PGlite } = require(process.env.QPASS_PGLITE_MODULE || '@electric-sql/pglite')
async function main() {
  const db = new PGlite()
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`)
    await db.exec(fs.readFileSync('ARCHIVOS CONTEXTO IA/qpass-bd 1.sql', 'utf8'))
    await db.exec(fs.readFileSync('supabase/compras_politicas_y_funcion.sql', 'utf8'))
    const sql = fs.readFileSync('supabase/sprint3_devA_pagos_prueba.sql', 'utf8')
    await db.exec(sql); await db.exec(sql)
    await db.exec(`insert into auth.users values
      ('00000000-0000-0000-0000-000000000001','cliente@test.local','{"nombre":"Cliente"}');
      insert into eventos(organizador_id,titulo,fecha_evento,estado) values('00000000-0000-0000-0000-000000000001','Prueba',now()+interval '30 days','publicado');
      insert into tipos_ticket(evento_id,nombre,precio,cantidad_disponible,limite_por_usuario) values(1,'General',10,3,3);
      set role authenticated;set test.uid='00000000-0000-0000-0000-000000000001';`)
    const call = async (key, outcome, quantity = 1) => (await db.query(
      'select comprar_entradas_prueba($1,$2::jsonb,null,$3,$4) as r',
      ['1', JSON.stringify([{tipo_ticket_id:'1',cantidad:quantity}]), key, outcome]
    )).rows[0].r
    const one = '10000000-0000-0000-0000-000000000001'
    const first = await call(one, 'aprobado')
    assert.equal(first.modo, 'prueba'); assert.equal(first.total, 10.7)
    assert.deepEqual(await call(one, 'aprobado'), first)
    await assert.rejects(() => call(one, 'aprobado', 2), e => e.message.includes('SOLICITUD_REUTILIZADA'))
    await assert.rejects(() => call(one, 'rechazado'), e => e.message.includes('SOLICITUD_REUTILIZADA'))
    assert.equal((await call('10000000-0000-0000-0000-000000000002', 'rechazado')).error, 'PAGO_PRUEBA_RECHAZADO')
    assert.equal((await call('10000000-0000-0000-0000-000000000003', 'vencido')).error, 'PAGO_PRUEBA_VENCIDO')
    await assert.rejects(() => call('10000000-0000-0000-0000-000000000004', 'otro'), e => e.message.includes('PRUEBA_INVALIDA'))
    await db.exec("set test.uid=''")
    await assert.rejects(() => call(one, 'aprobado'), e => e.message.includes('NO_AUTH'))
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int as n from compras')).rows[0].n, 1)
    assert.equal((await db.query('select count(*)::int as n from entradas')).rows[0].n, 1)
    assert.equal((await db.query('select cantidad_disponible as n from tipos_ticket where id=1')).rows[0].n, 2)
    console.log('PASS: pago aprobado/rechazado/vencido, reintento idempotente, cambio de selección rechazado, autenticación y cupo sin duplicación. Sin proveedores externos.')
  } finally { await db.close() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
