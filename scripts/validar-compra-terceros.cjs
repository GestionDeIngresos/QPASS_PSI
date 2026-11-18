/* eslint-disable @typescript-eslint/no-require-imports -- Pruebas aisladas fuera del bundle. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { webcrypto } = require('node:crypto')

function cargar(archivo, dependencias = {}, globals = {}) {
  const exports = {}
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(codigo, {
    exports, process: { env: {} }, TextEncoder, Uint8Array, crypto: webcrypto,
    console: { error() {} }, ...globals,
    require(nombre) {
      if (nombre in dependencias) return dependencias[nombre]
      throw new Error(`Importación no simulada: ${nombre}`)
    },
  }, { filename: archivo })
  return exports
}
const input = {
  solicitudId: '10000000-0000-0000-0000-000000000001', resultadoPrueba: 'aprobado', eventoId: '1',
  lineas: [{ tipoTicketId: '2', cantidad: 1 }], correoDestino: ' B@EXAMPLE.COM ',
}
function accion(opciones = {}) {
  const llamadas = []
  const respuesta = { compra_id: 10, entradas: 1, subtotal: 10, cargos_servicio: 0.7, total: 10.7, destinatario: 'B' }
  const supabase = {
    auth: { async getUser() { return { data: { user: opciones.sinSesion ? null : { id: 'A' } } } } },
    from(tabla) {
      assert.equal(tabla, 'usuarios')
      return { select() { return this }, eq(campo, valor) { assert.equal(campo, 'id'); assert.equal(valor, 'A'); return this }, async maybeSingle() { return { data: { activo: !opciones.inactiva }, error: null } } }
    },
    async rpc(nombre, parametros) {
      llamadas.push({ nombre, parametros })
      return { data: opciones.respuesta ?? respuesta, error: opciones.error ?? null }
    },
  }
  const { comprarEntradas } = cargar('app/eventos/[id]/comprar/actions.ts', {
    'next/cache': { revalidatePath() {} }, '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/compras/calculo': { MAX_ENTRADAS_POR_LINEA: 10, MAX_LINEAS: 10 },
  })
  return { comprarEntradas, llamadas }
}
async function main() {
  let total = 0
  async function probar(nombre, fn) { await fn(); total++; console.log(`PASS: ${nombre}`) }
  await probar('correo normalizado y contrato de simulación preservado', async () => {
    const c = accion(); const r = await c.comprarEntradas(input)
    assert.equal(r.ok, true); assert.equal(r.total, 10.7)
    assert.equal(c.llamadas[0].nombre, 'comprar_entradas_terceros_prueba')
    assert.equal(c.llamadas[0].parametros.p_correo_destino, 'b@example.com')
    assert.equal(c.llamadas[0].parametros.p_solicitud_id, input.solicitudId)
    assert.equal(c.llamadas[0].parametros.p_resultado, 'aprobado')
    assert.equal(c.llamadas[0].parametros.p_lineas[0].cantidad, 1)
  })
  await probar('compra para sí mismo usa destino null', async () => {
    const c = accion(); await c.comprarEntradas({ ...input, correoDestino: null })
    assert.equal(c.llamadas[0].parametros.p_correo_destino, null)
  })
  for (const cambio of [
    { correoDestino: 'no-es-correo' }, { correoDestino: '' }, { correoDestino: 'a'.repeat(255) + '@example.com' },
    { lineas: [] }, { lineas: [{ tipoTicketId: '2', cantidad: 0 }] },
    { lineas: [{ tipoTicketId: '2', cantidad: 1.5 }] }, { lineas: [...input.lineas, ...input.lineas] },
    { solicitudId: 'invalida' }, { resultadoPrueba: 'real' },
  ]) {
    await probar('entrada inválida no invoca RPC', async () => {
      const c = accion(); const r = await c.comprarEntradas({ ...input, ...cambio }); assert.equal(r.ok, false); assert.equal(c.llamadas.length, 0)
    })
  }
  for (const opciones of [{ sinSesion: true }, { inactiva: true }]) {
    await probar('sesión ausente o cuenta inactiva no compra', async () => {
      const c = accion(opciones); assert.equal((await c.comprarEntradas(input)).ok, false); assert.equal(c.llamadas.length, 0)
    })
  }
  for (const codigo of ['DESTINATARIO_NO_VALIDO', 'DESTINATARIO_NO_COINCIDE', 'COMPRA_INCONSISTENTE', 'DESTINATARIO_ES_COMPRADOR', 'CORREO_INVALIDO', 'SIN_CUPO', 'LIMITE_EXCEDIDO', 'SOLICITUD_REUTILIZADA', 'EVENTO_NO_DISPONIBLE', 'CUENTA_INACTIVA']) {
    await probar(`traducción de error SQL ${codigo}`, async () => {
      const c = accion({ error: { message: codigo } }); assert.equal((await c.comprarEntradas(input)).ok, false)
    })
  }
  for (const resultado of ['rechazado', 'vencido']) {
    await probar(`pago ${resultado} no presenta confirmación`, async () => {
      const c = accion({ respuesta: { error: `PAGO_PRUEBA_${resultado.toUpperCase()}` } })
      assert.equal((await c.comprarEntradas({ ...input, resultadoPrueba: resultado })).ok, false)
      assert.equal(c.llamadas[0].parametros.p_resultado, resultado)
    })
  }
  const storage = new Map()
  const sessionStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }
  const intentos = () => cargar('lib/compras/intento.ts', {}, { sessionStorage })
  await probar('reintento tras recarga conserva solicitud; otra cuenta/selección la separa', async () => {
    const firma = JSON.stringify(input)
    const a = await intentos().obtenerIntentoCompra('A', '1', firma)
    const b = await intentos().obtenerIntentoCompra('A', '1', firma)
    assert.equal(a.id, b.id)
    assert.notEqual(a.id, (await intentos().obtenerIntentoCompra('C', '1', firma)).id)
    assert.notEqual(a.id, (await intentos().obtenerIntentoCompra('A', '1', firma + 'cambio')).id)
    assert.equal(a.id, (await intentos().obtenerIntentoCompra('A', '1', firma)).id)
    assert.ok(!JSON.stringify([...storage]).includes('EXAMPLE.COM'))
    intentos().completarIntentoCompra(a.clave)
    assert.notEqual(a.id, (await intentos().obtenerIntentoCompra('A', '1', firma)).id)
  })
  await probar('sin persistencia no se crea intento utilizable', async () => {
    const m = cargar('lib/compras/intento.ts', {}, { sessionStorage: { getItem() { throw new Error('Bloqueado') } } })
    await assert.rejects(() => m.obtenerIntentoCompra('A', '1', 'seleccion'))
  })
  await probar('comprobante consulta RPC autorizado y no solicita QR', async () => {
    const consultas = []
    const supabase = { async rpc(nombre, parametros) {
      consultas.push({ nombre, parametros }); return { data: { id: '10', subtotal: 10, cargos_servicio: 0.7, total: 10.7, entradas: [], para_terceros: true }, error: null }
    } }
    const q = cargar('lib/compras/queries.ts', {
      './mock': { MOCK_COMPRA: {}, MOCK_ENTRADAS: [] },
      '@/lib/auth/sesion': { obtenerSesionActual: async () => ({ user: { id: 'A' }, perfil: { activo: true } }) },
      '../supabase/server': { createClient: async () => supabase },
    })
    const compra = await q.getCompra('10')
    assert.equal(compra.para_terceros, true)
    assert.equal(consultas[0].nombre, 'consultar_compra_propia')
    assert.equal(consultas[0].parametros.p_compra_id, '10')
    await assert.rejects(() => q.getMisEntradas('C'))
    await assert.rejects(() => q.getMisComprasPagadas('C'))
  })
  await probar('revisión estática de migración: delegación, privilegios y resumen sin QR', async () => {
    const sql = fs.readFileSync('supabase/sprint3_devD_compra_terceros.sql', 'utf8')
    assert.match(sql, /v_respuesta := public\.comprar_entradas_prueba\(/)
    assert.match(sql, /revoke execute on function public\.comprar_entradas\(text,jsonb,text\) from public,anon,authenticated/)
    assert.match(sql, /revoke execute on function public\.comprar_entradas_prueba/)
    assert.match(sql, /usuario_destino_id=\(select auth.uid\(\)\)/)
    const resumen = sql.split('function public.consultar_compra_propia')[1].split('$$;')[0]
    assert.doesNotMatch(resumen, /codigo_qr/)
    assert.match(resumen, /comprador_id=auth.uid\(\)/)
  })
  await probar('SQL: ambigüedad se rechaza y asignación incorrecta aborta después de delegar', async () => {
    const sql = fs.readFileSync('supabase/sprint3_devD_compra_terceros.sql', 'utf8')
    assert.match(sql, /v_destino := v_uid/)
    assert.match(sql, /where lower\(correo\)=v_correo order by id for share/)
    assert.match(sql, /if v_coincidencias<>1 then raise exception 'DESTINATARIO_NO_VALIDO'/)
    const delegacion = sql.indexOf('v_respuesta := public.comprar_entradas_prueba(')
    const control = sql.indexOf('usuario_destino_id is distinct from v_destino')
    assert.ok(delegacion < control)
    assert.match(sql.slice(control), /raise exception 'DESTINATARIO_NO_COINCIDE'/)
    assert.doesNotMatch(sql, /exception\s+when/i, 'No capturar y ocultar el error de asignación')
    // Son aserciones estáticas; no constituyen una prueba de rollback PostgreSQL.
  })
  const entradaResumen = {
    id: '1', compra_id: '10', estado: 'activa', creado_en: '2026-11-14T00:00:00Z',
    codigo_qr: 'QR_PRIVADO_NO_SERIALIZAR', usuario_destino_id: 'IDENTIDAD_NO_SERIALIZAR',
    tipo_ticket: { id: '2', nombre: 'General', precio: 999.99 },
    evento: { id: '3', titulo: 'Prueba HU 9', fecha_evento: '2026-12-01T00:00:00Z', tipo_acceso: 'qr_digital', ubicacion: 'Lugar' },
  }
  const compraHistorica = { id: '10', subtotal: 10, cargos_servicio: 0.7, total: 10.7, estado_pago: 'confirmado', creado_en: '2026-11-14T00:00:00Z', entradas: [entradaResumen], para_terceros: true }
  const formatos = { formatFechaCompra: () => '14 Nov 2026', formatFechaEvento: () => '1 Dic 2026', formatMoney: n => `Bs ${n.toFixed(2)}`, numeroCompra: id => `QP-${id}` }
  await probar('consulta descarta precio actual incluso si una RPC anterior lo devuelve', async () => {
    const q = cargar('lib/compras/queries.ts', {
      './mock': { MOCK_COMPRA: {}, MOCK_ENTRADAS: [] },
      '@/lib/auth/sesion': { obtenerSesionActual: async () => ({ user: { id: 'A' }, perfil: { activo: true } }) },
      '../supabase/server': { createClient: async () => ({ rpc: async () => ({ data: compraHistorica, error: null }) }) },
    })
    const compra = await q.getCompra('10')
    assert.equal(compra.entradas[0].tipo_ticket.precio, null)
    assert.equal(compra.total, 10.7)
    assert.doesNotMatch(JSON.stringify(compra), /QR_PRIVADO_NO_SERIALIZAR|IDENTIDAD_NO_SERIALIZAR/)
    assert.equal(entradaResumen.tipo_ticket.precio, 999.99, 'No mutar los datos de entrada')
  })
  await probar('confirmación no muestra precio actual como histórico', async () => {
    const pagina = cargar('app/compra/confirmacion/[compraId]/page.tsx', {
      'react/jsx-runtime': require('react/jsx-runtime'), 'next/link': { default: 'a' },
      'next/navigation': { notFound() { throw new Error('404') }, redirect() { throw new Error('login') } },
      '../../../../lib/compras/queries': { getUsuarioActual: async () => ({ id: 'A' }), getCompra: async () => compraHistorica },
      '../../../../lib/compras/format': formatos,
      '../../../../components/compras/DescargarComprobante': { DescargarComprobante: 'comprobante' },
    })
    const tree = await pagina.default({ params: Promise.resolve({ compraId: '10' }) })
    function texto(n) {
      if (Array.isArray(n)) return n.map(texto).join(' ')
      if (n && typeof n === 'object') return texto(n.props?.children)
      return typeof n === 'string' ? n : ''
    }
    assert.doesNotMatch(texto(tree), /999\.99/)
    assert.match(texto(tree), /histórico no disponible/)
    assert.match(texto(tree), /Bs 10\.70/)
  })
  await probar('PDF de comprobante conserva totales persistidos sin inventar precios unitarios', async () => {
    const textos = []
    function Documento(opciones) {
      const doc = new (require('jspdf').jsPDF)(opciones)
      const text = doc.text.bind(doc)
      doc.text = (t, ...args) => { textos.push(...(Array.isArray(t) ? t : [t])); return text(t, ...args) }
      doc.save = () => doc
      return doc
    }
    const pdf = cargar('lib/compras/pdf.ts', { jspdf: { jsPDF: Documento }, './format': formatos, '../eventos/format': { formatearFecha: () => 'Fecha' } })
    await pdf.generarComprobantePdf(compraHistorica)
    assert.ok(textos.includes('Bs 10.00') && textos.includes('Bs 0.70') && textos.includes('Bs 10.70'))
    assert.ok(!textos.some(t => t.includes('999.99')))
    assert.ok(textos.includes('No disponible'))
    const sql = fs.readFileSync('supabase/sprint3_devD_compra_terceros.sql', 'utf8')
    const resumen = sql.split('function public.consultar_compra_propia')[1].split('$$;')[0]
    assert.doesNotMatch(resumen, /t\.precio/)
  })
  console.log(`${total} pruebas aisladas correctas. SQL solo inspeccionada: no ejecutada; transacciones/RLS/concurrencia pendientes de PostgreSQL real.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
