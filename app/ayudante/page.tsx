import Link from 'next/link';
import { obtenerContextoAyudante } from '@/lib/ayudante/auth';
import { EstadoAsignacion } from '@/components/ayudante/EstadoAsignacion';
import { ResumenVentas } from '@/components/ayudante/ResumenVentas';
import { obtenerResumenVentas } from '@/lib/ayudante/ventas-server';
import type { LecturaResumen } from '@/lib/ayudante/ventas-types';

export default async function AyudantePage() {
  const { asignacion } = await obtenerContextoAyudante();
  const lectura: LecturaResumen = asignacion.estado === 'asignado' ? await obtenerResumenVentas(asignacion.eventoId) : { estado: 'pendiente' };
  return <>
    <div><p className="text-xs font-bold uppercase tracking-widest text-pink">Tu jornada</p><h1 className="mt-2 text-3xl font-extrabold">Dashboard</h1>
      <p className="mt-2 text-sm text-muted">Consulta tu actividad y prepara la atención de tu punto de venta.</p></div>
    <EstadoAsignacion asignacion={asignacion} />
    <ResumenVentas lectura={lectura} />
    <section className="flex flex-col gap-5 rounded-2xl border border-pink/30 bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-bold">Prepara una nueva venta</h2><p className="mt-2 text-sm text-muted">Las métricas incluyen únicamente ventas confirmadas de tu alcance autorizado. Fechas según la hora de Bolivia.</p></div>
      <Link href="/ayudante/ventas/nueva" className="shrink-0 rounded-lg bg-pink px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-pink-hover">Ir a Nueva venta</Link>
    </section>
  </>;
}
