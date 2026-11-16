import { obtenerContextoAyudante } from '@/lib/ayudante/auth';
import { EstadoAsignacion } from '@/components/ayudante/EstadoAsignacion';
import { HistorialVentas } from '@/components/ayudante/HistorialVentas';
import { leerFiltrosVentas } from '@/lib/ayudante/ventas-model';
import { obtenerHistorialVentas } from '@/lib/ayudante/ventas-server';
import type { LecturaHistorial } from '@/lib/ayudante/ventas-types';

export default async function HistorialAyudantePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { asignacion } = await obtenerContextoAyudante();
  if (asignacion.estado !== 'asignado') return <><h1 className="text-3xl font-extrabold">Historial de ventas</h1><EstadoAsignacion asignacion={asignacion} /></>;
  const { filtros, error } = leerFiltrosVentas(await searchParams);
  const lectura: LecturaHistorial = error ? { estado: 'pendiente' } : await obtenerHistorialVentas(asignacion.eventoId, filtros);
  return <>
    <div><h1 className="text-3xl font-extrabold">Historial de ventas</h1><p className="mt-2 text-sm text-muted">Consulta tus ventas confirmadas, detalles y comprobantes cuando estén disponibles.</p></div>
    <EstadoAsignacion asignacion={asignacion} />
    <HistorialVentas lectura={lectura} filtros={filtros} error={error} />
  </>;
}
