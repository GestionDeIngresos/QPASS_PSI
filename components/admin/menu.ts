// Menú lateral del panel Admin. Cada dev cambia a `activo: true` cuando su pantalla ya existe.
export type ItemMenuAdmin = { href: string; etiqueta: string; activo: boolean }

export const MENU_ADMIN: ItemMenuAdmin[] = [
  { href: '/admin/dashboard', etiqueta: 'Dashboard', activo: false },
  { href: '/admin/landing', etiqueta: 'Editar eventos de Landing Page', activo: false }, // Dev D (HU 25)
  { href: '/admin/usuarios', etiqueta: 'Gestión de Usuarios', activo: false }, //             Dev C (HU 26)
  { href: '/admin/solicitudes', etiqueta: 'Solicitudes de Eventos', activo: true }, //        Dev A (HU 30)
  { href: '/admin/reportes', etiqueta: 'Reportes', activo: false },
  { href: '/admin/qr-fisicos', etiqueta: 'QR Físicos', activo: false },
  { href: '/admin/categorias', etiqueta: 'Gestión de Categorías', activo: false }, //          Dev D (HU 35)
]
