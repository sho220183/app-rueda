-- ============================================================
-- MIGRACIÓN 003 — Ajustes señalados por el Security Advisor de Supabase
-- Ejecutar después de 002. Re-ejecutable.
-- ============================================================

-- search_path fijo en las funciones auxiliares (lint 0011).
alter function public.en_rpc() set search_path = '';
alter function public.sumar_periodos(date, text, int) set search_path = '';

-- Funciones del esquema original que no deben poder llamarse sin sesión (lint 0028).
-- handle_new_user es un trigger: nadie necesita llamarla por la API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.quitar_coadmin(uuid) from public, anon;
grant execute on function public.quitar_coadmin(uuid) to authenticated;
revoke execute on function public.nombre_publico(uuid) from public, anon;
grant execute on function public.nombre_publico(uuid) to authenticated;

-- rueda_ids_del_usuario se usa en las políticas RLS siempre con auth.uid().
-- Antes cualquier usuario podía consultarla con el id de OTRA persona y
-- averiguar en qué ruedas participa; ahora solo responde por uno mismo.
create or replace function public.rueda_ids_del_usuario(p_usuario_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select rueda_id from public.rueda_miembros
  where usuario_id = p_usuario_id and p_usuario_id = auth.uid();
$$;

revoke execute on function public.rueda_ids_del_usuario(uuid) from public, anon;
grant execute on function public.rueda_ids_del_usuario(uuid) to authenticated;

-- invitaciones tiene RLS sin políticas a propósito: solo se usa a través de
-- crear_invitacion / ver_invitacion / aceptar_invitacion (aviso INFO 0008).
comment on table public.invitaciones is
  'Sin políticas RLS a propósito: acceso solo vía funciones crear/ver/aceptar_invitacion.';
