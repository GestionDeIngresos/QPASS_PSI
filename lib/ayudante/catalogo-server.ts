import 'server-only';
import { exigirEventoAyudante } from './auth';
import type { DatosCatalogo } from './carrito';

/** Punto de adaptación pendiente de C. No consulta tablas ni RPC supuestas. */
export async function obtenerCatalogoAyudante(eventoId: number, demostracion = false): Promise<DatosCatalogo> {
  await exigirEventoAyudante(eventoId);
  if (demostracion && process.env.NODE_ENV === 'development') {
    const { crearCatalogoDemostracion } = await import('./demo/catalogo');
    return { estado: 'disponible', modo: 'demostracion', catalogo: crearCatalogoDemostracion(eventoId) };
  }
  return { estado: 'pendiente' };
}
