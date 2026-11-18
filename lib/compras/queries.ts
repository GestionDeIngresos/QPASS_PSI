import type { CompraConEntradas, CompraPagada, EntradaConEvento } from "../../types/compras";
import { MOCK_COMPRA, MOCK_ENTRADAS } from "./mock";
import { obtenerSesionActual } from '@/lib/auth/sesion';

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
  const sesion = await obtenerSesionActual();
  return sesion?.perfil?.activo === true ? sesion.user : null;
}

/** Entradas asignadas al usuario (usuario_destino_id). La RLS es la segunda barrera de seguridad. */
export async function getMisEntradas(userId: string): Promise<EntradaConEvento[]> {
  if (USE_MOCK) return MOCK_ENTRADAS;
  if ((await getUsuarioActual())?.id !== userId) throw new Error('No tienes permisos para consultar estas entradas.');
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
  if (USE_MOCK) return {
    ...MOCK_COMPRA,
    entradas: MOCK_COMPRA.entradas.map(({ id, compra_id, estado, creado_en, tipo_ticket, evento }) => ({ id, compra_id, estado, creado_en, tipo_ticket: { ...tipo_ticket, precio: null }, evento })),
    para_terceros: false,
  };
  if (!await getUsuarioActual()) return null;
  const supabase = await getSupabase();
  // SECURITY DEFINER con comprobación explícita de comprador/activo; no devuelve QR.
  const { data: compra, error } = await supabase.rpc('consultar_compra_propia', { p_compra_id: compraId });
  if (error) throw new Error(`No se pudo cargar la compra: ${error.message}`);
  if (!compra) return null; // La RPC comprueba explícitamente comprador y cuenta activa.

  return {
    // DTO explícito: una respuesta antigua/ampliada de la RPC no debe filtrar QR.
    id: String(compra.id),
    subtotal: Number(compra.subtotal),
    cargos_servicio: Number(compra.cargos_servicio),
    total: Number(compra.total),
    estado_pago: compra.estado_pago,
    comprobante_url: compra.comprobante_url,
    creado_en: compra.creado_en,
    para_terceros: compra.para_terceros === true,
    // También neutralizar respuestas de una versión anterior de la RPC.
    // Sin snapshot confirmado no se puede mostrar un precio del catálogo como histórico.
    entradas: (compra.entradas ?? []).map((e: CompraConEntradas['entradas'][number]) => ({
      id: String(e.id), compra_id: String(e.compra_id), estado: e.estado, creado_en: e.creado_en,
      tipo_ticket: { id: String(e.tipo_ticket.id), nombre: e.tipo_ticket.nombre, precio: null },
      evento: {
        id: String(e.evento.id), titulo: e.evento.titulo, foto_url: e.evento.foto_url,
        ubicacion: e.evento.ubicacion, fecha_evento: e.evento.fecha_evento, tipo_acceso: e.evento.tipo_acceso,
      },
    })),
  };
}

/** Operaciones pagadas por el usuario, independientes de sus entradas recibidas. */
export async function getMisComprasPagadas(userId: string): Promise<CompraPagada[]> {
  if (USE_MOCK) {
    const { id, subtotal, cargos_servicio, total, estado_pago, comprobante_url, creado_en } = MOCK_COMPRA;
    return [{ id, subtotal, cargos_servicio, total, estado_pago, comprobante_url, creado_en }];
  }
  if ((await getUsuarioActual())?.id !== userId) throw new Error('No tienes permisos para consultar estas compras.');
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('compras')
    .select('id, subtotal, cargos_servicio, total, estado_pago, comprobante_url, creado_en')
    .eq('comprador_id', userId).order('creado_en', { ascending: false });
  if (error) throw new Error('No se pudieron consultar tus compras.');
  return (data ?? []).map(c => ({ ...c, id: String(c.id), subtotal: Number(c.subtotal), cargos_servicio: Number(c.cargos_servicio), total: Number(c.total) }));
}
