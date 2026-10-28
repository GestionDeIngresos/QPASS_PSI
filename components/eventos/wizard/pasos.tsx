'use client'

import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { SubidaImagen } from '@/components/eventos/wizard/SubidaImagen'
import type { Categoria } from '@/lib/eventos/types'
import {
  MAX_TICKETS,
  nuevoTicket,
  type EventoBorrador,
  type ModoWizard,
  type TicketBorrador,
} from '@/lib/eventos/wizard-types'

type PropsPaso = {
  datos: EventoBorrador
  cambiar: (parcial: Partial<EventoBorrador>) => void
}

const TITULO = 'mb-5 text-xl font-bold text-white'

// ─── Paso 1: Información ─────────────────────────────────────────
export function PasoInformacion({ datos, cambiar, categorias }: PropsPaso & { categorias: Categoria[] }) {
  return (
    <div>
      <h2 className={TITULO}>Paso 1: Información Básica del Evento</h2>
      <Input
        label="Título del evento"
        value={datos.titulo}
        maxLength={160}
        placeholder="Ej. Glow Party"
        onChange={(e) => cambiar({ titulo: e.target.value })}
      />
      <Textarea
        label="Descripción"
        value={datos.descripcion}
        maxLength={5000}
        placeholder="Cuéntales a los asistentes de qué trata el evento"
        onChange={(e) => cambiar({ descripcion: e.target.value })}
      />
      <Select label="Categoría" value={datos.categoriaId} onChange={(e) => cambiar({ categoriaId: e.target.value })}>
        <option value="">Sin categoría</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>
      <SubidaImagen etiqueta="Foto de portada" valor={datos.fotoUrl} onCambio={(url) => cambiar({ fotoUrl: url })} />
    </div>
  )
}

// ─── Paso 2: Ubicación ───────────────────────────────────────────
export function PasoUbicacion({ datos, cambiar }: PropsPaso) {
  return (
    <div>
      <h2 className={TITULO}>Paso 2: Ubicación y Distribución</h2>
      <Input
        label="Ubicación"
        value={datos.ubicacion}
        maxLength={255}
        placeholder="Ej. Av. América esq. Pando, Cochabamba"
        onChange={(e) => cambiar({ ubicacion: e.target.value })}
      />
      <SubidaImagen etiqueta="Foto del mapa" valor={datos.mapaUrl} onCambio={(url) => cambiar({ mapaUrl: url })} />
    </div>
  )
}

// ─── Paso 3: Tickets y QR (HU 22) ────────────────────────────────
const ACCESOS = [
  { valor: 'qr_digital', etiqueta: 'QR Digital' },
  { valor: 'qr_fisico', etiqueta: 'QR Físico (Manilla)' },
] as const

export function PasoTickets({ datos, cambiar }: PropsPaso) {
  const cambiarTicket = (i: number, parcial: Partial<TicketBorrador>) =>
    cambiar({ tickets: datos.tickets.map((t, j) => (j === i ? { ...t, ...parcial } : t)) })

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white">Crear Tickets</h2>
        <button
          type="button"
          disabled={datos.tickets.length >= MAX_TICKETS}
          onClick={() => cambiar({ tickets: [...datos.tickets, nuevoTicket()] })}
          className="rounded-lg bg-cyan px-4 py-2 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          + Añadir Ticket
        </button>
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Tipo de acceso</p>
      <p className="mb-3 text-xs text-muted">
        QR Digital: se asigna automáticamente al comprar. QR Físico (Manilla): se vincula al entregar la manilla.
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        {ACCESOS.map((a) => (
          <button
            key={a.valor}
            type="button"
            aria-pressed={datos.tipoAcceso === a.valor}
            onClick={() => cambiar({ tipoAcceso: a.valor })}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
              datos.tipoAcceso === a.valor
                ? 'border-cyan bg-cyan/10 text-cyan'
                : 'border-border text-muted hover:text-white'
            }`}
          >
            {a.etiqueta}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {datos.tickets.map((t, i) => (
          <div key={t.id ?? `nuevo-${i}`} className="rounded-xl border border-border bg-bg/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-white">Ticket #{i + 1}</h3>
              <button
                type="button"
                disabled={datos.tickets.length === 1}
                onClick={() => cambiar({ tickets: datos.tickets.filter((_, j) => j !== i) })}
                className="rounded-lg border border-pink px-4 py-1.5 text-xs font-bold text-pink transition hover:bg-pink hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Eliminar
              </button>
            </div>
            <div className="grid gap-x-4 md:grid-cols-2">
              <Input label="Nombre del ticket" value={t.nombre} maxLength={80} placeholder="Ej. General"
                onChange={(e) => cambiarTicket(i, { nombre: e.target.value })} />
              <Input label="Precio (Bs)" type="number" inputMode="decimal" min={0} step="0.01" value={t.precio}
                placeholder="0.00" onChange={(e) => cambiarTicket(i, { precio: e.target.value })} />
              <Input label="Cantidad disponible" type="number" inputMode="numeric" min={0} step={1} value={t.cantidad}
                placeholder="100" onChange={(e) => cambiarTicket(i, { cantidad: e.target.value })} />
              <Input label="Límite por usuario" type="number" inputMode="numeric" min={1} step={1} value={t.limite}
                placeholder="1" onChange={(e) => cambiarTicket(i, { limite: e.target.value })} />
            </div>
            <Textarea label="Descripción del ticket" rows={2} value={t.descripcion} maxLength={500}
              placeholder="Qué incluye este ticket" onChange={(e) => cambiarTicket(i, { descripcion: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Paso 4: Cronograma ──────────────────────────────────────────
export function PasoCronograma({ datos, cambiar, modo }: PropsPaso & { modo: ModoWizard }) {
  return (
    <div>
      <h2 className={TITULO}>Paso 4: Cronograma del Evento</h2>
      <div className="grid gap-x-4 md:grid-cols-2">
        <Input label="Fecha de inicio" type="date" value={datos.fechaInicio}
          onChange={(e) => cambiar({ fechaInicio: e.target.value })} />
        <Input label="Fecha de fin" type="date" value={datos.fechaFin} min={datos.fechaInicio || undefined}
          onChange={(e) => cambiar({ fechaFin: e.target.value })} />
        <Input label="Hora de inicio" type="time" value={datos.horaInicio}
          onChange={(e) => cambiar({ horaInicio: e.target.value })} />
        <Input label="Hora de fin" type="time" value={datos.horaFin}
          onChange={(e) => cambiar({ horaFin: e.target.value })} />
      </div>
      <p className="text-xs text-muted">Horario de Bolivia (GMT-4).</p>
      {modo !== 'admin' && <p className="mt-1 text-xs text-muted/70">(Sujeto a aprobación del admin)</p>}
    </div>
  )
}
