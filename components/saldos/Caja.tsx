'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LectorQr } from '@/components/qr/LectorQr'
import { FotoAcceso } from '@/components/supervisor/FotoAcceso'
import {
  confirmarDevolucion,
  confirmarRecarga,
  consultarPersona,
  subirEvidencia
} from '@/lib/saldos/actions'
import {
  codigoValido,
  idValido,
  importeValido,
  uuidValido,
  conservarIncertidumbre
} from '@/lib/saldos/validacion'
import type {
  EventoCaja,
  RolCaja,
  SaldoPersona,
  ResultadoCaja
} from '@/lib/saldos/types'

type Intento = {
  evento: number
  codigo: string
  importe: string
  solicitud: string
  comprobante?: string
  foto?: string
  enviado?: boolean
}
const campo =
  'w-full rounded-lg border border-border bg-bg px-3 py-2 text-white disabled:opacity-60'
const boton =
  'rounded-lg border border-pink px-4 py-2 font-semibold text-pink disabled:opacity-40'
export function Caja({
  rol,
  eventos,
  cuentaId
}: {
  rol: RolCaja
  eventos: EventoCaja[]
  cuentaId: string
}) {
  const [evento, setEvento] = useState(eventos[0]?.id ?? 0)
  const [codigo, setCodigo] = useState('')
  const [importe, setImporte] = useState('')
  const [persona, setPersona] = useState<SaldoPersona | null>(null)
  const [intento, setIntento] = useState<Intento | null>(null)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [preparandoFoto, setPreparandoFoto] = useState(false)
  const [resultado, setResultado] = useState<ResultadoCaja | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [pendiente, startTransition] = useTransition()
  const ocupado = useRef(false)
  const router = useRouter()
  const clave = `qpass:devb:${cuentaId}:${rol}`
  const tasa = eventos.find((e) => e.id === evento)?.tasa
  const bloqueado = !!intento || pendiente

  function persistir(i: Intento) {
    sessionStorage.setItem(clave, JSON.stringify(i))
    setIntento(i)
  }
  function recuperar() {
    try {
      const raw = sessionStorage.getItem(clave)
      if (!raw) {
        setMensaje('No hay un intento pendiente en esta pestaña.')
        return
      }
      const i = JSON.parse(raw) as Intento
      if (
        !idValido(i.evento) ||
        !codigoValido(i.codigo) ||
        !importeValido(i.importe) ||
        !uuidValido(i.solicitud)
      )
        throw new Error('invalido')
      setIntento(i)
      setEvento(i.evento)
      setCodigo(i.codigo)
      setImporte(i.importe)
      setResultado(
        i.enviado
          ? {
              estado: 'incierto',
              mensaje:
                'Consulta el historial o reintenta el mismo intento para recuperar el resultado.'
            }
          : null
      )
      setMensaje(
        'Intento recuperado. Reintentar conserva su identificador y datos. Los archivos ya cargados permanecen vinculados.'
      )
    } catch {
      setMensaje(
        'No se pudo recuperar el intento. No confirmes otra operación sin revisar primero el historial.'
      )
    }
  }
  function preparar() {
    if (!persona || !importeValido(importe) || !tasa) return
    try {
      if (sessionStorage.getItem(clave)) {
        setMensaje(
          'Ya hay un intento guardado. Recupéralo antes de iniciar otro.'
        )
        return
      }
      persistir({
        evento,
        codigo: codigo.trim(),
        importe,
        solicitud: crypto.randomUUID()
      })
      setMensaje(
        'Revisa los datos. Al confirmar se registrará una operación simulada.'
      )
    } catch {
      setMensaje(
        'El navegador no permite conservar este intento. Habilita el almacenamiento de la pestaña antes de operar.'
      )
    }
  }
  function ejecutar() {
    if (
      !intento ||
      ocupado.current ||
      preparandoFoto ||
      resultado?.estado === 'confirmada'
    )
      return
    ocupado.current = true
    startTransition(async () => {
      try {
        let i = { ...intento }
        const enviadoAntes =
          i.enviado === true || resultado?.estado === 'incierto'
        if (rol === 'devolucion') {
          for (const tipo of ['comprobante', 'foto'] as const) {
            if (i[tipo]) continue
            const archivo = tipo === 'comprobante' ? comprobante : foto
            if (!archivo) {
              setMensaje(
                `Adjunta ${tipo === 'foto' ? 'la foto del usuario' : 'el comprobante simulado'}.`
              )
              return
            }
            const f = new FormData()
            f.set('evento', String(i.evento))
            f.set('solicitud', i.solicitud)
            f.set('tipo', tipo)
            f.set('archivo', archivo)
            const r = await subirEvidencia(f)
            if (!r.ruta) {
              setMensaje(r.error ?? 'No se pudo guardar la imagen.')
              return
            }
            i = { ...i, [tipo]: r.ruta }
            persistir(i)
          }
        }
        i = { ...i, enviado: true }
        persistir(i)
        const respuesta =
          rol === 'recargador'
            ? await confirmarRecarga(i.evento, i.codigo, i.importe, i.solicitud)
            : await confirmarDevolucion(
                i.evento,
                i.codigo,
                i.importe,
                i.comprobante!,
                i.foto!,
                i.solicitud
              )
        const r = conservarIncertidumbre(respuesta, enviadoAntes)
        setResultado(r)
        if (r.estado === 'rechazada') persistir({ ...i, enviado: false })
        if (r.estado === 'confirmada') {
          sessionStorage.removeItem(clave)
          router.refresh()
        }
      } catch {
        setResultado({
          estado: 'incierto',
          mensaje:
            'No se pudo confirmar el resultado. Conserva este intento y reintenta sin cambiar sus datos.'
        })
      } finally {
        ocupado.current = false
      }
    })
  }
  function nueva() {
    if (resultado?.estado === 'incierto') return
    try {
      sessionStorage.removeItem(clave)
    } catch {
      setMensaje('No se pudo cerrar el intento guardado.')
      return
    }
    setIntento(null)
    setCodigo('')
    setImporte('')
    setPersona(null)
    setComprobante(null)
    setFoto(null)
    setResultado(null)
    setMensaje('')
  }
  if (!eventos.length)
    return (
      <p className="rounded-xl border border-border p-6">
        No tienes eventos asignados. Solicita tu asignación al administrador.
      </p>
    )
  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-7">
      <p className="rounded-lg border border-yellow-400/40 p-3 text-sm text-yellow-200">
        Operación simulada. No se realizan cobros ni transferencias bancarias
        reales.
      </p>
      <button
        type="button"
        className={boton}
        disabled={pendiente || !!intento}
        onClick={recuperar}
      >
        Recuperar intento pendiente
      </button>
      <label className="block space-y-2">
        Evento
        <select
          className={campo}
          value={evento}
          disabled={bloqueado}
          onChange={(e) => {
            setEvento(Number(e.target.value))
            setPersona(null)
          }}
        >
          {eventos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.titulo}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted">
        {tasa
          ? `Conversión configurada: ${tasa} Bs por punto.`
          : 'Conversión pendiente de acuerdo del equipo. Puedes identificar al cliente y consultar su saldo; las operaciones monetarias están bloqueadas.'}
      </p>
      <LectorQr
        disabled={bloqueado}
        onCodigo={(v) => {
          setCodigo(v)
          setPersona(null)
        }}
      />
      <label className="block space-y-2">
        Código QR
        <input
          className={campo}
          maxLength={255}
          value={codigo}
          disabled={bloqueado}
          onChange={(e) => {
            setCodigo(e.target.value)
            setPersona(null)
          }}
          autoComplete="off"
        />
      </label>
      <button
        className={boton}
        disabled={bloqueado || !codigo.trim()}
        onClick={() =>
          startTransition(async () => {
            const r = await consultarPersona(rol, evento, codigo)
            setPersona(r.persona ?? null)
            setMensaje(r.error ?? 'Identificación verificada.')
          })
        }
      >
        Identificar y consultar saldo
      </button>
      {persona && (
        <div className="rounded-xl border border-cyan/50 p-4">
          <p className="font-bold">
            {persona.nombre} · entrada #{persona.entradaId}
          </p>
          <p>
            Total: {persona.saldo} pts · Reservado: {persona.reservado} pts
          </p>
          <p className="font-bold text-cyan">
            Disponible: {persona.disponible} pts
          </p>
        </div>
      )}
      <label className="block space-y-2">
        {rol === 'recargador'
          ? 'Importe recibido simulado (Bs)'
          : 'Puntos a devolver'}
        <input
          className={campo}
          value={importe}
          disabled={bloqueado}
          inputMode="decimal"
          maxLength={11}
          placeholder="0.00"
          onChange={(e) => setImporte(e.target.value)}
        />
      </label>
      {!intento && (
        <button
          className={boton}
          disabled={pendiente || !persona || !importeValido(importe) || !tasa}
          onClick={preparar}
        >
          Revisar {rol === 'recargador' ? 'recarga' : 'devolución'}
        </button>
      )}
      {intento && (
        <div className="space-y-4 rounded-xl border border-cyan/40 p-4">
          <p className="font-bold">
            {rol === 'recargador' ? 'Recargar' : 'Devolver'} {intento.importe}{' '}
            {rol === 'recargador' ? 'Bs simulados' : 'puntos'} · evento #
            {intento.evento}
          </p>
          <p className="break-all text-xs text-muted">
            Intento: {intento.solicitud}
          </p>
          {rol === 'devolucion' && resultado?.estado !== 'confirmada' && (
            <>
              <label className="block space-y-2">
                Comprobante de devolución simulada (imagen, máximo 2 MB)
                {intento.comprobante ? (
                  <span className="block text-cyan">
                    Comprobante vinculado al intento.
                  </span>
                ) : (
                  <input
                    className={campo}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={pendiente}
                    onChange={(e) =>
                      setComprobante(e.target.files?.[0] ?? null)
                    }
                  />
                )}
              </label>
              <div className="block space-y-2">
                {intento.foto ? (
                  <span className="block text-cyan">
                    Foto vinculada al intento.
                  </span>
                ) : (
                  <FotoAcceso
                    titulo="Foto del usuario"
                    contexto="la devolución"
                    maxBytes={2097152}
                    onFoto={setFoto}
                    onPreparando={setPreparandoFoto}
                    disabled={pendiente}
                  />
                )}
              </div>
              <p className="text-xs text-muted">
                Las imágenes se guardan de forma privada y no se pueden
                reemplazar después de cargarlas. En escritorio puedes elegir un
                archivo; en móvil puedes usar la cámara.
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className={boton}
              disabled={
                pendiente ||
                preparandoFoto ||
                resultado?.estado === 'confirmada'
              }
              onClick={ejecutar}
            >
              {pendiente
                ? 'Procesando…'
                : resultado?.estado === 'incierto'
                  ? 'Reintentar mismo intento'
                  : 'Confirmar operación simulada'}
            </button>
            <button
              className={boton}
              disabled={
                pendiente || preparandoFoto || resultado?.estado === 'incierto'
              }
              onClick={nueva}
            >
              {resultado?.estado === 'confirmada'
                ? 'Nueva operación'
                : 'Cancelar revisión'}
            </button>
          </div>
        </div>
      )}
      {mensaje && (
        <p role="status" className="text-sm text-muted">
          {mensaje}
        </p>
      )}
      {resultado?.estado === 'confirmada' ? (
        <div
          role="status"
          className="space-y-1 rounded-xl border border-cyan p-4 text-cyan"
        >
          <p className="font-bold">
            Operación simulada registrada · {resultado.operacion.referencia}
          </p>
          <p>
            Puntos: {resultado.operacion.puntos} · Importe:{' '}
            {resultado.operacion.importe} Bs · Saldo resultante:{' '}
            {resultado.operacion.saldo} pts
          </p>
        </div>
      ) : (
        resultado && (
          <p role="alert" className="text-pink">
            {resultado.mensaje}
          </p>
        )
      )}
    </div>
  )
}
