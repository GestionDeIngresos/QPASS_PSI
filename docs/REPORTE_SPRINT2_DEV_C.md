# QPass · Sprint 2 · Reporte de Dev C

**Desarrollador:** Jhonatan Aguilar (Dev C)
**Rama:** `Aguilar` (no se subió nada a `Main`)
**Fecha:** 02/11/2026
**Commit principal:** `b23febf` — Dev C: HU 26, 34, 5

---

## 1. Historias de usuario

| HU | Descripción | Pts | Estado |
|----|-------------|-----|--------|
| **HU 26** | Gestionar usuarios: ver, editar rol, eliminar | — | ✅ Terminada |
| **HU 34** | Crear/editar usuarios de personal con evento asignado (`asignaciones_staff`) | — | ✅ Terminada |
| **HU 5** | Menú "Mi Cuenta" con editar perfil y cerrar sesión | — | ✅ Terminada |
| | **Total** | **11** | |

**Dependencias:** solo de Dev A (layout `/admin` con guard de rol y función SQL `es_admin()`), que ya estaba en `Main`. No depende de Dev B ni de Dev D.

---

## 2. Qué se construyó

### HU 26 y HU 34 — `/admin/usuarios`
- Listado de usuarios con nombre, email, rol, estado, evento asignado y fecha de registro.
- Buscador (nombre, email o C.I.) y filtros por **Rol** y **Estado**; los filtros quedan en la URL.
- **Crear Usuario** (ventana modal según el Figma): nombres, apellidos, C.I., correo, contraseña temporal y rol.
- **Editar Usuario**: datos personales, rol, estado (Activo / Inactivo) y evento asignado.
- **Evento asignado** (HU 34): aparece solo para roles de personal (escaneador, supervisor, devolución, ayudante); tiene buscador y filtro por categoría. Un evento por persona.
- **Eliminar** con confirmación.
- Un usuario **Inactivo** queda bloqueado y no puede iniciar sesión.
- Protecciones: un admin no puede eliminarse, quitarse el rol de admin ni desactivarse a sí mismo; no se elimina a usuarios con compras/eventos/solicitudes (se sugiere desactivarlos).
- Responsivo: tabla en escritorio y tarjetas en celular.
- "Gestión de Usuarios" quedó activo en el menú lateral del admin.

### HU 5 — Menú "Mi Cuenta"
- Botón "Mi Cuenta" en el Header que abre un menú con avatar (iniciales), nombre y correo.
- Enlaces según el rol:
  - `admin` → Panel de administración (`/admin`, de Dev A)
  - `cliente` y `negocio` → Mis solicitudes (`/organizador/solicitudes`) y Mis eventos (`/organizador/eventos`), de Dev B
  - Todos → Mis compras, Editar perfil, Cerrar sesión
- Página **`/mi-cuenta/perfil`**: editar nombres, apellidos, correo y C.I. Si cambia el correo, Supabase envía un email de confirmación.
- Header con navegación "Explorar Eventos" y "Mis Compras" en escritorio.

---

## 3. Archivos

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `app/admin/usuarios/page.tsx` | Nuevo | Pantalla Gestión de Usuarios |
| `app/admin/usuarios/actions.ts` | Nuevo | Server actions: crear, editar, eliminar |
| `components/admin/usuarios/UsuarioModal.tsx` | Nuevo | Modal crear/editar con evento asignado |
| `components/admin/usuarios/FiltrosUsuarios.tsx` | Nuevo | Buscador y filtros |
| `lib/admin/usuarios.ts` | Nuevo | Consultas de usuarios y eventos asignables |
| `lib/admin/roles.ts` | Nuevo | Roles, etiquetas y colores del mockup |
| `lib/supabase/admin.ts` | Nuevo | Cliente con service role (solo servidor) |
| `components/MenuCuenta.tsx` | Nuevo | Menú "Mi Cuenta" |
| `app/mi-cuenta/perfil/page.tsx` | Nuevo | Página Editar perfil |
| `app/mi-cuenta/perfil/actions.ts` | Nuevo | Guardar perfil |
| `components/cuenta/EditarPerfilForm.tsx` | Nuevo | Formulario de perfil |
| `supabase/sprint2_devC_usuarios.sql` | Nuevo | SQL de Dev C |
| `components/Header.tsx` | Modificado | Usa el menú Mi Cuenta |
| `components/admin/menu.ts` | Modificado | Activa "Gestión de Usuarios" |
| `middleware.ts` | Modificado | Protege `/mi-cuenta` |

---

## 4. Base de datos — `supabase/sprint2_devC_usuarios.sql`

Re-ejecutable. Requiere antes el SQL de Dev A (`sprint2_devA_admin_eventos.sql`).

1. Agrega el rol **`escaneador`** al enum `rol_usuario` (ya existían: admin, cliente, supervisor, devolucion, ayudante, negocio).
2. Agrega la columna **`activo`** a `usuarios`.
3. `asignaciones_staff`: columna `asignado_en` e índice único por usuario (un evento por persona).
4. Políticas RLS de admin sobre `usuarios` (update, delete) y `asignaciones_staff` (todo), reutilizando `es_admin()`.
5. Políticas para que cada usuario vea y edite **su propia** fila.
6. Trigger que impide que un usuario normal se cambie rol, estado o correo.
7. Trigger que sincroniza el correo de `auth.users` con `public.usuarios`.

---

## 5. Configuración necesaria

1. Ejecutar `supabase/sprint2_devC_usuarios.sql` en Supabase → SQL Editor.
2. Agregar en `.env.local` (Supabase → Project Settings → API):
   ```
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   ⚠️ Sin `NEXT_PUBLIC_`, solo se usa en el servidor y **nunca se sube al repo**.
3. Para probar el panel, marcarse como admin:
   ```sql
   update public.usuarios set rol = 'admin' where correo = 'tu-correo@ejemplo.com';
   ```

---

## 6. Verificación

| Prueba | Resultado |
|--------|-----------|
| `npm run build` | ✅ Compila sin errores |
| `tsc --noEmit` | ✅ Sin errores de tipos |
| `eslint` en archivos de Dev C | ✅ Sin errores |
| Servidor de desarrollo (`npm run dev`) | ✅ Levanta en `localhost:3000` |
| Pruebas funcionales con usuario admin | ⏳ Pendiente: requiere ejecutar el SQL y la service role key |

### Casos de prueba sugeridos
- [ ] Abrir "Mi Cuenta" y ver los enlaces según el rol.
- [ ] Editar el perfil y ver el nombre actualizado en el menú.
- [ ] Cerrar sesión desde el menú.
- [ ] En `/admin/usuarios`: buscar y filtrar por rol y estado.
- [ ] Crear un usuario Escaneador con evento asignado.
- [ ] Editar rol, estado y evento asignado.
- [ ] Desactivar un usuario y comprobar que no puede iniciar sesión.
- [ ] Eliminar un usuario sin compras.
- [ ] Un usuario no admin no puede entrar a `/admin/usuarios`.

---

## 7. Decisiones y notas para el equipo

- **Rol del organizador:** en la base de datos no existe `organizador`; se asumió que **`negocio`** es el organizador. Dev B debe confirmarlo.
- **Nombre y apellidos:** la tabla `usuarios` guarda un solo campo `nombre`; los formularios lo separan por el primer espacio y al guardar se vuelve a unir (no se pierde información).
- **Fuera de alcance:** foto de perfil (no hay columna para guardarla) y el botón "Escanear ticket QR perdido" del Figma (no pertenece a estas HU).
- **Seguridad:** `.env.local` está versionado en el repo. Hoy solo contiene la clave pública (anon), pero **no se debe agregar ahí la service role key y luego hacer commit**. Se recomienda sacarlo del repo y agregarlo a `.gitignore`.
- **Aviso de Next.js 16:** `middleware.ts` está marcado como obsoleto (ahora se llama `proxy.ts`); funciona igual, se puede migrar más adelante.
