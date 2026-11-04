// Menú lateral del panel del organizador (Sprint 2 · Dev B)
export type ItemMenuOrganizador = { href: string; etiqueta: string; icono: 'calendario' | 'reloj' }

export const MENU_ORGANIZADOR: ItemMenuOrganizador[] = [
  { href: '/organizador/eventos', etiqueta: 'Mis Eventos', icono: 'calendario' },
  { href: '/organizador/solicitudes', etiqueta: 'Mis Solicitudes', icono: 'reloj' },
]
