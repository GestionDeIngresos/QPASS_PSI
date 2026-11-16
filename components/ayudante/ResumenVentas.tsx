import type { LecturaResumen } from '@/lib/ayudante/ventas-types';

export function ResumenVentas({ lectura }: { lectura: LecturaResumen }) {
  const resumen = lectura.estado === 'disponible' ? lectura.resumen : null;
  const tarjetas = [
    { titulo: 'Ventas del día', valor: resumen?.ventasDia, detalle: 'Hoy · hora de Bolivia' },
    { titulo: 'Ventas del mes', valor: resumen?.ventasMes, detalle: 'Mes actual · hora de Bolivia' },
    { titulo: 'Total de puntos cobrados', valor: resumen?.puntosCobrados, detalle: 'Ventas confirmadas del alcance autorizado' },
    { titulo: 'Cantidad de ventas confirmadas', valor: resumen?.cantidadConfirmadas, detalle: 'Alcance autorizado del evento' },
  ];
  return <div className="space-y-3">
    {!resumen && <p role="status" className="text-sm text-muted">Las métricas de ventas todavía no están disponibles.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tarjetas.map(t => <section key={t.titulo} className="min-w-0 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-muted">{t.titulo}</h2>
        <p className="mt-4 break-all text-3xl font-extrabold text-cyan" aria-label={t.valor === undefined ? 'Dato aún no disponible' : undefined}>{t.valor ?? '—'}</p>
        <p className="mt-3 text-xs text-muted">{resumen ? t.detalle : 'Pendiente de disponibilidad'}</p>
      </section>)}
    </div>
  </div>;
}
