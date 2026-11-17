import type { Metadata } from 'next'
import Link from 'next/link'
import { BotonConfirmar } from '@/components/admin/BotonConfirmar'
import { FiltrosUsuarios } from '@/components/admin/usuarios/FiltrosUsuarios'
import { UsuarioModal } from '@/components/admin/usuarios/UsuarioModal'
import { exigirAdmin } from '@/lib/admin/auth'
import { ROL_INFO, type Rol } from '@/lib/admin/roles'
import { formatearRangoCorto } from '@/lib/admin/solicitudes'
import {
  leerFiltrosUsuarios,
  listarEventosAsignables,
  listarUsuarios,
  obtenerUsuario,
  separarNombre,
  type UsuarioAdmin,
} from '@/lib/admin/usuarios'
import { crearUsuario, editarUsuario, eliminarUsuario } from './actions'

export const metadata: Metadata = { title: 'Gestión de usuarios · Admin · QPass' }

const ERRORES: Record<string, string> = {
  fallo: 'No se pudo completar la acción. Intenta de nuevo.',
  propio: 'No puedes eliminar tu propia cuenta.',
  con_datos: 'No se puede eliminar: el usuario tiene compras, eventos o solicitudes. Desactívalo en su lugar.',
  fallo_auth: 'Se borró el perfil, pero no la cuenta de acceso. Revisa Supabase → Authentication.',
  sin_clave: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.',
}

const BOTON = 'rounded-md px-3 py-1.5 text-[11px] font-bold transition'

function RolBadge({ rol }: { rol: Rol }) {
  const info = ROL_INFO[rol]
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${info.estilo}`}>
      {info.etiqueta}
    </span>
  )
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
        activo ? 'border-green-400 text-green-400' : 'border-red-500 text-red-500'
      }`}
    >
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function Acciones({ u, editarHref, esYo }: { u: UsuarioAdmin; editarHref: string; esYo: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Link href={editarHref} scroll={false} className={`${BOTON} bg-white/5 text-white hover:bg-white/10`}>
        Editar
      </Link>
      {!esYo && (
        <form action={eliminarUsuario}>
          <input type="hidden" name="id" value={u.id} />
          <BotonConfirmar
            mensaje={`¿Eliminar a ${u.nombre || u.correo}? Se borra su cuenta y no se puede deshacer.`}
            className={`${BOTON} bg-red-600 text-white hover:bg-red-500`}
          >
            Eliminar
          </BotonConfirmar>
        </form>
      )}
    </div>
  )
}

// /admin/usuarios → HU 26 (ver, editar rol, eliminar) + HU 34 (personal con evento asignado)
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const { user } = await exigirAdmin()
  const filtros = leerFiltrosUsuarios(params)
  const codigoError = typeof params.error === 'string' ? params.error : ''
  const editarId = typeof params.editar === 'string' ? params.editar : ''
  const creando = params.nuevo === '1'

  // La URL del listado conserva los filtros al abrir/cerrar el formulario
  const base = new URLSearchParams()
  if (filtros.q) base.set('q', filtros.q)
  if (filtros.rol) base.set('rol', filtros.rol)
  if (filtros.estado) base.set('estado', filtros.estado)
  const con = (extra: Record<string, string>) => {
    const p = new URLSearchParams(base)
    Object.entries(extra).forEach(([k, v]) => p.set(k, v))
    return `/admin/usuarios?${p}`
  }
  const listadoHref = base.size ? `/admin/usuarios?${base}` : '/admin/usuarios'

  const [usuarios, editando, eventos] = await Promise.all([
    listarUsuarios(filtros),
    editarId ? obtenerUsuario(editarId) : Promise.resolve(null),
    creando || editarId ? listarEventosAsignables() : Promise.resolve([]),
  ])

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Gestión de Usuarios</h1>

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <FiltrosUsuarios key={listadoHref} q={filtros.q} rol={filtros.rol} estado={filtros.estado} />
        <Link
          href={con({ nuevo: '1' })}
          scroll={false}
          className="rounded-lg bg-pink px-5 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
        >
          Crear Usuario
        </Link>
      </div>

      {ERRORES[codigoError] && (
        <p role="alert" className="mb-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {ERRORES[codigoError]}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_0_40px_rgba(157,0,255,0.08)] md:p-6">
        {usuarios.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {filtros.q || filtros.rol || filtros.estado
              ? 'No hay usuarios que coincidan con los filtros.'
              : 'Todavía no hay usuarios.'}
          </p>
        ) : (
          <>
            {/* Escritorio: tabla */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="px-3 py-3 font-semibold">Nombre</th>
                    <th className="px-3 py-3 font-semibold">Email</th>
                    <th className="px-3 py-3 font-semibold">Rol</th>
                    <th className="px-3 py-3 font-semibold">Estado</th>
                    <th className="px-3 py-3 font-semibold">Evento asignado</th>
                    <th className="px-3 py-3 font-semibold">F. registro</th>
                    <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-3 font-semibold text-white">{u.nombre || '—'}</td>
                      <td className="px-3 py-3 text-muted">{u.correo}</td>
                      <td className="px-3 py-3">
                        <RolBadge rol={u.rol} />
                      </td>
                      <td className="px-3 py-3">
                        <EstadoBadge activo={u.activo} />
                      </td>
                      <td className="max-w-40 truncate px-3 py-3 text-muted">{u.eventoTitulo ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatearRangoCorto(u.creadoEn, null)}</td>
                      <td className="px-3 py-3">
                        <Acciones u={u} editarHref={con({ editar: u.id })} esYo={u.id === user.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas */}
            <ul className="space-y-3 md:hidden">
              {usuarios.map((u) => (
                <li key={u.id} className="rounded-xl border border-border bg-bg/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-white">{u.nombre || '—'}</p>
                      <p className="truncate text-xs text-muted">{u.correo}</p>
                    </div>
                    <EstadoBadge activo={u.activo} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <RolBadge rol={u.rol} />
                    {u.eventoTitulo && <span className="truncate">· {u.eventoTitulo}</span>}
                    <span>· {formatearRangoCorto(u.creadoEn, null)}</span>
                  </div>
                  <div className="mt-3">
                    <Acciones u={u} editarHref={con({ editar: u.id })} esYo={u.id === user.id} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {creando && (
        <UsuarioModal
          modo="crear"
          inicial={{ nombres: '', apellidos: '', carnet: '', correo: '', rol: '', eventoId: null, password: '', confirmar: '' }}
          eventos={eventos}
          accion={crearUsuario}
          cerrarHref={listadoHref}
        />
      )}

      {editando && (
        <UsuarioModal
          key={editando.id}
          modo="editar"
          nombreActual={editando.nombre || editando.correo}
          inicial={{
            id: editando.id,
            ...separarNombre(editando.nombre),
            carnet: editando.carnet,
            correo: editando.correo,
            rol: editando.rol,
            activo: editando.activo,
            eventoId: editando.eventoId,
          }}
          eventos={eventos}
          accion={editarUsuario}
          cerrarHref={listadoHref}
        />
      )}
    </div>
  )
}
