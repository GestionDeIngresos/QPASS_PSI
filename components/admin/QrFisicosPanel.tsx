'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generarLote, vincularManilla } from '@/app/admin/qr-fisicos/actions'
import { QrCode } from '@/components/compras/QrCode'
import type { LoteQr } from '@/lib/qr/types'
import { LectorQr } from '@/components/qr/LectorQr'

const campo = 'w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-white outline-none focus:border-pink [color-scheme:dark]'
const boton = 'rounded-lg bg-pink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-pink-hover disabled:opacity-50'

export function QrFisicosPanel({ eventos, lote }: { eventos: { id: number; titulo: string }[]; lote: LoteQr | null }) {
  const router = useRouter()
  const [generando, generar] = useTransition()
  const [vinculando, vincular] = useTransition()
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const solicitud = useRef<{ key: string; id: string } | null>(null)
  const manilla = useRef<HTMLInputElement>(null)
  const entrada = useRef<HTMLInputElement>(null)

  function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)
    const evento = Number(datos.get('evento')), cantidad = Number(datos.get('cantidad'))
    const key = `${evento}:${cantidad}`
    if (!solicitud.current || solicitud.current.key !== key) solicitud.current = { key, id: crypto.randomUUID() }
    const id = solicitud.current.id
    setError(''); setAviso('')
    generar(async () => {
      try {
        const r = await generarLote(evento, cantidad, id)
        if (r.error) return setError(r.error)
        router.push(`/admin/qr-fisicos?lote=${r.loteId}`)
      } catch { setError('No se pudo generar el lote. Intenta de nuevo con la misma selección.') }
    })
  }
  function asociar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget, datos = new FormData(form)
    setError(''); setAviso('')
    vincular(async () => {
      try {
        const r = await vincularManilla(String(datos.get('codigo')), String(datos.get('entrada')), String(datos.get('carnet')))
        if (r.error) return setError(r.error)
        setAviso('Manilla vinculada. Usa la misma entrada para consultar su estado de ingreso.')
        form.reset(); router.refresh()
      } catch { setError('No se pudo completar la vinculación. Intenta de nuevo.') }
    })
  }
  return <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={crear} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold">Generar lote de manillas</h2>
        <label className="block text-sm text-muted">Evento<select className={`${campo} mt-2`} name="evento" required disabled={generando} defaultValue=""><option value="" disabled>Seleccionar evento</option>{eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.titulo}</option>)}</select></label>
        <label className="block text-sm text-muted">Cantidad<input className={`${campo} mt-2`} type="number" min={1} max={200} required defaultValue={10} name="cantidad" disabled={generando}/></label>
        <button className={boton} disabled={generando || eventos.length === 0}>{generando ? 'Generando…' : 'Generar QR'}</button>
        {eventos.length === 0 && <p className="text-sm text-muted">Configura el acceso de un evento como QR Físico para generar sus manillas.</p>}
      </form>
      <form onSubmit={asociar} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold">Vincular a una entrada comprada</h2>
        <p className="text-xs text-muted">Escanea con un lector o pega el código. El carnet debe coincidir con el perfil del propietario.</p>
        <fieldset disabled={vinculando} className="space-y-3">
          <p className="text-xs text-muted">QR de la manilla</p><LectorQr disabled={vinculando} onCodigo={v => { if (manilla.current) manilla.current.value = v }}/>
          <input ref={manilla} className={campo} aria-label="Código de la manilla" name="codigo" placeholder="QR de manilla (QPF-…)" required maxLength={255}/>
          <p className="text-xs text-muted">QR de la entrada comprada</p><LectorQr disabled={vinculando} onCodigo={v => { if (entrada.current) entrada.current.value = v }}/>
          <input ref={entrada} className={campo} aria-label="Código de la entrada comprada" name="entrada" placeholder="QR de la entrada comprada (QP-…)" required maxLength={255}/>
          <input className={campo} aria-label="Carnet del propietario" name="carnet" placeholder="Carnet del propietario" required maxLength={50} autoComplete="off"/>
          <button className={boton}>{vinculando ? 'Vinculando…' : 'Vincular manilla'}</button>
        </fieldset>
      </form>
    </div>
    {error && <p role="alert" className="rounded-lg border border-pink/50 bg-pink/10 p-4 text-sm text-pink">{error}</p>}
    {aviso && <p role="status" className="rounded-lg border border-cyan/50 bg-cyan/10 p-4 text-sm text-cyan">{aviso}</p>}
    {lote && <>
      <button type="button" onClick={() => window.print()} className="rounded-lg border border-cyan px-5 py-2.5 text-sm font-bold text-cyan">Imprimir / Guardar como PDF</button>
      <section className="lote-qr rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-5 text-xl font-bold">{lote.evento} · Lote #{lote.id}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{lote.codigos.map(qr => <article key={qr.codigo} className="manilla-qr break-inside-avoid rounded-xl bg-white p-4 text-center text-black"><QrCode value={qr.codigo} size={150}/><p className="mt-2 break-all font-mono text-[10px]">{qr.codigo}</p><p className="mt-1 text-xs">{qr.vinculado ? 'Vinculada' : 'Sin vincular'}</p></article>)}</div>
      </section>
      <style>{`@media print { body:has(.lote-qr) { visibility: hidden; } .lote-qr, .lote-qr * { visibility: visible; } .lote-qr { position: absolute; inset: 0; border: none; background: white; color: black; } .lote-qr > div { display: grid; grid-template-columns: repeat(3, 1fr); } .manilla-qr { break-inside: avoid; } }`}</style>
    </>}
  </div>
}
