/* eslint-disable @typescript-eslint/no-require-imports -- Fixtures solo de pruebas, sin red. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict')
const ts = require('typescript'), React = require('react'), jsx = require('react/jsx-runtime')
const { renderToStaticMarkup } = require('react-dom/server')
function cargar(archivo, deps = {}, env = {}) {
  const exports = {}
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(codigo, { exports, process: { env }, require(nombre) {
    if (nombre in deps) return deps[nombre]
    throw new Error(`Importación no simulada: ${nombre}`)
  } }, { filename: archivo })
  return exports
}
const modelo = cargar('lib/ayudante/ventas-model.ts')
const alcance = { ayudanteId: 'A', eventoId: 7, negociosAutorizados: ['negocio-1', 'negocio-2'] }
const fixture = {
  id: 'venta-1', referencia: 'REF-PRUEBA-1', estado: 'confirmada', fecha: '2026-11-15T04:00:00Z',
  ayudanteId: 'A', eventoId: 7, negocioId: 'negocio-1', negocioNombreHistorico: 'Negocio de prueba histórico', total: '2.50',
  items: [{ productoId: 'p1', nombreHistorico: 'Producto histórico de prueba', cantidad: 2, precioUnitarioHistorico: '1.25', subtotal: '2.50' }],
}
const filtros = { desde: '', hasta: '', negocio: '', referencia: '' }
function verificada(cambios = {}) {
  const v = modelo.validarVentaConfirmada({ ...fixture, ...cambios }, alcance)
  assert.ok(v, 'Fixture debe pasar validación'); return v
}
const Link = ({ href, children, ...props }) => React.createElement('a', { ...props, href }, children)
const depsVista = { 'react/jsx-runtime': jsx, 'next/link': { default: Link }, '@/lib/ayudante/ventas-model': modelo }
const DetalleVenta = cargar('components/ayudante/DetalleVenta.tsx', depsVista).DetalleVenta
const VentaNoDisponible = cargar('components/ayudante/VentaNoDisponible.tsx', depsVista).VentaNoDisponible
const ResumenVentas = cargar('components/ayudante/ResumenVentas.tsx', depsVista).ResumenVentas
const HistorialVentas = cargar('components/ayudante/HistorialVentas.tsx', depsVista).HistorialVentas
async function main() {
  let total = 0
  async function probar(nombre, fn) { await fn(); total++; console.log(`PASS: ${nombre}`) }
  for (const cambio of [{ estado: 'pendiente' }, { estado: 'rechazada' }, { ayudanteId: 'B' }, { eventoId: 8 }, { negocioId: 'ajeno' }]) {
    await probar('venta no confirmada o ajena se rechaza', async () => {
      assert.equal(modelo.validarVentaConfirmada({ ...fixture, ...cambio }, alcance), null)
    })
  }
  await probar('ID de URL debe coincidir y no autoriza por sí mismo', async () => {
    assert.equal(modelo.validarVentaConfirmada(fixture, alcance, 'otra-venta'), null)
    assert.ok(modelo.validarVentaConfirmada(fixture, alcance, fixture.id))
    for (const id of ['', '../venta', 'https://externo', '<script>']) assert.equal(modelo.idVentaValido(id), false)
  })
  for (const cambio of [{ items: [] }, { total: '999' }, { fecha: '2026-02-30T00:00:00Z' }, { fecha: '2026-11-15T12:00:00' }, { items: [{ ...fixture.items[0], cantidad: 0 }] }, { items: [{ ...fixture.items[0], cantidad: 1.5 }] }, { items: [{ ...fixture.items[0], precioUnitarioHistorico: undefined, precioActual: '1.25' }] }, { items: [{ ...fixture.items[0], subtotal: '999' }] }]) {
    await probar('datos históricos ausentes/inconsistentes no generan comprobante', async () => {
      assert.equal(modelo.validarVentaConfirmada({ ...fixture, ...cambio }, alcance), null)
    })
  }
  await probar('precio actual manipulado no reemplaza el histórico y campos extra no se propagan', async () => {
    const v = verificada({ codigo_qr: 'NO_PROPAGAR', items: [{ ...fixture.items[0], precioActual: '999', precioEnPuntos: '999' }] })
    const html = renderToStaticMarkup(React.createElement(DetalleVenta, { venta: v, comprobante: true }))
    assert.match(html, /1\.25/); assert.match(html, /2\.50 puntos/)
    assert.doesNotMatch(html, /999|NO_PROPAGAR/)
    assert.doesNotMatch(JSON.stringify(v), /precioActual|precioEnPuntos|codigo_qr/)
  })
  await probar('límites de día, mes y año se calculan en Bolivia', async () => {
    assert.equal(modelo.fechaDiaBolivia('2026-11-15T03:59:59Z'), '2026-11-14')
    assert.equal(modelo.fechaDiaBolivia('2026-11-15T04:00:00Z'), '2026-11-15')
    assert.equal(modelo.fechaDiaBolivia('2026-11-01T03:59:59Z'), '2026-10-31')
    assert.equal(modelo.fechaDiaBolivia('2027-01-01T03:59:59Z'), '2026-12-31')
    assert.equal(modelo.fechaDiaBolivia('2028-03-01T03:59:59Z'), '2028-02-29')
    assert.match(modelo.formatearFechaVenta('2027-01-01T03:59:00Z'), /2026.*23:59/)
  })
  const ventas = ['2026-11-15T03:59:59Z', '2026-11-15T04:00:00Z', '2026-11-01T03:59:59Z', '2026-11-01T04:00:00Z'].map((fecha, i) => verificada({ id: `v-${i}`, fecha }))
  await probar('dashboard usa confirmadas, total exacto y periodo boliviano', async () => {
    const r = modelo.resumirVentas(ventas, new Date('2026-11-15T12:00:00Z'))
    assert.equal(r.ventasDia, 1); assert.equal(r.ventasMes, 3); assert.equal(r.puntosCobrados, '10'); assert.equal(r.cantidadConfirmadas, 4)
    assert.throws(() => modelo.resumirVentas([ventas[0], ventas[0]], new Date()), /duplicado/)
  })
  for (const params of [{ desde: '2026-02-30' }, { desde: '2026-12-02', hasta: '2026-12-01' }, { negocio: '../ajeno' }, { desde: ['2026-11-15'] }, { referencia: 'a'.repeat(81) }]) {
    await probar('filtros inválidos se identifican', async () => { assert.ok(modelo.leerFiltrosVentas(params).error) })
  }
  await probar('filtros por día completo boliviano, negocio y referencia', async () => {
    const f = modelo.leerFiltrosVentas({ desde: '2026-11-15', hasta: '2026-11-15', negocio: 'negocio-1', referencia: 'prueba' })
    assert.equal(f.error, undefined); assert.equal(modelo.filtrarVentas(ventas, f.filtros).length, 1)
    assert.equal(modelo.filtrarVentas(ventas, { ...filtros, negocio: 'negocio-2' }).length, 0)
  })
  await probar('sin datos no se muestran ceros ni ventas ficticias', async () => {
    const html = renderToStaticMarkup(React.createElement(ResumenVentas, { lectura: { estado: 'pendiente' } }))
    assert.equal((html.match(/Dato aún no disponible/g) ?? []).length, 4)
    assert.doesNotMatch(html, />0</)
    const historial = renderToStaticMarkup(React.createElement(HistorialVentas, { lectura: { estado: 'pendiente' }, filtros }))
    assert.match(historial, /<fieldset disabled/); assert.match(historial, /name="negocio"/)
    assert.doesNotMatch(historial, /REF-PRUEBA|\/comprobante/)
  })
  await probar('historial autorizado prepara enlaces independientes a detalle y comprobante', async () => {
    const html = renderToStaticMarkup(React.createElement(HistorialVentas, { lectura: { estado: 'disponible', ventas: [verificada()], negocios: [{ id: 'negocio-1', nombre: 'Negocio de prueba' }] }, filtros }))
    assert.match(html, /href="\/ayudante\/ventas\/venta-1"/)
    assert.match(html, /href="\/ayudante\/ventas\/venta-1\/comprobante"/)
    assert.match(html, /REF-PRUEBA-1/)
  })
  const adapter = cargar('lib/ayudante/comercio-server.ts', { 'server-only': {}, './ventas-model': modelo })
  const catalogoRpc = { eventoId: 9, negocios: [{ id: '1', nombre: 'Negocio autorizado', eventoId: 9 }], productos: [] }
  const ventaRpc = { ...fixture, id: '12', referencia: 'QV-12', eventoId: 9, negocioId: '1' }
  function lecturasRpc(cambios = {}) {
    const llamadas = []
    const respuestas = { consultar_catalogo_ayudante: catalogoRpc,
      consultar_historial_ventas: { ventas: [ventaRpc], negocios: catalogoRpc.negocios, siguienteCursor: null },
      consultar_detalle_venta: ventaRpc, ...cambios }
    const db = { rpc: async (nombre, args) => {
      llamadas.push([nombre, JSON.parse(JSON.stringify(args))])
      if (!(nombre in respuestas)) throw new Error('RPC no permitida por la prueba: ' + nombre)
      return { data: respuestas[nombre], error: null }
    } }
    const m = cargar('lib/ayudante/ventas-server.ts', {
      'server-only': {}, './ventas-model': modelo, './comercio-server': adapter,
      './auth': { exigirEventoAyudante: async id => {
        if (id !== 9) throw new Error('EVENTO_DENEGADO')
        return { sesion: { user: { id: 'A' }, supabase: db } }
      } },
    }, { QPASS_COMERCIO_REAL: 'false' })
    return { ...m, llamadas }
  }
  await probar('historial vacío exitoso muestra No hay ventas registradas con cobros apagados', async () => {
    const m = lecturasRpc({ consultar_catalogo_ayudante: { ...catalogoRpc, negocios: [] },
      consultar_historial_ventas: { ventas: [], negocios: [], siguienteCursor: null } })
    const lectura = await m.obtenerHistorialVentas(9, filtros)
    assert.equal(lectura.estado, 'disponible'); assert.equal(lectura.ventas.length, 0)
    const html = renderToStaticMarkup(React.createElement(HistorialVentas, { lectura, filtros }))
    assert.match(html, /No hay ventas registradas/)
    assert.doesNotMatch(html, /todavía no está disponible|REF-PRUEBA|\/comprobante/)
    assert.doesNotMatch(html, /<fieldset disabled/)
    assert.match(html, /<select[^>]*name="negocio"[^>]*\sdisabled=""/)
    assert.deepEqual(m.llamadas.map(([nombre]) => nombre), ['consultar_historial_ventas', 'consultar_catalogo_ayudante'])
  })
  await probar('filtros autorizados y cursor llegan a la RPC; opciones no se inventan', async () => {
    const m = lecturasRpc()
    const consulta = { desde: '2026-11-01', hasta: '2026-11-17', negocio: '1', referencia: 'QV-12' }
    const lectura = await m.obtenerHistorialVentas(9, consulta, '20')
    assert.deepEqual(m.llamadas[0], ['consultar_historial_ventas', {
      p_evento: 9, p_desde: consulta.desde, p_hasta: consulta.hasta, p_negocio: 1,
      p_referencia: 'QV-12', p_antes: 20, p_limite: 25,
    }])
    const html = renderToStaticMarkup(React.createElement(HistorialVentas, { lectura, filtros: consulta }))
    assert.doesNotMatch(html, /<fieldset disabled|<select[^>]*\sdisabled=""/)
    assert.match(html, /Negocio autorizado/); assert.match(html, /name="desde"/)
    assert.match(html, /name="hasta"/); assert.match(html, /name="referencia"/)
    assert.match(html, /href="\/ayudante\/ventas\/12"/)
    assert.match(html, /href="\/ayudante\/ventas\/12\/comprobante"/)
    const vacio = renderToStaticMarkup(React.createElement(HistorialVentas, { lectura: { ...lectura, ventas: [] }, filtros: consulta }))
    assert.match(vacio, /No hay ventas confirmadas que coincidan con los filtros/)
  })
  await probar('detalle y comprobante cargan la venta persistida y sus históricos con el flag apagado', async () => {
    const m = lecturasRpc()
    for (const archivo of ['app/ayudante/ventas/[ventaId]/page.tsx', 'app/ayudante/ventas/[ventaId]/comprobante/page.tsx']) {
      const pagina = cargar(archivo, {
        'react/jsx-runtime': jsx, 'next/navigation': { notFound() { throw new Error('404') } },
        '@/lib/ayudante/auth': { obtenerContextoAyudante: async () => ({ asignacion: { estado: 'asignado', eventoId: 9 } }) },
        '@/lib/ayudante/ventas-server': m,
        '@/components/ayudante/EstadoAsignacion': { EstadoAsignacion: () => null },
        '@/components/ayudante/DetalleVenta': { DetalleVenta }, '@/components/ayudante/VentaNoDisponible': { VentaNoDisponible },
      })
      const html = renderToStaticMarkup(await pagina.default({ params: Promise.resolve({ ventaId: '12' }) }))
      assert.match(html, /QV-12/); assert.match(html, /Confirmada/)
      assert.match(html, /Producto histórico de prueba/); assert.match(html, /1\.25/); assert.match(html, /2\.50 puntos/)
      assert.match(html, archivo.includes('/comprobante/') ? /Comprobante de venta/ : /Detalle de venta/)
    }
    assert.equal(m.llamadas.filter(([nombre]) => nombre === 'consultar_detalle_venta').length, 2)
    assert.ok(m.llamadas.every(([nombre]) => ['consultar_detalle_venta', 'consultar_catalogo_ayudante'].includes(nombre)))
  })
  await probar('otras cuentas/eventos y datos no confirmados no producen detalle ni comprobante', async () => {
    for (const cambio of [{ ayudanteId: 'OTRO' }, { eventoId: 10 }, { estado: 'pendiente' }, { negocioId: '2' }]) {
      await assert.rejects(() => lecturasRpc({ consultar_detalle_venta: { ...ventaRpc, ...cambio } }).obtenerDetalleVenta(9, '12'), /histórico válido/)
    }
    const m = lecturasRpc()
    await assert.rejects(() => m.obtenerHistorialVentas(10, filtros), /EVENTO_DENEGADO/)
    await assert.rejects(() => m.obtenerDetalleVenta(10, '12'), /EVENTO_DENEGADO/)
    await assert.rejects(() => m.obtenerHistorialVentas(9, { ...filtros, desde: '2026-02-30' }), /Filtros inválidos/)
    assert.equal((await m.obtenerDetalleVenta(9, '../ajena')).estado, 'no_encontrada')
    assert.equal(m.llamadas.length, 0)
    assert.equal((await lecturasRpc({ consultar_detalle_venta: null }).obtenerDetalleVenta(9, '12')).estado, 'no_encontrada')
    await assert.rejects(() => lecturasRpc({ consultar_historial_ventas: null }).obtenerHistorialVentas(9, filtros), /No se pudo consultar el historial/)
  })
  await probar('HU59 consulta RPC autenticada del evento 9 con cobros apagados y muestra ceros reales', async () => {
    const llamadas = [], eventos = []
    const vacio = { ventasDia: 0, ventasMes: 0, puntosCobrados: '0', cantidadConfirmadas: 0 }
    let respuesta = { data: vacio, error: null }
    const db = { rpc: async (nombre, params) => { llamadas.push([nombre, params.p_evento]); return respuesta } }
    const adapter = cargar('lib/ayudante/comercio-server.ts', { 'server-only': {}, './ventas-model': modelo })
    const m = cargar('lib/ayudante/ventas-server.ts', {
      'server-only': {}, './ventas-model': modelo, './comercio-server': adapter,
      './auth': { exigirEventoAyudante: async id => { eventos.push(id); return { sesion: { supabase: db } } } },
    })
    const lectura = await m.obtenerResumenVentas(9)
    assert.equal(lectura.estado, 'disponible')
    assert.deepEqual(JSON.parse(JSON.stringify(lectura.resumen)), vacio)
    assert.deepEqual(eventos, [9]); assert.deepEqual(llamadas, [['consultar_resumen_ventas', 9]])
    const html = renderToStaticMarkup(React.createElement(ResumenVentas, { lectura }))
    assert.equal((html.match(/>0</g) ?? []).length, 4)
    assert.doesNotMatch(html, /Pendiente de disponibilidad|Dato aún no disponible/)
    for (const fallo of [{ data: null, error: { code: '42501' } }, { data: null, error: null }, { data: {}, error: null }]) {
      respuesta = fallo
      await assert.rejects(() => m.obtenerResumenVentas(9), /No se pudo consultar el resumen/)
    }
    assert.ok(llamadas.every(([nombre]) => nombre === 'consultar_resumen_ventas'))
  })
  await probar('lecturas y comprobante no permiten saltar guard de cuenta inactiva', async () => {
    const auth = cargar('lib/ayudante/auth.ts', {
      'server-only': {}, react: { cache: fn => fn }, 'next/navigation': { redirect() { throw new Error('DENEGADO') } },
      '@/lib/auth/sesion': { obtenerSesionActual: async () => ({ user: { id: 'A' }, perfil: { rol: 'ayudante', activo: false } }) },
    })
    const m = cargar('lib/ayudante/ventas-server.ts', { 'server-only': {}, './auth': auth, './ventas-model': modelo })
    await assert.rejects(() => m.obtenerResumenVentas(7), /DENEGADO/)
    await assert.rejects(() => m.obtenerHistorialVentas(7, filtros), /DENEGADO/)
    await assert.rejects(() => m.obtenerDetalleVenta(7, fixture.id), /DENEGADO/)
  })
  for (const archivo of ['app/ayudante/ventas/[ventaId]/page.tsx', 'app/ayudante/ventas/[ventaId]/comprobante/page.tsx']) {
    await probar('ruta de detalle/comprobante pendiente no muestra el ID solicitado como confirmado', async () => {
      const deps = {
        'react/jsx-runtime': jsx, 'next/navigation': { notFound() { throw new Error('404') } },
        '@/lib/ayudante/auth': { obtenerContextoAyudante: async () => ({ asignacion: { estado: 'asignado', eventoId: 7 } }) },
        '@/lib/ayudante/ventas-server': { obtenerDetalleVenta: async () => ({ estado: 'pendiente' }) },
        '@/components/ayudante/EstadoAsignacion': { EstadoAsignacion: () => null },
        '@/components/ayudante/DetalleVenta': { DetalleVenta }, '@/components/ayudante/VentaNoDisponible': { VentaNoDisponible },
      }
      const pagina = cargar(archivo, deps)
      const html = renderToStaticMarkup(await pagina.default({ params: Promise.resolve({ ventaId: 'ID_NO_VERIFICADO' }) }))
      assert.doesNotMatch(html, /ID_NO_VERIFICADO|>Confirmada</)
      assert.match(html, /No se ha verificado ninguna operación/)
      deps['@/lib/ayudante/ventas-server'] = { obtenerDetalleVenta: async () => ({ estado: 'no_encontrada' }) }
      await assert.rejects(() => cargar(archivo, deps).default({ params: Promise.resolve({ ventaId: 'ajena' }) }), /404/)
    })
  }
  await probar('sin fuente real ni entrada desde carrito; sin SQL, cobro o escritura', async () => {
    const fuente = fs.readFileSync('lib/ayudante/ventas-server.ts', 'utf8')
    assert.doesNotMatch(fuente, /\.rpc\(|\.insert\(|\.update\(|\.delete\(|['"]use server['"]|from ['"].*carrito/)
    assert.doesNotMatch(fs.readFileSync('components/ayudante/DetalleVenta.tsx', 'utf8'), /precioEnPuntos|sessionStorage|localStorage/)
  })
  console.log(`${total} pruebas de lecturas correctas. Registros únicamente ficticios de pruebas; sin integración ni ventas reales.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
