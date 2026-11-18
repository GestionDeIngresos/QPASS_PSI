'use client'

import { useState } from 'react'

// Campo de contraseña con botón para mostrar u ocultar el texto.
export function PasswordInput({ name, placeholder, minLength, className }: {
  name: string
  placeholder?: string
  minLength?: number
  className?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        name={name}
        required
        minLength={minLength}
        placeholder={placeholder}
        autoComplete="new-password"
        className={className}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted transition hover:text-white"
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  )
}
