import { notFound } from 'next/navigation';
import { obtenerContextoAyudante } from '@/lib/ayudante/auth';
import { obtenerDetalleVenta } from '@/lib/ayudante/ventas-server';
import { EstadoAsignacion } from '@/components/ayudante/EstadoAsignacion';
import { DetalleVenta } from '@/components/ayudante/DetalleVenta';
import { VentaNoDisponible } from '@/components/ayudante/VentaNoDisponible';

export default async function ComprobanteVentaPage({ params }: { params: Promise<{ ventaId: string }> }) {
  const { asignacion } = await obtenerContextoAyudante();
  if (asignacion.estado !== 'asignado') return <><h1 className="text-2xl font-bold">Comprobante de venta</h1><EstadoAsignacion asignacion={asignacion} /></>;
  const { ventaId } = await params;
  const lectura = await obtenerDetalleVenta(asignacion.eventoId, ventaId);
  if (lectura.estado === 'no_encontrada') notFound();
  if (lectura.estado === 'pendiente') return <VentaNoDisponible comprobante />;
  return <DetalleVenta venta={lectura.venta} comprobante />;
}
