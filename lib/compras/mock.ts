import type { CompraConEntradas, EntradaConEvento } from "../../types/compras";

const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const neon = {
  id: "ev-1",
  nombre: "Neon Horizon Festival 2026",
  fecha_inicio: dias(20),
  fecha_fin: dias(22),
  ubicacion: "Hangar 4, Madrid",
};
const afterlife = {
  id: "ev-2",
  nombre: "Afterlife - Club Set",
  fecha_inicio: dias(30),
  fecha_fin: dias(31),
  ubicacion: "The Warehouse, Barcelona",
};
const subterranean = {
  id: "ev-3",
  nombre: "Subterranean Sessions",
  fecha_inicio: dias(45),
  fecha_fin: dias(46),
  ubicacion: "Vault Underground",
};
const metropolis = {
  id: "ev-4",
  nombre: "Metropolis Afterhours",
  fecha_inicio: dias(-60),
  fecha_fin: dias(-59),
  ubicacion: "Apex Arena, Valencia",
};

export const MOCK_ENTRADAS: EntradaConEvento[] = [
  { id: "en-1", compra_id: "mock", codigo_qr: "QP-NEON-0001-A1B2C3", estado: "activa", creado_en: dias(-3), tipo_ticket: { id: "t1", nombre: "General Access", precio: 25 }, evento: neon },
  { id: "en-2", compra_id: "mock", codigo_qr: "QP-NEON-0002-D4E5F6", estado: "activa", creado_en: dias(-3), tipo_ticket: { id: "t2", nombre: "VIP Pass (Backstage Access)", precio: 50 }, evento: neon },
  { id: "en-3", compra_id: "mock-2", codigo_qr: "QP-AFTL-0003-G7H8I9", estado: "activa", creado_en: dias(-2), tipo_ticket: { id: "t3", nombre: "General Access", precio: 18 }, evento: afterlife },
  { id: "en-4", compra_id: "mock-3", codigo_qr: "QP-SUBT-0004-J1K2L3", estado: "activa", creado_en: dias(-1), tipo_ticket: { id: "t4", nombre: "General Access", precio: 22 }, evento: subterranean },
  { id: "en-5", compra_id: "mock-4", codigo_qr: "QP-METR-0005-M4N5O6", estado: "usada", creado_en: dias(-70), tipo_ticket: { id: "t5", nombre: "General Access", precio: 20 }, evento: metropolis },
];

export const MOCK_COMPRA: CompraConEntradas = {
  id: "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
  subtotal: 75,
  cargos_servicio: 3.5,
  total: 78.5,
  estado_pago: "pagado",
  comprobante_url: null,
  creado_en: new Date().toISOString(),
  entradas: MOCK_ENTRADAS.slice(0, 2),
};
