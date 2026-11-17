/* eslint-disable @typescript-eslint/no-require-imports -- Prueba de integración PostgreSQL, fuera del bundle. */
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { PGlite } = require(process.env.QPASS_PGLITE_MODULE || '@electric-sql/pglite')
async function main() {
  const db = new PGlite()
  const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
  const key = n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
  const as = async n => { await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)",[uid(n)]); await db.exec('set role authenticated') }
  const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0]
  const fail = (sql,args,code) => assert.rejects(() => db.query(sql,args),e => e.message.includes(code))
  const apply = path => db.exec(fs.readFileSync(path,'utf8'))
  try {
    await db.exec(`create schema auth;create role anon;create role authenticated;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`)
    await apply('ARCHIVOS CONTEXTO IA/qpass-bd 1.sql')
    await apply('supabase/sprint2_devA_admin_eventos.sql')
    await apply('supabase/sprint2_devC_usuarios.sql')
    await apply('supabase/compras_politicas_y_funcion.sql')
    await apply('supabase/sprint3_devA_qr.sql')
    await apply('supabase/sprint3_devA_reportes.sql')
    await apply('supabase/sprint3_devA_accesos.sql'); await apply('supabase/sprint3_devA_accesos.sql')
    await apply('supabase/sprint3_devA_edicion_segura.sql'); await apply('supabase/sprint3_devA_edicion_segura.sql')
    for(let n=1;n<=4;n++) await db.query('insert into auth.users values($1,$2,$3)',[uid(n),`u${n}@test.local`,{nombre:`Usuario ${n}`}])
    await db.exec(`update usuarios set rol='admin' where correo='u1@test.local';update usuarios set rol='supervisor' where correo in ('u3@test.local','u4@test.local');update usuarios set carnet_identidad='123456' where correo='u2@test.local'`)
    await db.query("insert into eventos(organizador_id,titulo,fecha_evento,fecha_fin,tipo_acceso,estado) values($1,'Prueba',now()+interval '7 days',now()+interval '8 days','qr_fisico','publicado'),($1,'Ajeno',now()+interval '7 days',now()+interval '8 days','qr_fisico','publicado')",[uid(1)])
    await db.exec("insert into tipos_ticket(evento_id,nombre,precio,cantidad_disponible,limite_por_usuario) values(1,'General',10,10,10)")
    await db.query("insert into asignaciones_staff(usuario_id,evento_id,rol_staff) values($1,1,'supervisor'),($2,1,'supervisor')",[uid(3),uid(4)])
    await as(2)
    const compra=(await one('select comprar_entradas($1,$2::jsonb,null) as r',['1',JSON.stringify([{tipo_ticket_id:'1',cantidad:3}])])).r
    await db.exec('reset role')
    const entradas=(await db.query('select id,codigo_qr from entradas order by id')).rows
    const antes=(await one('select cantidad_disponible from tipos_ticket where id=1')).cantidad_disponible
    await as(1)
    const lote=(await one('select generar_lote_qr(1,1,$1) as id',[key(1)])).id
    const codigo=(await one('select consultar_lote_qr($1) as r',[lote])).r.codigos[0].codigo
    await one('select vincular_manilla($1,$2,$3)',[codigo,entradas[0].codigo_qr,'123456'])
    await as(3)
    assert.equal((await db.query('select * from eventos_supervisor()')).rows.length,1)
    const foto=`${uid(3)}/1/${key(2)}.jpg`
    await db.query("insert into storage.objects(bucket_id,name) values('accesos',$1)",[foto])
    await fail("insert into storage.objects(bucket_id,name) values('accesos',$1)",[`${uid(3)}/2/ajeno.jpg`],'row-level security')
    await fail('select registrar_acceso($1,1,true,null,$2)',[codigo,key(3)],'FOTO_REQUERIDA')
    const registro=(await one('select registrar_acceso($1,1,true,$2,$3) as r',[codigo,foto,key(2)])).r
    assert.equal(registro.resultado,'permitido')
    assert.equal((await one('select registrar_acceso($1,1,true,$2,$3) as r',[codigo,foto,key(2)])).r.id,registro.id)
    await fail('select registrar_acceso($1,1,true,$2,$3)',[entradas[0].codigo_qr,foto,key(3)],'ENTRADA_NO_APTA')
    const denegado=(await one('select registrar_acceso($1,1,false,$2,$3) as r',[entradas[1].codigo_qr,foto,key(4)])).r
    await one('select corregir_acceso($1,1,$2,$3,$4,false)',[denegado.id,'permitido','Identidad comprobada','La entrada era correcta'])
    await fail('select corregir_acceso($1,1,$2,$3,$4,false)',[denegado.id,'denegado','','Cambio con version antigua'],'REGISTRO_CAMBIO')
    const reporte=(await one('select reportar_acceso($1,$2,$3) as id',[registro.id,'Prueba de reporte de ingreso',key(5)])).id
    assert.equal((await one('select reportar_acceso($1,$2,$3) as id',[registro.id,'Prueba de reporte de ingreso',key(5)])).id,reporte)
    await one('select corregir_acceso($1,1,$2,$3,$4,true)',[registro.id,'permitido','','Duplicado en historial'])
    assert.equal((await one("select historial_accesos(1,'',null,false) as r")).r.length,1)
    const eliminados=(await one("select historial_accesos(1,'',null,true) as r")).r
    assert.equal(eliminados.length,2); assert.equal(eliminados.find(r=>r.id===registro.id).reportes.length,1)
    assert.equal(eliminados.find(r=>r.id===registro.id).correcciones.length,1)
    await fail('select registrar_acceso($1,1,true,$2,$3)',[codigo,foto,key(6)],'ENTRADA_NO_APTA')
    await as(4)
    assert.equal((await one("select historial_accesos(1,'',null,true) as r")).r.length,0)
    await fail('select corregir_acceso($1,2,$2,$3,$4,false)',[denegado.id,'denegado','','No es mi registro'],'SIN_PERMISOS')
    await as(2)
    await fail('select historial_accesos(1)',[],'SIN_PERMISOS')
    assert.equal((await db.query('select * from storage.objects')).rows.length,0)
    await as(1)
    await one("select resolver_reporte_admin('acceso',$1)",[reporte])
    await as(3)
    assert.equal((await one("select historial_accesos(1,'',null,true) as r")).r.find(r=>r.id===registro.id).reportes[0].estado,'solucionado')
    await db.exec('reset role')
    assert.equal((await one('select estado from entradas where id=$1',[entradas[0].id])).estado,'usada')
    assert.equal((await one('select cantidad_disponible from tipos_ticket where id=1')).cantidad_disponible,antes)
    // Snapshot de edición, seguido de otra venta: guardar debe fallar sin reponer cupo.
    const evento=await one('select * from eventos where id=1'), ticket=await one('select * from tipos_ticket where id=1')
    const datos={titulo:'Prueba editada',ubicacion:'Lugar de prueba',fecha_evento:evento.fecha_evento,fecha_fin:evento.fecha_fin,tipo_acceso:'qr_fisico',version_edicion:String(evento.version_edicion)}
    const tickets=[{id:ticket.id,nombre:'General',precio:10,cantidad_disponible:ticket.cantidad_disponible,limite_por_usuario:10,version_edicion:String(ticket.version_edicion)}]
    await as(2);await one('select comprar_entradas($1,$2::jsonb,null)',['1',JSON.stringify([{tipo_ticket_id:'1',cantidad:1}])])
    await as(1)
    await fail('select guardar_evento_completo(1,null,null,$1::jsonb,$2::jsonb)',[JSON.stringify(datos),JSON.stringify(tickets)],'Los tickets o el cupo')
    await db.exec('reset role'); const nuevo=await one('select * from tipos_ticket where id=1');tickets[0].version_edicion=String(nuevo.version_edicion);tickets[0].cantidad_disponible=nuevo.cantidad_disponible
    await as(1)
    assert.equal((await one('select guardar_evento_completo(1,null,null,$1::jsonb,$2::jsonb) as id',[JSON.stringify(datos),JSON.stringify(tickets)])).id,1)
    console.log('PASS: Supervisor con foto privada, ingreso unico digital/fisico, idempotencia, denegacion, correccion versionada, eliminacion auditada sin reingreso, reportes resueltos, aislamiento y cupo no sobrescrito tras venta. Compra prueba '+compra.compra_id)
  } finally { await db.close() }
}
main().catch(e=>{console.error(e);process.exitCode=1})
