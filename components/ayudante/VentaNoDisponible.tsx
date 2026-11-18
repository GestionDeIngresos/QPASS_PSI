import Link from 'next/link';

export function VentaNoDisponible({ comprobante = false }: { comprobante?: boolean }) {
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
    <h1 className="text-2xl font-extrabold">{comprobante ? 'Comprobante no disponible' : 'Detalle de venta'}</h1>
    <p role="status" className="text-sm text-muted">La consulta de ventas todavía no está disponible. No se ha verificado ninguna operación para mostrar.</p>
    <p className="text-xs text-muted">El comprobante solo se habilitará para una venta confirmada y autorizada, con sus importes históricos.</p>
    <Link href="/ayudante/historial" className="inline-block text-sm font-semibold text-pink hover:underline">Volver al historial</Link>
  </section>;
}
