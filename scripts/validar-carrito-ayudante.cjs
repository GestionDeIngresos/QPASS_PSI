/* eslint-disable @typescript-eslint/no-require-imports -- Pruebas HU 60 aisladas, sin Supabase. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const jsx = require('react/jsx-runtime')
const { renderToStaticMarkup } = require('react-dom/server')

function cargar(archivo, deps = {}, entorno = 'production') {
  const exports = {}
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(codigo, { exports, process: { env: { NODE_ENV: entorno } }, require(nombre) {
    if (nombre in deps) return deps[nombre]
    throw new Error(`Importación no simulada: ${nombre}`)
  } }, { filename: archivo })
  return exports
}
const core = cargar('lib/ayudante/carrito.ts')
const demo = cargar('lib/ayudante/demo/catalogo.ts', { 'server-only': {} })
const catalogo = demo.crearCatalogoDemostracion(7)
const vacio = { negocioId: 'demo-bebidas', lineas: [] }
const conAgua = { negocioId: 'demo-bebidas', lineas: [{ productoId: 'demo-agua', cantidad: 1 }] }
function operar(estado, accion, datos = catalogo) {
  const r = core.actualizarCarrito(datos, estado, accion)
  assert.equal(r.ok, true, r.error)
  return r.carrito
}
async function pruebas() {
  let n = 0
  async function probar(nombre, fn) { await fn(); n++; console.log(`PASS: ${nombre}`) }
  await probar('carrito vacío tiene cero provisional, sin venta', async () => {
    const r = core.resumirCarrito(catalogo, vacio)
    assert.equal(r.ok, true); assert.equal(r.total, '0'); assert.equal(r.lineas.length, 0)
  })
  for (const cantidad of [0, -1, 1.5, NaN, Infinity, 1000, '2']) {
    await probar('cantidad inválida rechazada sin mutar carrito', async () => {
      const antes = JSON.stringify(conAgua)
      const r = core.actualizarCarrito(catalogo, conAgua, { tipo: 'cantidad', productoId: 'demo-agua', cantidad })
      assert.equal(r.ok, false); assert.equal(r.error, 'CANTIDAD_INVALIDA'); assert.equal(JSON.stringify(conAgua), antes)
    })
  }
  await probar('añadir repetido suma cantidad sin duplicar líneas', async () => {
    const r = operar(conAgua, { tipo: 'agregar', productoId: 'demo-agua' })
    assert.equal(r.lineas.length, 1); assert.equal(r.lineas[0].cantidad, 2)
    assert.equal(core.resumirCarrito(catalogo, r).total, '10')
  })
  await probar('líneas repetidas manipuladas no producen total', async () => {
    assert.equal(core.resumirCarrito(catalogo, { ...conAgua, lineas: [...conAgua.lineas, ...conAgua.lineas] }).error, 'PRODUCTO_REPETIDO')
  })
  await probar('producto deshabilitado no se añade', async () => {
    const r = core.actualizarCarrito(catalogo, vacio, { tipo: 'agregar', productoId: 'demo-refresco' })
    assert.equal(r.ok, false); assert.equal(r.error, 'PRODUCTO_NO_DISPONIBLE')
  })
  await probar('no mezcla productos de negocios distintos', async () => {
    const r = core.actualizarCarrito(catalogo, conAgua, { tipo: 'agregar', productoId: 'demo-bocadillo' })
    assert.equal(r.ok, false); assert.equal(r.error, 'PRODUCTO_NO_AUTORIZADO')
  })
  await probar('negocio ajeno al evento y sus productos quedan excluidos', async () => {
    const datos = { ...catalogo, negocios: [...catalogo.negocios, { id: 'ajeno', nombre: 'NO MOSTRAR', eventoId: 8 }], productos: [...catalogo.productos, { id: 'ajeno-p', negocioId: 'ajeno', nombre: 'NO MOSTRAR', precioEnPuntos: '1', disponibleParaVenta: true }] }
    assert.equal(core.negociosPermitidos(datos).length, 2)
    assert.equal(core.productosDelNegocio(datos, 'ajeno').length, 0)
    assert.equal(core.actualizarCarrito(datos, vacio, { tipo: 'negocio', negocioId: 'ajeno' }).error, 'NEGOCIO_NO_AUTORIZADO')
  })
  await probar('cambio de negocio requiere confirmación y vacía las líneas', async () => {
    assert.equal(core.actualizarCarrito(catalogo, conAgua, { tipo: 'negocio', negocioId: 'demo-comida' }).error, 'CONFIRMAR_CAMBIO')
    const cambiado = operar(conAgua, { tipo: 'negocio', negocioId: 'demo-comida', confirmarVaciado: true })
    assert.equal(cambiado.lineas.length, 0); assert.equal(cambiado.negocioId, 'demo-comida')
    assert.equal(conAgua.lineas.length, 1)
  })
  await probar('eliminar, cambiar cantidad y vaciar', async () => {
    const cambiado = operar(conAgua, { tipo: 'cantidad', productoId: 'demo-agua', cantidad: 3 })
    assert.equal(core.resumirCarrito(catalogo, cambiado).total, '15')
    assert.equal(operar(cambiado, { tipo: 'eliminar', productoId: 'demo-agua' }).lineas.length, 0)
    assert.equal(operar(cambiado, { tipo: 'vaciar' }).lineas.length, 0)
  })
  await probar('precio y total inyectados en líneas se ignoran', async () => {
    const manipulado = { ...conAgua, total: '-999', lineas: [{ ...conAgua.lineas[0], precioEnPuntos: '-999', subtotal: '-999' }] }
    const r = core.resumirCarrito(catalogo, manipulado)
    assert.equal(r.total, '5'); assert.equal(r.subtotal, '5'); assert.equal(r.lineas[0].subtotal, '5')
  })
  await probar('aritmética decimal exacta sin fijar precisión de B', async () => {
    const datos = { ...catalogo, productos: catalogo.productos.map(p => ({ ...p, precioEnPuntos: p.id === 'demo-agua' ? '0.1' : '0.2' })) }
    const r = core.resumirCarrito(datos, { negocioId: 'demo-bebidas', lineas: [{ productoId: 'demo-agua', cantidad: 3 }, { productoId: 'demo-jugo', cantidad: 1 }] })
    assert.equal(r.total, '0.5')
  })
  for (const precio of ['-1', 'NaN', '1e2', '', ' 1', '1,2', '9'.repeat(65)]) {
    await probar('precio inválido del catálogo bloquea selección', async () => {
      const datos = { ...catalogo, productos: catalogo.productos.map(p => ({ ...p, precioEnPuntos: precio })) }
      assert.equal(core.resumirCarrito(datos, conAgua).error, 'PRODUCTO_NO_DISPONIBLE')
    })
  }
  await probar('catálogo revocado o producto deshabilitado invalida el resumen', async () => {
    assert.equal(core.resumirCarrito({ ...catalogo, negocios: [] }, conAgua).error, 'NEGOCIO_NO_AUTORIZADO')
    assert.equal(core.resumirCarrito({ ...catalogo, productos: catalogo.productos.map(p => ({ ...p, disponibleParaVenta: false })) }, conAgua).error, 'PRODUCTO_NO_DISPONIBLE')
  })
  await probar('producción no carga demo aunque se solicite por URL', async () => {
    const eventos = []
    const m = cargar('lib/ayudante/catalogo-server.ts', { 'server-only': {}, './auth': { exigirEventoAyudante: async id => eventos.push(id) } })
    assert.equal((await m.obtenerCatalogoAyudante(7, true)).estado, 'pendiente'); assert.deepEqual(eventos, [7])
  })
  await probar('desarrollo solo carga demostración explícita tras autorización', async () => {
    let validado = false
    const m = cargar('lib/ayudante/catalogo-server.ts', { 'server-only': {}, './auth': { exigirEventoAyudante: async () => { validado = true } }, './demo/catalogo': { crearCatalogoDemostracion: id => { assert.equal(validado, true); return demo.crearCatalogoDemostracion(id) } } }, 'development')
    assert.equal((await m.obtenerCatalogoAyudante(7)).estado, 'pendiente')
    assert.equal((await m.obtenerCatalogoAyudante(7, true)).modo, 'demostracion')
  })
  await probar('ayudante inactivo es rechazado antes de servir catálogo/demo', async () => {
    const auth = cargar('lib/ayudante/auth.ts', {
      'server-only': {}, react: { cache: fn => fn }, 'next/navigation': { redirect(destino) { const e = new Error('Denegado'); e.destino = destino; throw e } },
      '@/lib/auth/sesion': { obtenerSesionActual: async () => ({ user: { id: 'A' }, perfil: { rol: 'ayudante', activo: false } }) },
    })
    const m = cargar('lib/ayudante/catalogo-server.ts', { 'server-only': {}, './auth': auth }, 'development')
    await assert.rejects(() => m.obtenerCatalogoAyudante(7, true), e => e.destino === '/eventos')
  })
  await probar('vista de carrito muestra provisionales y no muestra productos de otro negocio', async () => {
    const componente = cargar('components/ayudante/CatalogoCarrito.tsx', {
      react: { useState: inicial => [typeof inicial === 'object' ? conAgua : inicial, () => {}] },
      'react/jsx-runtime': jsx, '@/lib/ayudante/carrito': core,
    })
    const html = renderToStaticMarkup(React.createElement(componente.CatalogoCarrito, { datos: { estado: 'disponible', modo: 'demostracion', catalogo } }))
    assert.match(html, /Demostración/); assert.match(html, /Total provisional/); assert.match(html, /No disponible/)
    assert.doesNotMatch(html, /Bocadillo/); assert.doesNotMatch(html, /<form|action=/)
  })
  await probar('modo pendiente no contiene productos de demo ni importes ficticios', async () => {
    const componente = cargar('components/ayudante/CatalogoCarrito.tsx', { react: React, 'react/jsx-runtime': jsx, '@/lib/ayudante/carrito': core })
    const html = renderToStaticMarkup(React.createElement(componente.CatalogoCarrito, { datos: { estado: 'pendiente' } }))
    assert.match(html, /aún no está disponible/); assert.doesNotMatch(html, /Agua de demostración|Jugo de demostración/)
  })
  await probar('búsqueda filtra los productos ofrecidos del negocio seleccionado', async () => {
    let indice = 0
    const estados = [conAgua, 'JUGO', '', null]
    const componente = cargar('components/ayudante/CatalogoCarrito.tsx', { react: { useState: () => [estados[indice++], () => {}] }, 'react/jsx-runtime': jsx, '@/lib/ayudante/carrito': core })
    const html = renderToStaticMarkup(React.createElement(componente.CatalogoCarrito, { datos: { estado: 'disponible', modo: 'demostracion', catalogo } }))
    assert.match(html, /Añadir Jugo de demostración/)
    assert.doesNotMatch(html, /Añadir Agua de demostración|Añadir Refresco|Bocadillo/)
  })
  console.log(`${n} pruebas HU 60 correctas. Contratos C y catálogo real: pendientes; sin cobros.`)
}
pruebas().catch(error => { console.error(error); process.exitCode = 1 })
