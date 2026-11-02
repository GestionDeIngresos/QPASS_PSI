'use client'

import { ROL_INFO, ROLES } from '@/lib/admin/roles'

const SELECT =
  'rounded-lg border border-border bg-bg px-3 py-2 text-xs font-semibold text-white outline-none transition focus:border-pink [color-scheme:dark]'

// Buscador + filtros de Rol/Estado. Es un <form method="get">: los filtros viven en la URL.
export function FiltrosUsuarios({ q, rol, estado }: { q: string; rol: string; estado: string }) {
  const enviar = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit()

  return (
    <form action="/admin/usuarios" method="get" className="flex flex-1 flex-wrap items-center gap-3">
      <input
        name="q"
        type="search"
        defaultValue={q}
        maxLength={80}
        placeholder="Buscar por nombre, email o C.I..."
        aria-label="Buscar usuarios"
        className="min-w-0 flex-1 basis-56 rounded-lg border border-border bg-bg px-4 py-2 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink"
      />
      <select name="rol" defaultValue={rol} onChange={enviar} aria-label="Filtrar por rol" className={SELECT}>
        <option value="">Rol: Todos</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            Rol: {ROL_INFO[r].etiqueta}
          </option>
        ))}
      </select>
      <select name="estado" defaultValue={estado} onChange={enviar} aria-label="Filtrar por estado" className={SELECT}>
        <option value="">Estado: Todos</option>
        <option value="activos">Estado: Activos</option>
        <option value="inactivos">Estado: Inactivos</option>
      </select>
    </form>
  )
}
