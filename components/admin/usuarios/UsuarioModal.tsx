'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DatosUsuario, ResultadoUsuario } from '@/app/admin/usuarios/actions'
import { ROL_INFO, ROLES, esPersonal, type Rol } from '@/lib/admin/roles'
import type { EventoAsignable } from '@/lib/admin/usuarios'

type Props = {
  modo: 'crear' | 'editar'
  inicial: DatosUsuario
  /** Nombre completo para "Editando: …" */
  nombreActual?: string
  eventos: EventoAsignable[]
  accion: (datos: DatosUsuario) => Promise<ResultadoUsuario>
  /** URL del listado (con sus filtros) a la que se vuelve al cerrar o guardar */
  cerrarHref: string
}

const ETIQUETA = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted'
const CAMPO =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-muted/60 focus:border-pink [color-scheme:dark]'

function RolChip({ rol, activo, onClick }: { rol: Rol; activo?: boolean; onClick?: () => void }) {
  const info = ROL_INFO[rol]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase transition ${info.estilo} ${
        activo ? 'ring-2 ring-white/60' : 'opacity-80 hover:opacity-100'
      }`}
    >
      {info.etiqueta}
    </button>
  )
}

export function UsuarioModal({ modo, inicial, nombreActual, eventos, accion, cerrarHref }: Props) {
  const router = useRouter()
  const [datos, setDatos] = useState<DatosUsuario>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')

  const cambiar = (parcial: Partial<DatosUsuario>) => {
    setDatos((d) => ({ ...d, ...parcial }))
    setError(null)
  }
  const campo = (k: 'nombres' | 'apellidos' | 'carnet' | 'correo' | 'password' | 'confirmar') => ({
    value: datos[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => cambiar({ [k]: e.target.value }),
  })

  const rol = (ROLES as readonly string[]).includes(datos.rol) ? (datos.rol as Rol) : null
  const conEvento = rol !== null && esPersonal(rol)

  const categorias = useMemo(
    () => [...new Set(eventos.map((e) => e.categoria).filter((c): c is string => Boolean(c)))],
    [eventos]
  )
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return eventos.filter(
      (e) => (!categoria || e.categoria === categoria) && (!q || e.titulo.toLowerCase().includes(q))
    )
  }, [eventos, busqueda, categoria])

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!rol) return setError('Selecciona el rol del usuario.')
    if (modo === 'crear') {
      if ((datos.password ?? '').length < 8) return setError('La contraseña temporal debe tener al menos 8 caracteres.')
      if (datos.password !== datos.confirmar) return setError('Las contraseñas no coinciden.')
    }
    iniciar(async () => {
      const r = await accion({ ...datos, eventoId: conEvento ? datos.eventoId : null })
      if (!r.ok) return setError(r.error)
      router.push(cerrarHref)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={enviar}
        aria-labelledby="titulo-modal-usuario"
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.2)]"
      >
        <Link
          href={cerrarHref}
          aria-label="Cerrar"
          className="absolute right-5 top-5 flex h-7 w-7 items-center justify-center rounded-full border border-muted/60 text-xs text-muted transition hover:border-white hover:text-white"
        >
          ✕
        </Link>

        <h2 id="titulo-modal-usuario" className="pr-10 text-xl font-bold text-white">
          {modo === 'crear' ? 'Crear Usuario' : 'Editar Usuario'}
        </h2>
        <p className="mb-5 mt-1 text-xs text-muted">
          {modo === 'crear' ? (
            'Completa los datos para registrar un nuevo usuario'
          ) : (
            <>
              Editando: <span className="font-semibold text-pink">{nombreActual}</span>
            </>
          )}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={ETIQUETA}>Nombres</span>
            <input {...campo('nombres')} required maxLength={60} placeholder="Ej. Juan Pablo" className={CAMPO} />
          </label>
          <label>
            <span className={ETIQUETA}>Apellidos</span>
            <input {...campo('apellidos')} required maxLength={60} placeholder="Ej. Pérez García" className={CAMPO} />
          </label>
          <label>
            <span className={ETIQUETA}>Carnet de identidad (C.I.)</span>
            <input {...campo('carnet')} required maxLength={20} placeholder="12345678" className={CAMPO} />
          </label>
          <label>
            <span className={ETIQUETA}>Correo electrónico</span>
            <input {...campo('correo')} type="email" required placeholder="juan@correo.com" className={CAMPO} />
          </label>

          {modo === 'crear' && (
            <>
              <label>
                <span className={ETIQUETA}>Contraseña temporal</span>
                <input
                  {...campo('password')}
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  className={CAMPO}
                />
              </label>
              <label>
                <span className={ETIQUETA}>Confirmar contraseña</span>
                <input
                  {...campo('confirmar')}
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Repite la contraseña"
                  className={CAMPO}
                />
              </label>
            </>
          )}

          <label className={modo === 'crear' ? 'sm:col-span-2' : ''}>
            <span className={ETIQUETA}>{modo === 'crear' ? 'Rol del usuario' : 'Rol'}</span>
            <select
              value={datos.rol}
              onChange={(e) => cambiar({ rol: e.target.value })}
              required
              className={CAMPO}
            >
              <option value="" disabled>
                Seleccionar rol...
              </option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROL_INFO[r].etiqueta}
                </option>
              ))}
            </select>
          </label>

          {modo === 'editar' && (
            <label>
              <span className={ETIQUETA}>Estado</span>
              <select
                value={datos.activo === false ? 'inactivo' : 'activo'}
                onChange={(e) => cambiar({ activo: e.target.value === 'activo' })}
                className={CAMPO}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </label>
          )}
        </div>

        {modo === 'crear' && (
          <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-border bg-bg/60 p-3">
            {ROLES.filter((r) => r !== 'admin').map((r) => (
              <RolChip key={r} rol={r} activo={datos.rol === r} onClick={() => cambiar({ rol: r })} />
            ))}
          </div>
        )}

        {conEvento && (
          <fieldset className="mt-4 rounded-lg border border-border bg-bg/60 p-3">
            <legend className={`${ETIQUETA} px-1`}>Evento asignado</legend>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar evento..."
              aria-label="Buscar evento"
              className={`${CAMPO} rounded-full py-2`}
            />
            {categorias.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {['', ...categorias].map((c) => (
                  <button
                    key={c || 'todas'}
                    type="button"
                    onClick={() => setCategoria(c)}
                    aria-pressed={categoria === c}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                      categoria === c ? 'border-pink text-pink' : 'border-transparent text-muted hover:text-white'
                    }`}
                  >
                    {c || 'Todas'}
                  </button>
                ))}
              </div>
            )}
            <ul className="mt-3 max-h-44 space-y-1 overflow-y-auto pr-1">
              {[{ id: '', titulo: 'Sin asignar (—)', categoria: null }, ...visibles].map((ev) => {
                const elegido = (datos.eventoId ?? '') === ev.id
                return (
                  <li key={ev.id || 'ninguno'}>
                    <button
                      type="button"
                      onClick={() => cambiar({ eventoId: ev.id || null })}
                      aria-pressed={elegido}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                        elegido
                          ? 'border-cyan bg-cyan/10 text-white'
                          : 'border-transparent text-muted hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{ev.titulo}</span>
                      {elegido && <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-cyan" />}
                    </button>
                  </li>
                )
              })}
              {visibles.length === 0 && <li className="px-3 py-2 text-xs text-muted">No hay eventos que coincidan.</li>}
            </ul>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={guardando}
          className="mt-6 w-full rounded-lg bg-pink py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_25px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : modo === 'crear' ? 'Crear usuario' : 'Guardar cambios'}
        </button>
        <Link href={cerrarHref} className="mt-3 block text-center text-xs text-muted underline hover:text-white">
          Cancelar
        </Link>
      </form>
    </div>
  )
}
