import type { NegocioAsignadoVista, ProductoDisponibleVista } from './contracts';

/** Modelos de presentación, sin nombres de tablas/RPC de C ni precios de cobro. */
export type CatalogoVenta = { eventoId: number; negocios: NegocioAsignadoVista[]; productos: ProductoDisponibleVista[] };
export type DatosCatalogo = { estado: 'pendiente' } | { estado: 'disponible'; modo: 'demostracion' | 'integrado'; catalogo: CatalogoVenta };
export type LineaCarrito = { productoId: string; cantidad: number };
export type Carrito = { negocioId: string; lineas: LineaCarrito[] };
export const MAX_CANTIDAD_PROVISIONAL = 999;
export type AccionCarrito =
  | { tipo: 'negocio'; negocioId: string; confirmarVaciado?: boolean }
  | { tipo: 'agregar'; productoId: string }
  | { tipo: 'cantidad'; productoId: string; cantidad: number }
  | { tipo: 'eliminar'; productoId: string }
  | { tipo: 'vaciar' };
export type ResultadoCarrito = { ok: true; carrito: Carrito } | { ok: false; error: string };

export function negociosPermitidos(catalogo: CatalogoVenta) {
  return catalogo.negocios.filter(n => n.eventoId === catalogo.eventoId);
}
export function productosDelNegocio(catalogo: CatalogoVenta, negocioId: string) {
  if (!negociosPermitidos(catalogo).some(n => n.id === negocioId)) return [];
  return catalogo.productos.filter(p => p.negocioId === negocioId);
}
function decimal(valor: string) {
  if (typeof valor !== 'string' || valor.length > 64 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(valor)) return null;
  const [entero, fraccion = ''] = valor.split('.');
  return { unidades: BigInt(entero + fraccion), decimales: fraccion.length };
}
function textoDecimal(unidades: bigint, decimales: number): string {
  const texto = unidades.toString().padStart(decimales + 1, '0');
  if (!decimales) return texto;
  return (texto.slice(0, -decimales) + '.' + texto.slice(-decimales)).replace(/0+$/, '').replace(/\.$/, '');
}
export function precioValido(valor: string) { return decimal(valor) !== null; }

export function resumirCarrito(catalogo: CatalogoVenta, carrito: Carrito) {
  if (carrito.negocioId && !negociosPermitidos(catalogo).some(n => n.id === carrito.negocioId)) return { ok: false as const, error: 'NEGOCIO_NO_AUTORIZADO' };
  const productos = productosDelNegocio(catalogo, carrito.negocioId);
  const vistos = new Set<string>();
  const lineas = [];
  for (const linea of carrito.lineas) {
    if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad < 1 || linea.cantidad > MAX_CANTIDAD_PROVISIONAL) return { ok: false as const, error: 'CANTIDAD_INVALIDA' };
    if (vistos.has(linea.productoId)) return { ok: false as const, error: 'PRODUCTO_REPETIDO' };
    vistos.add(linea.productoId);
    const producto = productos.find(p => p.id === linea.productoId);
    if (!producto) return { ok: false as const, error: 'PRODUCTO_NO_AUTORIZADO' };
    const precio = decimal(producto.precioEnPuntos);
    if (producto.disponibleParaVenta !== true || !precio) return { ok: false as const, error: 'PRODUCTO_NO_DISPONIBLE' };
    const importe = precio.unidades * BigInt(linea.cantidad);
    lineas.push({ producto, cantidad: linea.cantidad, subtotal: textoDecimal(importe, precio.decimales), importe, decimales: precio.decimales });
  }
  const escala = Math.max(0, ...lineas.map(l => l.decimales));
  const total = lineas.reduce((suma, l) => suma + l.importe * (BigInt(10) ** BigInt(escala - l.decimales)), BigInt(0));
  const texto = textoDecimal(total, escala);
  // No exponer BigInt en el modelo de presentación ni aceptar precios de líneas.
  return { ok: true as const, subtotal: texto, total: texto, lineas: lineas.map(({ producto, cantidad, subtotal }) => ({ producto, cantidad, subtotal })) };
}

export function actualizarCarrito(catalogo: CatalogoVenta, previo: Carrito, accion: AccionCarrito): ResultadoCarrito {
  if (accion.tipo === 'negocio') {
    if (accion.negocioId && !negociosPermitidos(catalogo).some(n => n.id === accion.negocioId)) return { ok: false, error: 'NEGOCIO_NO_AUTORIZADO' };
    if (accion.negocioId === previo.negocioId) return { ok: true, carrito: previo };
    if (previo.lineas.length && !accion.confirmarVaciado) return { ok: false, error: 'CONFIRMAR_CAMBIO' };
    return { ok: true, carrito: { negocioId: accion.negocioId, lineas: [] } };
  }
  if (accion.tipo === 'vaciar') return { ok: true, carrito: { negocioId: negociosPermitidos(catalogo).some(n => n.id === previo.negocioId) ? previo.negocioId : '', lineas: [] } };
  let lineas = previo.lineas.map(l => ({ productoId: l.productoId, cantidad: l.cantidad }));
  if (accion.tipo === 'eliminar') lineas = lineas.filter(l => l.productoId !== accion.productoId);
  else if (accion.tipo === 'cantidad') {
    if (!lineas.some(l => l.productoId === accion.productoId)) return { ok: false, error: 'PRODUCTO_NO_AUTORIZADO' };
    lineas = lineas.map(l => l.productoId === accion.productoId ? { ...l, cantidad: accion.cantidad } : l);
  }
  else {
    const existente = lineas.find(l => l.productoId === accion.productoId);
    if (existente) existente.cantidad += 1;
    else lineas.push({ productoId: accion.productoId, cantidad: 1 });
  }
  const carrito = { negocioId: previo.negocioId, lineas };
  const resumen = resumirCarrito(catalogo, carrito);
  return resumen.ok ? { ok: true, carrito } : resumen;
}
