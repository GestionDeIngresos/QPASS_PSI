// Roles de QPass (enum public.rol_usuario) con su etiqueta y color del mockup. Se usa en cliente y servidor.
export const ROLES = ['cliente', 'organizador', 'recargador', 'escaneador', 'supervisor', 'devolucion', 'ayudante', 'negocio', 'admin'] as const
export type Rol = (typeof ROLES)[number]

export const ROL_INFO: Record<Rol, { etiqueta: string; estilo: string }> = {
  cliente: { etiqueta: 'Cliente', estilo: 'border-cyan text-cyan' },
  organizador: { etiqueta: 'Organizador', estilo: 'border-[#9D00FF] text-[#B44DFF]' },
  recargador: { etiqueta: 'Recargador', estilo: 'border-cyan text-cyan' },
  escaneador: { etiqueta: 'Escaneador', estilo: 'border-pink text-pink' },
  supervisor: { etiqueta: 'Supervisor', estilo: 'border-[#9D00FF] text-[#B44DFF]' },
  devolucion: { etiqueta: 'Devolución', estilo: 'border-amber-400 text-amber-400' },
  ayudante: { etiqueta: 'Ayudante', estilo: 'border-green-400 text-green-400' },
  negocio: { etiqueta: 'Negocio', estilo: 'border-white/70 text-white' },
  admin: { etiqueta: 'Admin', estilo: 'border-pink bg-pink/15 text-pink' },
}

/** Personal de evento (HU 34): estos roles llevan un evento asignado */
export const ROLES_PERSONAL: Rol[] = ['recargador', 'escaneador', 'supervisor', 'devolucion', 'ayudante', 'negocio']

export const esRol = (v: unknown): v is Rol => typeof v === 'string' && (ROLES as readonly string[]).includes(v)
export const esPersonal = (rol: Rol) => ROLES_PERSONAL.includes(rol)
