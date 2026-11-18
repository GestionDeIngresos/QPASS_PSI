import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirNegocio } from '@/lib/negocio/server'
import { PasswordInput } from '@/components/negocio/PasswordInput'
import { registrarAyudante } from '../actions'

export const metadata: Metadata = { title: 'Registrar Ayudante · QPass' }

const INPUT = 'w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink'

const ERRORES: Record<string, string> = {
  datos_invalidos: 'Revisa los datos ingresados.',
  sin_clave: 'Configuración del servidor incompleta. Contacta al administrador.',
  correo_duplicado: 'Ese correo ya tiene una cuenta registrada.',
  password_debil: 'La contraseña no cumple los requisitos de seguridad.',
  fallo_auth: 'No se pudo crear la cuenta. Inténtalo de nuevo.',
  sin_evento: 'El negocio no tiene un evento asignado.',
  no_asignable: 'Este correo no puede ser asignado como ayudante.',
  sin_permisos: 'No tienes permiso para esta acción.',
  fallo: 'No se pudo completar la acción. Inténtalo de nuevo.',
}

// /negocio/ayudantes/nuevo → HU 57: registrar un ayudante nuevo
export default async function NuevoAyudantePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const { supabase, user } = await exigirNegocio()

  const { data: negocios } = await supabase
    .from('negocios')
    .select('id, nombre')
    .eq('dueno_id', user.id)
    .order('nombre')

  const lista = negocios ?? []
  const error = typeof params.error === 'string' ? ERRORES[params.error] : undefined

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link href="/negocio/ayudantes" className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-white">
        ← Volver a Ayudantes
      </Link>

      <h1 className="mb-6 text-3xl font-extrabold text-white">Registrar Ayudante</h1>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-semibold text-white">No tienes negocios registrados.</p>
          <p className="mt-2 text-sm text-muted">Debes tener al menos un negocio para poder registrar ayudantes.</p>
          <Link
            href="/negocio/negocios/nuevo"
            className="mt-6 inline-block rounded-lg bg-pink px-6 py-3 text-sm font-bold text-white transition hover:bg-pink-hover"
          >
            Crear negocio
          </Link>
        </div>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.08)]">
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-muted">Crear Cuenta de Ayudante</h2>

          <form action={registrarAyudante} className="flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">
                Nombre completo <span className="text-pink">*</span>
              </label>
              <input
                name="nombre"
                type="text"
                required
                maxLength={120}
                placeholder="Nombre completo"
                autoComplete="off"
                className={INPUT}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">
                Correo electrónico <span className="text-pink">*</span>
              </label>
              <input
                name="correo"
                type="email"
                required
                placeholder="correo@ejemplo.com"
                autoComplete="off"
                className={INPUT}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">
                Contraseña temporal <span className="text-pink">*</span>
              </label>
              <PasswordInput
                name="password"
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                className={INPUT}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-muted">
                Negocios asignados <span className="text-pink">*</span>
              </p>
              <div className="flex flex-col gap-2">
                {lista.map((n) => (
                  <label key={n.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-bg/60 px-4 py-2.5 transition hover:border-pink/40">
                    <input
                      type="checkbox"
                      name="negocios"
                      value={n.id}
                      className="accent-pink h-4 w-4 rounded"
                    />
                    <span className="text-sm font-semibold text-white">{n.nombre}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-lg bg-pink px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
              >
                Registrar
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
      )}
    </div>
  )
}
