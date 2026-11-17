import 'server-only';
import { exigirEventoAyudante } from './auth';
import type { DatosCatalogo } from './carrito';

/** Activar después de aplicar y verificar las migraciones Dev D. */
export async function obtenerCatalogoAyudante(eventoId: number, demostracion = false): Promise<DatosCatalogo> {
  const contexto = await exigirEventoAyudante(eventoId);
  if (demostracion && process.env.NODE_ENV === 'development') {
    const { crearCatalogoDemostracion } = await import('./demo/catalogo');
    return { estado: 'disponible', modo: 'demostracion', catalogo: crearCatalogoDemostracion(eventoId) };
  }
  if (process.env.QPASS_COMERCIO_REAL !== 'true') return { estado: 'pendiente' };
  const { catalogoReal } = await import('./comercio-server');
  return { estado: 'disponible', modo: 'integrado', catalogo: await catalogoReal(contexto.sesion.supabase, eventoId) };
}
