import { MenuCuenta, type PerfilMenu } from '@/components/MenuCuenta'
import { CerrarSesionButton } from '@/components/CerrarSesionButton'

export function AccionesCuenta({ perfil }: { perfil: PerfilMenu }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <MenuCuenta perfil={perfil} />
      <CerrarSesionButton />
    </div>
  )
}
