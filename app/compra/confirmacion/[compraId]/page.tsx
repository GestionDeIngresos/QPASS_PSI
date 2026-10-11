import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCompra, getUsuarioActual } from "../../../../lib/compras/queries";
import { formatFechaCompra, formatFechaEvento, formatMoney, numeroCompra } from "../../../../lib/compras/format";
import { DescargarComprobante } from "../../../../components/compras/DescargarComprobante";

export const metadata = { title: "Compra confirmada · QPass" };
export const dynamic = "force-dynamic";

// comprar_entradas() (Dev C) deja la compra en "confirmado" cuando el pago simulado es exitoso.
const PAGADO = ["confirmado", "pagado", "completado", "aprobado"];

export default async function ConfirmacionPage({ params }: { params: Promise<{ compraId: string }> }) {
  const { compraId } = await params;

  const user = await getUsuarioActual();
  if (!user) redirect("/login");

  const compra = await getCompra(compraId); // RLS: solo devuelve compras del usuario
  if (!compra) notFound();

  const pagado = PAGADO.includes(compra.estado_pago.toLowerCase());

  return (
    <main className="min-h-screen bg-[#05050A]">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#00FF66]/50 bg-[#00FF66]/10 shadow-[0_0_40px_-8px_#00FF66]">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#00FF66]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="mt-6 text-3xl font-extrabold text-white">¡Compra confirmada!</h1>
          <p className="mt-2 text-sm text-[#A29DB8]">
            Tus entradas ya están en tu cuenta. Encuentra el código QR de cada una en «Mis Compras».
          </p>
        </div>

        <section className="mt-10 rounded-2xl border border-[#231B45] bg-[#16112E] p-5 shadow-[0_0_60px_-30px_#FF007A] sm:p-7">
          <dl className="grid grid-cols-2 gap-4 border-b border-[#231B45] pb-5 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[#6B648A]">N.º de compra</dt>
              <dd className="mt-1 font-mono font-bold text-white">{numeroCompra(compra.id)}</dd>
            </div>
            <div className="text-right">
              <dt className="text-[11px] uppercase tracking-wider text-[#6B648A]">Estado del pago</dt>
              <dd className={`mt-1 font-bold capitalize ${pagado ? "text-[#00FF66]" : "text-[#FFB800]"}`}>{compra.estado_pago}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] uppercase tracking-wider text-[#6B648A]">Fecha</dt>
              <dd className="mt-1 text-white">{formatFechaCompra(compra.creado_en)}</dd>
            </div>
          </dl>

          <ul className="divide-y divide-[#231B45]">
            {compra.entradas.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate font-extrabold text-white">{e.evento.titulo}</p>
                  <p className="text-xs text-[#A29DB8]">{formatFechaEvento(e.evento.fecha_evento)}</p>
                  <p className="mt-1 text-xs font-semibold text-[#00F0FF]">{e.tipo_ticket.nombre}</p>
                </div>
                <span className="shrink-0 text-sm text-white">{formatMoney(e.tipo_ticket.precio)}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-[#231B45] pt-5 text-sm">
            <div className="flex justify-between text-[#A29DB8]">
              <span>Subtotal</span>
              <span>{formatMoney(compra.subtotal)}</span>
            </div>
            <div className="flex justify-between text-[#A29DB8]">
              <span>Cargos de servicio</span>
              <span>{formatMoney(compra.cargos_servicio)}</span>
            </div>
            <div className="flex justify-between pt-2 text-lg font-extrabold">
              <span className="text-[#FF007A]">Total</span>
              <span className="text-[#FF007A]">{formatMoney(compra.total)}</span>
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/mis-compras"
            className="inline-flex w-full items-center justify-center rounded-lg bg-[#FF007A] px-5 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_24px_-6px_#FF007A] transition hover:brightness-110 sm:w-auto"
          >
            Ver mis entradas
          </Link>
          <DescargarComprobante compra={compra} />
        </div>
      </div>
    </main>
  );
}
