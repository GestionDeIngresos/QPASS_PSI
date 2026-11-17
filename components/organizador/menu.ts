// Menú lateral del panel del organizador (Sprint 2 · Dev B)
export type ItemMenuOrganizador = { href: string; etiqueta: string; icono: 'calendario' | 'reloj' }

export const MENU_ORGANIZADOR: ItemMenuOrganizador[] = [
  { href: '/organizador/dashboard', etiqueta: 'Resumen de mi evento', icono: 'calendario' },
  { href: '/organizador/eventos', etiqueta: 'Mis Eventos', icono: 'calendario' },
  { href: '/organizador/solicitudes', etiqueta: 'Mis Solicitudes', icono: 'reloj' },
]
