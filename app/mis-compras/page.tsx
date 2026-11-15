import { redirect } from "next/navigation";
import { getMisEntradas, getMisComprasPagadas, getUsuarioActual } from "../../lib/compras/queries";
import { MisComprasView } from "../../components/compras/MisComprasView";
import { ReportesEntradasPanel } from '@/components/compras/ReportesEntradasPanel';
import { obtenerReportesEntrada } from '@/lib/reportes/entradas-server';

export const metadata = { title: "Mis Compras · QPass" };
export const dynamic = "force-dynamic"; // depende del usuario autenticado

export default async function MisComprasPage() {
  const user = await getUsuarioActual();
  if (!user) redirect("/login"); // ajusta si tu ruta de login es otra

  const [entradas, compras, reportes] = await Promise.all([getMisEntradas(user.id), getMisComprasPagadas(user.id), obtenerReportesEntrada()]);

  return (
    <main className="min-h-screen bg-[#05050A]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <MisComprasView entradas={entradas} compras={compras} />
        <ReportesEntradasPanel datos={reportes} />
      </div>
    </main>
  );
}
