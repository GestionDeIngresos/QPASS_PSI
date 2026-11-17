# Integración del Sprint 2

## Error `column usuarios.activo does not exist`

El esquema base de `ARCHIVOS CONTEXTO IA` no incluye esta columna. La migración existente `sprint2_devC_usuarios.sql` la agrega junto con las políticas y los campos que necesita la gestión de usuarios. No se debe quitar el filtro ni inventar estados activos para ocultar el error.

En el SQL Editor del proyecto Supabase:

1. Si aún no se aplicó Dev A, ejecutar `supabase/sprint2_devA_admin_eventos.sql` (define `es_admin()`, requerida por Dev C).
2. Ejecutar completo `supabase/sprint2_devC_usuarios.sql`. Es repetible y conserva los usuarios existentes.
3. Recargar `/admin/usuarios` y comprobar listado, filtros y edición.

Crear/eliminar cuentas y cambiar correo o estado también requieren `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`, solo en el servidor. La configuración local revisada solo contiene URL y clave pública. Configurar la clave privada localmente y reiniciar Next; no compartirla ni incluirla en Git.

La migración no se ejecutó desde esta sesión: no hay conexión administrativa a la base de datos. El SQL de contexto es una referencia, no una inspección de la base remota.

## Cambios aplicados

- Las barras de Landing, páginas públicas, Admin y Organizador reutilizan `AccionesCuenta`: Mi Cuenta y Cerrar sesión.
- El menú conecta inicio, eventos, compras y perfil. Admin y Organizador tienen enlaces exclusivos según su rol; las páginas y acciones del organizador rechazan otros roles.
- Cerrar sesión pide confirmación. Cancelar conserva la sesión; un error muestra un aviso; al finalizar correctamente se vuelve a login.
- Crear/editar personal envía `rol_staff` al asignar un evento, como exige el esquema base.

## Comprobación manual con Supabase

Para habilitar el rol independiente Organizador, ejecutar `supabase/sprint2_rol_organizador.sql` y luego asignarlo a las cuentas correspondientes desde Gestión de Usuarios. No se cambia automáticamente el rol de ningún cliente. Clientes y administradores no acceden a `/organizador/*`.

Con una cuenta cliente y otra admin: abrir Mi Cuenta desde cada barra, acceder a perfil y regresar por el menú; recorrer las pantallas del Sprint 2; cancelar y luego confirmar el cierre de sesión. En Admin, crear/editar personal con un evento y verificar la asignación.

El código del organizador referencia `sprint2_devB_organizador.sql` y la función `eliminar_evento_sin_ventas`, pero ese archivo y esa definición no están en los SQL locales. Comprobar si Dev B los aplicó directamente en Supabase antes de validar solicitudes y eliminación de eventos. No se reemplazaron sus reglas por otras inferidas.
