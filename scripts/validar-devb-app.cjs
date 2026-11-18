/* eslint-disable @typescript-eslint/no-require-imports -- Sesiones/Storage/RPC simulados, sin red. */
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict')
const ts = require('typescript'),
  React = require('react'),
  jsx = require('react/jsx-runtime')
const { webcrypto } = require('node:crypto')
const { renderToStaticMarkup } = require('react-dom/server')
function cargar(archivo, deps = {}, globals = {}) {
  const exports = {}
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText
  vm.runInNewContext(
    codigo,
    {
      exports,
      File,
      FormData,
      Uint8Array,
      ArrayBuffer,
      crypto: webcrypto,
      ...globals,
      require(n) {
        if (n in deps) return deps[n]
        throw new Error('Importación no simulada: ' + n)
      }
    },
    { filename: archivo }
  )
  return exports
}
const validacion = cargar('lib/saldos/validacion.ts')
const key = '10000000-0000-0000-0000-000000000001'
const confirmada = {
  id: 1,
  referencia: 'QR-1',
  puntos: '4.00',
  importe: '10.00',
  saldo: '104.00',
  simulada: true
}
function acciones(op = {}) {
  const llamadas = [],
    roles = [],
    rutas = [],
    subidas = []
  const sesion = {
    user: { id: 'fixture-user' },
    perfil: { rol: 'devolucion', activo: true },
    supabase: {
      rpc: async (n, p) => {
        llamadas.push({ n, p })
        if (op.red) throw new Error('Sin red')
        return op.respuesta ?? { data: confirmada, error: null }
      },
      storage: {
        from: (bucket) => ({
          upload: async (ruta, archivo, options) => {
            subidas.push({ bucket, ruta, archivo, options })
            return { error: op.conflicto ? {} : null }
          },
          download: async () => ({ data: op.existente ?? null })
        })
      }
    }
  }
  const m = cargar('lib/saldos/actions.ts', {
    './server': {
      exigirCuenta: async () => sesion,
      exigirPersonal: async (rol) => {
        roles.push(rol)
        if (op.denegado) throw new Error('DENEGADO')
        return sesion
      },
      eventosCaja: async () => (op.ajeno ? [] : [{ id: 1 }])
    },
    'next/cache': { revalidatePath: (r) => rutas.push(r) },
    '@/lib/qr/server': {
      identificarQr: async () => ({ identificacionValida: !op.qrInvalido })
    },
    './validacion': validacion
  })
  return { ...m, llamadas, roles, rutas, subidas }
}
async function main() {
  let total = 0
  const test = async (n, f) => {
    await f()
    total++
    console.log('PASS ' + n)
  }
  await test('importes como texto con precisión exacta; no exponentes/NaN/comas/negativos', async () => {
    for (const x of [
      1,
      NaN,
      'NaN',
      '1e3',
      '1,25',
      '-1',
      '0',
      '1.001',
      '100000000',
      ' 10 ',
      ''
    ])
      assert.equal(validacion.importeValido(x), false)
    for (const x of ['0.01', '10', '10.1', '99999999.99'])
      assert.equal(validacion.importeValido(x), true)
    assert.equal(validacion.importeValido('0', true), true)
    assert.equal(validacion.normalizarImporte('10.1'), '10.10')
  })
  await test('roles arbitrarios y parámetros inválidos no invocan RPC', async () => {
    const a = acciones()
    assert.ok((await a.consultarPersona('admin', 1, 'QR')).error)
    for (const monto of ['1.001', '-1', 'NaN', '1e3'])
      assert.equal(
        (await a.confirmarRecarga(1, 'QR', monto, key)).estado,
        'rechazada'
      )
    assert.equal(
      (await a.confirmarDevolucion(1, 'QR', '1', 'x', 'y', 'otro')).estado,
      'rechazada'
    )
    assert.equal(a.llamadas.length, 0)
  })
  await test('guard de sesión precede cada escritura', async () => {
    for (const f of [
      (a) => a.confirmarRecarga(1, 'QR', '10', key),
      (a) => a.confirmarAjuste(1, '0', 'Motivo válido', key),
      (a) => a.enviarReporte(1, 'Reporte válido', key),
      (a) => a.confirmarDevolucion(1, 'QR', '1', 'x', 'y', key)
    ]) {
      const a = acciones({ denegado: true })
      await assert.rejects(() => f(a), /DENEGADO/)
      assert.equal(a.llamadas.length, 0)
    }
  })
  await test('recarga envía contrato explícito sin usuario/precio/saldo inyectados', async () => {
    const a = acciones()
    const r = await a.confirmarRecarga(1, ' QR ', '10.1', key)
    assert.equal(r.estado, 'confirmada')
    assert.equal(a.roles[0], 'recargador')
    assert.deepEqual(JSON.parse(JSON.stringify(a.llamadas[0])), {
      n: 'registrar_recarga',
      p: { p_evento: 1, p_codigo: 'QR', p_monto: '10.10', p_solicitud: key }
    })
    assert.ok(a.rutas.includes('/mi-cuenta/saldos'))
  })
  await test('rechazo SQL acredita rollback; red/HTTP/respuesta mal formada conserva incertidumbre', async () => {
    for (const code of ['P0001', '42501', '23514']) {
      const a = acciones({
        respuesta: { error: { code, message: 'SALDO_INSUFICIENTE' } }
      })
      assert.equal(
        (await a.confirmarRecarga(1, 'QR', '10', key)).estado,
        'rechazada'
      )
    }
    for (const op of [
      { red: true },
      { respuesta: { data: {}, error: null } },
      { respuesta: { error: { code: 'FETCH_ERROR', message: 'error' } } }
    ]) {
      const a = acciones(op)
      assert.equal(
        (await a.confirmarRecarga(1, 'QR', '10', key)).estado,
        'incierto'
      )
      assert.equal(a.rutas.length, 0)
    }
  })
  await test('reintentos de recarga/ajuste conservan UUID y payload', async () => {
    const a = acciones({ red: true })
    await a.confirmarRecarga(1, 'QR', '10', key)
    await a.confirmarRecarga(1, 'QR', '10', key)
    assert.deepEqual(a.llamadas[0], a.llamadas[1])
    const b = acciones()
    await b.confirmarAjuste(3, '0', 'Error de importe', key)
    assert.equal(b.llamadas[0].n, 'ajustar_recarga')
    assert.equal(b.llamadas[0].p.p_monto_correcto, '0.00')
  })
  await test('entrada usada válida se acepta; identificación inválida no consulta saldo', async () => {
    const a = acciones({ qrInvalido: true })
    assert.ok((await a.consultarPersona('devolucion', 1, 'QR')).error)
    assert.equal(a.llamadas.length, 0)
    const b = acciones({
      respuesta: {
        data: {
          nombre: 'Prueba',
          entradaId: 1,
          saldo: '5.00',
          reservado: '2.00',
          disponible: '3.00'
        },
        error: null
      }
    })
    assert.equal(
      (await b.consultarPersona('devolucion', 1, 'QR')).persona.disponible,
      '3.00'
    )
  })
  await test('upload exige foto real por firma, límite, tipo y evento autorizado', async () => {
    const form = (file) => {
      const f = new FormData()
      f.set('archivo', file)
      f.set('evento', '1')
      f.set('solicitud', key)
      f.set('tipo', 'foto')
      return f
    }
    const a = acciones()
    assert.ok(
      (
        await a.subirEvidencia(
          form(new File(['no es imagen'], 'f.jpg', { type: 'image/jpeg' }))
        )
      ).error
    )
    assert.equal(a.subidas.length, 0)
    const foto = new File([new Uint8Array([255, 216, 255, 0])], 'f.jpg', {
      type: 'image/jpeg'
    })
    const b = acciones({ ajeno: true })
    assert.ok((await b.subirEvidencia(form(foto))).error)
    assert.equal(b.subidas.length, 0)
    const c = acciones()
    assert.match(
      (await c.subirEvidencia(form(foto))).ruta,
      /fixture-user\/1\/.+\/foto.jpg/
    )
    assert.equal(c.subidas[0].options.upsert, false)
    assert.equal(c.subidas[0].bucket, 'devb-evidencias')
    const d = acciones({
      conflicto: true,
      existente: new Blob(['otra imagen'])
    })
    assert.ok((await d.subirEvidencia(form(foto))).error)
    const e = acciones({ conflicto: true, existente: foto })
    assert.ok((await e.subirEvidencia(form(foto))).ruta)
  })
  await test('devolución solo remite puntos y evidencias, nunca saldo de cliente', async () => {
    const a = acciones()
    await a.confirmarDevolucion(1, ' QR ', '1.5', 'comprobante', 'foto', key)
    assert.equal(a.roles[0], 'devolucion')
    assert.equal(a.llamadas[0].p.p_puntos, '1.50')
    assert.equal(a.llamadas[0].p.p_foto, 'foto')
    assert.equal(a.llamadas[0].p.usuario_id, undefined)
  })
  await test('reporte usa tabla/RPC de A y no una actualización de saldo', async () => {
    const a = acciones({ respuesta: { data: 8, error: null } })
    assert.equal((await a.enviarReporte(1, 'Error reportado', key)).id, 8)
    assert.equal(a.llamadas[0].n, 'reportar_recarga')
    assert.ok(a.rutas.includes('/admin/reportes'))
  })
  await test('ticket ajeno no revela propietario por consulta de cliente', async () => {
    const a = acciones({ respuesta: { data: null, error: null } })
    assert.equal((await a.localizarTicket('FISICO', 1)).ticket, null)
    assert.equal(a.llamadas[0].n, 'consultar_ticket_extraviado')
  })
  await test('layouts/acciones deniegan cuenta inactiva y roles cruzados', async () => {
    function server(perfil) {
      return cargar('lib/saldos/server.ts', {
        'server-only': {},
        'next/navigation': {
          redirect(destino) {
            throw new Error(destino)
          }
        },
        '@/lib/auth/sesion': {
          obtenerSesionActual: async () =>
            perfil === null ? null : { perfil, user: { id: 'X' } }
        }
      })
    }
    await assert.rejects(
      () => server(null).exigirPersonal('recargador'),
      /login/
    )
    for (const perfil of [
      { rol: 'recargador', activo: false },
      { rol: 'devolucion', activo: true },
      { rol: 'cliente', activo: true }
    ])
      await assert.rejects(
        () => server(perfil).exigirPersonal('recargador'),
        /eventos/
      )
    assert.equal(
      (
        await server({ rol: 'admin', activo: true }).exigirPersonal(
          'devolucion'
        )
      ).perfil.rol,
      'admin'
    )
  })
  await test('render de caja sin asignaciones no habilita formularios monetarios', async () => {
    const m = cargar('components/saldos/Caja.tsx', {
      react: React,
      'react/jsx-runtime': jsx,
      'next/navigation': { useRouter: () => ({}) },
      '@/components/qr/LectorQr': { LectorQr: () => null },
      '@/components/supervisor/FotoAcceso': { FotoAcceso: () => null },
      '@/lib/saldos/actions': {},
      '@/lib/saldos/validacion': validacion
    })
    const html = renderToStaticMarkup(
      React.createElement(m.Caja, {
        rol: 'recargador',
        eventos: [],
        cuentaId: 'X'
      })
    )
    assert.match(html, /No tienes eventos asignados/)
    assert.doesNotMatch(html, /Confirmar operación/)
    const configurada = renderToStaticMarkup(
      React.createElement(m.Caja, {
        rol: 'devolucion',
        eventos: [{ id: 1, titulo: 'Fixture', tasa: null }],
        cuentaId: 'X'
      })
    )
    assert.match(configurada, /Conversión pendiente/)
    assert.match(configurada, /Operación simulada/)
  })
  await test('caja recupera intento incierto tras recargar y no permite cancelar ni cambiar su payload', async () => {
    const memoria = new Map(),
      solicitudes = []
    const storage = {
      getItem: (k) => memoria.get(k) ?? null,
      setItem: (k, v) => memoria.set(k, v),
      removeItem: (k) => memoria.delete(k)
    }
    let estados = [],
      refs = [],
      cursor = 0,
      refCursor = 0,
      trabajo = Promise.resolve()
    const fakeReact = {
      useState(inicial) {
        const n = cursor++
        if (!(n in estados)) estados[n] = inicial
        return [
          estados[n],
          (v) => {
            estados[n] = typeof v === 'function' ? v(estados[n]) : v
          }
        ]
      },
      useRef(inicial) {
        const n = refCursor++
        return refs[n] ?? (refs[n] = { current: inicial })
      },
      useTransition() {
        return [
          false,
          (fn) => {
            trabajo = Promise.resolve(fn())
          }
        ]
      }
    }
    const m = cargar(
      'components/saldos/Caja.tsx',
      {
        react: fakeReact,
        'react/jsx-runtime': jsx,
        'next/navigation': { useRouter: () => ({ refresh() {} }) },
        '@/components/qr/LectorQr': { LectorQr: () => null },
        '@/components/supervisor/FotoAcceso': { FotoAcceso: () => null },
        '@/lib/saldos/validacion': validacion,
        '@/lib/saldos/actions': {
          consultarPersona: async () => ({
            persona: {
              nombre: 'Prueba',
              entradaId: 1,
              saldo: '100.00',
              reservado: '0.00',
              disponible: '100.00'
            }
          }),
          confirmarRecarga: async (...args) => {
            solicitudes.push(args)
            return solicitudes.length === 1
              ? { estado: 'incierto', mensaje: 'Red perdida' }
              : solicitudes.length === 2
                ? {
                    estado: 'rechazada',
                    mensaje: 'Permisos revocados después del primer envío'
                  }
                : { estado: 'confirmada', operacion: confirmada }
          }
        }
      },
      { sessionStorage: storage }
    )
    function render() {
      cursor = 0
      refCursor = 0
      return m.Caja({
        rol: 'recargador',
        eventos: [{ id: 1, titulo: 'Fixture', tasa: '2.5' }],
        cuentaId: 'A'
      })
    }
    function nodos(n) {
      if (!n || typeof n !== 'object') return []
      return [n, ...React.Children.toArray(n.props?.children).flatMap(nodos)]
    }
    const texto = (n) =>
      typeof n === 'string'
        ? n
        : Array.isArray(n)
          ? n.map(texto).join('')
          : n && typeof n === 'object'
            ? texto(n.props?.children)
            : ''
    const boton = (t, s) =>
      nodos(t).find((n) => n.type === 'button' && texto(n).includes(s))
    let t = render()
    const inputs = nodos(t).filter((n) => n.type === 'input')
    inputs[0].props.onChange({ target: { value: 'QR' } })
    inputs[1].props.onChange({ target: { value: '10' } })
    t = render()
    boton(t, 'Identificar y consultar').props.onClick()
    await trabajo
    t = render()
    boton(t, 'Revisar').props.onClick()
    assert.equal(memoria.size, 1)
    t = render()
    boton(t, 'Confirmar operación').props.onClick()
    await trabajo
    t = render()
    assert.equal(boton(t, 'Cancelar revisión').props.disabled, true)
    assert.ok(
      nodos(t)
        .filter((n) => n.type === 'input')
        .every((n) => n.props.disabled)
    )
    const pendiente = JSON.parse([...memoria.values()][0])
    assert.equal(pendiente.enviado, true)
    estados = []
    refs = []
    t = render()
    boton(t, 'Recuperar intento').props.onClick()
    t = render()
    assert.equal(boton(t, 'Cancelar revisión').props.disabled, true)
    boton(t, 'Reintentar mismo intento').props.onClick()
    await trabajo
    assert.deepEqual(solicitudes[0], solicitudes[1])
    t = render()
    assert.equal(
      boton(t, 'Cancelar revisión').props.disabled,
      true,
      'Un rechazo posterior no prueba rollback del primer envío incierto'
    )
    assert.equal(JSON.parse([...memoria.values()][0]).enviado, true)
    boton(t, 'Reintentar mismo intento').props.onClick()
    await trabajo
    assert.deepEqual(solicitudes[0], solicitudes[2])
    assert.equal(memoria.size, 0)
  })
  await test('solicitud virtual conserva UUID e importe textual; reintento recupera resultado sin reservar otra vez', async () => {
    const archivo = new File([new Uint8Array([255, 216, 255, 0])], 'qr.jpg', {
      type: 'image/jpeg'
    })
    const llamadas = [],
      subidas = [],
      ruta = `fixture-user/1/${key}.jpg`
    let recuperada = false
    const sesion = {
      user: { id: 'fixture-user' },
      perfil: { activo: true },
      supabase: {
        rpc: async (n, p) => {
          llamadas.push({ n, p })
          return {
            error: null,
            data:
              n === 'devc_mis_solicitudes_devolucion'
                ? recuperada
                  ? [{ qrRuta: ruta, monto: '12.34' }]
                  : []
                : n === 'devc_eventos_devolucion_cliente'
                  ? [{ eventoId: 1, disponible: '12.34' }]
                  : 1
          }
        },
        storage: {
          from: () => ({
            upload: async (r) => {
              subidas.push(r)
              return { error: null }
            },
            download: async () => ({ data: archivo })
          })
        }
      }
    }
    const m = cargar('app/mi-cuenta/devoluciones/actions.ts', {
      'next/cache': { revalidatePath() {} },
      '@/lib/auth/sesion': { obtenerSesionActual: async () => sesion },
      '@/lib/saldos/validacion': validacion
    })
    const f = new FormData()
    f.set('eventoId', '1')
    f.set('solicitud', key)
    f.set('archivo', archivo)
    assert.equal((await m.solicitarDevolucion(f)).ok, true)
    assert.equal(
      llamadas.find((x) => x.n === 'crear_solicitud_devolucion').p.p_monto,
      '12.34'
    )
    assert.equal(subidas[0], ruta)
    recuperada = true
    llamadas.length = 0
    assert.equal((await m.solicitarDevolucion(f)).ok, true)
    assert.equal(llamadas.length, 1)
    assert.equal(subidas.length, 1)
  })
  await test('reportes distinguen rechazo definitivo de respuesta de red incierta', async () => {
    const rechazado = acciones({
      respuesta: {
        data: null,
        error: { code: '42501', message: 'SIN_PERMISOS' }
      }
    })
    assert.equal(
      (await rechazado.enviarReporte(1, 'Reporte válido', key)).incierto,
      false
    )
    assert.equal(
      (await acciones({ red: true }).enviarReporte(1, 'Reporte válido', key))
        .incierto,
      true
    )
    assert.equal(
      (
        await acciones({
          respuesta: { data: null, error: null }
        }).enviarReporte(1, 'Reporte válido', key)
      ).incierto,
      true
    )
  })
  await test('ajuste incierto conserva intento tras rechazo de reintento y recarga de página', async () => {
    let estados = [],
      refs = [],
      cursor = 0,
      rc = 0,
      trabajo = Promise.resolve()
    const memoria = new Map(),
      peticiones = []
    const storage = {
      getItem: (k) => memoria.get(k) ?? null,
      setItem: (k, v) => memoria.set(k, v),
      removeItem: (k) => memoria.delete(k)
    }
    const react = {
      useState(v) {
        const n = cursor++
        if (!(n in estados)) estados[n] = v
        return [
          estados[n],
          (x) => (estados[n] = typeof x === 'function' ? x(estados[n]) : x)
        ]
      },
      useRef(v) {
        const n = rc++
        return refs[n] ?? (refs[n] = { current: v })
      },
      useTransition() {
        return [
          false,
          (f) => {
            trabajo = Promise.resolve(f())
          }
        ]
      }
    }
    const m = cargar(
      'components/saldos/GestionRecarga.tsx',
      {
        react,
        'react/jsx-runtime': jsx,
        'next/navigation': { useRouter: () => ({ refresh() {} }) },
        '@/lib/saldos/validacion': validacion,
        '@/lib/saldos/actions': {
          confirmarAjuste: async (...args) => {
            peticiones.push(args)
            return peticiones.length === 1
              ? { estado: 'incierto', mensaje: 'Sin respuesta' }
              : peticiones.length === 2
                ? { estado: 'rechazada', mensaje: 'SIN_PERMISOS' }
                : { estado: 'confirmada', operacion: confirmada }
          }
        }
      },
      { sessionStorage: storage }
    )
    const nodos = (n) =>
      n && typeof n === 'object'
        ? [n, ...React.Children.toArray(n.props?.children).flatMap(nodos)]
        : []
    const texto = (n) =>
      typeof n === 'string'
        ? n
        : Array.isArray(n)
          ? n.map(texto).join('')
          : n && typeof n === 'object'
            ? texto(n.props?.children)
            : ''
    const render = () => {
      cursor = 0
      rc = 0
      return m.GestionRecarga({ id: 1, cuentaId: 'X', ajustable: true })
    }
    const boton = (t, s) =>
      nodos(t).find((n) => n.type === 'button' && texto(n).includes(s))
    let t = render()
    nodos(t)
      .find((n) => n.type === 'select')
      .props.onChange({ target: { value: 'ajuste' } })
    t = render()
    nodos(t)
      .find((n) => n.type === 'input')
      .props.onChange({ target: { value: '5' } })
    nodos(t)
      .find((n) => n.type === 'textarea')
      .props.onChange({ target: { value: 'Corrección explícita' } })
    t = render()
    boton(t, 'Revisar').props.onClick()
    t = render()
    boton(t, 'Confirmar').props.onClick()
    await trabajo
    t = render()
    assert.equal(boton(t, 'Cancelar revisión').props.disabled, true)
    boton(t, 'Reintentar mismo').props.onClick()
    await trabajo
    t = render()
    assert.equal(boton(t, 'Cancelar revisión').props.disabled, true)
    estados = []
    refs = []
    t = render()
    boton(t, 'Recuperar intento').props.onClick()
    t = render()
    assert.equal(boton(t, 'Cancelar revisión').props.disabled, true)
    boton(t, 'Reintentar mismo').props.onClick()
    await trabajo
    assert.deepEqual(peticiones[0], peticiones[2])
    assert.equal(memoria.size, 0)
  })
  console.log(
    `${total} pruebas de aplicación Dev B aprobadas. Fixtures aislados, sin Supabase ni archivos privados reales.`
  )
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
