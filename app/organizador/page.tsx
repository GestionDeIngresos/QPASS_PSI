import { redirect } from 'next/navigation'

// /organizador no tiene pantalla propia: lleva a Mis Eventos
export default function OrganizadorInicio() {
  redirect('/organizador/eventos')
}
