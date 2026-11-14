"use client";

import { useMemo, useState } from "react";
import Link from 'next/link';
import type { CompraPagada, EntradaConEvento } from "../../types/compras";
import { esProximo, formatFechaCompra, formatMoney, numeroCompra } from "../../lib/compras/format";
import { TicketCard } from "./TicketCard";
import { QrModal } from "./QrModal";

type Tab = "proximos" | "historial";

export function MisComprasView({ entradas, compras = [] }: { entradas: EntradaConEvento[]; compras?: CompraPagada[] }) {
  const [tab, setTab] = useState<Tab>("proximos");
  const [seleccionada, setSeleccionada] = useState<EntradaConEvento | null>(null);

  const { proximos, historial } = useMemo(() => {
    const prox: EntradaConEvento[] = [];
    const hist: EntradaConEvento[] = [];
    for (const e of entradas) (esProximo(e) ? prox : hist).push(e);
    // próximos: el más cercano primero · historial: el más reciente primero
    prox.sort((a, b) => +new Date(a.evento.fecha_evento) - +new Date(b.evento.fecha_evento));
    hist.sort((a, b) => +new Date(b.evento.fecha_evento) - +new Date(a.evento.fecha_evento));
    return { proximos: prox, historial: hist };
  }, [entradas]);

  const lista = tab === "proximos" ? proximos : historial;

  const tabBtn = (id: Tab, label: string, n: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`rounded-md px-4 py-2 text-xs font-bold transition ${
        tab === id ? "bg-[#FF007A]/15 text-[#FF007A] ring-1 ring-[#FF007A]/50" : "text-[#A29DB8] hover:text-white"
      }`}
    >
      {label} ({n})
    </button>
  );

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Mis Compras</h1>
          <p className="mt-1 text-sm text-[#A29DB8]">Consulta tus entradas y las compras que pagaste, incluidas las realizadas para otras personas.</p>
        </div>
        <div role="tablist" className="inline-flex self-start rounded-lg border border-[#231B45] bg-[#16112E] p-1 sm:self-auto">
          {tabBtn("proximos", "Próximos", proximos.length)}
          {tabBtn("historial", "Historial", historial.length)}
        </div>
      </div>

      <h2 className="mt-8 text-xl font-bold text-white">Entradas que te pertenecen</h2>
      {lista.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-[#231B45] p-10 text-center text-sm text-[#A29DB8]">
          {tab === "proximos" ? "No tienes entradas para próximos eventos." : "Aún no tienes compras en el historial."}
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {lista.map((e) => (
            <TicketCard key={e.id} entrada={e} proximo={tab === "proximos"} onVerQr={() => setSeleccionada(e)} />
          ))}
        </ul>
      )}

      {seleccionada && <QrModal entrada={seleccionada} onClose={() => setSeleccionada(null)} />}
      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-bold text-white">Compras que pagaste</h2>
        <p className="text-sm text-muted">Conservas el comprobante. Si compraste para otra persona, sus entradas y QR están en su cuenta.</p>
        {compras.length === 0 ? <p className="text-sm text-muted">No tienes compras registradas.</p> : <ul className="space-y-3">
          {compras.map(c => <li key={c.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-bold">Compra {numeroCompra(c.id)}</p><p className="text-xs text-muted">{formatFechaCompra(c.creado_en)} · {c.estado_pago}</p><p className="mt-1 font-semibold text-cyan">{formatMoney(c.total)}</p></div>
            <Link href={`/compra/confirmacion/${encodeURIComponent(c.id)}`} className="text-sm font-bold text-pink hover:underline">Ver detalle y comprobante</Link>
          </li>)}
        </ul>}
      </section>
    </>
  );
}
