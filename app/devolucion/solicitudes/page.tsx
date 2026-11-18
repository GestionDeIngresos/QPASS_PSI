import type { Metadata } from 'next'
import { exigirEncargadoDevolucion } from '@/lib/devolucion/solicitudes'
import {
  SolicitudesCliente,
  type SolicitudEncargado,
} from './SolicitudesCliente'

export const metadata: Metadata = { title: 'Solicitudes Virtuales · QPass' }

type SolicitudRaw = {
  id: number
  solicitante: string
  correo: string
  monto: string
  estado: string
  creadoEn: string
  qrRuta: string
}

// /devolucion/solicitudes → HU 50/51: encargado revisa solicitudes en revisión
export default async function SolicitudesPage() {
  const { supabase } = await exigirEncargadoDevolucion()

  const { data: eventosData } = await supabase.rpc('devc_eventos_encargado')
  const eventos = (eventosData ?? []) as { id: number; titulo: string }[]

  // Obtener solicitudes en_revision de cada evento en paralelo
  const porEvento = await Promise.all(
    eventos.map(async (ev) => {
      const { data } = await supabase.rpc('listar_solicitudes_devolucion', {
        p_evento: ev.id,
        p_estado: 'en_revision',
      })
      const lista = (data ?? []) as SolicitudRaw[]
      return lista.map((s) => ({
        ...s,
        eventoId: ev.id,
        eventoTitulo: ev.titulo,
      }))
    })
  )

  // Unir y ordenar de más antigua a más reciente
  const unidas = porEvento.flat().sort((a, b) => {
    const diff = new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime()
    return diff !== 0 ? diff : a.id - b.id
  })

  // Generar URLs firmadas de 300 s para todos los QR (patrón de Dev A)
  const rutas = [...new Set(unidas.map((s) => s.qrRuta).filter(Boolean))]
  const firmadas = rutas.length
    ? await supabase.storage.from('devoluciones').createSignedUrls(rutas, 300)
    : null
  const urlsMap = new Map(firmadas?.data?.map((v) => [v.path, v.signedUrl]) ?? [])

  const solicitudes: SolicitudEncargado[] = unidas.map((s) => {
    const { qrRuta, ...resto } = s
    return { ...resto, urlFirmada: qrRuta ? (urlsMap.get(qrRuta) ?? undefined) : undefined }
  })

  return (
    <div className="min-h-screen bg-[#05050A] px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-extrabold text-white">Solicitudes Virtuales</h1>
        <p className="mt-2 text-sm text-muted">
          Gestiona las solicitudes de devolución de puntos de eventos finalizados.
        </p>

        {/* Aviso de modo de prueba */}
        <div className="mt-5 rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-sm font-medium text-yellow-300">
          Modo de prueba: no se realizan transferencias de dinero reales.
        </div>

        <div className="mt-6">
          <SolicitudesCliente
            solicitudes={solicitudes}
            sinEventos={eventos.length === 0}
          />
        </div>
      </div>
    </div>
  )
}
