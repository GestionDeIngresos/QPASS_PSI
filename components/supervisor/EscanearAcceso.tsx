'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { LectorQr } from '@/components/qr/LectorQr'
import { FotoAcceso } from '@/components/supervisor/FotoAcceso'
import type { IdentidadQr } from '@/lib/qr/types'
import { consultarEntrada, registrarIngreso, subirFotoAcceso } from '@/app/supervisor/actions'

const campo = 'w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white outline-none focus:border-pink'
export function EscanearAcceso({ eventos }: { eventos: { id: number; titulo: string }[] }) {
  const [evento, setEvento] = useState(String(eventos[0]?.id ?? ''))
  const [codigo, setCodigo] = useState('')
  const [identidad, setIdentidad] = useState<IdentidadQr | null>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [pendiente, iniciar] = useTransition()
  const [fotoBloqueada, setFotoBloqueada] = useState(false)
  const [fotoProcesando, setFotoProcesando] = useState(false)
  const intento = useRef<{ id: string; permitir: boolean; ruta?: string } | null>(null)
  function limpiar() { setIdentidad(null); setError(''); setExito(''); setFoto(null); setFotoBloqueada(false); setFotoProcesando(false); intento.current = null }
  function verificar() {
    setError(''); setExito('')
    iniciar(async () => { try {
      const r = await consultarEntrada(codigo, Number(evento))
      if (r.error) { setIdentidad(null); setError(r.error); return }
      setIdentidad(r.identidad ?? null)
    } catch { setError('No se pudo verificar la entrada. Intenta de nuevo.') } })
  }
  function decidir(permitir: boolean) {
    if (fotoProcesando) return
    if (!foto || !identidad) return setError('Adjunta una foto del momento antes de registrar la decisión.')
    if (foto.size === 0 || foto.size > 5242880 || !['image/jpeg','image/png','image/webp'].includes(foto.type)) return setError('Elige una foto JPG, PNG o WEBP de hasta 5 MB.')
    if (intento.current && intento.current.permitir !== permitir) return setError('Primero reintenta la decisión anterior o consulta el historial antes de iniciar otra operación.')
    if (!intento.current) intento.current = { id: crypto.randomUUID(), permitir }
    setFotoBloqueada(true)
    const solicitud = intento.current
    setError('')
    iniciar(async () => { try {
      if (!solicitud.ruta) {
        const form = new FormData(); form.set('foto', foto); form.set('evento', evento); form.set('solicitud', solicitud.id)
        const r = await subirFotoAcceso(form)
        if (r.error || !r.ruta) return setError(r.error ?? 'No se pudo guardar la foto.')
        solicitud.ruta = r.ruta
      }
      const r = await registrarIngreso(codigo, Number(evento), permitir, solicitud.ruta, solicitud.id)
      if (r.error) return setError(r.error)
      setExito(`Acceso ${r.registro?.resultado} registrado (#${r.registro?.id}).`)
      setIdentidad(null)
    } catch { setError('No se pudo confirmar la respuesta. Reintenta la misma decisión o consulta el historial; no se duplicará el ingreso.') } })
  }
  if (!eventos.length) return <p className="rounded-2xl border border-border bg-card p-6 text-muted">No tienes eventos publicados asignados. Solicita al administrador que revise tu asignación.</p>
  return <div className="grid gap-6 lg:grid-cols-2">
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-xl font-bold">Verificar entrada</h2>
      <label className="block text-sm text-muted">Evento<select className={`${campo} mt-2`} disabled={pendiente} value={evento} onChange={e => { setEvento(e.target.value); limpiar() }}>{eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.titulo}</option>)}</select></label>
      <LectorQr disabled={pendiente} onCodigo={v => { limpiar(); setCodigo(v) }}/>
      <form onSubmit={e => { e.preventDefault(); verificar() }} className="space-y-3"><input aria-label="Código QR" className={campo} value={codigo} disabled={pendiente} required maxLength={255} onChange={e => { limpiar(); setCodigo(e.target.value) }} placeholder="Escanea o pega el código QR"/><button disabled={pendiente} className="rounded-lg bg-pink px-5 py-3 font-bold disabled:opacity-50">{pendiente ? 'Procesando…' : 'Verificar QR'}</button></form>
      {error && <p role="alert" className="text-sm text-pink">{error}</p>}
      {exito && <div role="status" className="space-y-3 text-cyan"><p>{exito}</p><button onClick={() => { limpiar(); setCodigo('') }} className="rounded-lg border border-cyan px-4 py-2">Siguiente asistente</button></div>}
      <Link href={`/supervisor/historial?evento=${evento}`} className="inline-block text-sm text-cyan underline">Ver historial de este evento</Link>
    </section>
    {identidad && <section className="space-y-4 rounded-2xl border border-border bg-card p-6"><h2 className="text-xl font-bold">{identidad.nombre}</h2><p className="text-sm text-muted">Entrada #{identidad.entradaId} · QR {identidad.origen}</p><p className={identidad.aptaIngreso ? 'text-cyan' : 'text-pink'}>{identidad.aptaIngreso ? 'Entrada válida para ingresar' : `No apta para ingreso · Estado: ${identidad.estadoEntrada}`}</p>
      <FotoAcceso disabled={pendiente || fotoBloqueada} onPreparando={setFotoProcesando} onFoto={f => { setFoto(f); setError('') }}/>
      <div className="flex flex-wrap gap-3"><button disabled={pendiente || fotoProcesando || !identidad.aptaIngreso || !foto} onClick={() => decidir(true)} className="rounded-lg bg-cyan px-5 py-3 font-bold text-black disabled:opacity-40">Permitir ingreso</button><button disabled={pendiente || fotoProcesando || !foto} onClick={() => decidir(false)} className="rounded-lg bg-pink px-5 py-3 font-bold disabled:opacity-40">Denegar ingreso</button></div>
    </section>}
  </div>
}
