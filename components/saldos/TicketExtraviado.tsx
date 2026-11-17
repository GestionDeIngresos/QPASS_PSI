'use client'
import { useState, useTransition } from 'react'
import { localizarTicket } from '@/lib/saldos/actions'
import { LectorQr } from '@/components/qr/LectorQr'
import type { TicketLocalizado } from '@/lib/saldos/types'
export function TicketExtraviado() {
  const [codigo, setCodigo] = useState(''),
    [evento, setEvento] = useState(''),
    [mensaje, setMensaje] = useState('')
  const [ticket, setTicket] = useState<TicketLocalizado | null>(null)
  const [pendiente, startTransition] = useTransition()
  return (
    <form
      className="space-y-4 rounded-2xl border border-border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          setTicket(null)
          try {
            const r = await localizarTicket(codigo, Number(evento))
            setTicket(r.ticket ?? null)
            setMensaje(
              r.error ??
                (r.ticket
                  ? 'Ticket localizado.'
                  : 'No hay un ticket propio o autorizado para esos datos.')
            )
          } catch {
            setMensaje('No se pudo completar la consulta. Intenta de nuevo.')
          }
        })
      }}
    >
      <p className="text-sm text-muted">
        Como cliente puedes comprobar si un ticket físico encontrado te
        pertenece. El personal autorizado puede identificar al propietario de un
        ticket encontrado dentro de su evento. Para recuperar uno perdido, acude
        al punto de atención con tu documento; esta consulta no lo anula ni
        emite otro.
      </p>
      <label className="block">
        Número del evento
        <input
          required
          type="number"
          min="1"
          max="2147483647"
          value={evento}
          onChange={(e) => {
            setEvento(e.target.value)
            setTicket(null)
          }}
          disabled={pendiente}
          className="mt-2 w-full rounded-lg border border-border bg-bg p-3"
        />
      </label>
      <LectorQr
        disabled={pendiente}
        onCodigo={(v) => {
          setCodigo(v)
          setTicket(null)
        }}
      />
      <label className="block">
        Código QR del ticket físico
        <input
          required
          maxLength={255}
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value)
            setTicket(null)
          }}
          disabled={pendiente}
          className="mt-2 w-full rounded-lg border border-border bg-bg p-3"
        />
      </label>
      <button
        disabled={pendiente}
        className="rounded-lg bg-pink px-5 py-3 font-bold disabled:opacity-40"
      >
        {pendiente ? 'Consultando…' : 'Consultar ticket'}
      </button>
      {mensaje && <p role="status">{mensaje}</p>}
      {ticket && (
        <div className="rounded-xl border border-cyan p-4">
          <p className="font-bold text-cyan">
            {ticket.propio
              ? 'Este ticket te pertenece'
              : `Propietario: ${ticket.nombre}`}
          </p>
          <p>
            {ticket.evento} · Entrada #{ticket.entradaId} · {ticket.estado}
          </p>
        </div>
      )}
    </form>
  )
}
