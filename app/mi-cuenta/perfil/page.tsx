import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/AuthCard'
import { EditarPerfilForm } from '@/components/cuenta/EditarPerfilForm'
import { separarNombre } from '@/lib/admin/usuarios'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Editar perfil · QPass' }

// /mi-cuenta/perfil → HU 5: el usuario actualiza sus datos personales
export default async function EditarPerfilPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/mi-cuenta/perfil')

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('nombre, carnet_identidad')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <AuthCard title="Editar perfil" subtitle="Actualiza tus datos personales.">
      <EditarPerfilForm
        inicial={{
          ...separarNombre(perfil?.nombre ?? ''),
          correo: user.email ?? '',
          carnet: perfil?.carnet_identidad ?? '',
        }}
      />
    </AuthCard>
  )
}
