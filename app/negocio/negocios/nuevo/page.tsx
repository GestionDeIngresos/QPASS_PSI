import type { Metadata } from 'next'
import Link from 'next/link'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { exigirNegocio } from '@/lib/negocio/server'
import { crearNegocio } from '../actions'

export const metadata: Metadata = { title: 'Crear Negocio · QPass' }

const ERRORES: Record<string, string> = {
  sin_evento: 'Tu cuenta no tiene un evento asignado. Pide al administrador que te asigne uno.',
  datos_invalidos: 'Revisa los datos ingresados.',
  sin_permisos: 'No tienes permiso para esta acción.',
  fallo: 'No se pudo crear el negocio. Inténtalo de nuevo.',
}

const INPUT = 'w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-muted/60 focus:border-pink'
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted'

// /negocio/negocios/nuevo → HU 53: crear un nuevo negocio
export default async function NuevoNegocioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirNegocio()
  const params = await searchParams
  const error = typeof params.error === 'string' ? ERRORES[params.error] : undefined

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link href="/negocio/negocios" className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-white">
        ← Volver a Mis Negocios
      </Link>

      <h1 className="mb-6 text-3xl font-extrabold text-white">Crear Nuevo Negocio</h1>

      {error && (
        <p role="alert" className="mb-5 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.08)]">
        <form action={crearNegocio} className="flex flex-col gap-5">
          <div>
            <label htmlFor="nombre" className={LABEL}>
              Nombre <span className="text-pink">*</span>
            </label>
            <input
              id="nombre"
              name="nombre"
              type="text"
              required
              maxLength={120}
              placeholder="Nombre del negocio"
              className={INPUT}
            />
          </div>

          <div>
            <label htmlFor="descripcion" className={LABEL}>
              Descripción
            </label>
            <textarea
              id="descripcion"
              name="descripcion"
              rows={4}
              placeholder="Descripción opcional del negocio"
              className={`${INPUT} resize-none`}
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <SubmitButton
              pendingText="Guardando…"
              className="rounded-lg bg-pink px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover disabled:opacity-60"
            >
              Guardar
            </SubmitButton>
            <Link
              href="/negocio/negocios"
              className="rounded-lg border border-border px-6 py-2.5 text-sm font-bold text-white transition hover:border-pink"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </section>
    </div>
  )
}
