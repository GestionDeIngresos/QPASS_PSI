import Link from 'next/link'
import { BotonConfirmar } from '@/components/admin/BotonConfirmar'
import { EventImage } from '@/components/eventos/EventImage'
import { DetallesEventoModal } from '@/components/organizador/DetallesEventoModal'
import { eliminarMiEvento } from '@/app/organizador/eventos/actions'
import { etiquetaAcceso, eventoFinalizado } from '@/lib/eventos/format'
import { rangoEvento, rangoEventoConHoras } from '@/lib/organizador/format'
import type { EventoPropio } from '@/lib/organizador/types'

const BOTON = 'rounded-lg px-4 py-2.5 text-center text-sm font-bold transition'

/** Tarjeta de "Mis Eventos": Editar · Ver detalles · Eliminar (HU 21) */
export function EventoCard({ evento }: { evento: EventoPropio }) {
  const tieneVentas = evento.estadisticas.entradasVendidas > 0
  const finalizado = eventoFinalizado(evento.fechaInicio)
  const tipo = etiquetaAcceso(evento.tipoAcceso)
  const lugar = evento.ubicacion ?? 'Ubicación por confirmar'

  // insignia de estado
  const insignia = finalizado
    ? { texto: 'Finalizado', clase: 'bg-white/10 text-muted' }
    : evento.estado === 'publicado'
      ? { texto: 'Publicado', clase: 'bg-green-400/15 text-green-400' }
      : { texto: 'Aprobado · falta publicar', clase: 'bg-amber-400/15 text-amber-400' }

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative">
        <EventImage id={evento.id} titulo={evento.titulo} fotoUrl={evento.fotoUrl} className="h-36 w-full" />
        <span className={`absolute left-3 top-3 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase backdrop-blur ${insignia.clase}`}>
          {insignia.texto}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[11px] font-bold text-pink">{rangoEvento(evento.fechaInicio, evento.fechaFin)}</p>
        <h2 className="mt-1 text-xl font-bold text-white">{evento.titulo}</h2>
        <p className="mt-1 text-sm text-muted">{lugar}</p>
        <p className="mt-1 text-[11px] font-bold text-pink">Tipo: {tipo}</p>

        <div className="mt-auto grid grid-cols-1 gap-2 pt-5 sm:grid-cols-3">
          <Link href={`/organizador/eventos/${evento.id}/editar`} className={`${BOTON} bg-cyan text-black hover:opacity-90`}>
            Editar
          </Link>

          <DetallesEventoModal
            id={evento.id}
            titulo={evento.titulo}
            fotoUrl={evento.fotoUrl}
            fechaTexto={rangoEventoConHoras(evento.fechaInicio, evento.fechaFin)}
            lugarTexto={`${lugar} · Tipo: ${tipo}`}
            estadisticas={evento.estadisticas}
          />

          <form action={eliminarMiEvento}>
            <input type="hidden" name="id" value={evento.id} />
            <BotonConfirmar
              mensaje={`¿Eliminar "${evento.titulo}"? Se borrarán también sus tickets. No se puede deshacer.`}
              disabled={tieneVentas}
              title={tieneVentas ? 'No se puede eliminar: ya tiene entradas vendidas' : undefined}
              className={`${BOTON} w-full border border-red-500/40 bg-[#5a0f1f] text-white hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#5a0f1f]`}
            >
              Eliminar
            </BotonConfirmar>
          </form>
        </div>

        {tieneVentas && (
          <p className="mt-3 text-[11px] text-muted">
            Tiene {evento.estadisticas.entradasVendidas} entradas vendidas: no se puede eliminar.
          </p>
        )}
      </div>
    </li>
  )
}
