-- Ejecutar en Supabase SQL Editor antes de asignar el rol desde Gestión de Usuarios.
-- No convierte clientes existentes en organizadores.
alter type public.rol_usuario add value if not exists 'organizador';
