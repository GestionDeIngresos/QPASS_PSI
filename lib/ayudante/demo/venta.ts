import { resumirCarrito, type Carrito, type CatalogoVenta } from '../carrito';

export const QR_DEMO = 'QPASS:DEMO:SIN-VALOR:CLIENTE-001';
export const CLIENTE_DEMO = 'Cliente ficticio · Ana Demo';
export type VentaDemo = {
  referencia: string; fecha: string; cliente: string; negocio: string;
  total: string; saldoAnterior: string; saldoFinal: string;
  items: { nombre: string; cantidad: number; precio: string; subtotal: string }[];
};
export type EstadoDemo = { saldo: string; ventas: VentaDemo[] };
export const iniciarDemo = (): EstadoDemo => ({ saldo: '100', ventas: [] });

/** Función local pura: nunca consulta identidades ni registra transacciones reales. */
export function confirmarVentaDemo(estado: EstadoDemo, catalogo: CatalogoVenta, carrito: Carrito, codigo: string, fecha: string): EstadoDemo {
  if (codigo !== QR_DEMO) throw new Error('Solo se acepta el QR ficticio de esta demostración.');
  if (!carrito.negocioId.startsWith('demo-') || carrito.lineas.some(l => !l.productoId.startsWith('demo-')))
    throw new Error('Solo se permiten productos ficticios.');
  const resumen = resumirCarrito(catalogo, carrito);
  if (!resumen.ok || !resumen.lineas.length || Number(resumen.total) <= 0) throw new Error('Selecciona productos ficticios disponibles.');
  const centavos = (v: string) => Math.round(Number(v) * 100);
  const restante = centavos(estado.saldo) - centavos(resumen.total);
  if (restante < 0) throw new Error('Saldo de demostración insuficiente.');
  const saldoFinal = String(restante / 100);
  const venta: VentaDemo = {
    referencia: `DEMO-${String(estado.ventas.length + 1).padStart(4, '0')}`,
    fecha, cliente: CLIENTE_DEMO,
    negocio: catalogo.negocios.find(n => n.id === carrito.negocioId)!.nombre,
    total: resumen.total, saldoAnterior: estado.saldo, saldoFinal,
    items: resumen.lineas.map(l => ({ nombre: l.producto.nombre, cantidad: l.cantidad, precio: l.producto.precioEnPuntos, subtotal: l.subtotal })),
  };
  return { saldo: saldoFinal, ventas: [venta, ...estado.ventas] };
}

export function resumenDemo(estado: EstadoDemo) {
  return { cantidad: estado.ventas.length, puntos: String(estado.ventas.reduce((s, v) => s + Math.round(Number(v.total) * 100), 0) / 100) };
}
