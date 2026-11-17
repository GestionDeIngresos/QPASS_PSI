import { obtenerContextoAyudante } from '@/lib/ayudante/auth';
import { EstadoAsignacion } from '@/components/ayudante/EstadoAsignacion';
import { HistorialVentas } from '@/components/ayudante/HistorialVentas';
import { leerFiltrosVentas } from '@/lib/ayudante/ventas-model';
import { obtenerHistorialVentas } from '@/lib/ayudante/ventas-server';
import type { LecturaHistorial } from '@/lib/ayudante/ventas-types';

export default async function HistorialAyudantePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { asignacion } = await obtenerContextoAyudante();
  if (asignacion.estado !== 'asignado') return <><h1 className="text-3xl font-extrabold">Historial de ventas</h1><EstadoAsignacion asignacion={asignacion} /></>;
  const params = await searchParams;
  const { filtros, error: errorFiltros } = leerFiltrosVentas(params);
  const cursor = params.antes;
  const error = errorFiltros || (cursor !== undefined && (typeof cursor !== 'string' || !/^[1-9]\d{0,8}$/.test(cursor)) ? 'Cursor inválido.' : undefined);
  const lectura: LecturaHistorial = error ? { estado: 'pendiente' } : await obtenerHistorialVentas(asignacion.eventoId, filtros, typeof cursor === 'string' ? cursor : undefined);
  return <>
    <div><h1 className="text-3xl font-extrabold">Historial de ventas</h1><p className="mt-2 text-sm text-muted">Consulta tus ventas confirmadas, detalles y comprobantes cuando estén disponibles.</p></div>
    <EstadoAsignacion asignacion={asignacion} />
    <HistorialVentas lectura={lectura} filtros={filtros} error={error} />
  </>;
}
