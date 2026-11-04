import Link from 'next/link'
import { fechaCorta, fechasPropuestas } from '@/lib/organizador/format'
import type { SolicitudPropia } from '@/lib/organizador/types'

// ─── ZONA EDITABLE: textos y colores de cada estado ──────────────
const ESTADOS = {
  en_revision: {
    texto: 'En revisión',
    pill: 'border-amber-400 bg-amber-400/10 text-amber-400',
    nota: 'Un administrador está revisando tu solicitud.',
  },
  aprobada: {
    texto: 'Aprobada',
    pill: 'border-green-400 bg-green-400/10 text-green-400',
    nota: 'Tu evento fue aprobado. Ya puedes gestionarlo en Mis Eventos.',
  },
  rechazada: {
    texto: 'Denegada',
    pill: 'border-pink bg-pink/10 text-pink',
    nota: 'El administrador denegó esta solicitud.',
  },
} as const
// ─────────────────────────────────────────────────────────────────

/** Una fila de "Mis Solicitudes" (HU 19) */
export function SolicitudItem({ s }: { s: SolicitudPropia }) {
  const estado = ESTADOS[s.estado] ?? ESTADOS.en_revision

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="truncate text-base font-bold text-white">{s.titulo}</p>
        <p className="mt-1 text-xs text-muted">
          Fechas propuestas: {fechasPropuestas(s.fechaInicio, s.fechaFin)}
          <span className="mx-2">·</span>
          Enviada el {fechaCorta(s.solicitadoEn)}
        </p>
        <p className="mt-1 text-xs text-muted/80">
          {estado.nota}{' '}
          {s.estado === 'aprobada' && (
            <Link href="/organizador/eventos" className="font-semibold text-cyan underline-offset-4 hover:underline">
              Ir a Mis Eventos
            </Link>
          )}
        </p>
      </div>
      <span className={`w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${estado.pill}`}>
        {estado.texto}
      </span>
    </li>
  )
}
