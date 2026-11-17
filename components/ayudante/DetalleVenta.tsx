import Link from 'next/link';
import { formatearFechaVenta } from '@/lib/ayudante/ventas-model';
import type { VentaAutorizada } from '@/lib/ayudante/ventas-types';

export function DetalleVenta({ venta, comprobante = false }: { venta: VentaAutorizada; comprobante?: boolean }) {
  return <section className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">{comprobante ? 'Comprobante de venta' : 'Detalle de venta'}</h1><span className="rounded-full border border-cyan/50 px-3 py-1 text-xs font-bold text-cyan">Confirmada</span></div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      {[['ID de venta', venta.id], ['Referencia', venta.referencia], ['Fecha y hora · Bolivia', formatearFechaVenta(venta.fecha)], ['Negocio', venta.negocioNombreHistorico]].map(([titulo, valor]) => <div key={titulo}><dt className="text-xs text-muted">{titulo}</dt><dd className="mt-1 break-words font-semibold">{valor}</dd></div>)}
    </dl>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="pb-3 text-left text-muted">Productos registrados en la venta</caption>
      <thead className="border-y border-border text-xs text-muted"><tr>{['Producto', 'Cantidad', 'Precio unitario histórico', 'Subtotal en puntos'].map(t => <th key={t} scope="col" className="px-3 py-3">{t}</th>)}</tr></thead>
      <tbody>{venta.items.map((item, i) => <tr key={`${item.productoId}:${i}`} className="border-b border-border"><td className="max-w-72 break-words px-3 py-4">{item.nombreHistorico}</td><td className="px-3 py-4">{item.cantidad}</td><td className="break-all px-3 py-4">{item.precioUnitarioHistorico}</td><td className="break-all px-3 py-4">{item.subtotal}</td></tr>)}</tbody>
    </table></div>
    <p className="flex flex-wrap justify-between gap-3 text-lg font-bold"><span>Total confirmado</span><span className="break-all text-cyan">{venta.total} puntos</span></p>
    <p className="text-xs text-muted">Importes históricos del registro confirmado. No se utilizan precios del catálogo actual ni del carrito.</p>
    <div className="flex flex-wrap gap-4 text-sm font-semibold text-pink"><Link href="/ayudante/historial" className="hover:underline">Volver al historial</Link>
      {!comprobante && <Link href={`/ayudante/ventas/${encodeURIComponent(venta.id)}/comprobante`} className="hover:underline">Ver comprobante</Link>}
      {comprobante && <Link href={`/ayudante/ventas/${encodeURIComponent(venta.id)}`} className="hover:underline">Ver detalle</Link>}
    </div>
  </section>;
}
