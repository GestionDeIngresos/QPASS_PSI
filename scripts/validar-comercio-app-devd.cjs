/* eslint-disable @typescript-eslint/no-require-imports -- Sesiones y RPC simuladas, sin red. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require('typescript'), React = require('react'), jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');
function cargar(archivo, deps = {}, env = { QPASS_COMERCIO_REAL: 'true' }) {
  const exports = {};
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(codigo, { exports, process: { env }, URLSearchParams, require(n) {
    if (n in deps) return deps[n]; throw new Error(`Importación no simulada: ${n}`);
  } }); return exports;
}
const cobro = cargar('lib/ayudante/cobro.ts');
const modelo = cargar('lib/ayudante/ventas-model.ts');
const actor = '00000000-0000-0000-0000-000000000003';
const solicitud = { eventoId: 1, negocioId: '1', codigo: ' QR-PRUEBA ', lineas: [{ productoId: '1', cantidad: 2 }], solicitudId: '10000000-0000-0000-0000-000000000001', totalEsperado: '2.50' };
const venta = { id: '1', referencia: 'QV-1', estado: 'confirmada', fecha: '2026-11-16T12:00:00+00:00', eventoId: 1, negocioId: '1', ayudanteId: actor, negocioNombreHistorico: 'Histórico', total: '2.50', items: [{ productoId: '1', nombreHistorico: 'Agua', cantidad: 2, precioUnitarioHistorico: '1.25', subtotal: '2.50' }] };
const catalogo = { eventoId: 1, negocios: [{ id: '1', nombre: 'Actual', eventoId: 1 }], productos: [{ id: '1', negocioId: '1', nombre: 'Agua', precioEnPuntos: '1.25', disponibleParaVenta: true }] };
function acciones(opciones = {}) {
  const llamadas = [], rutas = [];
  const rpc = async (n, p) => { llamadas.push({ n, p }); if (opciones.red) throw new Error('Sin red'); return opciones.respuesta ?? { data: venta, error: null }; };
  const deps = { '@/lib/ayudante/cobro': cobro, 'next/cache': { revalidatePath: ruta => rutas.push(ruta) },
    '@/lib/ayudante/auth': { exigirEventoAyudante: async () => { if (opciones.denegado) throw new Error('DENEGADO'); return { sesion: { user: { id: actor }, supabase: { rpc } } }; } } };
  return { ...cargar('app/ayudante/ventas/nueva/actions.ts', deps, { QPASS_COMERCIO_REAL: opciones.apagado ? 'false' : 'true' }), llamadas, rutas };
}
async function main() {
  let total = 0; const probar = async (n, f) => { await f(); total++; console.log(`PASS ${n}`); };
  for (const datos of [null, {}, { ...solicitud, negocioId: 'otro' }, { ...solicitud, codigo: '' }, { ...solicitud, totalEsperado: 'NaN' }, { ...solicitud, totalEsperado: '2.501' }, { ...solicitud, solicitudId: 'otro' }, { ...solicitud, lineas: [] }, { ...solicitud, lineas: [solicitud.lineas[0], solicitud.lineas[0]] }]) {
    await probar('entrada inválida no llama RPC', async () => { const a = acciones(); assert.equal((await a.confirmarCobro(datos)).estado, 'rechazada'); assert.equal(a.llamadas.length, 0); });
  }
  await probar('auth y flag se verifican antes de cobrar', async () => {
    const a = acciones({ apagado: true }); assert.equal((await a.confirmarCobro(solicitud)).estado, 'rechazada'); assert.equal(a.llamadas.length, 0);
    const b = acciones({ denegado: true }); await assert.rejects(() => b.confirmarCobro(solicitud), /DENEGADO/); assert.equal(b.llamadas.length, 0);
  });
  await probar('payload explícito sin actor/precios de líneas/total falsificado', async () => {
    const a = acciones(); const r = await a.confirmarCobro({ ...solicitud, clienteId: 'FALSO', ayudanteId: 'FALSO', total: 0, lineas: [{ ...solicitud.lineas[0], precio: 0 }] });
    assert.equal(r.estado, 'confirmada'); assert.equal(a.llamadas[0].n, 'cobrar_venta');
    const p = a.llamadas[0].p; assert.equal(p.p_codigo, 'QR-PRUEBA'); assert.equal(p.p_total_esperado, '2.50');
    assert.deepEqual(JSON.parse(JSON.stringify(p.p_lineas)), [{ producto_id: 1, cantidad: 2 }]);
    assert.doesNotMatch(JSON.stringify(p), /FALSO|clienteId|precio/); assert.equal(a.rutas.length, 2);
    assert.deepEqual(Object.keys(r.venta).sort(), ['id', 'referencia', 'total']);
  });
  await probar('mismo intento conserva UUID y payload ante respuesta perdida', async () => {
    const a = acciones({ red: true });
    assert.equal((await a.confirmarCobro(solicitud)).estado, 'incierto');
    assert.equal((await a.confirmarCobro(solicitud)).estado, 'incierto');
    assert.deepEqual(a.llamadas[0], a.llamadas[1]); assert.equal(a.rutas.length, 0);
  });
  await probar('errores SQL conocidos acreditan rechazo; HTTP/red no acreditan rollback', async () => {
    for (const code of ['P0001', '42501', '40001']) assert.equal((await acciones({ respuesta: { error: { code, message: 'SALDO_INSUFICIENTE' } } }).confirmarCobro(solicitud)).estado, 'rechazada');
    for (const respuesta of [{ error: { code: 'FETCH_ERROR', message: 'Red' } }, { data: {}, error: null }]) assert.equal((await acciones({ respuesta }).confirmarCobro(solicitud)).estado, 'incierto');
  });
  await probar('consulta QR proyecta nombre y decimales sin datos privados', async () => {
    const a = acciones({ respuesta: { data: { nombre: 'Prueba', saldo: '10.00', reservado: '2.00', gastable: '8.00', codigo_qr: 'NO_EXPORTAR' }, error: null } });
    const r = await a.consultarAsistenteVenta(1, '1', 'QR-PRUEBA'); assert.equal(r.ok, true); assert.doesNotMatch(JSON.stringify(r), /NO_EXPORTAR/);
  });
  const adapter = cargar('lib/ayudante/comercio-server.ts', { 'server-only': {}, './ventas-model': modelo });
  const db = cambios => ({ rpc: async n => ({ error: null, data: n === 'consultar_catalogo_ayudante' ? catalogo : cambios[n] }) });
  await probar('adaptadores reales validan catálogo, actor, negocio e históricos', async () => {
    const d = db({ consultar_detalle_venta: venta }); const r = await adapter.detalleReal(d, actor, 1, '1');
    assert.equal(r.estado, 'disponible'); assert.equal(r.venta.items[0].precioUnitarioHistorico, '1.25');
    await assert.rejects(() => adapter.detalleReal(db({ consultar_detalle_venta: { ...venta, ayudanteId: 'AJENO' } }), actor, 1, '1'), /histórico válido/);
    assert.equal((await adapter.detalleReal(db({ consultar_detalle_venta: null }), actor, 1, '1')).estado, 'no_encontrada');
  });
  await probar('resumen viene de agregación SQL, historial pagina y mantiene cursor', async () => {
    const d = db({ consultar_resumen_ventas: { ventasDia: 40, ventasMes: 40, cantidadConfirmadas: 40, puntosCobrados: '100.00' }, consultar_historial_ventas: { ventas: [venta], negocios: catalogo.negocios, siguienteCursor: '1' } });
    assert.equal((await adapter.resumenReal(d, 1)).cantidadConfirmadas, 40);
    assert.equal((await adapter.historialReal(d, actor, 1, { desde: '', hasta: '', negocio: '', referencia: '' })).siguienteCursor, '1');
    await assert.rejects(() => adapter.historialReal(d, actor, 1, { desde: '', hasta: '', negocio: '', referencia: '' }, 'INVALIDO'), /Filtro inválido/);
  });
  await probar('cobro incierto bloquea edición y ofrece reintentar sin crear otra solicitud', async () => {
    const estados = [{ negocioId: '1', lineas: solicitud.lineas }, 'QR-PRUEBA', { nombre: 'Prueba', gastable: '10.00', reservado: '0.00' }, solicitud, { estado: 'incierto', mensaje: 'Resultado incierto' }, '', 0];
    let i = 0;
    const componente = cargar('components/ayudante/VentaIntegrada.tsx', {
      react: { useState: () => [estados[i++], () => {}], useTransition: () => [false, () => {}] }, 'react/jsx-runtime': jsx,
      'next/link': { default: ({ children, ...p }) => React.createElement('a', p, children) },
      './CatalogoCarrito': { CatalogoCarrito: () => React.createElement('input', { name: 'carrito' }) },
      '@/components/qr/LectorQr': { LectorQr: () => null }, '@/lib/ayudante/carrito': cargar('lib/ayudante/carrito.ts'),
      '@/app/ayudante/ventas/nueva/actions': {},
    });
    const html = renderToStaticMarkup(React.createElement(componente.VentaIntegrada, { catalogo }));
    assert.match(html, /<fieldset disabled/); assert.match(html, /Reintentar la misma solicitud/);
    assert.match(html, /10000000-0000-0000-0000-000000000001/); assert.doesNotMatch(html, /Nueva venta|Corregir selección/);
  });
  console.log(`${total} pruebas de integración de aplicación aprobadas. Sin peticiones a Supabase.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
