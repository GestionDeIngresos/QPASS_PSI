import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirNegocio } from '@/lib/negocio/server'
import { editarAyudante } from '../../actions'

export const metadata: Metadata = { title: 'Editar Ayudante · QPass' }

const INPUT = 'w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink'
const SELECT = 'w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-pink [color-scheme:dark]'

const ERRORES: Record<string, string> = {
  datos_invalidos: 'Revisa los datos ingresados.',
  sin_permisos: 'No tienes permiso para esta acción.',
  fallo: 'No se pudo completar la acción. Inténtalo de nuevo.',
}

type AyudanteInfo = {
  usuarioId: string
  nombre: string
  correo: string
  activo: boolean
  negocios: { id: number; nombre: string; activo: boolean }[]
}

// /negocio/ayudantes/[usuarioId]/editar → HU 58: editar un ayudante
export default async function EditarAyudantePage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { usuarioId } = await params
  const sp = await searchParams
  const { supabase, user } = await exigirNegocio()

  const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!RE_UUID.test(usuarioId)) notFound()

  const [rpcResult, negociosResult] = await Promise.all([
    supabase.rpc('listar_ayudantes_dueno'),
    supabase.from('negocios').select('id, nombre').eq('dueno_id', user.id).order('nombre'),
  ])

  const todosAyudantes = (rpcResult.data ?? []) as AyudanteInfo[]
  const ayudante = todosAyudantes.find((a) => a.usuarioId === usuarioId)
  if (!ayudante) notFound()

  const negocios = (negociosResult.data ?? []) as { id: number; nombre: string }[]
  const negociosActivos = new Set(ayudante.negocios.filter((n) => n.activo).map((n) => n.id))

  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link href="/negocio/ayudantes" className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-white">
        ← Volver a Ayudantes
      </Link>

      <h1 className="mb-6 text-3xl font-extrabold text-white">Editar Ayudante</h1>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.08)]">
        <form action={editarAyudante} className="flex flex-col gap-5">
          <input type="hidden" name="usuarioId" value={ayudante.usuarioId} />

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">
              Correo electrónico
            </label>
            <p className="rounded-lg border border-border bg-bg/40 px-4 py-2.5 text-sm text-muted">
              {ayudante.correo}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">
              Nombre completo <span className="text-pink">*</span>
            </label>
            <input
              name="nombre"
              type="text"
              required
              maxLength={120}
              defaultValue={ayudante.nombre}
              placeholder="Nombre completo"
              autoComplete="off"
              className={INPUT}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Negocios asignados</p>
            <div className="flex flex-col gap-2">
              {negocios.map((n) => (
                <label key={n.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-bg/60 px-4 py-2.5 transition hover:border-pink/40">
                  <input
                    type="checkbox"
                    name="negocios"
                    value={n.id}
                    defaultChecked={negociosActivos.has(n.id)}
                    className="accent-pink h-4 w-4 rounded"
                  />
                  <span className="text-sm font-semibold text-white">{n.nombre}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">
              Estado <span className="text-pink">*</span>
            </label>
            <select name="activo" defaultValue={ayudante.activo ? 'true' : 'false'} className={SELECT}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>

          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-lg bg-pink px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
            >
              Guardar cambios
            </button>
            <Link
              href="/negocio/ayudantes"
              className="rounded-lg border border-border px-6 py-2.5 text-sm font-semibold text-muted transition hover:border-white/30 hover:text-white"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </section>
    </div>
  )
}
