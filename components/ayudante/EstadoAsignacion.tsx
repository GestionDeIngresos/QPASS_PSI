import type { AsignacionAyudante } from '@/lib/ayudante/auth';

export function EstadoAsignacion({ asignacion }: { asignacion: AsignacionAyudante }) {
  if (asignacion.estado === 'asignado') return <p className="text-sm text-cyan">Evento asignado #{asignacion.eventoId}</p>;
  return <div role="status" className="rounded-xl border border-pink/40 bg-pink/10 p-5">
    <h2 className="font-bold text-white">{asignacion.estado === 'sin_asignacion' ? 'Necesitas un evento asignado' : 'Revisa tu asignación de evento'}</h2>
    <p className="mt-2 text-sm text-muted">{asignacion.estado === 'sin_asignacion'
      ? 'Contacta al administrador para que asigne tu cuenta al evento correspondiente.'
      : 'Hay más de un evento asignado a tu cuenta. Contacta al administrador para confirmar dónde debes trabajar.'}</p>
  </div>;
}
