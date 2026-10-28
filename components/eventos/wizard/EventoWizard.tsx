'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { PasoCronograma, PasoInformacion, PasoTickets, PasoUbicacion } from '@/components/eventos/wizard/pasos'
import type { Categoria } from '@/lib/eventos/types'
import {
  borradorVacio,
  validarPaso,
  validarTodo,
  type AccionFinal,
  type AccionGuardar,
  type EventoBorrador,
  type ModoWizard,
  type PasoWizard,
} from '@/lib/eventos/wizard-types'

export type EventoWizardProps = {
  /** 'solicitud' (organizador nuevo, Dev B) · 'admin' (HU 31) · 'organizador' (editar el propio, HU 20) */
  modo: ModoWizard
  /** Datos de partida (para editar). Si se omite, el formulario arranca vacío */
  inicial?: EventoBorrador
  categorias: Categoria[]
  /** Server action que guarda. Cada pantalla inyecta la suya (así controla permisos y estado) */
  accion: AccionGuardar
  /** Botón de la izquierda en el paso 1 (opcional) */
  volverHref?: string
  volverTexto?: string
  /** A dónde ir tras guardar con éxito (si se omite, solo muestra el mensaje) */
  redirigirA?: string
}

const PASOS = ['Información', 'Ubicación', 'Tickets y QR', 'Cronograma']
const SECUNDARIO =
  'rounded-lg border border-border px-6 py-3 text-sm font-semibold text-white transition hover:border-pink disabled:opacity-50'

export function EventoWizard({
  modo,
  inicial,
  categorias,
  accion,
  volverHref,
  volverTexto = 'Volver',
  redirigirA,
}: EventoWizardProps) {
  const router = useRouter()
  const [datos, setDatos] = useState<EventoBorrador>(inicial ?? borradorVacio())
  const [paso, setPaso] = useState<PasoWizard>(1)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  const cambiar = (parcial: Partial<EventoBorrador>) => {
    setDatos((d) => ({ ...d, ...parcial }))
    setError(null)
  }

  function siguiente() {
    const problema = validarPaso(paso, datos)
    if (problema) return setError(problema)
    setError(null)
    setPaso((p) => Math.min(4, p + 1) as PasoWizard)
  }

  function anterior() {
    setError(null)
    setPaso((p) => Math.max(1, p - 1) as PasoWizard)
  }

  function guardar(final: AccionFinal) {
    const invalido = validarTodo(datos)
    if (invalido) {
      setPaso(invalido.paso)
      return setError(invalido.error)
    }
    setError(null)
    iniciar(async () => {
      const resultado = await accion(datos, final)
      if (!resultado.ok) return setError(resultado.error)
      setExito(resultado.mensaje ?? 'Guardado correctamente.')
      if (redirigirA) setTimeout(() => router.push(redirigirA), 1200)
      else router.refresh()
    })
  }

  const ocupado = guardando || exito !== null
  const textoFinal = modo === 'solicitud' ? 'Enviar solicitud' : 'Guardar cambios'

  return (
    <div>
      {/* Indicador de pasos */}
      <ol className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PASOS.map((nombre, i) => {
          const n = (i + 1) as PasoWizard
          const estado = n === paso ? 'actual' : n < paso ? 'hecho' : 'pendiente'
          const estilo = {
            actual: 'border-pink bg-pink/15 text-white',
            hecho: 'border-green-500/70 bg-green-500/10 text-white hover:border-green-400',
            pendiente: 'border-border bg-card/60 text-muted',
          }[estado]
          return (
            <li key={nombre}>
              <button
                type="button"
                disabled={n > paso || ocupado}
                aria-current={estado === 'actual' ? 'step' : undefined}
                onClick={() => setPaso(n)}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-semibold transition ${estilo}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs">
                  {estado === 'hecho' ? '✓' : n}
                </span>
                Paso {n}: {nombre}
              </button>
            </li>
          )
        })}
      </ol>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(255,0,122,0.08)] md:p-8">
        {paso === 1 && <PasoInformacion datos={datos} cambiar={cambiar} categorias={categorias} />}
        {paso === 2 && <PasoUbicacion datos={datos} cambiar={cambiar} />}
        {paso === 3 && <PasoTickets datos={datos} cambiar={cambiar} />}
        {paso === 4 && <PasoCronograma datos={datos} cambiar={cambiar} modo={modo} />}

        {error && (
          <p role="alert" className="mt-2 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
            {error}
          </p>
        )}
        {exito && (
          <p role="status" className="mt-2 rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            {exito}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
          {paso > 1 ? (
            <button type="button" onClick={anterior} disabled={ocupado} className={SECUNDARIO}>
              Anterior
            </button>
          ) : (
            volverHref && (
              <Link href={volverHref} className={SECUNDARIO}>
                {volverTexto}
              </Link>
            )
          )}

          {paso < 4 ? (
            <Button type="button" onClick={siguiente} className="sm:w-auto sm:px-8">
              Siguiente
            </Button>
          ) : (
            <>
              {modo === 'admin' && (
                <button
                  type="button"
                  onClick={() => guardar('guardar')}
                  disabled={ocupado}
                  className="rounded-lg bg-cyan px-6 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
              )}
              <Button
                type="button"
                disabled={ocupado}
                onClick={() => guardar(modo === 'admin' ? 'publicar' : 'guardar')}
                className="sm:w-auto sm:px-8"
              >
                {guardando ? 'Guardando…' : modo === 'admin' ? 'Guardar y publicar' : textoFinal}
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
