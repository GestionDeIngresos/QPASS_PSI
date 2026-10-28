import type { CompraConEntradas, EntradaConEvento } from "../../types/compras";
import { formatFechaCompra, formatFechaEvento, formatMoney, numeroCompra } from "./format";

// jsPDF y qrcode se importan dinámicamente: solo se descargan al pulsar el botón.
const ROSA: [number, number, number] = [255, 0, 122];
const FONDO: [number, number, number] = [15, 11, 30];
const GRIS: [number, number, number] = [107, 100, 138];

function cabecera(doc: import("jspdf").jsPDF, titulo: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...FONDO);
  doc.rect(0, 0, w, 28, "F");
  doc.setFillColor(...ROSA);
  doc.circle(16, 14, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("QPass", 22, 16);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(titulo, w - 14, 16, { align: "right" });
}

function guardar(doc: import("jspdf").jsPDF, nombre: string) {
  doc.save(nombre.replace(/[^\w.-]+/g, "_"));
}

/** Ticket individual con QR (fondo blanco para que el QR escanee bien al imprimirse). */
export async function generarTicketPdf(e: EntradaConEvento) {
  const [{ jsPDF }, QRCode] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  cabecera(doc, "Entrada de acceso");

  doc.setTextColor(20, 20, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(doc.splitTextToSize(e.evento.titulo, w - 28), 14, 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...GRIS);
  doc.text(formatFechaEvento(e.evento.fecha_evento), 14, 62);
  if (e.evento.ubicacion) doc.text(e.evento.ubicacion, 14, 69);

  doc.setTextColor(20, 20, 30);
  doc.setFont("helvetica", "bold");
  doc.text(e.tipo_ticket.nombre, 14, 82);

  const qr = await QRCode.toDataURL(e.codigo_qr, { margin: 1, width: 600, errorCorrectionLevel: "M" });
  const lado = 90;
  doc.addImage(qr, "PNG", (w - lado) / 2, 95, lado, lado);

  doc.setFont("courier", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...GRIS);
  doc.text(e.codigo_qr, w / 2, 95 + lado + 8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Presenta este código QR en el acceso. No lo compartas: cada entrada es de un solo uso.", w / 2, 290, { align: "center" });

  guardar(doc, `ticket-${e.evento.titulo}-${e.id.slice(0, 6)}.pdf`);
}

/** Comprobante de compra (se usa si la compra no tiene comprobante_url). */
export async function generarComprobantePdf(c: CompraConEntradas) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  cabecera(doc, "Comprobante de compra");

  doc.setTextColor(20, 20, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Compra ${numeroCompra(c.id)}`, 14, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRIS);
  doc.text(formatFechaCompra(c.creado_en), 14, 51);
  doc.text(`Estado del pago: ${c.estado_pago}`, 14, 57);

  let y = 72;
  doc.setTextColor(20, 20, 30);
  doc.setFont("helvetica", "bold");
  doc.text("Detalle", 14, y);
  doc.text("Precio", w - 14, y, { align: "right" });
  doc.setDrawColor(...GRIS);
  doc.line(14, y + 2, w - 14, y + 2);
  y += 10;

  doc.setFont("helvetica", "normal");
  for (const e of c.entradas) {
    doc.text(doc.splitTextToSize(`${e.evento.titulo} — ${e.tipo_ticket.nombre}`, w - 60), 14, y);
    doc.text(formatMoney(e.tipo_ticket.precio), w - 14, y, { align: "right" });
    y += 8;
  }

  y += 4;
  doc.line(14, y, w - 14, y);
  y += 8;
  doc.text("Subtotal", 14, y);
  doc.text(formatMoney(c.subtotal), w - 14, y, { align: "right" });
  y += 7;
  doc.text("Cargos de servicio", 14, y);
  doc.text(formatMoney(c.cargos_servicio), w - 14, y, { align: "right" });
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...ROSA);
  doc.text("Total", 14, y);
  doc.text(formatMoney(c.total), w - 14, y, { align: "right" });

  guardar(doc, `comprobante-${numeroCompra(c.id)}.pdf`);
}
