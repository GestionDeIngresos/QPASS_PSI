/* eslint-disable @typescript-eslint/no-require-imports -- Pruebas aisladas sin servicios externos. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');

function cargar(archivo, deps = {}) {
  const exports = {};
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(codigo, { exports, Date, require(n) {
    assert.ok(n in deps, `Dependencia externa no autorizada: ${n}`);
    return deps[n];
  } }, { filename: archivo });
  return exports;
}
const carritoCore = cargar('lib/ayudante/carrito.ts');
const { crearCatalogoDemostracion } = cargar('lib/ayudante/demo/catalogo.ts', { 'server-only': {} });
const demo = cargar('lib/ayudante/demo/venta.ts', { '../carrito': carritoCore });
const catalogo = crearCatalogoDemostracion(7);
const carrito = { negocioId: 'demo-bebidas', lineas: [{ productoId: 'demo-agua', cantidad: 3 }] };
const fecha = '2026-11-17T14:00:00.000Z';
let pruebas = 0;
function probar(nombre, fn) { fn(); pruebas++; console.log(`PASS ${nombre}`); }

probar('saldo inicial 100, compra 15 y saldo final 85 sin mutar el estado anterior', () => {
  const previo = demo.iniciarDemo();
  const siguiente = demo.confirmarVentaDemo(previo, catalogo, carrito, demo.QR_DEMO, fecha);
  assert.equal(previo.saldo, '100'); assert.equal(previo.ventas.length, 0);
  assert.equal(siguiente.saldo, '85'); assert.equal(siguiente.ventas[0].total, '15');
  assert.equal(demo.resumenDemo(siguiente).cantidad, 1); assert.equal(demo.resumenDemo(siguiente).puntos, '15');
});
probar('QR reales, vacíos y variantes del QR demo se rechazan', () => {
  for (const qr of ['', 'QR-REAL-123', 'https://qpass.test/qr/123', demo.QR_DEMO + ' '])
    assert.throws(() => demo.confirmarVentaDemo(demo.iniciarDemo(), catalogo, carrito, qr, fecha), /QR ficticio/);
});
probar('productos reales, carrito vacío y cantidades inválidas se rechazan', () => {
  for (const c of [{ negocioId: '1', lineas: [{ productoId: '1', cantidad: 1 }] },
    { negocioId: 'demo-bebidas', lineas: [] },
    { ...carrito, lineas: [{ productoId: 'demo-agua', cantidad: -1 }] },
    { ...carrito, lineas: [{ productoId: 'demo-refresco', cantidad: 1 }] }])
    assert.throws(() => demo.confirmarVentaDemo(demo.iniciarDemo(), catalogo, c, demo.QR_DEMO, fecha));
});
probar('saldo insuficiente no modifica ventas ni puntos', () => {
  const previo = demo.iniciarDemo();
  assert.throws(() => demo.confirmarVentaDemo(previo, catalogo, { ...carrito, lineas: [{ productoId: 'demo-agua', cantidad: 21 }] }, demo.QR_DEMO, fecha), /insuficiente/);
  assert.equal(previo.saldo, '100'); assert.equal(previo.ventas.length, 0);
});
probar('comprobante conserva productos, cantidades, fecha, referencia y precios históricos', () => {
  const v = demo.confirmarVentaDemo(demo.iniciarDemo(), catalogo, carrito, demo.QR_DEMO, fecha).ventas[0];
  assert.equal(v.referencia, 'DEMO-0001'); assert.equal(v.fecha, fecha);
  assert.equal(v.items[0].cantidad, 3); assert.equal(v.items[0].precio, '5'); assert.equal(v.items[0].subtotal, '15');
  const copia = JSON.stringify(v);
  const otro = crearCatalogoDemostracion(7); otro.productos[0].nombre = 'Cambio'; otro.productos[0].precioEnPuntos = '99';
  assert.equal(JSON.stringify(v), copia);
});
probar('ventas sucesivas acumulan dashboard, referencias y saldo sin errores decimales', () => {
  const c = { ...carrito, lineas: [{ productoId: 'demo-jugo', cantidad: 1 }] };
  let estado = demo.iniciarDemo();
  for (let i = 0; i < 2; i++) estado = demo.confirmarVentaDemo(estado, catalogo, c, demo.QR_DEMO, fecha);
  assert.equal(estado.saldo, '83'); assert.equal(estado.ventas[0].referencia, 'DEMO-0002');
  assert.equal(demo.resumenDemo(estado).puntos, '17'); assert.equal(demo.resumenDemo(estado).cantidad, 2);
});

probar('flujo interactivo completo: identificación, confirmación única, comprobante, historial y dashboard', () => {
  const estados = []; let indice = 0;
  const componente = cargar('components/ayudante/VentaDemostracion.tsx', {
    react: { useState(inicial) {
      const i = indice++;
      if (!(i in estados)) estados[i] = typeof inicial === 'function' ? inicial() : inicial;
      return [estados[i], v => { estados[i] = typeof v === 'function' ? v(estados[i]) : v; }];
    } }, 'react/jsx-runtime': jsx,
    'next/link': { default: ({ children, ...p }) => React.createElement('a', p, children) },
    'qrcode.react': { QRCodeSVG: () => React.createElement('svg', { 'data-demo': true }) },
    './CatalogoCarrito': { CatalogoCarrito: () => null },
    '@/lib/ayudante/carrito': carritoCore, '@/lib/ayudante/demo/venta': demo,
  });
  let arbol;
  function render() { indice = 0; arbol = componente.VentaDemostracion({ catalogo }); return renderToStaticMarkup(arbol); }
  function nodos(n) {
    if (!n || typeof n !== 'object') return [];
    if (Array.isArray(n)) return n.flatMap(nodos);
    return [n, ...nodos(n.props?.children)];
  }
  function pulsar(texto) {
    const n = nodos(arbol).find(n => n.type === 'button' &&
      (n.props.children === texto || (Array.isArray(n.props.children) && n.props.children.join('') === `${texto} · demo`)));
    assert.ok(n, `Botón: ${texto}`); assert.ok(!n.props.disabled, `Habilitado: ${texto}`);
    n.props.onClick(); return render();
  }
  let html = render();
  assert.doesNotMatch(html, /<input|video|<form|action=/);
  assert.match(html, /SIMULACIÓN/);
  assert.ok(nodos(arbol).find(n => n.props?.children === 'Confirmar venta simulada').props.disabled);
  pulsar('Historial'); assert.match(render(), /Aún no hay ventas simuladas/);
  pulsar('Nueva venta');
  nodos(arbol).find(n => n.props?.onCambio).props.onCambio(carrito); render();
  pulsar('Simular lectura del QR ficticio');
  // Cambiar carrito invalida la identificación anterior.
  nodos(arbol).find(n => n.props?.onCambio).props.onCambio(carrito); render();
  assert.ok(nodos(arbol).find(n => n.props?.children === 'Confirmar venta simulada').props.disabled);
  pulsar('Simular lectura del QR ficticio');
  const confirmar = nodos(arbol).find(n => n.props?.children === 'Confirmar venta simulada').props.onClick;
  confirmar(); confirmar(); html = render();
  assert.match(html, /Saldo final: 85 puntos/); assert.equal(estados[0].ventas.length, 1);
  pulsar('Ver comprobante de demostración'); html = render();
  for (const texto of ['Sin valor fiscal', 'DEMO-0001', 'Cantidad: 3', '15 puntos ficticios', '85 puntos']) assert.ok(html.includes(texto));
  pulsar('Ver historial de demostración'); assert.match(render(), /DEMO-0001/);
  pulsar('Ver dashboard de demostración'); html = render();
  assert.match(html, /Ventas simuladas confirmadas: 1/); assert.match(html, /Total vendido: 15/); assert.match(html, /Saldo actual del cliente: 85/);
  pulsar('Preparar nueva venta ficticia'); assert.equal(estados[0].saldo, '85'); assert.equal(estados[0].ventas.length, 1);
});
console.log(`${pruebas} pruebas de demostración aprobadas. Sin red ni Supabase.`);
