'use client';

import { useState } from 'react';
import { actualizarCarrito, negociosPermitidos, productosDelNegocio, precioValido, resumirCarrito, MAX_CANTIDAD_PROVISIONAL, type AccionCarrito, type Carrito, type DatosCatalogo } from '@/lib/ayudante/carrito';

const errores: Record<string, string> = {
  NEGOCIO_NO_AUTORIZADO: 'El negocio no está disponible para este evento.',
  PRODUCTO_NO_AUTORIZADO: 'El producto no pertenece al negocio seleccionado.',
  PRODUCTO_NO_DISPONIBLE: 'El producto ya no está disponible. Elimínalo o vacía el carrito.',
  PRODUCTO_REPETIDO: 'El carrito contiene productos repetidos. Vacíalo y vuelve a seleccionar.',
  CANTIDAD_INVALIDA: `Usa cantidades enteras entre 1 y ${MAX_CANTIDAD_PROVISIONAL}.`,
};
const campo = 'w-full min-w-0 rounded-lg border border-border bg-bg px-3 py-2.5 text-sm';

export function CatalogoCarrito({ datos, onCambio }: { datos: DatosCatalogo; onCambio?: (carrito: Carrito) => void }) {
  const [carrito, setCarrito] = useState<Carrito>({ negocioId: '', lineas: [] });
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [cambioPendiente, setCambioPendiente] = useState<string | null>(null);
  if (datos.estado !== 'disponible') return <div className="grid gap-5 lg:grid-cols-2">
    <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-bold">1. Catálogo de productos</h2>
      <p role="status" className="mt-4 text-sm text-muted">El catálogo aún no está disponible. No se han consultado productos para vender.</p></section>
    <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-bold">2. Carrito</h2>
      <p className="mt-4 text-sm text-muted">Seleccionar productos se habilitará cuando esté disponible tu catálogo.</p><p className="mt-5 font-bold text-cyan">Total provisional: —</p></section>
  </div>;
  const catalogo = datos.catalogo;
  const negocios = negociosPermitidos(catalogo);
  const productos = productosDelNegocio(catalogo, carrito.negocioId).filter(p => p.nombre.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')));
  const resumen = resumirCarrito(catalogo, carrito);

  function aplicar(accion: AccionCarrito) {
    const resultado = actualizarCarrito(catalogo, carrito, accion);
    if (!resultado.ok) {
      if (resultado.error === 'CONFIRMAR_CAMBIO' && accion.tipo === 'negocio') setCambioPendiente(accion.negocioId);
      else setError(errores[resultado.error] ?? 'No se pudo actualizar el carrito.');
      return;
    }
    setCarrito(resultado.carrito); setError(''); setCambioPendiente(null);
    onCambio?.(resultado.carrito);
    if (accion.tipo === 'negocio') setBusqueda('');
  }

  return <div className="space-y-5">
    {datos.modo === 'demostracion' && <div role="status" className="rounded-xl border border-cyan/50 bg-cyan/10 p-4 text-sm text-cyan">
      <p className="font-bold">Demostración · Productos y negocios ficticios</p><p className="mt-1">Catálogo ficticio para simulación. Sin cobros reales.</p>
    </div>}
    <p className="text-sm text-muted">Importes informativos: el cobro deberá verificar disponibilidad y recalcular precios vigentes antes de confirmarse.</p>
    {error && <p role="alert" className="rounded-lg border border-pink/40 p-3 text-sm text-pink">{error}</p>}
    {cambioPendiente !== null && <div role="alert" className="space-y-3 rounded-xl border border-pink/50 bg-card p-4">
      <p className="text-sm">Cambiar de negocio vaciará el carrito actual. ¿Deseas continuar?</p>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={() => aplicar({ tipo: 'negocio', negocioId: cambioPendiente, confirmarVaciado: true })} className="rounded-lg bg-pink px-4 py-2 text-sm font-bold">Cambiar y vaciar carrito</button>
        <button type="button" onClick={() => setCambioPendiente(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Conservar carrito</button></div>
    </div>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <section className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">1. Catálogo de productos</h2>
        <label className="block text-sm text-muted">Negocio<select className={`${campo} mt-2 [color-scheme:dark]`} value={carrito.negocioId} onChange={e => aplicar({ tipo: 'negocio', negocioId: e.target.value })}>
          <option value="">Selecciona un negocio</option>{negocios.map(n => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select></label>
        <label className="block text-sm text-muted">Buscar productos<input type="search" className={`${campo} mt-2`} value={busqueda} disabled={!carrito.negocioId} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre del producto" /></label>
        {!carrito.negocioId ? <p className="text-sm text-muted">Selecciona un negocio para ver sus productos.</p> : productos.length === 0 ? <p className="text-sm text-muted">No hay productos que coincidan con la búsqueda.</p> : <ul className="space-y-3">
          {productos.map(p => {
            const disponible = p.disponibleParaVenta === true && precioValido(p.precioEnPuntos);
            return <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg p-4">
              <div className="min-w-0 flex-1"><p className="break-words font-semibold">{p.nombre}</p><p className="mt-1 text-sm text-cyan">{precioValido(p.precioEnPuntos) ? `${p.precioEnPuntos} puntos` : 'Precio no disponible'}</p>
                {!disponible && <p className="mt-1 text-xs text-pink">No disponible</p>}</div>
              <button type="button" disabled={!disponible} onClick={() => aplicar({ tipo: 'agregar', productoId: p.id })} aria-label={`Añadir ${p.nombre}`} className="rounded-lg bg-pink px-4 py-2 text-sm font-bold disabled:opacity-40">Añadir</button>
            </li>;
          })}
        </ul>}
      </section>
      <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">2. Carrito</h2><button type="button" disabled={!carrito.lineas.length} onClick={() => aplicar({ tipo: 'vaciar' })} className="text-sm font-semibold text-pink disabled:opacity-40">Vaciar carrito</button></div>
        {!resumen.ok ? <p role="alert" className="text-sm text-pink">{errores[resumen.error]} Vacía el carrito para empezar de nuevo.</p> : resumen.lineas.length === 0 ? <p className="text-sm text-muted">Tu carrito está vacío.</p> : <ul className="space-y-4">
          {resumen.lineas.map(l => <li key={l.producto.id} className="space-y-3 border-b border-border pb-4">
            <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words font-semibold">{l.producto.nombre}</p><button type="button" onClick={() => aplicar({ tipo: 'eliminar', productoId: l.producto.id })} aria-label={`Eliminar ${l.producto.nombre}`} className="shrink-0 text-xs font-semibold text-pink">Eliminar</button></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><label className="text-xs text-muted">Cantidad<input aria-label={`Cantidad de ${l.producto.nombre}`} type="number" min={1} max={MAX_CANTIDAD_PROVISIONAL} step={1} value={l.cantidad}
              onChange={e => aplicar({ tipo: 'cantidad', productoId: l.producto.id, cantidad: e.target.value === '' ? NaN : Number(e.target.value) })} className="ml-2 w-20 rounded-lg border border-border bg-bg p-2 text-sm text-white" /></label>
              <span className="break-all text-sm text-cyan">{l.subtotal} puntos</span></div>
          </li>)}
        </ul>}
        <dl className="space-y-3 border-t border-border pt-4 text-sm"><div className="flex justify-between gap-3"><dt>Subtotal provisional</dt><dd className="break-all">{resumen.ok ? resumen.subtotal : '—'} puntos</dd></div>
          <div className="flex justify-between gap-3 font-bold"><dt>Total provisional</dt><dd className="break-all text-cyan">{resumen.ok ? resumen.total : '—'} puntos</dd></div></dl>
        <p className="text-xs text-muted">No se aplican cargos ni descuentos en esta vista previa. No es un comprobante de venta.</p>
      </section>
    </div>
  </div>;
}
