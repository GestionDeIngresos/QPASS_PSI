/* eslint-disable @typescript-eslint/no-require-imports -- Script Node de validación, fuera del bundle. */
// PostgreSQL temporal. Requiere @electric-sql/pglite fuera del bundle de la app.
// QPASS_PGLITE_MODULE permite indicar la instalación temporal de validación.
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
    await db.exec(`alter table usuarios add column activo boolean not null default true;
      insert into auth.users values
      ('00000000-0000-0000-0000-000000000001','admin@test.local','{"nombre":"Admin"}'),
      ('00000000-0000-0000-0000-000000000002','cliente@test.local','{"nombre":"Cliente"}'),
      ('00000000-0000-0000-0000-000000000003','staff@test.local','{"nombre":"Supervisor"}');
      update usuarios set rol='admin' where correo='admin@test.local';
      update usuarios set carnet_identidad='123456' where correo='cliente@test.local';
      update usuarios set rol='supervisor' where correo='staff@test.local';
      insert into eventos(organizador_id,titulo,fecha_evento,tipo_acceso) values
      ('00000000-0000-0000-0000-000000000001','Evento uno',now(),'qr_fisico'),
      ('00000000-0000-0000-0000-000000000001','Evento dos',now(),'qr_fisico');
      insert into tipos_ticket(evento_id,nombre,precio,cantidad_disponible) values(1,'General',10,8),(2,'General',10,8);
      insert into compras(comprador_id,subtotal,total,estado_pago) values
      ('00000000-0000-0000-0000-000000000002',10,10,'confirmado'),
      ('00000000-0000-0000-0000-000000000002',10,10,'pendiente');
      insert into entradas(compra_id,tipo_ticket_id,usuario_destino_id,codigo_qr) values
      (1,1,'00000000-0000-0000-0000-000000000002','QP-uno'),
      (1,2,'00000000-0000-0000-0000-000000000002','QP-dos'),
      (2,1,'00000000-0000-0000-0000-000000000002','QP-pendiente');
      insert into asignaciones_staff(usuario_id,evento_id,rol_staff) values('00000000-0000-0000-0000-000000000003',1,'supervisor');`)
    const sql = fs.readFileSync('supabase/sprint3_devA_qr.sql', 'utf8')
    await db.exec(sql); await db.exec(sql)
    const uid = async n => db.exec(`set role authenticated; set test.uid='00000000-0000-0000-0000-${String(n).padStart(12, '0')}'`)
    const q = async (sql, args = []) => (await db.query(sql, args)).rows[0]
    const fails = async (sql, args, code) => assert.rejects(() => db.query(sql, args), e => e.message.includes(code))
    await uid(1)
    const request = '10000000-0000-0000-0000-000000000001'
    const lote = (await q('select generar_lote_qr(1,2,$1) as id', [request])).id
    assert.equal((await q('select generar_lote_qr(1,2,$1) as id', [request])).id, lote)
    await fails('select generar_lote_qr(1,3,$1)', [request], 'SOLICITUD_REUTILIZADA')
    await fails('select generar_lote_qr(1,201,$1)', [request], 'DATOS_INVALIDOS')
    const batch = (await q('select consultar_lote_qr($1) as lote', [lote])).lote
    assert.equal(batch.codigos.length, 2)
    const [code, other] = batch.codigos.map(c => c.codigo)
    await fails('select vincular_manilla($1,$2,$3)', [code, 'QP-pendiente', '123456'], 'ENTRADA_NO_VALIDA')
    await fails('select vincular_manilla($1,$2,$3)', [code, 'QP-dos', '123456'], 'EVENTO_NO_COINCIDE')
    await fails('select vincular_manilla($1,$2,$3)', [code, 'QP-uno', 'otro'], 'IDENTIDAD_NO_COINCIDE')
    assert.equal((await q('select vincular_manilla($1,$2,$3) as id', [code, 'QP-uno', '123456'])).id, 1)
    assert.equal((await q('select vincular_manilla($1,$2,$3) as id', [code, 'QP-uno', '123456'])).id, 1)
    await fails('select vincular_manilla($1,$2,$3)', [other, 'QP-uno', '123456'], 'ENTRADA_YA_VINCULADA')
    await uid(3)
    const digital = (await q('select identificar_qr($1,1) as identidad', ['QP-uno'])).identidad
    const physical = (await q('select identificar_qr($1,1) as identidad', [code])).identidad
    assert.equal(digital.entradaId, physical.entradaId)
    assert.equal(physical.aptaIngreso, true)
    assert.equal('correo' in physical, false)
    await fails('select identificar_qr($1,2)', [code], 'SIN_PERMISOS')
    await fails('select identificar_qr($1,1)', [other], 'QR_NO_VALIDO_PARA_EVENTO')
    await fails('select generar_lote_qr(1,1,$1)', [request], 'SIN_PERMISOS')
    await assert.rejects(() => db.query('select * from vinculos_qr_fisico'), e => e.code === '42501')
    await db.exec("reset role;update entradas set estado='usada' where id=1")
    await uid(3)
    const used = (await q('select identificar_qr($1,1) as identidad', [code])).identidad
    assert.equal(used.aptaIngreso, false)
    assert.equal(used.identificacionValida, true)
    await db.exec("reset role;update compras set estado_pago='fallido' where id=1")
    await uid(3)
    assert.equal((await q('select identificar_qr($1,1) as identidad', [code])).identidad.identificacionValida, false)
    await uid(2)
    await fails('select identificar_qr($1,1)', [code], 'SIN_PERMISOS')
    await uid(1)
    await db.exec("reset role;update usuarios set activo=false where correo='admin@test.local'")
    await uid(1)
    await fails('select consultar_lote_qr($1)', [lote], 'SIN_PERMISOS')
    await db.exec('reset role')
    assert.equal((await q('select cantidad_disponible as n from tipos_ticket where id=1')).n, 8)
    assert.equal((await q('select count(*)::int as n from entradas')).n, 3)
    const dashboards = fs.readFileSync('supabase/sprint3_devA_dashboards.sql', 'utf8')
    await db.exec(dashboards); await db.exec(dashboards)
    await db.exec("update usuarios set activo=true where correo='admin@test.local'; update compras set estado_pago='confirmado' where id=1")
    await uid(1)
    const global = (await q('select resumen_dashboard(null) as resumen')).resumen
    assert.equal(global.compras, 1); assert.equal(global.ingresos, 10)
    assert.equal(global.usuarios, 3)
    await uid(2)
    await fails('select resumen_dashboard(null)', [], 'SIN_PERMISOS')
    await fails('select resumen_dashboard(1)', [], 'SIN_PERMISOS')
    await db.exec("reset role; alter type rol_usuario add value if not exists 'organizador'")
    await db.exec("update usuarios set rol='organizador' where correo='admin@test.local'; insert into entradas(compra_id,tipo_ticket_id,usuario_destino_id,codigo_qr) values(1,1,'00000000-0000-0000-0000-000000000002','QP-extra'); insert into eventos(organizador_id,titulo,fecha_evento) values('00000000-0000-0000-0000-000000000003','Evento ajeno',now())")
    await uid(1)
    const own = (await q('select resumen_dashboard(1) as resumen')).resumen
    assert.equal(own.entradas, 2); assert.equal(own.usuarios, 1)
    assert.equal(own.compras, 1); assert.equal(own.ingresos, 10)
    await fails('select resumen_dashboard(3)', [], 'SIN_PERMISOS')
    await fails('select resumen_dashboard(null)', [], 'SIN_PERMISOS')
    console.log('PASS: dashboards global/propietario, sin duplicar ingresos/asistentes, compra pendiente excluida y aislamiento por rol/evento.')
    console.log('PASS: SQL repetible, lotes idempotentes, identidad/evento/pago, vínculo único, permisos, QR digital/físico, entrada usada, anulación de pago y cupo conservado.')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
