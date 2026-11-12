'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Acceso } from '@/lib/supervisor/server'
import { corregirRegistro, reportarRegistro } from '@/app/supervisor/actions'

const campo = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white'
function Registro({ registro: r }: { registro: Acceso }) {
  const router = useRouter()
  const [modal, setModal] = useState<'editar' | 'eliminar' | 'reportar' | null>(null)
  const dialogo = useRef<HTMLDialogElement>(null)
  const reporte = useRef<string | null>(null)
  const [error, setError] = useState('')
  const [pendiente, iniciar] = useTransition()
  function abrir(tipo: typeof modal) { setError(''); setModal(tipo); dialogo.current?.showModal() }
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('')
    const form = new FormData(e.currentTarget)
    iniciar(async () => { try {
      let respuesta
      if (modal === 'reportar') {
        reporte.current ??= crypto.randomUUID()
        respuesta = await reportarRegistro(r.id, String(form.get('descripcion')), reporte.current)
      } else respuesta = await corregirRegistro(r.id, r.version, String(form.get('resultado') ?? r.resultado), String(form.get('observacion') ?? r.observacion), String(form.get('motivo')), modal === 'eliminar')
      if (respuesta.error) return setError(respuesta.error)
      dialogo.current?.close(); setModal(null); router.refresh()
    } catch { setError('No se pudo confirmar la operación. Revisa el historial antes de repetirla.') } })
  }
  return <article className="space-y-3 rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{r.nombre} · #{r.id}</h2><p className={r.resultado === 'permitido' ? 'text-cyan' : 'text-pink'}>{r.resultado}{r.eliminado ? ' · Eliminado del historial operativo' : ''}</p></div>
    <p className="text-xs text-muted">{new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.registrado_en))}</p>
    {r.observacion && <p className="whitespace-pre-wrap text-sm">{r.observacion}</p>}
    {r.fotoFirmada ? <a href={r.fotoFirmada} target="_blank" rel="noreferrer" className="text-sm text-cyan underline">Ver foto del momento</a> : <p className="text-xs text-muted">Foto no disponible</p>}
    {r.reportes.map(p => <p key={p.id} className="text-sm text-muted">Reporte #{p.id}: {p.descripcion} · <span className="text-cyan">{p.estado}</span></p>)}
    {!!r.correcciones.length && <details className="text-xs text-muted"><summary>Historial de correcciones</summary>{r.correcciones.map((c, i) => <p key={`${c.fecha}-${i}`} className="mt-2">{c.motivo} · {c.antes} → {c.despues}</p>)}</details>}
    <div className="flex flex-wrap gap-3">{!r.eliminado && <><button onClick={() => abrir('editar')} className="rounded-lg border border-cyan px-3 py-2 text-xs text-cyan">Editar</button><button onClick={() => abrir('eliminar')} className="rounded-lg border border-pink px-3 py-2 text-xs text-pink">Eliminar</button></>}<button onClick={() => abrir('reportar')} className="rounded-lg border border-border px-3 py-2 text-xs">Reportar error</button></div>
    <dialog ref={dialogo} onCancel={e => { if (pendiente) e.preventDefault() }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-card p-6 text-white backdrop:bg-black/75 backdrop:backdrop-blur-sm" aria-label="Gestionar registro de acceso">
      {modal && <form key={modal} onSubmit={enviar} className="space-y-4"><h2 className="text-xl font-bold">{modal === 'reportar' ? 'Reportar un error' : modal === 'eliminar' ? 'Eliminar registro' : 'Corregir registro'}</h2>
        <p className="text-xs text-muted">Las correcciones quedan registradas. Editar o eliminar un acceso no reactiva una entrada usada.</p>
        {modal === 'reportar' ? <textarea name="descripcion" aria-label="Descripción del reporte" className={campo} minLength={5} maxLength={2000} required placeholder="Describe el problema"/> : <>
          {modal === 'editar' && <><label className="block text-sm">Resultado<select name="resultado" className={`${campo} mt-2`} defaultValue={r.resultado}><option value="permitido">Permitido</option><option value="denegado">Denegado</option></select></label><textarea name="observacion" aria-label="Observación" className={campo} defaultValue={r.observacion} maxLength={1000} placeholder="Observación"/></>}
          <textarea name="motivo" aria-label="Motivo de la corrección" className={campo} minLength={5} maxLength={500} required placeholder="Motivo de la corrección o eliminación"/>
        </>}
        {error && <p role="alert" className="text-sm text-pink">{error}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={pendiente} onClick={() => dialogo.current?.close()} className="rounded-lg border border-border px-4 py-2">Cancelar</button><button disabled={pendiente} className="rounded-lg bg-pink px-4 py-2 font-bold">{pendiente ? 'Guardando…' : 'Confirmar'}</button></div>
      </form>}
    </dialog>
  </article>
}
export function HistorialAccesos({ registros }: { registros: Acceso[] }) {
  return registros.length ? <div className="grid gap-4 lg:grid-cols-2">{registros.map(r => <Registro key={`${r.id}:${r.version}:${r.reportes.length}`} registro={r}/>)}</div> : <p className="rounded-2xl border border-border bg-card p-6 text-muted">No hay registros con estos filtros.</p>
}
