import { redirect } from 'next/navigation'

// /negocio no tiene pantalla propia: lleva a Mis Negocios
export default function NegocioInicio() {
  redirect('/negocio/negocios')
}
