'use client'
import { useFormStatus } from 'react-dom'

// Botón de formulario que pide confirmación antes de enviar (acciones destructivas)
export function BotonConfirmar({
  mensaje,
  className,
  children,
  ...props
}: { mensaje: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus()
  return (
    <button
      {...props}
      disabled={props.disabled || pending}
      aria-busy={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(mensaje)) e.preventDefault()
      }}
    >
      {pending ? 'Procesando…' : children}
    </button>
  )
}
