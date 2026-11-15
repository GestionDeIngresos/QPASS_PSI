import { obtenerContextoAyudante } from '@/lib/ayudante/auth';
import { EstadoAsignacion } from '@/components/ayudante/EstadoAsignacion';

export default async function NuevaVentaPage() {
  const { asignacion } = await obtenerContextoAyudante();
  if (asignacion.estado !== 'asignado') return <><h1 className="text-3xl font-extrabold">Nueva venta</h1><EstadoAsignacion asignacion={asignacion} /></>;
  return <>
    <div><h1 className="text-3xl font-extrabold">Nueva venta</h1><p className="mt-2 text-sm text-muted">Productos, carrito e identificación del asistente en un solo lugar.</p></div>
    <EstadoAsignacion asignacion={asignacion} />
    <p role="status" className="rounded-xl border border-pink/40 bg-pink/10 p-4 text-sm">Las ventas aún no están habilitadas. No se realizarán cobros ni cambios de saldo.</p>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <section className="min-w-0 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold">1. Catálogo de productos</h2>
        <label className="mt-5 block text-sm text-muted">Negocio<select disabled className="mt-2 w-full rounded-lg border border-border bg-bg p-3 text-sm opacity-60"><option>Selección no disponible</option></select></label>
        <p className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">El catálogo aún no está disponible.</p>
      </section>
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-bold">2. Carrito</h2><p className="mt-4 text-sm text-muted">El carrito se habilitará junto con el catálogo.</p>
          <div className="mt-5 flex justify-between border-t border-border pt-4 font-bold"><span>Total en puntos</span><span className="text-cyan" aria-label="Total no disponible">—</span></div></section>
        <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-bold">3. Identificación QR</h2>
          <p className="mt-3 text-sm text-muted">La identificación del asistente se habilitará antes de confirmar una venta.</p>
          <button type="button" disabled className="mt-5 w-full rounded-lg border border-cyan/40 px-4 py-3 text-sm font-bold text-cyan opacity-50">Identificar asistente</button></section>
      </div>
    </div>
    <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-bold">4. Resultado de cobro</h2>
      <p className="mt-3 text-sm text-muted">Todavía no hay un cobro confirmado en esta pantalla.</p>
      <button type="button" disabled className="mt-5 rounded-lg bg-pink px-6 py-3 text-sm font-bold opacity-50">Confirmar cobro</button></section>
  </>;
}
