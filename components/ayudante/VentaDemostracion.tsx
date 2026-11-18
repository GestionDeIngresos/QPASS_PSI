'use client';

import { useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { CatalogoCarrito } from './CatalogoCarrito';
import { resumirCarrito, type Carrito, type CatalogoVenta } from '@/lib/ayudante/carrito';
import { CLIENTE_DEMO, QR_DEMO, confirmarVentaDemo, iniciarDemo, resumenDemo, type VentaDemo } from '@/lib/ayudante/demo/venta';

const boton = 'rounded-lg border border-cyan/50 px-4 py-2 text-sm font-bold text-cyan disabled:opacity-40';
const panel = 'space-y-4 rounded-2xl border border-border bg-card p-5';
type Vista = 'Nueva venta' | 'Comprobante' | 'Historial' | 'Dashboard';
const fechaLocal = (fecha: string) => new Date(fecha).toLocaleString('es-BO', { timeZone: 'America/La_Paz' });

export function VentaDemostracion({ catalogo }: { catalogo: CatalogoVenta }) {
  const [estado, setEstado] = useState(iniciarDemo);
  const [carrito, setCarrito] = useState<Carrito>({ negocioId: '', lineas: [] });
  const [identificado, setIdentificado] = useState(false);
  const [confirmada, setConfirmada] = useState(false);
  const [venta, setVenta] = useState<VentaDemo | null>(null);
  const [vista, setVista] = useState<Vista>('Nueva venta');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const resumen = resumirCarrito(catalogo, carrito);
  const metricas = resumenDemo(estado);

  function nueva() {
    setCarrito({ negocioId: '', lineas: [] }); setIdentificado(false); setConfirmada(false);
    setError(''); setVersion(v => v + 1); setVista('Nueva venta');
  }
  function confirmar() {
    if (!identificado || confirmada) return;
    try {
      const siguiente = confirmarVentaDemo(estado, catalogo, carrito, QR_DEMO, new Date().toISOString());
      setEstado(siguiente); setVenta(siguiente.ventas[0]); setConfirmada(true); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo simular la venta.'); }
  }

  return <div className="space-y-5">
    <div role="status" className="space-y-2 rounded-xl border border-cyan bg-cyan/10 p-5">
      <h1 className="text-2xl font-extrabold">Demostración de ventas · HU 61, 62 y 63</h1>
      <p>SIMULACIÓN · Sin cobros reales. Cliente, QR, puntos y ventas ficticios.</p>
      <p className="text-sm">Datos en memoria: al recargar o salir se reinician. No se registran ventas, puntos ni devoluciones en Supabase.</p>
      <Link href="/ayudante/ventas/nueva" className="inline-block text-sm font-semibold text-cyan underline">Salir de la demostración</Link>
    </div>
    <nav aria-label="Flujo de demostración" className="flex flex-wrap gap-3">
      {(['Nueva venta', 'Comprobante', 'Historial', 'Dashboard'] as const).map(v => <button key={v} type="button" className={boton} aria-current={vista === v ? 'page' : undefined}
        disabled={v === 'Comprobante' && !venta} onClick={() => setVista(v)}>{v} · demo</button>)}
    </nav>
    {error && <p role="alert" className="text-pink">{error}</p>}
    {vista === 'Nueva venta' && <>
      <p className="text-sm text-muted">Prueba sugerida: selecciona Bebidas y añade 3 aguas de 5 puntos. Saldo inicial: 100; compra: 15; saldo final: 85.</p>
      <fieldset disabled={confirmada} className="space-y-5">
        <CatalogoCarrito key={version} datos={{ estado: 'disponible', modo: 'demostracion', catalogo }} onCambio={c => { setCarrito(c); setIdentificado(false); setError(''); }} />
        <section className={panel}>
          <h2 className="text-lg font-bold">3. Identificación QR de demostración</h2>
          <p>Este QR solo identifica al cliente ficticio. No se admite escanear ni introducir un QR real.</p>
          <QRCodeSVG value={QR_DEMO} size={128} title="QR ficticio sin valor para cobros" bgColor="#ffffff" fgColor="#000000" marginSize={2} />
          <p className="break-all text-xs text-muted">{QR_DEMO}</p>
          <button type="button" className={boton} disabled={!resumen.ok || !carrito.lineas.length} onClick={() => setIdentificado(true)}>Simular lectura del QR ficticio</button>
          {identificado && <div role="status"><p>{CLIENTE_DEMO}</p><p>Saldo de demostración: {estado.saldo} puntos</p></div>}
        </section>
      </fieldset>
      <section className={panel}>
        <h2 className="text-lg font-bold">4. Confirmación de demostración</h2>
        {confirmada && venta ? <div role="status" className="space-y-3">
          <p>Venta simulada confirmada: {venta.referencia} · {venta.total} puntos. Saldo final: {venta.saldoFinal} puntos.</p>
          <button type="button" className={boton} onClick={() => setVista('Comprobante')}>Ver comprobante de demostración</button>
          <button type="button" className={`${boton} ml-3`} onClick={nueva}>Nueva venta ficticia</button>
        </div> : <>
          <p>Total simulado: {resumen.ok ? resumen.total : '—'} puntos</p>
          <button type="button" className={boton} disabled={!identificado || !resumen.ok || !carrito.lineas.length} onClick={confirmar}>Confirmar venta simulada</button>
        </>}
      </section>
    </>}
    {vista === 'Comprobante' && venta && <section className={panel}>
      <h2 className="text-xl font-bold">Comprobante de demostración · Sin valor fiscal</h2>
      <p>Referencia: {venta.referencia}</p><p>Fecha (Bolivia): {fechaLocal(venta.fecha)}</p>
      <p>{venta.cliente} · {venta.negocio}</p>
      <ul className="space-y-2">{venta.items.map((l, i) => <li key={i}>{l.nombre} · Cantidad: {l.cantidad} × {l.precio} puntos = {l.subtotal} puntos</li>)}</ul>
      <p className="font-bold">Total: {venta.total} puntos ficticios</p>
      <p>Saldo anterior: {venta.saldoAnterior} · Saldo final: {venta.saldoFinal} puntos</p>
      <button type="button" className={boton} onClick={() => setVista('Historial')}>Ver historial de demostración</button>
    </section>}
    {vista === 'Historial' && <section className={panel}>
      <h2 className="text-xl font-bold">Historial de demostración</h2>
      {!estado.ventas.length ? <p>Aún no hay ventas simuladas.</p> : <ul className="space-y-4">{estado.ventas.map(v => <li key={v.referencia} className="space-y-2 border-b border-border pb-3">
        <p>{v.referencia} · {fechaLocal(v.fecha)} · {v.cliente} · {v.total} puntos · Simulada</p>
        <button type="button" className={boton} onClick={() => { setVenta(v); setVista('Comprobante'); }}>Ver comprobante {v.referencia}</button>
      </li>)}</ul>}
      <button type="button" className={boton} onClick={() => setVista('Dashboard')}>Ver dashboard de demostración</button>
    </section>}
    {vista === 'Dashboard' && <section className={panel}>
      <h2 className="text-xl font-bold">Dashboard de demostración</h2>
      <p>Ventas simuladas confirmadas: {metricas.cantidad}</p><p>Total vendido: {metricas.puntos} puntos ficticios</p>
      <p>Saldo inicial del cliente: 100 puntos</p><p>Saldo actual del cliente: {estado.saldo} puntos</p>
      <button type="button" className={boton} onClick={nueva}>Preparar nueva venta ficticia</button>
    </section>}
  </div>;
}
