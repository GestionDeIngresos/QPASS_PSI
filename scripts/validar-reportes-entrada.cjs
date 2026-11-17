/* eslint-disable @typescript-eslint/no-require-imports -- Pruebas aisladas sin red ni dependencias nuevas. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { webcrypto } = require('node:crypto')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function cargar(archivo, deps = {}, globals = {}) {
  const exports = {}
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(codigo, { exports, TextEncoder, Uint8Array, crypto: webcrypto, ...globals, require(nombre) {
    if (nombre in deps) return deps[nombre]
    throw new Error(`Importación no simulada: ${nombre}`)
  } }, { filename: archivo })
  return exports
}
const compartido = cargar('lib/reportes/entradas.ts')
const input = { entradaId: '12', descripcion: '  No puedo ver mi entrada  ', solicitudId: '10000000-0000-0000-0000-000000000001' }
function accion(opciones = {}) {
  const llamadas = [], rutas = []
  const supabase = { async rpc(nombre, parametros) {
    llamadas.push({ nombre, parametros })
    if (opciones.red) throw new Error('Sin red')
    return { data: opciones.data === undefined ? 8 : opciones.data, error: opciones.error ? { message: opciones.error } : null }
  } }
  const sesion = opciones.sinSesion ? null : { user: { id: 'A' }, perfil: { activo: !opciones.inactivo }, supabase }
  const m = cargar('app/mis-compras/actions.ts', {
    'next/cache': { revalidatePath: ruta => rutas.push(ruta) },
    '@/lib/auth/sesion': { obtenerSesionActual: async () => sesion },
    '@/lib/reportes/entradas': compartido,
  })
  return { enviar: m.reportarEntrada, llamadas, rutas }
}
async function main() {
  let numero = 0
  async function prueba(nombre, fn) { await fn(); numero++; console.log(`PASS: ${nombre}`) }
  for (const invalido of [null, {}, { ...input, entradaId: '-1' }, { ...input, entradaId: '1.5' }, { ...input, entradaId: '2147483648' }, { ...input, entradaId: 12 }, { ...input, descripcion: '    ' }, { ...input, descripcion: 'abcd' }, { ...input, descripcion: 'a'.repeat(2001) }, { ...input, solicitudId: 'invalida' }]) {
    await prueba('datos inválidos no invocan SQL', async () => {
      const a = accion(); assert.equal((await a.enviar(invalido)).ok, false); assert.equal(a.llamadas.length, 0)
    })
  }
  await prueba('límites de descripción válidos y texto normalizado', async () => {
    assert.equal(compartido.validarReporte(input).descripcion, 'No puedo ver mi entrada')
    assert.ok(compartido.validarReporte({ ...input, descripcion: 'a'.repeat(5) }))
    assert.ok(compartido.validarReporte({ ...input, descripcion: 'a'.repeat(2000) }))
  })
  for (const opciones of [{ sinSesion: true }, { inactivo: true }]) {
    await prueba('cuenta ausente/inactiva no envía reportes', async () => {
      const a = accion(opciones); assert.equal((await a.enviar(input)).ok, false); assert.equal(a.llamadas.length, 0)
    })
  }
  await prueba('solo identidad de servidor: usuario y estado falsificados se ignoran', async () => {
    const a = accion(); const r = await a.enviar({ ...input, usuario_id: 'VICTIMA', estado: 'solucionado' })
    assert.equal(r.ok, true); assert.equal(r.reporteId, 8)
    assert.equal(a.llamadas[0].nombre, 'reportar_entrada_propia')
    assert.equal(a.llamadas[0].parametros.p_entrada, 12)
    assert.equal(a.llamadas[0].parametros.p_descripcion, 'No puedo ver mi entrada')
    assert.equal(a.llamadas[0].parametros.p_solicitud, input.solicitudId)
    assert.deepEqual(Object.keys(a.llamadas[0].parametros).sort(), ['p_descripcion', 'p_entrada', 'p_solicitud'])
    assert.deepEqual(a.rutas, ['/mis-compras', '/admin/reportes'])
  })
  for (const error of ['ENTRADA_NO_AUTORIZADA', 'SOLICITUD_REUTILIZADA', 'CUENTA_INACTIVA', 'NO_AUTH', 'REPORTE_ALTERA_ENTRADA', 'REPORTE_INCONSISTENTE', 'funcion no disponible']) {
    await prueba(`rechazo de SQL ${error} no muestra éxito`, async () => {
      const a = accion({ error }); assert.equal((await a.enviar(input)).ok, false); assert.equal(a.rutas.length, 0)
    })
  }
  for (const opciones of [{ red: true }, { data: null }, { data: 0 }, { data: '8' }]) {
    await prueba('fallo de red/respuesta incierta conserva posibilidad de reintento', async () => {
      const a = accion(opciones); assert.equal((await a.enviar(input)).ok, false)
    })
  }
  await prueba('misma solicitud persiste tras recarga y se separa por usuario/datos', async () => {
    const map = new Map()
    const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }
    const nuevo = () => cargar('lib/reportes/entradas.ts', {}, { sessionStorage: storage })
    const a = await nuevo().obtenerSolicitudReporte('A', '12', 'Problema de prueba')
    const b = await nuevo().obtenerSolicitudReporte('A', '12', ' Problema de prueba ')
    assert.equal(a.id, b.id)
    assert.notEqual(a.id, (await nuevo().obtenerSolicitudReporte('B', '12', 'Problema de prueba')).id)
    assert.notEqual(a.id, (await nuevo().obtenerSolicitudReporte('A', '13', 'Problema de prueba')).id)
    assert.notEqual(a.id, (await nuevo().obtenerSolicitudReporte('A', '12', 'Problema diferente')).id)
    assert.ok(!JSON.stringify([...map]).includes('Problema de prueba'))
  })
  await prueba('almacenamiento bloqueado impide preparar solicitud', async () => {
    const m = cargar('lib/reportes/entradas.ts', {}, { sessionStorage: { getItem() { throw new Error('bloqueado') } } })
    await assert.rejects(() => m.obtenerSolicitudReporte('A', '12', 'Problema'))
  })
  const datos = { entradas: [{ id: 12, evento: 'Evento de prueba', tipo_entrada: 'General', codigo_qr: 'QR_PRIVADO' }], reportes: [{ id: 8, entrada_id: 12, evento: 'Evento de prueba', descripcion: 'Problema', estado: 'pendiente', creado_en: '2026-11-14T12:00:00Z', correo: 'NO_SERIALIZAR' }] }
  await prueba('consulta de seguimiento devuelve DTO sin QR ni correo', async () => {
    const m = cargar('lib/reportes/entradas-server.ts', {
      'server-only': {}, '@/lib/auth/sesion': { obtenerSesionActual: async () => ({ user: { id: 'A' }, perfil: { activo: true }, supabase: { rpc: async nombre => {
        assert.equal(nombre, 'consultar_mis_reportes_entrada'); return { data: datos, error: null }
      } } }) },
    })
    const r = await m.obtenerReportesEntrada(); assert.equal(r.disponible, true)
    assert.doesNotMatch(JSON.stringify(r), /QR_PRIVADO|NO_SERIALIZAR/)
  })
  await prueba('falta de RPC degrada solo reportes, no lanza error a Mis Compras', async () => {
    const m = cargar('lib/reportes/entradas-server.ts', { 'server-only': {}, '@/lib/auth/sesion': { obtenerSesionActual: async () => ({ user: { id: 'A' }, perfil: { activo: true }, supabase: { rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) } }) } })
    assert.equal((await m.obtenerReportesEntrada()).disponible, false)
  })
  await prueba('panel renderiza identificación, formulario y estados, sin datos QR', async () => {
    const { ReportesEntradasPanel } = cargar('components/compras/ReportesEntradasPanel.tsx', {
      react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'next/navigation': { useRouter: () => ({ refresh() {} }) },
      '@/app/mis-compras/actions': { reportarEntrada() { throw new Error('No enviar al renderizar') } },
      '@/lib/reportes/entradas': compartido,
      '@/components/ui/Textarea': cargar('components/ui/Textarea.tsx', { 'react/jsx-runtime': require('react/jsx-runtime') }),
      '@/components/ui/Button': cargar('components/ui/Button.tsx', { 'react/jsx-runtime': require('react/jsx-runtime') }),
    })
    const markup = renderToStaticMarkup(React.createElement(ReportesEntradasPanel, { datos: { ...datos, disponible: true, usuarioId: 'A', reportes: [...datos.reportes, { ...datos.reportes[0], id: 9, estado: 'solucionado' }] } }))
    assert.match(markup, /Entrada #12/); assert.match(markup, /Evento de prueba/)
    assert.match(markup, /Enviar reporte/); assert.match(markup, /Pendiente/); assert.match(markup, /Solucionado/)
    assert.doesNotMatch(markup, /QR_PRIVADO|NO_SERIALIZAR/)
    const noDisponible = renderToStaticMarkup(React.createElement(ReportesEntradasPanel, { datos: { disponible: false, mensaje: 'No disponible' } }))
    assert.match(noDisponible, /No disponible/); assert.doesNotMatch(noDisponible, /<form/)
  })
  await prueba('SQL estática: tabla existente, autorización, idempotencia y QR inalterado', async () => {
    const sql = fs.readFileSync('supabase/sprint3_devD_reportes_entrada.sql', 'utf8')
    assert.doesNotMatch(sql, /create\s+table/i)
    assert.match(sql, /c\.comprador_id=v_uid or en\.usuario_destino_id=v_uid/)
    assert.match(sql, /where r\.usuario_id=v_uid/)
    assert.match(sql, /on public\.reportes_entrada\(usuario_id,solicitud_id\)/)
    assert.match(sql, /pg_advisory_xact_lock/); assert.match(sql, /SOLICITUD_REUTILIZADA/)
    assert.match(sql, /values\(p_entrada,v_uid,v_descripcion,'pendiente',p_solicitud\)/)
    assert.match(sql, /REPORTE_ALTERA_ENTRADA/)
    assert.doesNotMatch(sql, /update\s+public\.entradas|disable row level security|drop policy/i)
    const listado = sql.split('function public.consultar_mis_reportes_entrada')[1].split('$$;')[0]
    assert.doesNotMatch(listado, /codigo_qr|u\.correo/)
    assert.match(sql, /revoke all on public\.reportes_entrada from public,anon,authenticated/)
  })
  console.log(`${numero} pruebas aisladas correctas. SQL inspeccionada estáticamente; RLS, rollback, Admin y concurrencia reales pendientes.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
