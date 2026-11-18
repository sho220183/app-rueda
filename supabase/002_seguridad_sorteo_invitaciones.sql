-- ============================================================
-- MIGRACIÓN 002 — Seguridad, sorteo en el servidor, vencimientos
-- entre ciclos e invitaciones personales.
--
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de schema.sql.
-- Es re-ejecutable (usa create or replace / drop if exists).
--
-- Qué corrige:
--  1. Vinculación por teléfono: ahora solo usa el teléfono VERIFICADO
--     por SMS (auth.users.phone_confirmed_at), nunca el que alguien
--     escribe al registrarse. Se elimina vincular_nuevo_miembro.
--  2. asignar_coadmin: ya no asigna a un usuario cualquiera cuando el
--     correo no existe (bug de comparar '' = '').
--  3. Co-admin: ya no puede cambiar el admin principal, el co-admin,
--     el token público ni el estado de la rueda, ni borrarla.
--  4. Sorteo, avance de período, reinicio de ciclo y generación de
--     aportes pasan a funciones del servidor (no se pueden manipular
--     desde el navegador). El sorteo queda auditable.
--  5. Vencimientos: se calculan de forma continua entre ciclos.
--  6. Login A: el rol ya no lo elige el usuario (se ignora y no se
--     puede editar). Ser admin = haber creado la rueda.
--  7. Login B: invitaciones personales de un solo uso por integrante.
-- ============================================================

-- ------------------------------------------------------------
-- 6. PERFILES: el rol ya no se toma del registro ni se puede editar
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, telefono)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', new.email, new.phone, 'Sin nombre'),
    coalesce(new.raw_user_meta_data->>'telefono', new.phone)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Solo se pueden escribir nombre y teléfono; la columna rol queda fuera de alcance.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant insert (id, nombre, telefono) on public.profiles to authenticated;
grant update (nombre, telefono) on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 3. RUEDAS: políticas separadas por operación + protección de columnas
-- ------------------------------------------------------------
drop policy if exists "admin gestiona sus ruedas" on public.ruedas;
drop policy if exists "admin ve sus ruedas" on public.ruedas;
drop policy if exists "crear rueda propia" on public.ruedas;
drop policy if exists "admin edita sus ruedas" on public.ruedas;
drop policy if exists "admin principal borra su rueda" on public.ruedas;

create policy "admin ve sus ruedas" on public.ruedas
  for select using (admin_id = auth.uid() or co_admin_id = auth.uid());

create policy "crear rueda propia" on public.ruedas
  for insert with check (
    admin_id = auth.uid() and co_admin_id is null and ciclo_actual = 1 and periodo_actual = 1
  );

create policy "admin edita sus ruedas" on public.ruedas
  for update
  using (admin_id = auth.uid() or co_admin_id = auth.uid())
  with check (admin_id = auth.uid() or co_admin_id = auth.uid());

create policy "admin principal borra su rueda" on public.ruedas
  for delete using (admin_id = auth.uid());

-- Las funciones del servidor activan esta marca (válida solo dentro de su
-- transacción) para poder tocar columnas que el cliente no puede tocar.
create or replace function public.en_rpc()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('rueda.rpc', true), '') = 'on';
$$;

create or replace function public.proteger_ruedas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Sin usuario = SQL Editor / service role: mantenimiento permitido.
  if auth.uid() is null then
    return new;
  end if;

  if new.admin_id is distinct from old.admin_id then
    raise exception 'No se puede cambiar el administrador principal de la rueda';
  end if;

  if (new.co_admin_id is distinct from old.co_admin_id
      or new.token is distinct from old.token
      or new.estado is distinct from old.estado)
     and auth.uid() is distinct from old.admin_id then
    raise exception 'Solo el administrador principal puede hacer este cambio';
  end if;

  if (new.ciclo_actual is distinct from old.ciclo_actual
      or new.periodo_actual is distinct from old.periodo_actual)
     and not public.en_rpc() then
    raise exception 'El ciclo y el período solo cambian con las acciones de la rueda';
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_ruedas on public.ruedas;
create trigger proteger_ruedas
  before update on public.ruedas
  for each row execute function public.proteger_ruedas();

-- ------------------------------------------------------------
-- RUEDA_MIEMBROS: nadie puede vincular la cuenta de OTRA persona,
-- y el estado "ganador" solo lo asigna el sorteo.
-- ------------------------------------------------------------
create or replace function public.proteger_rueda_miembros()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ciclo int;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.usuario_id is not null and new.usuario_id <> auth.uid() then
      raise exception 'Cada persona vincula su propia cuenta (usá una invitación)';
    end if;
    if new.estado = 'ganador' or new.ciclo_ganador is not null then
      raise exception 'El estado de ganador solo lo asigna el sorteo';
    end if;
    return new;
  end if;

  if new.rueda_id is distinct from old.rueda_id then
    raise exception 'No se puede mover un integrante a otra rueda';
  end if;

  if new.usuario_id is distinct from old.usuario_id
     and new.usuario_id is not null
     and new.usuario_id <> auth.uid() then
    raise exception 'Cada persona vincula su propia cuenta (usá una invitación)';
  end if;

  if not public.en_rpc() then
    if new.estado = 'ganador' and old.estado <> 'ganador' then
      raise exception 'El estado de ganador solo lo asigna el sorteo';
    end if;
    if old.estado = 'ganador' and new.estado = 'activo' then
      raise exception 'Un ganador vuelve a ser elegible solo al reiniciar el ciclo';
    end if;
    if new.ciclo_ganador is distinct from old.ciclo_ganador then
      raise exception 'El ciclo ganador solo lo asigna el sorteo';
    end if;

    -- Reactivar a alguien que ya ganó en el ciclo actual lo devuelve como
    -- ganador (no puede volver a salir sorteado en el mismo ciclo).
    if old.estado = 'retirado' and new.estado = 'activo' and old.ciclo_ganador is not null then
      select ciclo_actual into v_ciclo from public.ruedas where id = new.rueda_id;
      if old.ciclo_ganador = v_ciclo then
        new.estado := 'ganador';
      else
        new.ciclo_ganador := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_rueda_miembros on public.rueda_miembros;
create trigger proteger_rueda_miembros
  before insert or update on public.rueda_miembros
  for each row execute function public.proteger_rueda_miembros();

-- ------------------------------------------------------------
-- SORTEOS: solo lectura desde el cliente; se crean con realizar_sorteo()
-- ------------------------------------------------------------
alter table public.sorteos add column if not exists participantes uuid[];

drop policy if exists "admin gestiona sorteos" on public.sorteos;
drop policy if exists "admin ve sorteos" on public.sorteos;
create policy "admin ve sorteos" on public.sorteos
  for select using (
    rueda_id in (select id from public.ruedas where admin_id = auth.uid() or co_admin_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 1. VINCULACIÓN POR TELÉFONO: solo con teléfono verificado por SMS
-- ------------------------------------------------------------
drop function if exists public.vincular_nuevo_miembro(uuid);

create or replace function public.vincular_miembro_por_telefono()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefono text;
  v_count integer;
begin
  select phone into v_telefono
  from auth.users
  where id = auth.uid() and phone_confirmed_at is not null;

  if v_telefono is null or length(regexp_replace(v_telefono, '[^0-9]', '', 'g')) < 8 then
    return 0;
  end if;

  update public.rueda_miembros
  set usuario_id = auth.uid()
  where usuario_id is null
    and estado <> 'retirado'
    and telefono is not null
    and length(regexp_replace(telefono, '[^0-9]', '', 'g')) >= 8
    and right(regexp_replace(telefono, '[^0-9]', '', 'g'), 9)
      = right(regexp_replace(v_telefono, '[^0-9]', '', 'g'), 9);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.vincular_miembro_por_telefono() from public, anon;
grant execute on function public.vincular_miembro_por_telefono() to authenticated;

-- ------------------------------------------------------------
-- 2. CO-ADMINISTRADOR: búsqueda exacta, sin coincidencias vacías
-- ------------------------------------------------------------
create or replace function public.asignar_coadmin(p_rueda_id uuid, p_identificador text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_ident text := btrim(coalesce(p_identificador, ''));
  v_digitos text;
  v_ids uuid[];
begin
  select admin_id into v_admin from public.ruedas where id = p_rueda_id;
  if v_admin is null or v_admin is distinct from auth.uid() then
    raise exception 'Solo el administrador principal puede asignar un co-administrador';
  end if;

  if position('@' in v_ident) > 0 then
    select array_agg(id) into v_ids
    from auth.users
    where lower(email) = lower(v_ident) and email_confirmed_at is not null;
  else
    v_digitos := regexp_replace(v_ident, '[^0-9]', '', 'g');
    if length(v_digitos) < 8 then
      raise exception 'Ingresá un correo o un número de teléfono válido';
    end if;
    select array_agg(id) into v_ids
    from auth.users
    where phone_confirmed_at is not null
      and phone is not null
      and right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = right(v_digitos, 9);
  end if;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'No encontramos ninguna cuenta verificada con ese correo o teléfono';
  end if;
  if array_length(v_ids, 1) > 1 then
    raise exception 'Hay más de una cuenta con ese teléfono; usá el correo de la persona';
  end if;
  if v_ids[1] = v_admin then
    raise exception 'Esa persona ya es la administradora principal';
  end if;

  update public.ruedas set co_admin_id = v_ids[1] where id = p_rueda_id;
end;
$$;

revoke execute on function public.asignar_coadmin(uuid, text) from public, anon;
grant execute on function public.asignar_coadmin(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5. VENCIMIENTOS: suma N períodos a una fecha según la frecuencia.
-- Mensual usa intervalos de Postgres (31/01 + 1 mes = 28/02, no 03/03).
-- ------------------------------------------------------------
create or replace function public.sumar_periodos(p_fecha date, p_frecuencia text, p_n int)
returns date
language sql
immutable
as $$
  select case p_frecuencia
    when 'semanal' then p_fecha + 7 * p_n
    when 'quincenal' then p_fecha + 15 * p_n
    else (p_fecha + make_interval(months => p_n))::date
  end;
$$;

-- Helper interno: verifica que el usuario actual administre la rueda,
-- la bloquea para evitar acciones simultáneas y la devuelve.
create or replace function public.rueda_para_gestionar(p_rueda_id uuid)
returns public.ruedas
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ruedas;
begin
  select * into r from public.ruedas where id = p_rueda_id for update;
  if not found or not (r.admin_id = auth.uid() or r.co_admin_id = auth.uid()) then
    raise exception 'No tenés permiso para gestionar esta rueda';
  end if;
  if r.estado <> 'activa' then
    raise exception 'La rueda está cerrada';
  end if;
  return r;
end;
$$;

revoke execute on function public.rueda_para_gestionar(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4a. GENERAR APORTES DEL PERÍODO (también completa integrantes
-- agregados después de haber generado)
-- ------------------------------------------------------------
create or replace function public.generar_aportes(p_rueda_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ruedas;
  v_venc date;
  v_k int;
  v_count int;
begin
  r := public.rueda_para_gestionar(p_rueda_id);

  -- Si el período ya tiene aportes, reutilizamos su vencimiento.
  select min(fecha_vencimiento) into v_venc
  from public.aportes
  where rueda_id = r.id and ciclo = r.ciclo_actual and periodo = r.periodo_actual;

  if v_venc is null then
    -- Cantidad de períodos ya generados antes de este, contando TODOS los ciclos.
    select count(*) into v_k
    from (
      select distinct ciclo, periodo from public.aportes
      where rueda_id = r.id
        and (ciclo < r.ciclo_actual or (ciclo = r.ciclo_actual and periodo < r.periodo_actual))
    ) x;
    v_venc := public.sumar_periodos(r.fecha_inicio, r.frecuencia, v_k);
  end if;

  insert into public.aportes (rueda_id, miembro_id, ciclo, periodo, monto, monto_pagado, fecha_vencimiento, estado)
  select r.id, m.id, r.ciclo_actual, r.periodo_actual, r.monto_aporte, 0, v_venc, 'pendiente'
  from public.rueda_miembros m
  where m.rueda_id = r.id and m.estado <> 'retirado'
  on conflict (miembro_id, ciclo, periodo) do nothing;

  get diagnostics v_count = row_count;

  if r.fecha_sorteo is null then
    update public.ruedas set fecha_sorteo = v_venc where id = r.id;
  end if;

  return v_count;
end;
$$;

revoke execute on function public.generar_aportes(uuid) from public, anon;
grant execute on function public.generar_aportes(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4b. SORTEO EN EL SERVIDOR (auditable)
-- Ganador = participantes[(semilla mod n) + 1], con participantes
-- ordenados por id. Ambos quedan guardados en la tabla sorteos.
-- ------------------------------------------------------------
create or replace function public.realizar_sorteo(p_rueda_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ruedas;
  v_hoy date := (now() at time zone 'America/Asuncion')::date;
  v_contrib int;
  v_generados int;
  v_pagados int;
  v_elegibles uuid[];
  v_hex text;
  v_idx int;
  v_ganador uuid;
  v_monto numeric(12,2);
begin
  r := public.rueda_para_gestionar(p_rueda_id);

  if exists (
    select 1 from public.sorteos
    where rueda_id = r.id and ciclo = r.ciclo_actual and periodo = r.periodo_actual
  ) then
    raise exception 'Ya se realizó el sorteo de este período';
  end if;

  if r.fecha_sorteo is not null and r.fecha_sorteo > v_hoy then
    raise exception 'El sorteo está programado para el %. Todavía no llegó la fecha.', to_char(r.fecha_sorteo, 'DD/MM/YYYY');
  end if;

  select count(*) into v_contrib
  from public.rueda_miembros where rueda_id = r.id and estado <> 'retirado';

  select count(*), count(*) filter (where estado = 'pagado')
  into v_generados, v_pagados
  from public.aportes
  where rueda_id = r.id and ciclo = r.ciclo_actual and periodo = r.periodo_actual;

  if v_generados = 0 then
    raise exception 'Primero generá los aportes del período';
  end if;
  if v_contrib = 0 or v_pagados::numeric / v_contrib < 0.85 then
    raise exception 'Todavía no se llegó al 85%% de aportes pagados (% de %)', v_pagados, v_contrib;
  end if;

  select array_agg(id order by id) into v_elegibles
  from public.rueda_miembros where rueda_id = r.id and estado = 'activo';

  if v_elegibles is null then
    raise exception 'No hay integrantes elegibles para sortear';
  end if;

  -- 48 bits aleatorios fuertes (los primeros 12 hex de un UUID v4 son todos aleatorios).
  v_hex := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_idx := (('x' || lpad(v_hex, 16, '0'))::bit(64)::bigint % array_length(v_elegibles, 1))::int + 1;
  v_ganador := v_elegibles[v_idx];
  v_monto := r.monto_aporte * v_contrib;

  perform set_config('rueda.rpc', 'on', true);

  insert into public.sorteos (rueda_id, ciclo, periodo, fecha, ganador_id, monto_entregado, semilla, participantes)
  values (r.id, r.ciclo_actual, r.periodo_actual, v_hoy, v_ganador, v_monto, v_hex, v_elegibles);

  update public.rueda_miembros
  set estado = 'ganador', ciclo_ganador = r.ciclo_actual
  where id = v_ganador;

  return jsonb_build_object(
    'ganador_id', v_ganador,
    'monto', v_monto,
    'participantes', to_jsonb(v_elegibles),
    'semilla', v_hex
  );
end;
$$;

revoke execute on function public.realizar_sorteo(uuid) from public, anon;
grant execute on function public.realizar_sorteo(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4c. AVANZAR PERÍODO
-- ------------------------------------------------------------
create or replace function public.avanzar_periodo(p_rueda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ruedas;
begin
  r := public.rueda_para_gestionar(p_rueda_id);

  if not exists (
    select 1 from public.aportes
    where rueda_id = r.id and ciclo = r.ciclo_actual and periodo = r.periodo_actual
  ) then
    raise exception 'Generá los aportes del período antes de cerrarlo';
  end if;

  perform set_config('rueda.rpc', 'on', true);
  update public.ruedas
  set periodo_actual = periodo_actual + 1, fecha_sorteo = null
  where id = r.id;
end;
$$;

revoke execute on function public.avanzar_periodo(uuid) from public, anon;
grant execute on function public.avanzar_periodo(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4d. REINICIAR CICLO (solo cuando todos ya ganaron)
-- ------------------------------------------------------------
create or replace function public.reiniciar_ciclo(p_rueda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ruedas;
begin
  r := public.rueda_para_gestionar(p_rueda_id);

  if exists (select 1 from public.rueda_miembros where rueda_id = r.id and estado = 'activo') then
    raise exception 'Todavía hay integrantes que no salieron sorteados en este ciclo';
  end if;
  if not exists (select 1 from public.rueda_miembros where rueda_id = r.id and estado = 'ganador') then
    raise exception 'No hay ganadores para reiniciar';
  end if;

  perform set_config('rueda.rpc', 'on', true);

  update public.rueda_miembros
  set estado = 'activo', ciclo_ganador = null
  where rueda_id = r.id and estado = 'ganador';

  update public.ruedas
  set ciclo_actual = ciclo_actual + 1, periodo_actual = 1, fecha_sorteo = null
  where id = r.id;
end;
$$;

revoke execute on function public.reiniciar_ciclo(uuid) from public, anon;
grant execute on function public.reiniciar_ciclo(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. INVITACIONES PERSONALES (Login B)
-- Tabla sin políticas: solo se accede por las funciones de abajo,
-- así ningún integrante puede ver los tokens de otros.
-- ------------------------------------------------------------
create table if not exists public.invitaciones (
  token text primary key,
  miembro_id uuid not null unique references public.rueda_miembros(id) on delete cascade,
  creada_por uuid not null references public.profiles(id),
  expira_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

alter table public.invitaciones enable row level security;
revoke all on public.invitaciones from anon, authenticated;

-- El admin genera (o regenera) la invitación de un integrante sin cuenta.
-- Regenerar invalida el link anterior.
create or replace function public.crear_invitacion(p_miembro_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rueda_id uuid;
  v_usuario uuid;
  v_estado text;
  v_token text;
begin
  select rueda_id, usuario_id, estado into v_rueda_id, v_usuario, v_estado
  from public.rueda_miembros where id = p_miembro_id;

  if v_rueda_id is null then
    raise exception 'No existe ese integrante';
  end if;
  perform public.rueda_para_gestionar(v_rueda_id);

  if v_usuario is not null then
    raise exception 'Este integrante ya tiene una cuenta vinculada';
  end if;
  if v_estado = 'retirado' then
    raise exception 'No se puede invitar a un integrante retirado';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.invitaciones (token, miembro_id, creada_por)
  values (v_token, p_miembro_id, auth.uid())
  on conflict (miembro_id) do update
    set token = excluded.token,
        creada_por = excluded.creada_por,
        expira_at = now() + interval '14 days',
        created_at = now();

  return v_token;
end;
$$;

revoke execute on function public.crear_invitacion(uuid) from public, anon;
grant execute on function public.crear_invitacion(uuid) to authenticated;

-- Datos mínimos para mostrar la invitación antes de iniciar sesión.
create or replace function public.ver_invitacion(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'rueda_nombre', r.nombre,
    'miembro_nombre', m.nombre,
    'admin_nombre', p.nombre,
    'monto_aporte', r.monto_aporte,
    'moneda', r.moneda,
    'frecuencia', r.frecuencia,
    'vencida', i.expira_at < now(),
    'ya_vinculada', m.usuario_id is not null
  )
  from public.invitaciones i
  join public.rueda_miembros m on m.id = i.miembro_id
  join public.ruedas r on r.id = m.rueda_id
  join public.profiles p on p.id = r.admin_id
  where i.token = p_token;
$$;

revoke execute on function public.ver_invitacion(text) from public;
grant execute on function public.ver_invitacion(text) to anon, authenticated;

-- La persona invitada (con sesión iniciada) reclama su lugar. Un solo uso.
create or replace function public.aceptar_invitacion(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_miembro uuid;
  v_expira timestamptz;
  v_usuario uuid;
  v_rueda uuid;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para aceptar la invitación';
  end if;

  select i.miembro_id, i.expira_at into v_miembro, v_expira
  from public.invitaciones i where i.token = p_token;

  if v_miembro is null then
    raise exception 'La invitación no es válida o ya fue usada';
  end if;
  if v_expira < now() then
    raise exception 'La invitación venció. Pedile al administrador una nueva.';
  end if;

  select usuario_id, rueda_id into v_usuario, v_rueda
  from public.rueda_miembros where id = v_miembro for update;

  if v_usuario is not null then
    raise exception 'Ese lugar ya está vinculado a otra cuenta';
  end if;

  update public.rueda_miembros set usuario_id = auth.uid() where id = v_miembro;
  delete from public.invitaciones where token = p_token;

  return v_rueda;
end;
$$;

revoke execute on function public.aceptar_invitacion(text) from public, anon;
grant execute on function public.aceptar_invitacion(text) to authenticated;

-- ------------------------------------------------------------
-- 5b. CORRECCIÓN DE DATOS: recalcula los vencimientos de aportes NO
-- pagados de ciclos 2 en adelante, que con la lógica anterior volvían
-- a empezar desde la fecha de inicio.
-- ------------------------------------------------------------
with orden as (
  select rueda_id, ciclo, periodo,
         (dense_rank() over (partition by rueda_id order by ciclo, periodo) - 1)::int as k
  from (select distinct rueda_id, ciclo, periodo from public.aportes) x
)
update public.aportes a
set fecha_vencimiento = public.sumar_periodos(r.fecha_inicio, r.frecuencia, o.k)
from orden o
join public.ruedas r on r.id = o.rueda_id
where a.rueda_id = o.rueda_id
  and a.ciclo = o.ciclo
  and a.periodo = o.periodo
  and a.ciclo > 1
  and a.estado <> 'pagado';

-- ------------------------------------------------------------
-- REVISIÓN MANUAL RECOMENDADA (no modifica nada):
-- integrantes vinculados a una cuenta cuyo teléfono NO está verificado.
-- Con la lógica anterior pudieron vincularse con un teléfono ajeno.
-- Si alguno no corresponde, desvinculalo desde la app ("Desvincular").
-- ------------------------------------------------------------
-- select r.nombre as rueda, m.nombre as integrante, m.telefono,
--        u.email, u.phone, u.phone_confirmed_at
-- from public.rueda_miembros m
-- join public.ruedas r on r.id = m.rueda_id
-- join auth.users u on u.id = m.usuario_id
-- where u.phone_confirmed_at is null
--   and m.usuario_id <> r.admin_id;
