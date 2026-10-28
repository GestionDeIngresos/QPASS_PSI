'use client'

// Botón de formulario que pide confirmación antes de enviar (acciones destructivas)
export function BotonConfirmar({
  mensaje,
  className,
  children,
  ...props
}: { mensaje: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={className}
      onClick={(e) => {
        if (!window.confirm(mensaje)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
