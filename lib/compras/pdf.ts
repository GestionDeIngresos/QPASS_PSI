import type { CompraConEntradas, EntradaConEvento } from "../../types/compras";
import { formatFechaCompra, formatMoney, numeroCompra } from "./format";
import { formatearFecha } from "../eventos/format";

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
  if (!e.codigo_qr?.trim() || !['qr_digital', 'qr_fisico'].includes(e.evento.tipo_acceso)) {
    throw new Error('La entrada no tiene un QR o tipo de acceso válido.');
  }
  const [{ jsPDF }, QRCode] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const margen = 14;
  const limite = doc.internal.pageSize.getHeight() - margen;
  const ancho = w - margen * 2;
  const fisico = e.evento.tipo_acceso === 'qr_fisico';
  const titulo = fisico ? 'Recogida de manilla' : 'Entrada digital';
  let y = 42;

  cabecera(doc, titulo);

  function nuevaPagina() {
    doc.addPage();
    cabecera(doc, titulo);
    y = 42;
  }

  // Se dibuja línea a línea para conservar todo el texto sin posiciones fijas.
  function escribir(texto: string, tamano: number, negrita = false) {
    const interlineado = tamano * 0.3528 * 1.3;
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(tamano);
    const lineas: string[] = doc.splitTextToSize(texto, ancho);
    for (const linea of lineas) {
      if (y + interlineado > limite) nuevaPagina();
      doc.setFont('helvetica', negrita ? 'bold' : 'normal');
      doc.setFontSize(tamano);
      doc.setTextColor(20, 20, 30);
      doc.text(linea, margen, y);
      y += interlineado;
    }
    y += 4;
  }

  escribir(e.evento.titulo, 20, true);
  escribir(`Fecha: ${formatearFecha(e.evento.fecha_evento, { conAnio: true, conHora: true })} (hora de Bolivia)`, 11);
  escribir(`Ubicación: ${e.evento.ubicacion?.trim() || 'Por confirmar'}`, 11);
  escribir(`Tipo de entrada: ${e.tipo_ticket.nombre}`, 12, true);

  const instrucciones = fisico
    ? 'QR de recogida: presenta este código y tu carnet al administrador para recoger y vincular tu manilla física. Este PDF no sustituye la manilla necesaria para ingresar. No compartas este código.'
    : 'Presenta este código QR en el acceso al evento. No lo compartas: cada entrada permite un solo ingreso y está sujeta a validación.';
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  const lineasCodigo: string[] = doc.splitTextToSize(e.codigo_qr, ancho);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lineasInstrucciones: string[] = doc.splitTextToSize(instrucciones, ancho);
  // Mantener juntos el QR completo, su código y las instrucciones.
  const altoBloque = 16 + 90 + 6 + lineasCodigo.length * 4.2 + 5 + lineasInstrucciones.length * 4.6;
  if (y + altoBloque > limite) nuevaPagina();
  escribir(fisico ? 'QR de recogida de manilla' : 'QR de acceso digital', 12, true);

  const qr = await QRCode.toDataURL(e.codigo_qr, {
    margin: 4, width: 600, errorCorrectionLevel: 'M',
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
  const lado = 90;
  doc.addImage(qr, "PNG", (w - lado) / 2, y, lado, lado);
  y += lado + 6;

  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  for (const linea of lineasCodigo) {
    doc.text(linea, w / 2, y, { align: 'center' });
    y += 4.2;
  }
  y += 5;
  escribir(instrucciones, 10);

  guardar(doc, `ticket-${fisico ? 'recogida' : 'digital'}-${e.evento.titulo.slice(0, 80)}-${e.id}.pdf`);
}

/** Comprobante de compra (se usa si la compra no tiene comprobante_url). */
export async function generarComprobantePdf(c: CompraConEntradas) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  cabecera(doc, "Comprobante de prueba");
  doc.setFontSize(9);
  doc.text("SIMULACION - Sin movimiento de dinero real", 14, 32);

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
