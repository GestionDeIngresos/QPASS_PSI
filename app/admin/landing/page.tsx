import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirAdmin } from '@/lib/admin/auth'
import { formatearFecha } from '@/lib/eventos/format'
import { listarPublicadosAdmin } from '@/lib/landing/queries'
import { alternarCarrusel, guardarRapido } from './actions'

export const metadata: Metadata = { title: 'Editar eventos de Landing · Admin · QPass' }

const MENSAJES: Record<string, string> = {
  fallo: 'No se pudo completar la acción. Intenta de nuevo.',
  invalido: 'Revisa los datos: título y ubicación (mín. 3 caracteres).',
}
const campo =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink'

// /admin/landing → HU 25: elegir qué eventos salen en el carrusel + editar su información
export default async function AdminLandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAdmin()
  const p = await searchParams
  const un = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
  const eventos = await listarPublicadosAdmin()
  const seleccionado = eventos.find((e) => e.id === un(p.id)) ?? null
  const error = MENSAJES[un(p.error)]
  const visibles = eventos.filter((e) => e.destacado_carrusel).length

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Editar eventos de Landing Page</h1>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}
      {un(p.ok) && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Cambios guardados. La Landing ya los muestra.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-bold text-white">Eventos Próximos a Mostrar en el Carrusel</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            {visibles} de {eventos.length} publicados visibles en la Landing. Solo aparecen eventos publicados.
          </p>
          {eventos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Todavía no hay eventos publicados.</p>
          ) : (
            <ul className="space-y-2">
              {eventos.map((e) => (
                <li
                  key={e.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                    seleccionado?.id === e.id ? 'border-[#9D00FF] bg-[#2B0B57]/40' : 'border-border bg-bg/60'
                  }`}
                >
                  <Link href={`/admin/landing?id=${e.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{e.titulo}</p>
                    <p className="truncate text-[11px] text-muted">
                      {formatearFecha(e.fecha_evento, { conAnio: true })} · {e.ubicacion ?? 'Sin ubicación'}
                    </p>
                  </Link>
                  <form action={alternarCarrusel} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="visible" value={String(!e.destacado_carrusel)} />
                    <span className={`text-[11px] font-semibold ${e.destacado_carrusel ? 'text-cyan' : 'text-muted'}`}>
                      {e.destacado_carrusel ? 'Visible' : 'Oculto'}
                    </span>
                    <button
                      type="submit"
                      role="switch"
                      aria-checked={e.destacado_carrusel}
                      aria-label={`${e.destacado_carrusel ? 'Quitar' : 'Mostrar'} ${e.titulo} en el carrusel`}
                      className={`relative h-6 w-11 rounded-full transition ${e.destacado_carrusel ? 'bg-cyan' : 'bg-white/15'}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg transition-all ${
                          e.destacado_carrusel ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 font-bold text-white">Editar Evento Seleccionado</h2>
          {!seleccionado ? (
            <p className="py-10 text-center text-sm text-muted">Elige un evento de la lista para editarlo.</p>
          ) : (
            <form action={guardarRapido} className="space-y-4">
              <input type="hidden" name="id" value={seleccionado.id} />
              <label className="block text-[11px] font-bold uppercase tracking-wide text-muted">
                Título del evento
                <input name="titulo" defaultValue={seleccionado.titulo} required minLength={3} maxLength={160} className={`${campo} mt-1.5 normal-case`} />
              </label>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-muted">
                Ubicación
                <input name="ubicacion" defaultValue={seleccionado.ubicacion ?? ''} required minLength={3} maxLength={255} className={`${campo} mt-1.5 normal-case`} />
              </label>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-muted">
                Descripción
                <textarea name="descripcion" defaultValue={seleccionado.descripcion ?? ''} rows={5} maxLength={5000} className={`${campo} mt-1.5 normal-case`} />
              </label>
              <p className="text-xs text-muted">
                Fecha: {formatearFecha(seleccionado.fecha_evento, { conAnio: true, conHora: true })}
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="rounded-lg bg-pink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-pink-hover">
                  Guardar cambios
                </button>
                <Link href="/admin/landing" className="rounded-lg px-5 py-2.5 text-sm font-bold text-muted transition hover:text-white">
                  Cancelar
                </Link>
              </div>
              <Link
                href={`/admin/landing/${seleccionado.id}/editar`}
                className="block rounded-lg border border-cyan/40 px-4 py-2.5 text-center text-sm font-bold text-cyan transition hover:bg-cyan/10"
              >
                Editar información completa (foto, mapa, tickets, fechas) →
              </Link>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
