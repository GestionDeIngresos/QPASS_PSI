import type { CompraConEntradas, EntradaConEvento, EventoDeEntrada } from "../../types/compras";

const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const ev = (id: string, titulo: string, ubicacion: string, d: number, tipo: EventoDeEntrada["tipo_acceso"]): EventoDeEntrada => ({
  id, titulo, ubicacion, fecha_evento: dias(d), tipo_acceso: tipo, foto_url: null,
});

const neon = ev("ev-1", "Neon Horizon Festival 2026", "Hangar 4, Cochabamba", 20, "qr_digital");
const afterlife = ev("ev-2", "Afterlife - Club Set", "The Warehouse, Cochabamba", 30, "qr_fisico");
const subterranean = ev("ev-3", "Subterranean Sessions", "Vault Underground, Cochabamba", 45, "qr_digital");
const metropolis = ev("ev-4", "Metropolis Afterhours", "Apex Arena, Cochabamba", -60, "qr_fisico");

export const MOCK_ENTRADAS: EntradaConEvento[] = [
  { id: "en-1", compra_id: "mock", codigo_qr: "QP-NEON0001A1B2C3", estado: "activa", creado_en: dias(-3), tipo_ticket: { id: "t1", nombre: "General Access", precio: 25 }, evento: neon },
  { id: "en-2", compra_id: "mock", codigo_qr: "QP-NEON0002D4E5F6", estado: "activa", creado_en: dias(-3), tipo_ticket: { id: "t2", nombre: "VIP Pass", precio: 50 }, evento: neon },
  { id: "en-3", compra_id: "mock-2", codigo_qr: "QP-AFTL0003G7H8I9", estado: "activa", creado_en: dias(-2), tipo_ticket: { id: "t3", nombre: "General Access", precio: 18 }, evento: afterlife },
  { id: "en-4", compra_id: "mock-3", codigo_qr: "QP-SUBT0004J1K2L3", estado: "activa", creado_en: dias(-1), tipo_ticket: { id: "t4", nombre: "General Access", precio: 22 }, evento: subterranean },
  { id: "en-5", compra_id: "mock-4", codigo_qr: "QP-METR0005M4N5O6", estado: "usada", creado_en: dias(-70), tipo_ticket: { id: "t5", nombre: "General Access", precio: 20 }, evento: metropolis },
];

export const MOCK_COMPRA: CompraConEntradas = {
  id: "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
  subtotal: 75,
  cargos_servicio: 5.25,
  total: 80.25,
  estado_pago: "confirmado",
  comprobante_url: null,
  creado_en: new Date().toISOString(),
  entradas: MOCK_ENTRADAS.slice(0, 2),
};
