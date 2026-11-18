/* eslint-disable @typescript-eslint/no-require-imports -- Cámara/canvas simulados; NO prueba hardware ni Storage real. */
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict')
const ts = require('typescript'),
  React = require('react'),
  jsx = require('react/jsx-runtime')
const nodos = (n) =>
  n && typeof n === 'object'
    ? [n, ...React.Children.toArray(n.props?.children).flatMap(nodos)]
    : []
const texto = (n) =>
  typeof n === 'string' || typeof n === 'number'
    ? String(n)
    : Array.isArray(n)
      ? n.map(texto).join('')
      : n && typeof n === 'object'
        ? texto(n.props?.children)
        : ''
function fixture(op = {}) {
  const estados = [],
    refs = [],
    effects = [],
    tareas = [],
    fotos = [],
    preparando = [],
    revocadas = [],
    constraints = []
  let cursor = 0,
    refCursor = 0,
    efCursor = 0,
    stops = 0
  const video = {
    videoWidth: 640,
    videoHeight: 480,
    play: async () => {},
    srcObject: null
  }
  const stream = {
    getTracks: () => [
      {
        stop() {
          stops++
        }
      }
    ]
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
      const n = refCursor++
      return refs[n] ?? (refs[n] = { current: v })
    },
    useEffect(fn, deps) {
      const n = efCursor++,
        prev = effects[n]
      if (!prev || deps.some((d, i) => d !== prev.deps[i]))
        tareas.push(() => {
          prev?.cleanup?.()
          effects[n] = { deps, cleanup: fn() }
        })
    }
  }
  const exports = {}
  const code = ts.transpileModule(
    fs.readFileSync('components/supervisor/FotoAcceso.tsx', 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX
      }
    }
  ).outputText
  vm.runInNewContext(code, {
    exports,
    File,
    Blob,
    Date,
    URL: {
      createObjectURL: () => `blob:fixture-${fotos.length}`,
      revokeObjectURL: (v) => revocadas.push(v)
    },
    navigator: {
      mediaDevices: {
        getUserMedia: async (c) => {
          constraints.push(c)
          if (op.denegado) throw new Error('DENEGADO')
          return stream
        }
      }
    },
    document: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => (op.sinCanvas ? null : { drawImage() {} }),
        toBlob: (fn) =>
          fn(
            new Blob([new Uint8Array([255, 216, 255, 0])], {
              type: 'image/jpeg'
            })
          )
      })
    },
    require: (n) =>
      n === 'react'
        ? react
        : n === 'react/jsx-runtime'
          ? jsx
          : (() => {
              throw new Error(n)
            })()
  })
  function render() {
    cursor = 0
    refCursor = 0
    efCursor = 0
    const t = exports.FotoAcceso({
      onFoto: (f) => fotos.push(f),
      onPreparando: (v) => preparando.push(v),
      ...op.props
    })
    for (const n of nodos(t))
      if (n.props?.ref)
        n.props.ref.current = n.type === 'video' ? video : { click() {} }
    while (tareas.length) tareas.shift()()
    return t
  }
  return {
    render,
    fotos,
    preparando,
    revocadas,
    constraints,
    stops: () => stops,
    unmount: () => effects.forEach((e) => e?.cleanup?.())
  }
}
const boton = (t, s) =>
  nodos(t).find((n) => n.type === 'button' && texto(n).includes(s))
const tick = () => new Promise((r) => setImmediate(r))
async function main() {
  let total = 0
  const test = async (n, f) => {
    await f()
    total++
    console.log('PASS ' + n)
  }
  await test('componente A conserva límite 5 MB y controles separados cámara/archivo', async () => {
    const f = fixture(),
      t = f.render()
    assert.ok(boton(t, 'Abrir cámara'))
    assert.ok(boton(t, 'Elegir foto existente'))
    assert.match(texto(t), /5 MB/)
    f.unmount()
  })
  await test('devolución selecciona archivo y presenta contexto/límite 2 MB', async () => {
    const f = fixture({
      props: {
        titulo: 'Foto del usuario',
        contexto: 'la devolución',
        maxBytes: 2097152
      }
    })
    let t = f.render()
    const foto = new File([new Uint8Array([255, 216, 255, 0])], 'foto.jpg', {
      type: 'image/jpeg'
    })
    nodos(t)
      .find((n) => n.type === 'input')
      .props.onChange({ target: { files: [foto], value: 'foto.jpg' } })
    t = f.render()
    assert.equal(f.fotos[0], foto)
    assert.match(texto(t), /2 MB/)
    assert.match(nodos(t).find((n) => n.type === 'img').props.alt, /devolución/)
    f.unmount()
  })
  await test('archivo 3 MB sigue admitido en A y se rechaza en devolución B', async () => {
    const foto = new File([new Uint8Array(3 * 1048576)], 'grande.png', {
      type: 'image/png'
    })
    for (const [maxBytes, aceptado] of [
      [5242880, true],
      [2097152, false]
    ]) {
      const f = fixture({ props: { maxBytes } }),
        t = f.render()
      nodos(t)
        .find((n) => n.type === 'input')
        .props.onChange({ target: { files: [foto], value: '' } })
      assert.equal(f.fotos.length, aceptado ? 1 : 0)
      if (!aceptado) assert.match(texto(f.render()), /hasta 2 MB/)
      f.unmount()
    }
  })
  await test('captura convierte frame simulado a File JPEG y libera cámara', async () => {
    const f = fixture({
      props: { maxBytes: 2097152, contexto: 'la devolución' }
    })
    boton(f.render(), 'Abrir cámara').props.onClick()
    let t = f.render()
    await tick()
    nodos(t)
      .find((n) => n.type === 'video')
      .props.onLoadedData()
    t = f.render()
    assert.equal(boton(t, 'Tomar foto').props.disabled, false)
    boton(t, 'Tomar foto').props.onClick()
    await tick()
    f.render()
    assert.equal(f.fotos.length, 1)
    assert.equal(f.fotos[0].type, 'image/jpeg')
    assert.deepEqual(f.preparando, [true, false])
    assert.equal(f.constraints[0].audio, false)
    assert.ok(f.stops() > 0)
    f.unmount()
  })
  await test('permiso de cámara denegado informa error y mantiene selección por archivo', async () => {
    const f = fixture({ denegado: true })
    boton(f.render(), 'Abrir cámara').props.onClick()
    f.render()
    await tick()
    const t = f.render()
    assert.match(texto(t), /No se pudo abrir la cámara/)
    assert.ok(boton(t, 'Elegir foto existente'))
    assert.equal(f.fotos.length, 0)
    f.unmount()
  })
  await test('desmontar detiene tracks y revoca previsualización de archivo', async () => {
    const f = fixture()
    let t = f.render()
    nodos(t)
      .find((n) => n.type === 'input')
      .props.onChange({
        target: {
          files: [new File(['x'], 'f.jpg', { type: 'image/jpeg' })],
          value: ''
        }
      })
    t = f.render()
    boton(t, 'Tomar otra foto').props.onClick()
    f.render()
    await tick()
    f.unmount()
    assert.ok(f.stops() > 0)
    assert.equal(f.revocadas.length, 1)
  })
  await test('fallo de canvas libera estado preparando y permite reintento', async () => {
    const f = fixture({ sinCanvas: true })
    boton(f.render(), 'Abrir cámara').props.onClick()
    let t = f.render()
    await tick()
    nodos(t)
      .find((n) => n.type === 'video')
      .props.onLoadedData()
    t = f.render()
    boton(t, 'Tomar foto').props.onClick()
    t = f.render()
    assert.deepEqual(f.preparando, [true, false])
    assert.match(texto(t), /No se pudo tomar la foto/)
    assert.equal(f.fotos.length, 0)
    f.unmount()
  })
  console.log(
    `${total} pruebas de foto aprobadas con cámara/canvas simulados. Hardware, permisos reales y Storage siguen pendientes.`
  )
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
