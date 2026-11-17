'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportarEntrada } from '@/app/mis-compras/actions';
import { MAX_DESCRIPCION, MIN_DESCRIPCION, obtenerSolicitudReporte, type DatosReportes } from '@/lib/reportes/entradas';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';

export function ReportesEntradasPanel({ datos }: { datos: DatosReportes }) {
  const router = useRouter();
  const [entradaId, setEntradaId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const enviando = useRef(false);
  const ultimaClave = useRef<string | null>(null);
  const entrada = datos.disponible ? datos.entradas.find(e => String(e.id) === entradaId) : null;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!datos.disponible || enviando.current || confirmacion) return;
    if (!entrada || descripcion.trim().length < MIN_DESCRIPCION || descripcion.trim().length > MAX_DESCRIPCION) {
      setError('Selecciona una entrada y escribe entre 5 y 2000 caracteres.');
      return;
    }
    enviando.current = true;
    setCargando(true);
    setError('');
    try {
      let solicitud: { id: string; clave: string };
      try { solicitud = await obtenerSolicitudReporte(datos.usuarioId, entradaId, descripcion); } catch {
        setError('Habilita el almacenamiento de esta pestaña para conservar la solicitud antes de enviarla.');
        return;
      }
      ultimaClave.current = solicitud.clave;
      const resultado = await reportarEntrada({ entradaId, descripcion, solicitudId: solicitud.id });
      if (!resultado.ok) { setError(resultado.error); return; }
      setConfirmacion(`Reporte #${resultado.reporteId} registrado. Puedes consultar su estado en “Mis reportes”.`);
      router.refresh();
    } catch {
      setError('No se pudo confirmar el envío. Reintenta con los mismos datos; se conservará la solicitud.');
    } finally {
      enviando.current = false;
      setCargando(false);
    }
  }

  return <section aria-labelledby="titulo-reportes-entradas" className="mt-10 space-y-5 border-t border-border pt-8">
    <h2 id="titulo-reportes-entradas" className="text-xl font-bold text-white">Problemas con tus entradas</h2>
    <p className="text-sm text-muted">Puedes reportar entradas de compras que pagaste o que están asignadas a tu cuenta. Enviar un reporte no cambia la entrada ni su QR.</p>
    <button type="button" onClick={() => router.refresh()} disabled={cargando} className="text-sm font-semibold text-cyan hover:underline disabled:opacity-50">Actualizar estado de reportes</button>
    {!datos.disponible ? <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted">{datos.mensaje}</p> : <>
      <form onSubmit={enviar} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <label htmlFor="entrada-reporte" className="block text-sm font-semibold">Entrada que deseas reportar</label>
        <select id="entrada-reporte" required value={entradaId} disabled={cargando || !!confirmacion || datos.entradas.length === 0}
          onChange={e => { setEntradaId(e.target.value); setError(''); }}
          className="w-full min-w-0 rounded-lg border border-border bg-bg px-3 py-3 text-sm [color-scheme:dark]">
          <option value="">Selecciona una entrada</option>
          {datos.entradas.map(e => <option key={e.id} value={e.id}>Entrada #{e.id} · {e.evento} · {e.tipo_entrada}</option>)}
        </select>
        {entrada && <p className="break-words text-sm text-cyan">Entrada #{entrada.id} · Evento: {entrada.evento} · {entrada.tipo_entrada}</p>}
        {datos.entradas.length === 0 && <p className="text-sm text-muted">No hay entradas de compras confirmadas disponibles para reportar.</p>}
        <Textarea label="Descripción del problema" aria-label="Descripción del problema" value={descripcion}
          onChange={e => { setDescripcion(e.target.value); setError(''); }} required minLength={MIN_DESCRIPCION} maxLength={MAX_DESCRIPCION}
          disabled={cargando || !!confirmacion || datos.entradas.length === 0} placeholder="Describe qué ocurrió. Evita incluir contraseñas o datos de pago." />
        <p className="text-xs text-muted">{descripcion.length}/{MAX_DESCRIPCION} caracteres</p>
        {!confirmacion && <Button type="submit" disabled={cargando || datos.entradas.length === 0}>{cargando ? 'Enviando reporte…' : 'Enviar reporte'}</Button>}
        {confirmacion && <><p role="status" className="text-sm text-cyan">{confirmacion}</p><Button type="button" onClick={() => {
          try { if (ultimaClave.current) sessionStorage.removeItem(ultimaClave.current); } catch { setError('No se pudo iniciar otra solicitud. Revisa el almacenamiento del navegador.'); return; }
          ultimaClave.current = null; setConfirmacion(''); setDescripcion(''); setError('');
        }}>Nuevo reporte</Button></>}
        {error && <p role="alert" className="text-sm text-pink">{error}</p>}
      </form>
      <h3 className="text-lg font-bold">Mis reportes</h3>
      <p className="text-xs text-muted">Solo aparecen los reportes enviados desde tu cuenta. El comprador y el destinatario no ven los reportes del otro.</p>
      {datos.reportes.length === 0 ? <p className="text-sm text-muted">Todavía no enviaste reportes.</p> : <ul className="grid gap-4 md:grid-cols-2">
        {datos.reportes.map(r => <li key={r.id} className="min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">Reporte #{r.id} · Entrada #{r.entrada_id}</span>
            <span className={r.estado === 'solucionado' ? 'text-cyan' : 'text-pink'}>{r.estado === 'solucionado' ? 'Solucionado' : 'Pendiente'}</span></div>
          <p className="mt-2 break-words text-sm font-bold">{r.evento}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.descripcion}</p>
          <p className="mt-3 text-xs text-muted">{new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.creado_en))}</p>
        </li>)}
      </ul>}
      {(datos.entradas.length === 100 || datos.reportes.length === 100) && <p className="text-xs text-muted">Se muestran hasta 100 entradas y los 100 reportes más recientes.</p>}
    </>}
  </section>;
}
