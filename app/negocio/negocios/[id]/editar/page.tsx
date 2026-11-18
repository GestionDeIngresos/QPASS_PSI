import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { exigirNegocio } from '@/lib/negocio/server'
import { editarNegocio } from '../../actions'

export const metadata: Metadata = { title: 'Editar Negocio · QPass' }

const ERRORES: Record<string, string> = {
  datos_invalidos: 'Revisa los datos ingresados.',
  sin_permisos: 'No tienes permiso para esta acción.',
  fallo: 'No se pudo guardar los cambios. Inténtalo de nuevo.',
}

const INPUT = 'w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-muted/60 focus:border-pink'
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted'

// /negocio/negocios/[id]/editar → HU 54: editar nombre, descripción y estado del negocio
export default async function EditarNegocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const { supabase, user } = await exigirNegocio()

  if (!/^\d+$/.test(id)) notFound()

  const { data: negocio } = await supabase
    .from('negocios')
    .select('id, nombre, descripcion, estado')
    .eq('id', Number(id))
    .eq('dueno_id', user.id)
    .maybeSingle()

  if (!negocio) notFound()

  const sp = await searchParams
  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link href="/negocio/negocios" className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-white">
        ← Volver a Mis Negocios
      </Link>

      <h1 className="mb-6 text-3xl font-extrabold text-white">Editar Negocio</h1>

      {error && (
        <p role="alert" className="mb-5 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.08)]">
        <form action={editarNegocio} className="flex flex-col gap-5">
          <input type="hidden" name="id" value={negocio.id} />

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
              defaultValue={negocio.nombre}
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
              defaultValue={negocio.descripcion ?? ''}
              className={`${INPUT} resize-none`}
            />
          </div>

          <div>
            <label htmlFor="estado" className={LABEL}>
              Estado
            </label>
            <select
              id="estado"
              name="estado"
              defaultValue={String(negocio.estado)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-white outline-none transition focus:border-pink [color-scheme:dark]"
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
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
