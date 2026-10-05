type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ children, className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`w-full rounded-lg bg-pink py-3 font-bold uppercase tracking-wide text-white transition hover:bg-pink-hover shadow-[0_0_25px_rgba(255,0,122,0.35)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}