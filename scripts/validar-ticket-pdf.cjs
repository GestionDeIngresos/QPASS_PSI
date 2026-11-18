/* eslint-disable @typescript-eslint/no-require-imports -- Validación Node fuera del bundle. */
// Usa jsPDF, qrcode y el decodificador ZXing instalados. Sin red ni datos reales.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { jsPDF } = require('jspdf')
const QRCode = require('qrcode')
const { PNG } = require('pngjs')
const { RGBLuminanceSource, BinaryBitmap, HybridBinarizer, QRCodeReader } = require('@zxing/library')

const documentos = [], codigos = [], cache = new Map()
function Documento(opciones) {
  const doc = new jsPDF(opciones)
  const registro = { doc, textos: [], imagenes: [] }
  const text = doc.text.bind(doc), addImage = doc.addImage.bind(doc)
  doc.text = (texto, x, y, opcionesTexto) => {
    assert.equal(typeof texto, 'string')
    registro.textos.push({ texto, x, y, tamano: doc.getFontSize(), ancho: doc.getTextWidth(texto), align: opcionesTexto?.align, pagina: doc.getCurrentPageInfo().pageNumber })
    return text(texto, x, y, opcionesTexto)
  }
  doc.addImage = (imagen, tipo, x, y, w, h) => {
    registro.imagenes.push({ x, y, w, h, pagina: doc.getCurrentPageInfo().pageNumber })
    return addImage(imagen, tipo, x, y, w, h)
  }
  doc.save = nombre => {
    registro.nombre = nombre
    registro.pdf = Buffer.from(doc.output('arraybuffer'))
    return doc
  }
  documentos.push(registro)
  return doc
}
function cargar(archivo) {
  archivo = path.resolve(archivo)
  if (cache.has(archivo)) return cache.get(archivo)
  const exports = {}
  cache.set(archivo, exports)
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(codigo, { exports, require(nombre) {
    if (nombre === 'jspdf') return { jsPDF: Documento }
    if (nombre === 'qrcode') return { async toDataURL(valor, opciones) {
      const imagen = await QRCode.toDataURL(valor, opciones)
      codigos.push({ valor, opciones, imagen })
      return imagen
    } }
    if (nombre.startsWith('.')) return cargar(path.resolve(path.dirname(archivo), nombre + '.ts'))
    throw new Error(`Importación inesperada: ${nombre}`)
  } }, { filename: archivo })
  return exports
}
function decodificar(imagen) {
  const png = PNG.sync.read(Buffer.from(imagen.split(',')[1], 'base64'))
  const luminancia = new Uint8ClampedArray(png.width * png.height)
  for (let i = 0; i < luminancia.length; i++) {
    const [r, g, b, a] = png.data.subarray(i * 4, i * 4 + 4)
    assert.equal(a, 255)
    luminancia[i] = (r + 2 * g + b) / 4
  }
  assert.deepEqual([...png.data.subarray(0, 4)], [255, 255, 255, 255])
  return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminancia, png.width, png.height)))).getText()
}
function verificarGeometria(registro) {
  const w = registro.doc.internal.pageSize.getWidth(), h = registro.doc.internal.pageSize.getHeight()
  const cuerpos = registro.textos.filter(t => t.y > 28)
  for (const t of cuerpos) {
    const izquierda = t.align === 'center' ? t.x - t.ancho / 2 : t.x
    assert.ok(izquierda >= 13.5 && izquierda + t.ancho <= w - 13.5, 'Texto fuera del ancho imprimible')
    assert.ok(t.y - t.tamano * 0.3528 > 28 && t.y <= h - 14, 'Texto fuera del alto imprimible')
  }
  for (const imagen of registro.imagenes) {
    assert.ok(imagen.y >= 42 && imagen.y + imagen.h <= h - 14, 'QR fuera de página')
    for (const t of cuerpos.filter(t => t.pagina === imagen.pagina)) {
      assert.ok(t.y < imagen.y || t.y - t.tamano * 0.3528 > imagen.y + imagen.h, 'Texto superpuesto al QR')
    }
  }
  for (let i = 1; i < cuerpos.length; i++) {
    const anterior = cuerpos[i - 1], actual = cuerpos[i]
    if (anterior.pagina === actual.pagina) assert.ok(actual.y - actual.tamano * 0.3528 > anterior.y, 'Líneas superpuestas')
  }
}
const base = {
  id: '123', compra_id: '456', codigo_qr: 'QP-0123456789ABCDEF0123456789ABCDEF', estado: 'activa', creado_en: '2026-11-14T00:00:00Z',
  tipo_ticket: { id: '7', nombre: 'General', precio: 10 },
  evento: { id: '8', titulo: 'Concierto de prueba', foto_url: null, ubicacion: 'Plaza de prueba', fecha_evento: '2026-12-03T01:30:00Z', tipo_acceso: 'qr_digital' },
}
async function main() {
  const { generarTicketPdf } = cargar('lib/compras/pdf.ts')
  const casos = [
    ['digital', base],
    ['recogida', { ...base, evento: { ...base.evento, tipo_acceso: 'qr_fisico' } }],
    ['textos extensos', { ...base, tipo_ticket: { ...base.tipo_ticket, nombre: 'Tipo muy extenso '.repeat(50) }, evento: { ...base.evento, titulo: 'Nombre de evento muy extenso '.repeat(100), ubicacion: 'Ubicación de prueba con descripción extensa '.repeat(100), tipo_acceso: 'qr_fisico' } }],
    ['ubicación pendiente y código largo', { ...base, codigo_qr: 'QP-' + 'A'.repeat(252), evento: { ...base.evento, ubicacion: null } }],
  ]
  for (const [nombre, entrada] of casos) {
    const antes = JSON.stringify(entrada)
    await generarTicketPdf(entrada)
    const doc = documentos.at(-1), qr = codigos.at(-1)
    assert.equal(JSON.stringify(entrada), antes, 'No mutar la entrada')
    assert.equal(doc.pdf.subarray(0, 5).toString(), '%PDF-')
    assert.match(doc.nombre, /^ticket-(digital|recogida)-[\w.-]+\.pdf$/)
    assert.equal(qr.valor, entrada.codigo_qr)
    assert.equal(decodificar(qr.imagen), entrada.codigo_qr, 'ZXing debe recuperar exactamente el QR original')
    assert.equal(qr.opciones.margin, 4)
    const textos = doc.textos.filter(t => t.y > 28).map(t => t.texto).join(' ')
    assert.ok(textos.includes('2026') && textos.includes('21:30'), 'Fecha en Bolivia con año')
    assert.ok(textos.includes('Tipo de entrada:'))
    if (entrada.evento.tipo_acceso === 'qr_fisico') {
      assert.match(textos, /QR de recogida/)
      assert.match(textos, /no sustituye la manilla/)
      assert.doesNotMatch(textos, /Presenta este código QR en el acceso/)
    } else {
      assert.match(textos, /Presenta este código QR en el acceso/)
    }
    if (!entrada.evento.ubicacion) assert.match(textos, /Ubicación: Por confirmar/)
    if (nombre === 'textos extensos') {
      assert.ok(doc.doc.getNumberOfPages() > 1)
      // Al unir líneas solo se normalizan espacios introducidos por el salto.
      const normalizar = t => t.replace(/\s+/g, ' ').trim()
      assert.ok(normalizar(textos).includes(normalizar(entrada.evento.titulo)))
      assert.ok(normalizar(textos).includes(normalizar(entrada.evento.ubicacion)))
      assert.ok(normalizar(textos).includes(normalizar(entrada.tipo_ticket.nombre)))
    }
    verificarGeometria(doc)
    console.log(`PASS: ${nombre}; PDF real, geometría y QR decodificado`)
  }
  await assert.rejects(() => generarTicketPdf({ ...base, codigo_qr: '' }))
  await assert.rejects(() => generarTicketPdf({ ...base, evento: { ...base.evento, tipo_acceso: 'desconocido' } }))
  console.log('PASS: QR vacío y tipo desconocido rechazados')
  console.log('Sin archivos PDF persistidos, sin red. RLS remoto, impresión y cámara: pendientes.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
