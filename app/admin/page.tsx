import { redirect } from 'next/navigation'

// El Dashboard aún no existe: por ahora /admin lleva a Solicitudes.
export default function AdminInicio() {
  redirect('/admin/solicitudes')
}
