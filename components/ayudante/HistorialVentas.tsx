import Link from 'next/link';
import { formatearFechaVenta } from '@/lib/ayudante/ventas-model';
import type { FiltrosVentas, LecturaHistorial } from '@/lib/ayudante/ventas-types';

export function HistorialVentas({ lectura, filtros, error }: { lectura: LecturaHistorial; filtros: FiltrosVentas; error?: string }) {
  const disponible = lectura.estado === 'disponible';
  const tieneFiltros = Object.values(filtros).some(Boolean);
  return <div className="space-y-5">
    {error && <p role="alert" className="text-sm text-pink">{error}</p>}
    <form action="/ayudante/historial" method="get">
      <fieldset disabled={!disponible} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-2 text-sm font-semibold">Filtros{!disponible && ' · aún no disponibles'}</legend>
        <label className="text-sm text-muted">Desde<input type="date" name="desde" defaultValue={filtros.desde} className="mt-2 w-full min-w-0 rounded-lg border border-border bg-bg p-3 text-sm disabled:opacity-60" /></label>
        <label className="text-sm text-muted">Hasta<input type="date" name="hasta" defaultValue={filtros.hasta} className="mt-2 w-full min-w-0 rounded-lg border border-border bg-bg p-3 text-sm disabled:opacity-60" /></label>
        <label className="text-sm text-muted">Negocio<select name="negocio" defaultValue={filtros.negocio} disabled={!disponible || lectura.negocios.length === 0} className="mt-2 w-full min-w-0 rounded-lg border border-border bg-bg p-3 text-sm [color-scheme:dark] disabled:opacity-60"><option value="">Todos los autorizados</option>
          {disponible && lectura.negocios.map(n => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select></label>
        <label className="text-sm text-muted">Referencia<input type="search" name="referencia" maxLength={80} defaultValue={filtros.referencia} placeholder="Referencia de venta" className="mt-2 w-full min-w-0 rounded-lg border border-border bg-bg p-3 text-sm disabled:opacity-60" /></label>
        <button type="submit" className="rounded-lg bg-pink px-4 py-3 text-sm font-bold disabled:opacity-50">Filtrar</button>
      </fieldset>
    </form>
    <p className="text-xs text-muted">Las fechas incluyen el día seleccionado según America/La_Paz.</p>
    {!disponible && <p role="status" className="text-sm text-muted">El historial de ventas todavía no está disponible. No se muestran operaciones de demostración.</p>}
    <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full text-left text-sm"><caption className="p-5 text-left text-muted">Ventas confirmadas · hora de Bolivia</caption>
      <thead className="border-y border-border text-muted"><tr>{['Fecha', 'Referencia', 'Negocio', 'Total en puntos', 'Consulta'].map(t => <th key={t} scope="col" className="px-4 py-3">{t}</th>)}</tr></thead>
      <tbody>{disponible && lectura.ventas.length ? lectura.ventas.map(v => <tr key={v.id} className="border-b border-border"><td className="whitespace-nowrap px-4 py-4">{formatearFechaVenta(v.fecha)}</td><td className="break-all px-4 py-4">{v.referencia}</td><td className="max-w-64 break-words px-4 py-4">{v.negocioNombreHistorico}</td><td className="break-all px-4 py-4">{v.total}</td>
        <td className="px-4 py-4"><div className="flex flex-wrap gap-3 font-semibold text-pink"><Link href={`/ayudante/ventas/${encodeURIComponent(v.id)}`} className="hover:underline">Ver detalle</Link><Link href={`/ayudante/ventas/${encodeURIComponent(v.id)}/comprobante`} className="hover:underline">Comprobante</Link></div></td>
      </tr>) : <tr><td colSpan={5} className="p-8 text-center text-muted">{disponible ? tieneFiltros ? 'No hay ventas confirmadas que coincidan con los filtros.' : 'No hay ventas registradas' : 'Listado pendiente de disponibilidad.'}</td></tr>}</tbody>
    </table></div>
    {disponible && lectura.siguienteCursor && <Link href={`/ayudante/historial?${new URLSearchParams({ ...filtros, antes: lectura.siguienteCursor }).toString()}`} className="text-sm font-semibold text-cyan">Ver ventas anteriores</Link>}
  </div>;
}
