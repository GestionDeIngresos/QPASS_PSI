import { obtenerContextoAyudante } from '@/lib/ayudante/auth';
import { EstadoAsignacion } from '@/components/ayudante/EstadoAsignacion';

export default async function HistorialAyudantePage() {
  const { asignacion } = await obtenerContextoAyudante();
  if (asignacion.estado !== 'asignado') return <><h1 className="text-3xl font-extrabold">Historial de ventas</h1><EstadoAsignacion asignacion={asignacion} /></>;
  return <>
    <div><h1 className="text-3xl font-extrabold">Historial de ventas</h1><p className="mt-2 text-sm text-muted">Consulta tus ventas confirmadas, detalles y comprobantes cuando estén disponibles.</p></div>
    <EstadoAsignacion asignacion={asignacion} />
    <fieldset disabled className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      <legend className="px-2 text-sm font-semibold">Filtros · aún no disponibles</legend>
      <label className="text-sm text-muted">Desde<input type="date" className="mt-2 w-full rounded-lg border border-border bg-bg p-3 text-sm opacity-60" /></label>
      <label className="text-sm text-muted">Hasta<input type="date" className="mt-2 w-full rounded-lg border border-border bg-bg p-3 text-sm opacity-60" /></label>
      <label className="text-sm text-muted">Referencia<input type="text" placeholder="Referencia de venta" className="mt-2 w-full rounded-lg border border-border bg-bg p-3 text-sm opacity-60" /></label>
      <button type="button" className="self-end rounded-lg bg-pink px-4 py-3 text-sm font-bold opacity-50">Filtrar</button>
    </fieldset>
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-left text-sm"><caption className="p-5 text-left text-muted">Ventas confirmadas · hora de Bolivia</caption>
        <thead className="border-y border-border text-muted"><tr>{['Fecha', 'Referencia', 'Negocio', 'Total en puntos', 'Detalle'].map(t => <th key={t} scope="col" className="px-4 py-3">{t}</th>)}</tr></thead>
        <tbody><tr><td colSpan={5} className="p-8 text-center text-muted">El historial aún no está disponible. Aquí aparecerán las ventas que puedas consultar.</td></tr></tbody>
      </table>
    </div>
    <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">Detalle y comprobante</h2><p className="mt-2 text-sm text-muted">Se habilitarán para cada venta confirmada.</p>
      <button type="button" disabled className="mt-4 rounded-lg border border-cyan/40 px-4 py-2 text-sm font-semibold text-cyan opacity-50">Ver detalle</button></section>
  </>;
}
