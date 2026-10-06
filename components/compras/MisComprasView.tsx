"use client";

import { useMemo, useState } from "react";
import type { EntradaConEvento } from "../../types/compras";
import { esProximo } from "../../lib/compras/format";
import { TicketCard } from "./TicketCard";
import { QrModal } from "./QrModal";

type Tab = "proximos" | "historial";

export function MisComprasView({ entradas }: { entradas: EntradaConEvento[] }) {
  const [tab, setTab] = useState<Tab>("proximos");
  const [seleccionada, setSeleccionada] = useState<EntradaConEvento | null>(null);

  const { proximos, historial } = useMemo(() => {
    const ahora = new Date();
    const prox: EntradaConEvento[] = [];
    const hist: EntradaConEvento[] = [];
    for (const e of entradas) (esProximo(e, ahora) ? prox : hist).push(e);
    // próximos: el más cercano primero · historial: el más reciente primero
    prox.sort((a, b) => +new Date(a.evento.fecha_inicio) - +new Date(b.evento.fecha_inicio));
    hist.sort((a, b) => +new Date(b.evento.fecha_inicio) - +new Date(a.evento.fecha_inicio));
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
          <p className="mt-1 text-sm text-[#A29DB8]">Gestiona tus pases y accede a los códigos de entrada para tus próximos eventos</p>
        </div>
        <div role="tablist" className="inline-flex self-start rounded-lg border border-[#231B45] bg-[#16112E] p-1 sm:self-auto">
          {tabBtn("proximos", "Próximos", proximos.length)}
          {tabBtn("historial", "Historial", historial.length)}
        </div>
      </div>

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
    </>
  );
}
