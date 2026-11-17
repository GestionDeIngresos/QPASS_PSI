/* eslint-disable @typescript-eslint/no-require-imports -- Auditoría autorizada: solo GET/HEAD, sin RPC ni SQL remoto. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const raiz = path.resolve(__dirname, '..');
const decimal = v => {
  const s = String(v);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) throw new Error('DECIMAL_NO_ADMITIDO');
  const negativo = s.startsWith('-'), [entero, fraccion = ''] = s.replace(/^-/, '').split('.');
  return BigInt(entero) * 100n * (negativo ? -1n : 1n) + BigInt(fraccion.padEnd(2, '0')) * (negativo ? -1n : 1n);
};
const clave = r => `${r.usuario_id}:${r.evento_id}`;
async function main() {
  process.loadEnvFile(path.join(raiz, '.env.local'));
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const proyecto = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/integracion-supabase/esquema-api.json'), 'utf8')).proyecto;
  if (url.protocol !== 'https:' || url.hostname !== proyecto || url.username || url.password) throw new Error('PROYECTO_NO_COINCIDE');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('FALTA_CLAVE_PRIVILEGIADA');
  if (!key.startsWith('sb_secret_')) {
    let payload; try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { throw new Error('CLAVE_NO_VERIFICABLE'); }
    if (payload.role !== 'service_role') throw new Error('ROL_NO_PRIVILEGIADO');
  }
  let peticiones = 0;
  async function request(tabla, params = {}, metodo = 'GET') {
    const endpoint = new URL(tabla ? `/rest/v1/${tabla}` : '/rest/v1/', url);
    for (const [k, v] of Object.entries(params)) endpoint.searchParams.set(k, v);
    const response = await fetch(endpoint, { method: metodo, redirect: 'error', cache: 'no-store',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Accept: tabla ? 'application/json' : 'application/openapi+json' },
      signal: AbortSignal.timeout(20000) });
    peticiones++;
    if (!response.ok) {
      // Solo código de error estructural. No imprimir URL, headers, body ni filas.
      let codigo = ''; try { codigo = (await response.json()).code || ''; } catch { /* respuesta sin JSON */ }
      if (!/^[A-Z0-9_]{0,20}$/.test(codigo)) codigo = '';
      throw new Error(`HTTP_${response.status}${codigo ? '_' + codigo : ''}`);
    }
    const rango = response.headers.get('content-range');
    const cantidad = rango && /\/(\d+)$/.exec(rango)?.[1];
    return { cantidad: cantidad === null || cantidad === undefined ? null : Number(cantidad),
      datos: metodo === 'HEAD' ? null : await response.json() };
  }
  const api = (await request('')).datos;
  if (!api.definitions || !api.paths) throw new Error('OPENAPI_INCOMPLETO');
  const columnas = Object.fromEntries(Object.entries(api.definitions).map(([n, d]) => [n, Object.keys(d.properties || {})]));
  const rpcs = Object.keys(api.paths).filter(p => p.startsWith('/rpc/')).map(p => p.slice(5)).sort();
  const campos = {
    negocios: 'id,estado', productos: 'id,negocio_id,precio,disponible',
    ayudantes: 'id,usuario_id,negocio_id,activo', asignaciones_staff: 'id,usuario_id,evento_id,rol_staff',
    saldos_puntos: 'id,usuario_id,evento_id,saldo',
    solicitudes_devolucion: 'id,usuario_id,evento_id,monto_solicitado,estado',
    devoluciones: 'id,solicitud_id,usuario_id,monto', recargas: 'id,usuario_id,evento_id,monto',
    ventas: 'id,cliente_id,evento_id,negocio_id,ayudante_id,total',
    venta_items: 'id,venta_id,producto_id,cantidad,precio_unitario',
  };
  const tablas = {}, conteos = {};
  for (const [tabla, select] of Object.entries(campos)) {
    if (!columnas[tabla]) throw new Error('TABLA_NO_VISIBLE_EN_API');
    const cantidad = (await request(tabla, { select: 'id', limit: '1' }, 'HEAD')).cantidad;
    if (cantidad === null || cantidad > 20000) throw new Error('CONTEO_NO_COMPLETO_O_SUPERA_LIMITE');
    conteos[tabla] = cantidad; tablas[tabla] = [];
    for (let offset = 0; offset < cantidad; offset += 500) {
      const pagina = (await request(tabla, { select, order: 'id.asc', limit: '500', offset: String(offset) })).datos;
      if (!Array.isArray(pagina)) throw new Error('RESPUESTA_NO_ADMITIDA');
      tablas[tabla].push(...pagina);
    }
    if (tablas[tabla].length !== cantidad || new Set(tablas[tabla].map(r => r.id)).size !== cantidad) throw new Error('LECTURA_INCOMPLETA_O_CONCURRENTE');
  }
  // Solo cuentas de los ayudantes: no descargar nombres, documentos ni correos.
  const usuarios = [];
  const ids = [...new Set(tablas.ayudantes.map(r => r.usuario_id))];
  for (let i = 0; i < ids.length; i += 50) {
    const pagina = (await request('usuarios', { select: 'id,rol,activo', id: `in.(${ids.slice(i, i + 50).join(',')})` })).datos;
    if (!Array.isArray(pagina)) throw new Error('RESPUESTA_NO_ADMITIDA');
    usuarios.push(...pagina);
  }
  const ne = columnas.negocios_eventos ? (await request('negocios_eventos', { select: 'negocio_id,evento_id,activo', limit: '1000' })).datos : null;
  const solicitudes = tablas.solicitudes_devolucion;
  const reservas = new Map();
  for (const s of solicitudes.filter(s => ['en_revision', 'aprobada'].includes(s.estado))) reservas.set(clave(s), (reservas.get(clave(s)) || 0n) + decimal(s.monto_solicitado));
  const saldos = new Map(tablas.saldos_puntos.map(s => [clave(s), s]));
  const solicitudesPorId = new Map(solicitudes.map(s => [s.id, s]));
  const negocios = new Map(tablas.negocios.map(n => [n.id, n]));
  const cuentas = new Map(usuarios.map(u => [u.id, u]));
  const staff = tablas.asignaciones_staff.filter(s => s.rol_staff === 'ayudante');
  const ayudantesActivos = tablas.ayudantes.filter(a => a.activo);
  const eventosUsuario = id => [...new Set(staff.filter(s => s.usuario_id === id).map(s => s.evento_id))];
  const porEstado = Object.fromEntries(['en_revision', 'aprobada', 'rechazada'].map(e => [e, solicitudes.filter(s => s.estado === e).length]));
  const pagosPorSolicitud = new Map();
  for (const d of tablas.devoluciones) if (d.solicitud_id !== null) pagosPorSolicitud.set(d.solicitud_id, (pagosPorSolicitud.get(d.solicitud_id) || 0n) + decimal(d.monto));
  const importesLineas = new Map();
  for (const l of tablas.venta_items) importesLineas.set(l.venta_id, (importesLineas.get(l.venta_id) || 0n) + decimal(l.precio_unitario) * BigInt(l.cantidad));
  const movimientos = new Map();
  const sumar = (k, monto) => movimientos.set(k, (movimientos.get(k) || 0n) + monto);
  tablas.recargas.forEach(r => sumar(clave(r), decimal(r.monto)));
  tablas.ventas.forEach(v => sumar(`${v.cliente_id}:${v.evento_id}`, -decimal(v.total)));
  tablas.devoluciones.forEach(d => { const s = solicitudesPorId.get(d.solicitud_id); if (s) sumar(`${d.usuario_id}:${s.evento_id}`, -decimal(d.monto)); });
  for (const [tabla, cantidad] of Object.entries(conteos)) {
    if ((await request(tabla, { select: 'id', limit: '1' }, 'HEAD')).cantidad !== cantidad) throw new Error('CONTEO_CAMBIO_DURANTE_AUDITORIA');
  }
  const informe = {
    capturado_en: new Date().toISOString(), proyecto: url.hostname, peticiones,
    alcance: 'Solo GET/HEAD con clave privilegiada; sin RPC ni escrituras. Solo agregados persistidos. Lecturas HTTP independientes: NO snapshot transaccional. Metadatos API NO acreditan RLS/triggers/cuerpos actuales.',
    catalogo_fuente_sha256: createHash('sha256').update(fs.readFileSync(path.join(raiz, 'docs/integracion-supabase/qpass_catalogo_supabase_2026-11-16.json'))).digest('hex'),
    columnas_comerciales_api: Object.fromEntries(Object.keys(campos).concat(['negocios_eventos']).map(n => [n, columnas[n] || null])),
    rpcs_api: rpcs, conteos,
    datos: {
      solicitudes_por_estado: porEstado,
      solicitudes_con_estado_no_reconocido: solicitudes.filter(s => !['en_revision', 'aprobada', 'rechazada'].includes(s.estado)).length,
      negocios_activos: tablas.negocios.filter(n => n.estado).length,
      productos_disponibles: tablas.productos.filter(p => p.disponible).length,
      precios_negativos: tablas.productos.filter(p => decimal(p.precio) < 0n).length,
      ayudantes_activos: ayudantesActivos.length,
      ayudantes_activos_con_negocio_cuenta_rol_y_staff_validos: ayudantesActivos.filter(a => negocios.get(a.negocio_id)?.estado && cuentas.get(a.usuario_id)?.activo && cuentas.get(a.usuario_id)?.rol === 'ayudante' && eventosUsuario(a.usuario_id).length === 1).length,
      ayudantes_activos_sin_staff: ayudantesActivos.filter(a => eventosUsuario(a.usuario_id).length === 0).length,
      ayudantes_activos_con_staff_ambiguo: ayudantesActivos.filter(a => eventosUsuario(a.usuario_id).length > 1).length,
      relacion_negocio_evento_api: ne === null ? 'no_expuesta' : 'expuesta',
      pares_negocio_evento_leidos: Array.isArray(ne) ? ne.length : null,
      reservas_v1_sin_saldo: [...reservas.keys()].filter(k => !saldos.has(k)).length,
      reservas_v1_superiores_al_saldo: [...reservas].filter(([k, r]) => saldos.has(k) && r > decimal(saldos.get(k).saldo)).length,
      cuentas_saldo_duplicadas: tablas.saldos_puntos.length - saldos.size,
      devoluciones_sin_solicitud: tablas.devoluciones.filter(d => d.solicitud_id === null).length,
      devoluciones_con_solicitud_inexistente_o_usuario_distinto: tablas.devoluciones.filter(d => d.solicitud_id !== null && (!solicitudesPorId.has(d.solicitud_id) || solicitudesPorId.get(d.solicitud_id).usuario_id !== d.usuario_id)).length,
      solicitudes_con_pagado_superior_al_solicitado: [...pagosPorSolicitud].filter(([id, monto]) => solicitudesPorId.has(id) && monto > decimal(solicitudesPorId.get(id).monto_solicitado)).length,
      solicitudes_aprobadas_con_devolucion: solicitudes.filter(s => s.estado === 'aprobada' && pagosPorSolicitud.has(s.id)).length,
      ventas_con_total_distinto_de_lineas_o_sin_lineas: tablas.ventas.filter(v => !importesLineas.has(v.id) || importesLineas.get(v.id) !== decimal(v.total)).length,
      saldos_distintos_de_recargas_menos_ventas_menos_devoluciones: tablas.saldos_puntos.filter(s => decimal(s.saldo) !== (movimientos.get(clave(s)) || 0n)).length,
    },
    interpretaciones_no_confirmadas: ['Unidad monetaria/puntos de productos.precio', 'Si saldo ya descuenta reservas', 'Semantica de liquidacion de devoluciones', 'Aprobacion B/C de negocios_eventos y reservas v1'],
  };
  fs.writeFileSync(path.join(raiz, 'docs/integracion-supabase/auditoria-003-datos-reales.json'), JSON.stringify(informe, null, 2) + '\n');
  console.log(JSON.stringify(informe, null, 2));
}
if (require.main === module) main().catch(e => {
  const codigo = /^(?:HTTP_\d+(?:_[A-Z0-9_]+)?|[A-Z][A-Z0-9_]+)$/.test(e.message) ? e.message : 'AUDITORIA_NO_COMPLETADA';
  console.error(codigo); process.exitCode = 1;
});
module.exports = { main, decimal };
