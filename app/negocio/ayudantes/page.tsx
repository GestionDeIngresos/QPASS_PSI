import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { BotonConfirmar } from '@/components/admin/BotonConfirmar'
import { exigirNegocio } from '@/lib/negocio/server'
import { eliminarAyudante } from './actions'

export const metadata: Metadata = { title: 'Ayudantes · QPass' }

type AyudanteInfo = {
  usuarioId: string
  nombre: string
  correo: string
  activo: boolean
  negocios: { id: number; nombre: string; activo: boolean }[]
}

const AVISOS: Record<string, string> = {
  creado: 'Ayudante registrado correctamente.',
  editado: 'Ayudante actualizado correctamente.',
  eliminado: 'Ayudante eliminado.',
}
const ERRORES: Record<string, string> = {
  con_ventas: 'Este ayudante tiene ventas registradas y no se puede eliminar. Puedes desactivarlo desde Editar.',
  sin_permisos: 'No tienes permiso para esta acción.',
  fallo: 'No se pudo completar la acción. Inténtalo de nuevo.',
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
        activo ? 'border-green-400 text-green-400' : 'border-pink/70 text-pink'
      }`}
    >
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

const BTN = 'rounded-md px-3 py-1.5 text-[11px] font-bold transition'
const SELECT = 'rounded-lg border border-border bg-bg px-3 py-2 text-xs font-semibold text-white outline-none transition focus:border-pink [color-scheme:dark]'

// /negocio/ayudantes → HU 57/58: lista y gestión de ayudantes
export default async function AyudantesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const { supabase, user } = await exigirNegocio()

  const [rpcResult, negociosResult] = await Promise.all([
    supabase.rpc('listar_ayudantes_dueno'),
    supabase.from('negocios').select('id, nombre').eq('dueno_id', user.id).order('nombre'),
  ])

  const todosAyudantes = (rpcResult.data ?? []) as AyudanteInfo[]
  const negocios = (negociosResult.data ?? []) as { id: number; nombre: string }[]

  const q = typeof params.q === 'string' ? params.q.trim() : ''
  const negocioFiltro = typeof params.negocio === 'string' && /^\d+$/.test(params.negocio)
    ? Number(params.negocio)
    : null
  const estadoFiltro = params.estado === 'activo' || params.estado === 'inactivo' ? params.estado : ''

  const aviso = typeof params.ok === 'string' ? AVISOS[params.ok] : undefined
  const error = typeof params.error === 'string' ? ERRORES[params.error] : undefined

  // Filtros aplicados en servidor sobre el resultado de la RPC
  let lista = todosAyudantes
  if (q) {
    const ql = q.toLowerCase()
    lista = lista.filter(
      (a) => a.nombre.toLowerCase().includes(ql) || a.correo.toLowerCase().includes(ql),
    )
  }
  if (negocioFiltro !== null) {
    lista = lista.filter((a) => a.negocios.some((n) => n.id === negocioFiltro))
  }
  if (estadoFiltro === 'activo') lista = lista.filter((a) => a.activo)
  if (estadoFiltro === 'inactivo') lista = lista.filter((a) => !a.activo)

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Ayudantes</h1>

      {/* Filtros + botón registrar */}
      <div className="mb-5 flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-card p-4">
        <Form action="/negocio/ayudantes" className="flex flex-1 flex-wrap items-center gap-3">
          <input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            placeholder="Buscar por nombre o correo…"
            aria-label="Buscar ayudantes"
            className="min-w-0 flex-1 basis-48 rounded-lg border border-border bg-bg px-4 py-2 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink"
          />
          <select name="negocio" defaultValue={negocioFiltro ?? ''} aria-label="Filtrar por negocio" className={SELECT}>
            <option value="">Negocio: Todos</option>
            {negocios.map((n) => (
              <option key={n.id} value={n.id}>{n.nombre}</option>
            ))}
          </select>
          <select name="estado" defaultValue={estadoFiltro} aria-label="Filtrar por estado" className={SELECT}>
            <option value="">Estado: Todos</option>
            <option value="activo">Estado: Activo</option>
            <option value="inactivo">Estado: Inactivo</option>
          </select>
          <button type="submit" className="rounded-lg border border-cyan px-5 py-2 text-xs font-bold text-cyan transition hover:bg-cyan/10">
            Filtrar
          </button>
        </Form>
        <Link
          href="/negocio/ayudantes/nuevo"
          className="rounded-lg bg-pink px-5 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
        >
          Registrar ayudante
        </Link>
      </div>

      {aviso && (
        <p role="status" className="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-semibold text-white">
            {q || negocioFiltro || estadoFiltro
              ? 'No hay ayudantes que coincidan con los filtros.'
              : 'Todavía no tienes ayudantes registrados.'}
          </p>
          {!q && !negocioFiltro && !estadoFiltro && (
            <Link
              href="/negocio/ayudantes/nuevo"
              className="mt-6 inline-block rounded-lg bg-pink px-6 py-3 text-sm font-bold text-white transition hover:bg-pink-hover"
            >
              Registrar ayudante
            </Link>
          )}
        </div>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_0_40px_rgba(157,0,255,0.08)] md:p-6">
          {/* Escritorio: tabla */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-3 font-semibold">Nombre</th>
                  <th className="px-3 py-3 font-semibold">Correo electrónico</th>
                  <th className="px-3 py-3 font-semibold">Negocios asignados</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => {
                  const negociosActivos = a.negocios.filter((n) => n.activo).map((n) => n.nombre).join(', ')
                  return (
                    <tr key={a.usuarioId} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-3 font-semibold text-white">{a.nombre || '—'}</td>
                      <td className="px-3 py-3 text-muted">{a.correo}</td>
                      <td className="max-w-48 truncate px-3 py-3 text-muted">
                        {negociosActivos || <span className="italic">Sin asignar</span>}
                      </td>
                      <td className="px-3 py-3"><EstadoBadge activo={a.activo} /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/negocio/ayudantes/${a.usuarioId}/editar`} className={`${BTN} bg-cyan/10 text-cyan hover:bg-cyan/20`}>
                            Editar
                          </Link>
                          <form action={eliminarAyudante}>
                            <input type="hidden" name="usuarioId" value={a.usuarioId} />
                            <BotonConfirmar
                              mensaje={`¿Eliminar a ${a.nombre || a.correo}? No se borra la cuenta.`}
                              className={`${BTN} bg-red-600 text-white hover:bg-red-500`}
                            >
                              Eliminar
                            </BotonConfirmar>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <ul className="space-y-3 md:hidden">
            {lista.map((a) => {
              const negociosActivos = a.negocios.filter((n) => n.activo).map((n) => n.nombre).join(', ')
              return (
                <li key={a.usuarioId} className="rounded-xl border border-border bg-bg/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-white">{a.nombre || '—'}</p>
                      <p className="truncate text-xs text-muted">{a.correo}</p>
                    </div>
                    <EstadoBadge activo={a.activo} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">
                    {negociosActivos || <span className="italic">Sin asignar</span>}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/negocio/ayudantes/${a.usuarioId}/editar`} className={`${BTN} bg-cyan/10 text-cyan hover:bg-cyan/20`}>
                      Editar
                    </Link>
                    <form action={eliminarAyudante}>
                      <input type="hidden" name="usuarioId" value={a.usuarioId} />
                      <BotonConfirmar
                        mensaje={`¿Eliminar a ${a.nombre || a.correo}? No se borra la cuenta.`}
                        className={`${BTN} bg-red-600 text-white hover:bg-red-500`}
                      >
                        Eliminar
                      </BotonConfirmar>
                    </form>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
