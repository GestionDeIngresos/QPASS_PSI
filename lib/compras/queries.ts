import type { CompraConEntradas, EntradaConEvento } from "../../types/compras";
import { MOCK_COMPRA, MOCK_ENTRADAS } from "./mock";

/** Carga el cliente de Supabase solo cuando NO estamos en modo mock. */
async function getSupabase() {
  const { createClient } = await import("../supabase/server");
  return await createClient();
}

/** Pon NEXT_PUBLIC_USE_MOCK_COMPRAS=true en .env.development.local mientras Dev C no termine. */
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_COMPRAS === "true";

/**
 * ÚNICO sitio que conoce las columnas de eventos/tipos_ticket que usa "Mis Compras".
 * Join: entradas → tipos_ticket → eventos (columnas reales del esquema de QPass).
 */
const ENTRADA_SELECT = `
  id, compra_id, codigo_qr, estado, creado_en,
  tipos_ticket (
    id, nombre, precio,
    eventos ( id, titulo, foto_url, ubicacion, fecha_evento, tipo_acceso )
  )
`;

const uno = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizar(row: any): EntradaConEvento | null {
  const tipo = uno(row.tipos_ticket);
  const evento = uno(tipo?.eventos);
  if (!tipo || !evento) return null; // evento no visible (p. ej. ya no está publicado)
  return {
    id: String(row.id),
    compra_id: String(row.compra_id),
    codigo_qr: row.codigo_qr,
    estado: row.estado,
    creado_en: row.creado_en,
    tipo_ticket: { id: String(tipo.id), nombre: tipo.nombre, precio: Number(tipo.precio) },
    evento: {
      id: String(evento.id),
      titulo: evento.titulo,
      foto_url: evento.foto_url ?? null,
      ubicacion: evento.ubicacion ?? null,
      fecha_evento: evento.fecha_evento,
      tipo_acceso: evento.tipo_acceso,
    },
  };
}

/** Usuario autenticado o null (las páginas deciden el redirect). */
export async function getUsuarioActual() {
  if (USE_MOCK) return { id: "mock-user" };
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Entradas asignadas al usuario (usuario_destino_id). La RLS es la segunda barrera de seguridad. */
export async function getMisEntradas(userId: string): Promise<EntradaConEvento[]> {
  if (USE_MOCK) return MOCK_ENTRADAS;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("entradas")
    .select(ENTRADA_SELECT)
    .eq("usuario_destino_id", userId)
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar tus entradas: ${error.message}`);
  return (data ?? []).map(normalizar).filter((e): e is EntradaConEvento => e !== null);
}

export async function getCompra(compraId: string): Promise<CompraConEntradas | null> {
  if (USE_MOCK) return MOCK_COMPRA;
  const supabase = await getSupabase();
  const { data: compra, error } = await supabase
    .from("compras")
    .select("id, subtotal, cargos_servicio, total, estado_pago, comprobante_url, creado_en")
    .eq("id", compraId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la compra: ${error.message}`);
  if (!compra) return null; // no existe o no es tuya (RLS)

  const { data: filas, error: e2 } = await supabase
    .from("entradas")
    .select(ENTRADA_SELECT)
    .eq("compra_id", compraId)
    .order("creado_en", { ascending: true });
  if (e2) throw new Error(`No se pudieron cargar las entradas: ${e2.message}`);

  return {
    ...compra,
    subtotal: Number(compra.subtotal),
    cargos_servicio: Number(compra.cargos_servicio),
    total: Number(compra.total),
    entradas: (filas ?? []).map(normalizar).filter((e): e is EntradaConEvento => e !== null),
  };
}
