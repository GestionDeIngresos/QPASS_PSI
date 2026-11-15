import Link from 'next/link';
import { obtenerContextoAyudante } from '@/lib/ayudante/auth';
import { EstadoAsignacion } from '@/components/ayudante/EstadoAsignacion';

export default async function AyudantePage() {
  const { asignacion } = await obtenerContextoAyudante();
  return <>
    <div><p className="text-xs font-bold uppercase tracking-widest text-pink">Tu jornada</p><h1 className="mt-2 text-3xl font-extrabold">Dashboard</h1>
      <p className="mt-2 text-sm text-muted">Consulta tu actividad y prepara la atención de tu punto de venta.</p></div>
    <EstadoAsignacion asignacion={asignacion} />
    <div className="grid gap-4 sm:grid-cols-3">
      {['Ventas del día', 'Ventas del mes', 'Total de puntos vendidos'].map(titulo => <section key={titulo} className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-muted">{titulo}</h2><p className="mt-4 text-3xl font-extrabold text-cyan" aria-label="Dato aún no disponible">—</p>
        <p className="mt-3 text-xs text-muted">Pendiente de disponibilidad</p>
      </section>)}
    </div>
    <section className="flex flex-col gap-5 rounded-2xl border border-pink/30 bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-bold">Prepara una nueva venta</h2><p className="mt-2 text-sm text-muted">Las estadísticas estarán disponibles cuando se habiliten las ventas. Fechas según la hora de Bolivia.</p></div>
      <Link href="/ayudante/ventas/nueva" className="shrink-0 rounded-lg bg-pink px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-pink-hover">Ir a Nueva venta</Link>
    </section>
  </>;
}
