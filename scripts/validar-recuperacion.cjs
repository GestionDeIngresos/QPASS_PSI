/* eslint-disable @typescript-eslint/no-require-imports -- Pruebas aisladas sin dependencias adicionales. */
// Ejecuta los componentes reales con hooks y Auth simulados. No abre un navegador ni usa red.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const flush = () => new Promise(resolve => setImmediate(resolve))
function montar(archivo, opciones = {}) {
  const slots = [], efectos = [], storage = new Map(opciones.storage ?? [])
  let cursor = 0, tree, listener, cleanup
  const llamadas = { enviar: [], cambiar: [], salir: [] }
  const user = opciones.user === undefined ? { id: 'usuario-prueba' } : opciones.user
  const session = user && { user, expires_at: Date.now() / 1000 + 3600 }
  const auth = {
    onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() { listener = null } } } } },
    async initialize() {
      if (opciones.recuperacion) listener?.('PASSWORD_RECOVERY', session)
      return { error: opciones.errorInicial ?? null }
    },
    async getUser() { return { data: { user: opciones.userActual === undefined ? user : opciones.userActual }, error: null } },
    async resetPasswordForEmail(...args) {
      llamadas.enviar.push(args)
      if (opciones.red) throw new Error('Sin conexión')
      return { error: opciones.errorEnvio ?? null }
    },
    async updateUser(args) {
      llamadas.cambiar.push(args)
      if (opciones.cambioPendiente) await opciones.cambioPendiente
      return { error: opciones.errorCambio ?? null }
    },
    async signOut(args) {
      llamadas.salir.push(args)
      if (!opciones.errorSalida) listener?.('SIGNED_OUT', null)
      return { error: opciones.errorSalida ?? null }
    },
  }
  const client = { auth }
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = initial
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }]
    },
    useRef(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = { current: initial }
      return slots[i]
    },
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; efectos.push(fn) } },
  }
  const jsx = (type, props) => ({ type, props })
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  const context = {
    exports, URL, URLSearchParams,
    window: { location: { href: opciones.url ?? 'http://localhost:3000/reset-password', origin: 'http://localhost:3000' } },
    sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === '@/lib/supabase/client') return { createClient: () => client }
      if (name === 'next/link') return { default: 'Link' }
      if (name === '@/components/AuthCard') return { AuthCard: 'AuthCard' }
      if (name === '@/components/ui/Input') return { Input: 'Input' }
      if (name === '@/components/ui/Button') return { Button: 'Button' }
      throw new Error(`Importación no simulada: ${name}`)
    },
  }
  vm.runInNewContext(codigo, context, { filename: archivo })
  const render = () => { cursor = 0; tree = exports.default(); return tree }
  render()
  for (const efecto of efectos) cleanup = efecto()
  function nodos(node) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(nodos)
    return [node, ...nodos(node.props?.children)]
  }
  function texto(node) {
    if (Array.isArray(node)) return node.map(texto).join(' ')
    if (node && typeof node === 'object') return texto(node.props?.children)
    return typeof node === 'string' ? node : ''
  }
  return {
    opciones, llamadas, storage, render, texto: () => texto(tree),
    async listo() { await flush(); await flush(); render() },
    input(label, value) { nodos(tree).find(n => n.type === 'Input' && n.props.label === label).props.onChange({ target: { value } }); render() },
    form() { return nodos(tree).find(n => n.type === 'form') },
    async enviar() { await this.form().props.onSubmit({ preventDefault() {} }); render() },
    async boton() { await nodos(tree).find(n => n.type === 'Button').props.onClick(); render() },
    desmontar() { cleanup?.() },
  }
}
const reset = 'app/reset-password/page.tsx'
const forgot = 'app/forgot-password/page.tsx'
async function main() {
  let pruebas = 0
  async function probar(nombre, fn) { await fn(); pruebas++; console.log(`PASS: ${nombre}`) }
  await probar('correo inválido no solicita recuperación', async () => {
    const c = montar(forgot); c.input('Email registrado', 'incorrecto'); await c.enviar()
    assert.equal(c.llamadas.enviar.length, 0); assert.match(c.texto(), /correo electrónico válido/)
  })
  await probar('correo recortado, URL local y confirmación neutral', async () => {
    const c = montar(forgot); c.input('Email registrado', ' persona@example.com '); await c.enviar()
    assert.equal(c.llamadas.enviar[0][0], 'persona@example.com')
    assert.equal(c.llamadas.enviar[0][1].redirectTo, 'http://localhost:3000/reset-password')
    assert.match(c.texto(), /Si el correo está registrado/)
  })
  await probar('cuenta inexistente conserva respuesta neutral', async () => {
    const c = montar(forgot, { errorEnvio: { status: 400, code: 'user_not_found' } })
    c.input('Email registrado', 'ausente@example.com'); await c.enviar(); assert.match(c.texto(), /Si el correo está registrado/)
  })
  for (const opcion of [{ errorEnvio: { status: 429 } }, { red: true }, { errorEnvio: { status: 503 } }]) {
    await probar('error de servicio o límite permite reintentar sin confirmar envío', async () => {
      const c = montar(forgot, opcion); c.input('Email registrado', 'persona@example.com'); await c.enviar()
      assert.ok(c.form()); assert.doesNotMatch(c.texto(), /Si el correo está registrado/)
    })
  }
  for (const opciones of [{ user: null }, {}, { url: 'http://localhost:3000/reset-password?code=reutilizado', errorInicial: { code: 'invalid_grant' } }, { recuperacion: true, url: 'http://localhost:3000/reset-password#error=access_denied&error_code=otp_expired' }]) {
    await probar('sin recuperación válida no hay formulario', async () => {
      const c = montar(reset, opciones); await c.listo(); assert.equal(c.form(), undefined); assert.match(c.texto(), /Solicita uno nuevo/); c.desmontar()
    })
  }
  await probar('contraseñas cortas, espacios y diferentes no llaman updateUser', async () => {
    const c = montar(reset, { recuperacion: true }); await c.listo()
    for (const [a, b] of [['corta', 'corta'], ['        ', '        '], ['nueva-clave-123', 'distinta-123']]) {
      c.input('Nueva contraseña', a); c.input('Confirmar contraseña', b); await c.enviar()
    }
    assert.equal(c.llamadas.cambiar.length, 0)
  })
  await probar('éxito cambia contraseña y cierra sesión local antes del login', async () => {
    const c = montar(reset, { recuperacion: true }); await c.listo()
    c.input('Nueva contraseña', 'nueva-clave-123'); c.input('Confirmar contraseña', 'nueva-clave-123'); await c.enviar()
    assert.equal(c.llamadas.cambiar[0].password, 'nueva-clave-123'); assert.equal(c.llamadas.salir[0].scope, 'local')
    assert.match(c.texto(), /La sesión temporal se cerró/); assert.equal(c.storage.size, 0); assert.equal(c.form(), undefined)
  })
  await probar('fallo de cierre permite reintentar sin cambiar contraseña otra vez', async () => {
    const opciones = { recuperacion: true, errorSalida: { status: 503 } }
    const c = montar(reset, opciones); await c.listo()
    c.input('Nueva contraseña', 'nueva-clave-123'); c.input('Confirmar contraseña', 'nueva-clave-123'); await c.enviar()
    assert.doesNotMatch(c.texto(), /Iniciar sesión con la nueva contraseña/)
    opciones.errorSalida = null; await c.boton()
    assert.equal(c.llamadas.cambiar.length, 1); assert.match(c.texto(), /La sesión temporal se cerró/)
  })
  await probar('política de contraseña rechazada conserva formulario', async () => {
    const c = montar(reset, { recuperacion: true, errorCambio: { code: 'weak_password' } }); await c.listo()
    c.input('Nueva contraseña', 'nueva-clave-123'); c.input('Confirmar contraseña', 'nueva-clave-123'); await c.enviar()
    assert.ok(c.form()); assert.equal(c.llamadas.salir.length, 0); assert.match(c.texto(), /política de seguridad/)
  })
  await probar('sesión vencida al guardar invalida formulario', async () => {
    const c = montar(reset, { recuperacion: true, errorCambio: { status: 401 } }); await c.listo()
    c.input('Nueva contraseña', 'nueva-clave-123'); c.input('Confirmar contraseña', 'nueva-clave-123'); await c.enviar()
    assert.equal(c.form(), undefined); assert.equal(c.llamadas.salir.length, 0)
  })
  await probar('cambio de cuenta entre verificación y envío no cambia contraseña', async () => {
    const opciones = { recuperacion: true }; const c = montar(reset, opciones); await c.listo()
    opciones.userActual = { id: 'otro-usuario' }
    c.input('Nueva contraseña', 'nueva-clave-123'); c.input('Confirmar contraseña', 'nueva-clave-123'); await c.enviar()
    assert.equal(c.llamadas.cambiar.length, 0); assert.equal(c.form(), undefined)
  })
  await probar('recarga solo reanuda contexto vigente de la misma cuenta', async () => {
    const c = montar(reset, { recuperacion: true }); await c.listo(); c.desmontar()
    const nuevo = montar(reset, { storage: [...c.storage] }); await nuevo.listo(); assert.ok(nuevo.form())
    const ajeno = montar(reset, { user: { id: 'otro' }, storage: [...c.storage] }); await ajeno.listo(); assert.equal(ajeno.form(), undefined)
    const vencido = montar(reset, { storage: [['qpass:recuperacion', JSON.stringify({ usuario: 'usuario-prueba', vence: 1 })]] }); await vencido.listo(); assert.equal(vencido.form(), undefined)
  })
  await probar('doble envío concurrente genera una sola actualización', async () => {
    let liberar; const cambioPendiente = new Promise(resolve => { liberar = resolve })
    const c = montar(reset, { recuperacion: true, cambioPendiente }); await c.listo()
    c.input('Nueva contraseña', 'nueva-clave-123'); c.input('Confirmar contraseña', 'nueva-clave-123')
    const enviar = c.form().props.onSubmit
    const a = enviar({ preventDefault() {} }); const b = enviar({ preventDefault() {} })
    await flush(); assert.equal(c.llamadas.cambiar.length, 1); liberar(); await Promise.all([a, b])
  })
  console.log(`${pruebas} pruebas aisladas correctas. Correo, tokens reales y navegador: pendientes.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
