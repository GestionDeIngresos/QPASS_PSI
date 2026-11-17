'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmarAjuste, enviarReporte } from '@/lib/saldos/actions'
import type { ResultadoCaja } from '@/lib/saldos/types'
import {
  importeValido,
  uuidValido,
  conservarIncertidumbre
} from '@/lib/saldos/validacion'

type Intento = {
  tipo: 'ajuste' | 'reporte'
  monto: string
  motivo: string
  solicitud: string
  enviado?: boolean
}
export function GestionRecarga({
  id,
  cuentaId,
  ajustable
}: {
  id: number
  cuentaId: string
  ajustable: boolean
}) {
  const [tipo, setTipo] = useState<'ajuste' | 'reporte'>('reporte')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [intento, setIntento] = useState<Intento | null>(null)
  const [incierto, setIncierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [pendiente, startTransition] = useTransition()
  const ocupado = useRef(false)
  const router = useRouter()
  const key = `qpass:devb:${cuentaId}:gestion:${id}`
  function recuperar() {
    try {
      const raw = sessionStorage.getItem(key)
      if (!raw) {
        setMensaje('No hay intento pendiente.')
        return
      }
      const i = JSON.parse(raw) as Intento
      if (
        !uuidValido(i.solicitud) ||
        !['ajuste', 'reporte'].includes(i.tipo) ||
        typeof i.motivo !== 'string' ||
        (i.tipo === 'ajuste' && !importeValido(i.monto, true))
      )
        throw new Error('invalido')
      setIntento(i)
      setTipo(i.tipo)
      setMonto(i.monto)
      setMotivo(i.motivo)
      setIncierto(i.enviado !== false)
      setMensaje('Intento recuperado. Reintenta con los mismos datos.')
    } catch {
      setMensaje(
        'No se pudo recuperar el intento. Revisa el historial antes de iniciar otro.'
      )
    }
  }
  function preparar() {
    try {
      if (sessionStorage.getItem(key)) {
        setMensaje('Recupera primero el intento guardado.')
        return
      }
      const i = {
        tipo,
        monto,
        motivo,
        solicitud: crypto.randomUUID(),
        enviado: false
      }
      sessionStorage.setItem(key, JSON.stringify(i))
      setIntento(i)
      setMensaje(
        'Revisa los datos y confirma. El reporte no cambia el saldo; el ajuste sí aplica un movimiento explícito.'
      )
    } catch {
      setMensaje(
        'Habilita el almacenamiento de la pestaña para conservar el identificador.'
      )
    }
  }
  function enviar() {
    if (!intento || ocupado.current) return
    ocupado.current = true
    startTransition(async () => {
      try {
        const enviadoAntes = intento.enviado !== false || incierto
        const enviado = { ...intento, enviado: true }
        sessionStorage.setItem(key, JSON.stringify(enviado))
        setIntento(enviado)
        if (intento.tipo === 'reporte') {
          const r = await enviarReporte(id, intento.motivo, intento.solicitud)
          if (r.error) {
            setMensaje(r.error)
            const desconocido = enviadoAntes || r.incierto !== false
            setIncierto(desconocido)
            if (!desconocido) {
              const rechazado = { ...intento, enviado: false }
              sessionStorage.setItem(key, JSON.stringify(rechazado))
              setIntento(rechazado)
            }
            return
          }
          setMensaje(
            `Reporte #${r.id} registrado. Consulta su estado en Mis reportes.`
          )
        } else {
          const r: ResultadoCaja = conservarIncertidumbre(
            await confirmarAjuste(
              id,
              intento.monto,
              intento.motivo,
              intento.solicitud
            ),
            enviadoAntes
          )
          if (r.estado !== 'confirmada') {
            setMensaje(r.mensaje)
            setIncierto(r.estado === 'incierto')
            if (r.estado === 'rechazada') {
              const rechazado = { ...intento, enviado: false }
              sessionStorage.setItem(key, JSON.stringify(rechazado))
              setIntento(rechazado)
            }
            return
          }
          setMensaje(
            `Ajuste registrado: ${r.operacion.puntos} puntos. Saldo resultante: ${r.operacion.saldo}.`
          )
        }
        sessionStorage.removeItem(key)
        setIntento(null)
        setIncierto(false)
        setMotivo('')
        setMonto('')
        router.refresh()
      } catch {
        setIncierto(true)
        setMensaje('Resultado desconocido. Reintenta el mismo intento.')
      } finally {
        ocupado.current = false
      }
    })
  }
  const campo = 'w-full rounded-lg border border-border bg-bg p-2 text-sm'
  return (
    <details className="mt-4 border-t border-border pt-3">
      <summary className="cursor-pointer font-semibold text-pink">
        Reportar o corregir recarga #{id}
      </summary>
      <div className="mt-3 space-y-3">
        <button
          type="button"
          className="text-sm text-cyan underline"
          disabled={pendiente || !!intento}
          onClick={recuperar}
        >
          Recuperar intento pendiente
        </button>
        <label className="block">
          Operación
          <select
            className={campo}
            value={tipo}
            disabled={pendiente || !!intento}
            onChange={(e) => setTipo(e.target.value as 'ajuste' | 'reporte')}
          >
            <option value="reporte">Reportar error a administración</option>
            {ajustable && (
              <option value="ajuste">Ajustar importe con auditoría</option>
            )}
          </select>
        </label>
        {tipo === 'ajuste' && (
          <label className="block">
            Importe total correcto (Bs simulados)
            <input
              className={campo}
              inputMode="decimal"
              maxLength={11}
              value={monto}
              disabled={pendiente || !!intento}
              onChange={(e) => setMonto(e.target.value)}
            />
          </label>
        )}
        <label className="block">
          {tipo === 'ajuste' ? 'Motivo del ajuste' : 'Descripción del reporte'}
          <textarea
            className={campo}
            maxLength={tipo === 'ajuste' ? 500 : 2000}
            value={motivo}
            disabled={pendiente || !!intento}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
        <p className="text-xs text-muted">
          El histórico original se conserva. Un ajuste que retire puntos
          consumidos o reservados será rechazado.
        </p>
        {!intento ? (
          <button
            className="rounded-lg border border-pink px-4 py-2 text-pink disabled:opacity-40"
            onClick={preparar}
            disabled={
              pendiente ||
              motivo.trim().length < 5 ||
              (tipo === 'ajuste' && !importeValido(monto, true))
            }
          >
            Revisar
          </button>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-pink px-4 py-2 font-bold disabled:opacity-40"
              disabled={pendiente}
              onClick={enviar}
            >
              {pendiente
                ? 'Procesando…'
                : incierto
                  ? 'Reintentar mismo intento'
                  : 'Confirmar'}
            </button>
            <button
              className="text-sm underline disabled:opacity-40"
              disabled={pendiente || incierto}
              onClick={() => {
                sessionStorage.removeItem(key)
                setIntento(null)
              }}
            >
              Cancelar revisión
            </button>
          </div>
        )}
        {mensaje && (
          <p role="status" className="text-sm text-cyan">
            {mensaje}
          </p>
        )}
      </div>
    </details>
  )
}
