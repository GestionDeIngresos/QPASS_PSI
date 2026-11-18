import { obtenerContextoAyudante } from '@/lib/ayudante/auth';
import { EstadoAsignacion } from '@/components/ayudante/EstadoAsignacion';
import Link from 'next/link';
import { obtenerCatalogoAyudante } from '@/lib/ayudante/catalogo-server';
import { CatalogoCarrito } from '@/components/ayudante/CatalogoCarrito';
import { VentaIntegrada } from '@/components/ayudante/VentaIntegrada';
import { VentaDemostracion } from '@/components/ayudante/VentaDemostracion';

export default async function NuevaVentaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { asignacion } = await obtenerContextoAyudante();
  if (asignacion.estado !== 'asignado') return <><h1 className="text-3xl font-extrabold">Nueva venta</h1><EstadoAsignacion asignacion={asignacion} /></>;
  const demostracion = (await searchParams).demo === 'catalogo';
  const datos = await obtenerCatalogoAyudante(asignacion.eventoId, demostracion);
  if (datos.estado === 'disponible' && datos.modo === 'demostracion') return <VentaDemostracion catalogo={datos.catalogo} />;
  if (datos.estado === 'disponible' && datos.modo === 'integrado') return <>
    <h1 className="text-3xl font-extrabold">Nueva venta</h1>
    <EstadoAsignacion asignacion={asignacion} />
    <VentaIntegrada catalogo={datos.catalogo} />
  </>;
  return <>
    <div><h1 className="text-3xl font-extrabold">Nueva venta</h1><p className="mt-2 text-sm text-muted">Productos, carrito e identificación del asistente en un solo lugar.</p></div>
    <EstadoAsignacion asignacion={asignacion} />
    <p role="status" className="rounded-xl border border-pink/40 bg-pink/10 p-4 text-sm">Las ventas aún no están habilitadas. No se realizarán cobros ni cambios de saldo.</p>
    {process.env.NODE_ENV === 'development' && <Link href={demostracion ? '/ayudante/ventas/nueva' : '/ayudante/ventas/nueva?demo=catalogo'} className="inline-block text-sm font-semibold text-cyan hover:underline">
      {demostracion ? 'Salir de la demostración' : 'Probar demostración con productos ficticios'}
    </Link>}
    <CatalogoCarrito key={`${asignacion.eventoId}:${datos.estado === 'disponible' ? datos.modo : 'pendiente'}`} datos={datos} />
    <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-bold">3. Identificación QR</h2>
          <p className="mt-3 text-sm text-muted">La identificación del asistente se habilitará antes de confirmar una venta.</p>
          <button type="button" disabled className="mt-5 rounded-lg border border-cyan/40 px-4 py-3 text-sm font-bold text-cyan opacity-50">Identificar asistente</button></section>
    <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-bold">4. Resultado de cobro</h2>
      <p className="mt-3 text-sm text-muted">Todavía no hay un cobro confirmado en esta pantalla.</p>
      <button type="button" disabled className="mt-5 rounded-lg bg-pink px-6 py-3 text-sm font-bold opacity-50">Confirmar cobro</button></section>
  </>;
}
