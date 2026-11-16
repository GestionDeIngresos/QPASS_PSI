import 'server-only';
import type { CatalogoVenta } from '../carrito';

/** Exclusivo de demostración en desarrollo o pruebas; no son asignaciones reales. */
export function crearCatalogoDemostracion(eventoId: number): CatalogoVenta {
  return {
    eventoId,
    negocios: [
      { id: 'demo-bebidas', nombre: 'Bebidas · ficticio', eventoId },
      { id: 'demo-comida', nombre: 'Comida · ficticio', eventoId },
    ],
    productos: [
      { id: 'demo-agua', negocioId: 'demo-bebidas', nombre: 'Agua de demostración', precioEnPuntos: '5', disponibleParaVenta: true },
      { id: 'demo-jugo', negocioId: 'demo-bebidas', nombre: 'Jugo de demostración', precioEnPuntos: '8.50', disponibleParaVenta: true },
      { id: 'demo-refresco', negocioId: 'demo-bebidas', nombre: 'Refresco de demostración', precioEnPuntos: '7', disponibleParaVenta: false },
      { id: 'demo-bocadillo', negocioId: 'demo-comida', nombre: 'Bocadillo de demostración', precioEnPuntos: '12', disponibleParaVenta: true },
    ],
  };
}
