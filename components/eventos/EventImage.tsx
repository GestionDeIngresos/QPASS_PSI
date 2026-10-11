import { esUrlHttp, gradienteRespaldo } from '@/lib/eventos/format'

type Props = {
  id: string
  titulo: string
  fotoUrl: string | null
  className?: string // controla el alto/ancho desde fuera (ej. "h-40 w-full")
}

/**
 * Foto del evento. Si no hay foto_url válida, muestra un degradado
 * (igual que las tarjetas del mockup).
 * Se usa <img> normal porque foto_url puede venir de cualquier dominio
 * y next/image exigiría declararlos en next.config.ts.
 */
export function EventImage({ id, titulo, fotoUrl, className = '' }: Props) {
  if (esUrlHttp(fotoUrl)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fotoUrl} alt={titulo} loading="lazy" className={`object-cover ${className}`} />
    )
  }
  return (
    <div
      role="img"
      aria-label={titulo}
      className={className}
      style={{ backgroundImage: gradienteRespaldo(id) }}
    />
  )
}
