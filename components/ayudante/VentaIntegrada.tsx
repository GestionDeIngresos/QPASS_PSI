'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CatalogoCarrito } from './CatalogoCarrito';
import { LectorQr } from '@/components/qr/LectorQr';
import { resumirCarrito, type CatalogoVenta, type Carrito } from '@/lib/ayudante/carrito';
import type { SolicitudCobro } from '@/lib/ayudante/cobro';
import { confirmarCobro, consultarAsistenteVenta } from '@/app/ayudante/ventas/nueva/actions';

export function VentaIntegrada({ catalogo }: { catalogo: CatalogoVenta }) {
  const [carrito, setCarrito] = useState<Carrito>({ negocioId: '', lineas: [] });
  const [codigo, setCodigo] = useState('');
  const [asistente, setAsistente] = useState<{ nombre: string; gastable: string; reservado: string } | null>(null);
  const [intento, setIntento] = useState<SolicitudCobro | null>(null);
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof confirmarCobro>> | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [version, setVersion] = useState(0);
  const [ocupado, iniciar] = useTransition();
  const resumen = resumirCarrito(catalogo, carrito);
  const bloqueado = ocupado || intento !== null;
  function cambiarCodigo(v: string) { setCodigo(v); setAsistente(null); setMensaje(''); }
  function cambiarCarrito(v: Carrito) { setCarrito(v); setAsistente(null); setMensaje(''); }
  function consultar() {
    iniciar(async () => {
      const r = await consultarAsistenteVenta(catalogo.eventoId, carrito.negocioId, codigo);
      if (r.ok) { setAsistente(r); setMensaje(''); } else { setAsistente(null); setMensaje(r.mensaje); }
    });
  }
  function cobrar() {
    if (!resumen.ok || !carrito.lineas.length) return;
    const solicitud = intento ?? { eventoId: catalogo.eventoId, negocioId: carrito.negocioId,
      codigo: codigo.trim(), lineas: carrito.lineas, solicitudId: crypto.randomUUID(), totalEsperado: resumen.total };
    setIntento(solicitud);
    iniciar(async () => {
      try { setResultado(await confirmarCobro(solicitud)); }
      catch { setResultado({ estado: 'incierto', mensaje: 'No se conoce el resultado. Reintenta la misma solicitud o revisa el historial.' }); }
    });
  }
  function nueva() {
    setCarrito({ negocioId: '', lineas: [] }); setCodigo(''); setAsistente(null); setIntento(null);
    setResultado(null); setMensaje(''); setVersion(v => v + 1);
  }
  return <div className="space-y-5">
    <fieldset disabled={bloqueado}>
      <CatalogoCarrito key={version} datos={{ estado: 'disponible', modo: 'integrado', catalogo }} onCambio={cambiarCarrito} />
      <section className="mt-5 space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold">3. Identificar asistente</h2>
        <label className="block text-sm">Código QR<input value={codigo} maxLength={255} onChange={e => cambiarCodigo(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-bg p-3" autoComplete="off" /></label>
        <LectorQr onCodigo={cambiarCodigo} disabled={bloqueado || !carrito.negocioId} />
        <button type="button" onClick={consultar} disabled={!codigo.trim() || !carrito.negocioId} className="rounded-lg border border-cyan px-4 py-3 text-sm font-bold text-cyan disabled:opacity-40">Consultar saldo gastable</button>
      </section>
    </fieldset>
    {mensaje && <p role="alert" className="text-sm text-pink">{mensaje}</p>}
    {asistente && <div className="rounded-xl border border-cyan/40 p-4"><p>{asistente.nombre}</p><p>Gastable: {asistente.gastable} puntos</p><p className="text-sm text-muted">Reservado: {asistente.reservado} puntos</p></div>}
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-bold">4. Confirmar cobro</h2>
      <p className="text-sm text-muted">El precio y el saldo se vuelven a verificar al confirmar.</p>
      {resultado?.estado === 'confirmada' ? <div role="status" className="space-y-3"><p>Cobro confirmado: {resultado.venta.referencia} · {resultado.venta.total} puntos</p>
        <Link href={`/ayudante/ventas/${resultado.venta.id}/comprobante`} className="block font-semibold text-cyan">Ver comprobante</Link>
        <button type="button" onClick={nueva} className="rounded-lg bg-pink px-4 py-3 font-bold">Nueva venta</button></div>
        : <>
          {resultado && <p role="alert" className="text-sm text-pink">{resultado.mensaje}</p>}
          {intento && <p className="break-all text-xs text-muted">Solicitud: {intento.solicitudId}. Conserva esta página hasta conocer el resultado.</p>}
          <button type="button" onClick={cobrar} disabled={ocupado || !asistente || !resumen.ok || !carrito.lineas.length || resultado?.estado === 'rechazada'} className="rounded-lg bg-pink px-5 py-3 font-bold disabled:opacity-40">
            {ocupado ? 'Procesando…' : intento ? 'Reintentar la misma solicitud' : `Cobrar ${resumen.ok ? resumen.total : '—'} puntos`}
          </button>
          {resultado?.estado === 'rechazada' && <button type="button" onClick={() => { setIntento(null); setResultado(null); setAsistente(null); }} className="ml-4 text-sm text-cyan">Corregir selección</button>}
        </>}
    </section>
  </div>;
}
