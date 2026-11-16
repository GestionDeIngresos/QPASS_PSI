/* eslint-disable @typescript-eslint/no-require-imports -- Validación aislada, fuera del bundle. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const jsx = require('react/jsx-runtime')
const { renderToStaticMarkup } = require('react-dom/server')

function cargar(archivo, deps = {}) {
  const exports = {}
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(codigo, { exports, process: { env: {} }, require(nombre) {
    if (nombre in deps) return deps[nombre]
    throw new Error(`Importación no simulada: ${nombre}`)
  } }, { filename: archivo })
  return exports
}
const base = { user: { id: 'ayudante-prueba', email: 'ayudante@example.test' }, perfil: { nombre: 'Cuenta de prueba', rol: 'ayudante', activo: true } }
function redirigir(destino) { const e = new Error('Redirección esperada'); e.destino = destino; throw e }
function guard(opciones = {}) {
  const consultas = []
  const cliente = { from(tabla) {
    consultas.push(['from', tabla])
    return { select(campos) { consultas.push(['select', campos]); return this },
      eq(campo, valor) { consultas.push(['eq', campo, valor]); return this },
      then(resolve, reject) { return Promise.resolve({ data: opciones.filas ?? [{ evento_id: 7 }], error: opciones.error ?? null }).then(resolve, reject) },
    }
  } }
  const sesion = opciones.sinSesion ? null : { ...base, perfil: 'perfil' in opciones ? opciones.perfil : base.perfil, supabase: cliente }
  const m = cargar('lib/ayudante/auth.ts', {
    'server-only': {}, react: { cache: fn => fn }, 'next/navigation': { redirect: redirigir },
    '@/lib/auth/sesion': { obtenerSesionActual: async () => sesion },
  })
  return { ...m, consultas }
}
const Link = ({ href, children, ...props }) => React.createElement('a', { ...props, href }, children)
const EstadoAsignacion = cargar('components/ayudante/EstadoAsignacion.tsx', { 'react/jsx-runtime': jsx }).EstadoAsignacion
const pantallas = [
  ['/ayudante', 'app/ayudante/page.tsx'],
  ['/ayudante/ventas/nueva', 'app/ayudante/ventas/nueva/page.tsx'],
  ['/ayudante/historial', 'app/ayudante/historial/page.tsx'],
]
async function vista(archivo, contexto, datosCatalogo = { estado: 'pendiente' }, estadoCarrito) {
  const modeloVentas = cargar('lib/ayudante/ventas-model.ts')
  const ResumenVentas = cargar('components/ayudante/ResumenVentas.tsx', { 'react/jsx-runtime': jsx }).ResumenVentas
  const HistorialVentas = cargar('components/ayudante/HistorialVentas.tsx', { 'react/jsx-runtime': jsx, 'next/link': { default: Link }, '@/lib/ayudante/ventas-model': modeloVentas }).HistorialVentas
  const carrito = cargar('components/ayudante/CatalogoCarrito.tsx', {
    react: estadoCarrito ? { useState: inicial => [typeof inicial === 'object' ? estadoCarrito : inicial, () => {}] } : React, 'react/jsx-runtime': jsx,
    '@/lib/ayudante/carrito': cargar('lib/ayudante/carrito.ts'),
  });
  return cargar(archivo, {
    'react/jsx-runtime': jsx, 'next/link': { default: Link },
    '@/lib/ayudante/auth': { obtenerContextoAyudante: async () => contexto },
    '@/components/ayudante/EstadoAsignacion': { EstadoAsignacion },
    '@/components/ayudante/CatalogoCarrito': carrito,
    '@/lib/ayudante/catalogo-server': { obtenerCatalogoAyudante: async () => datosCatalogo },
    '@/lib/ayudante/ventas-model': modeloVentas,
    '@/lib/ayudante/ventas-server': { obtenerResumenVentas: async () => ({ estado: 'pendiente' }), obtenerHistorialVentas: async () => ({ estado: 'pendiente' }) },
    '@/components/ayudante/ResumenVentas': { ResumenVentas },
    '@/components/ayudante/HistorialVentas': { HistorialVentas },
  }).default({ searchParams: Promise.resolve({}) })
}
async function fixtures(incluirCarritos = false) {
  const contexto = { sesion: base, asignacion: { estado: 'asignado', eventoId: 7 } }
  const cerrar = cargar('components/CerrarSesionButton.tsx', {
    react: React, 'react/jsx-runtime': jsx, 'next/navigation': { useRouter: () => ({}) },
    '@/lib/supabase/client': { createClient() { throw new Error('No usar Auth real en fixtures') } },
  })
  const menu = cargar('components/MenuCuenta.tsx', { react: React, 'react/jsx-runtime': jsx, 'next/link': { default: Link }, '@/components/CerrarSesionButton': cerrar })
  const cuenta = cargar('components/AccionesCuenta.tsx', { 'react/jsx-runtime': jsx, '@/components/MenuCuenta': menu, '@/components/CerrarSesionButton': cerrar })
  const paginas = new Map()
  const escenarios = [...pantallas.map(([ruta, archivo]) => ({ ruta, archivo }))]
  if (incluirCarritos) {
    const demo = cargar('lib/ayudante/demo/catalogo.ts', { 'server-only': {} })
    const datosCatalogo = { estado: 'disponible', modo: 'demostracion', catalogo: demo.crearCatalogoDemostracion(7) }
    escenarios.push({ ruta: '/ayudante/ventas/nueva?fixture=bebidas', archivo: pantallas[1][1], datosCatalogo,
      estadoCarrito: { negocioId: 'demo-bebidas', lineas: [{ productoId: 'demo-agua', cantidad: 2 }, { productoId: 'demo-jugo', cantidad: 1 }] } })
    escenarios.push({ ruta: '/ayudante/ventas/nueva?fixture=comida', archivo: pantallas[1][1], datosCatalogo,
      estadoCarrito: { negocioId: 'demo-comida', lineas: [{ productoId: 'demo-bocadillo', cantidad: 3 }] } })
  }
  for (const { ruta, archivo, datosCatalogo, estadoCarrito } of escenarios) {
    const nav = cargar('components/ayudante/AyudanteNav.tsx', { 'react/jsx-runtime': jsx, 'next/link': { default: Link }, 'next/navigation': { usePathname: () => ruta.split('?')[0] } })
    const layout = cargar('app/ayudante/layout.tsx', {
      'react/jsx-runtime': jsx, 'next/link': { default: Link },
      '@/lib/ayudante/auth': { exigirAyudante: async () => base },
      '@/components/AccionesCuenta': cuenta, '@/components/ayudante/AyudanteNav': nav,
    })
    const html = renderToStaticMarkup(await layout.default({ children: await vista(archivo, contexto, datosCatalogo, estadoCarrito) }))
    paginas.set(ruta, html)
  }
  return paginas
}
async function pruebas() {
  let total = 0
  async function probar(nombre, fn) { await fn(); total++; console.log(`PASS: ${nombre}`) }
  await probar('sin sesión redirige a login', async () => {
    await assert.rejects(() => guard({ sinSesion: true }).exigirAyudante(), e => e.destino === '/login?next=/ayudante')
  })
  for (const rol of ['cliente', 'admin', 'organizador', 'supervisor', 'recargador', 'escaneador', 'devolucion', 'negocio']) {
    await probar(`rol ${rol} denegado antes de consultar asignaciones`, async () => {
      const g = guard({ perfil: { ...base.perfil, rol } })
      await assert.rejects(() => g.obtenerContextoAyudante(), e => e.destino === '/eventos')
      assert.equal(g.consultas.length, 0)
    })
  }
  for (const perfil of [null, { rol: 'ayudante', activo: false }, { rol: 'ayudante', activo: null }, { rol: 'ayudante' }]) {
    await probar('perfil inexistente, inactivo o no verificable se rechaza', async () => {
      await assert.rejects(() => guard({ perfil }).exigirAyudante(), e => e.destino === '/eventos')
    })
  }
  await probar('ayudante activo con evento y consulta limitada a su usuario/rol', async () => {
    const g = guard(); const c = await g.obtenerContextoAyudante()
    assert.equal(c.asignacion.estado, 'asignado'); assert.equal(c.asignacion.eventoId, 7)
    assert.deepEqual(g.consultas, [['from', 'asignaciones_staff'], ['select', 'evento_id'], ['eq', 'usuario_id', base.user.id], ['eq', 'rol_staff', 'ayudante']])
    await g.exigirEventoAyudante(7)
    for (const id of [8, -1, 0, 1.5, NaN]) await assert.rejects(() => g.exigirEventoAyudante(id), e => e.destino === '/ayudante')
  })
  for (const [filas, estado] of [[[], 'sin_asignacion'], [[{ evento_id: 7 }, { evento_id: 8 }], 'asignacion_ambigua']]) {
    await probar(`${estado} bloquea acceso a un evento`, async () => {
      const g = guard({ filas }); assert.equal((await g.obtenerContextoAyudante()).asignacion.estado, estado)
      await assert.rejects(() => g.exigirEventoAyudante(7), e => e.destino === '/ayudante')
      for (const archivo of pantallas.slice(1).map(p => p[1])) {
        const html = renderToStaticMarkup(await vista(archivo, { asignacion: { estado } }))
        assert.doesNotMatch(html, /Confirmar cobro|<table|<input/)
      }
    })
  }
  for (const opciones of [{ error: { code: 'fallo' } }, { filas: [{ evento_id: null }] }, { filas: [{ evento_id: -1 }] }]) {
    await probar('error o asignación inválida nunca habilita el módulo', async () => {
      await assert.rejects(() => guard(opciones).obtenerContextoAyudante(), /No se pudo verificar/)
    })
  }
  await probar('middleware protege todas las rutas nuevas sin sesión', async () => {
    const m = cargar('middleware.ts', {
      'next/server': require('next/server'),
      '@supabase/ssr': { createServerClient: () => ({ auth: { getClaims: async () => ({ data: null, error: null }) } }) },
    })
    const { NextRequest } = require('next/server')
    for (const [ruta] of pantallas) {
      const req = new NextRequest('http://localhost:3000' + ruta)
      const respuesta = await m.middleware(req)
      assert.equal(respuesta.status, 307)
      const destino = new URL(respuesta.headers.get('location'))
      assert.equal(destino.pathname, '/login'); assert.equal(destino.searchParams.get('next'), ruta)
    }
    assert.match(fs.readFileSync('middleware.ts', 'utf8'), /RUTAS_PROTEGIDAS = .*'\/ayudante'/)
  })
  await probar('navegación y pantallas SSR con datos solo de fixture', async () => {
    const paginas = await fixtures()
    for (const [ruta, html] of paginas) {
      for (const [href] of pantallas) assert.ok(html.includes(`href="${href}"`))
      assert.ok(html.includes('aria-current="page"'))
      assert.ok(html.includes('Cerrar sesión'))
      assert.doesNotMatch(html, /<form[^>]*method="post"|<video/)
      if (ruta.endsWith('/nueva')) assert.match(html, /disabled=""[^>]*>Confirmar cobro/)
      if (ruta.endsWith('/historial')) assert.match(html, /<fieldset disabled=""/)
    }
  })
  await probar('solo lectura de asignaciones: sin RPC, escrituras o acciones de cobro', async () => {
    const archivos = ['lib/ayudante/auth.ts', ...pantallas.map(p => p[1])]
    for (const archivo of archivos) assert.doesNotMatch(fs.readFileSync(archivo, 'utf8'), /\.rpc\(|\.insert\(|\.update\(|\.delete\(|['"]use server['"]|service.role/i)
    const contracts = fs.readFileSync('lib/ayudante/contracts.ts', 'utf8')
    assert.match(contracts, /import type \{ IdentidadQr \}/)
    assert.match(fs.readFileSync('components/MenuCuenta.tsx', 'utf8'), /ayudante: \[\{ href: '\/ayudante'/)
  })
  console.log(`${total} pruebas aisladas correctas. Auth/asignaciones reales: pendientes.`)
}

async function verificarNavegador() {
  const os = require('node:os'), http = require('node:http'), { spawn } = require('node:child_process')
  const navegador = process.env.QPASS_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  assert.ok(fs.existsSync(navegador), 'Indica un navegador Chromium instalado mediante QPASS_BROWSER_PATH')
  const paginas = await fixtures(true)
  const cssDir = path.resolve('.next/static/chunks')
  const css = fs.readdirSync(cssDir).filter(n => n.endsWith('.css')).map(n => fs.readFileSync(path.join(cssDir, n), 'utf8')).join('\n')
  assert.ok(css.length > 0, 'Ejecutar build antes de probar el diseño')
  const server = http.createServer((req, res) => {
    if (req.url === '/estilos.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return }
    const html = paginas.get(req.url)
    if (!html) { res.writeHead(404); res.end(); return }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/estilos.css"><body>${html}</body></html>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'qpass-ayudante-prueba-'))
  const browser = spawn(navegador, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let ws
  try {
    const puertoArchivo = path.join(perfil, 'DevToolsActivePort')
    for (let i = 0; i < 100 && !fs.existsSync(puertoArchivo); i++) await new Promise(resolve => setTimeout(resolve, 100))
    assert.ok(fs.existsSync(puertoArchivo), 'El navegador no inició depuración')
    const puerto = fs.readFileSync(puertoArchivo, 'utf8').split('\n')[0]
    const target = await (await fetch(`http://127.0.0.1:${puerto}/json/new?about:blank`, { method: 'PUT' })).json()
    ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    let secuencia = 0
    const pendientes = new Map()
    ws.onmessage = event => {
      const m = JSON.parse(event.data)
      if (m.id && pendientes.has(m.id)) {
        const p = pendientes.get(m.id); pendientes.delete(m.id); clearTimeout(p.timer)
        if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result)
      }
    }
    const enviar = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++secuencia
      const timer = setTimeout(() => { pendientes.delete(id); reject(new Error('Tiempo de espera del navegador')) }, 10000)
      pendientes.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }))
    })
    await enviar('Page.enable')
    for (const width of [390, 1280]) for (const [ruta] of paginas) {
      await enviar('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 })
      await enviar('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${ruta}` })
      await enviar('Runtime.evaluate', { expression: "new Promise(r => { if(document.readyState==='complete') r(); else window.addEventListener('load',r,{once:true}); }).then(()=>document.fonts.ready)", awaitPromise: true })
      const resultado = await enviar('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({ viewport: innerWidth, ancho: document.documentElement.scrollWidth, navegacion: document.querySelectorAll('nav[aria-label="Navegación del ayudante"] a').length, operativos: [...document.querySelectorAll('button')].filter(b=>/Confirmar cobro|Identificar asistente|Ver detalle|Filtrar/.test(b.textContent)&&!b.matches(':disabled')).length })` })
      const medidas = JSON.parse(resultado.result.value)
      assert.ok(medidas.ancho <= width, `Desbordamiento: ${ruta} a ${width}px (${medidas.ancho})`)
      assert.equal(medidas.navegacion, 3); assert.equal(medidas.operativos, 0)
      console.log(`PASS navegador fixture: ${ruta}, ${width}px, sin desbordamiento ni cobros operativos`)
    }
    await enviar('Browser.close').catch(() => {})
  } finally {
    ws?.close(); browser.kill(); await new Promise(resolve => server.close(resolve))
    // No se elimina recursivamente el perfil: solo contiene datos ficticios en TEMP.
  }
}
pruebas().then(() => process.argv.includes('--browser') ? verificarNavegador() : undefined).catch(error => { console.error(error); process.exitCode = 1 })
