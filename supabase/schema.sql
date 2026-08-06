-- ============================================================
-- ESQUEMA: Sistema de Ruedas de Ahorro (tanda/pasanaku)
-- Ejecutar en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Extensión para generar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- PERFILES (extiende auth.users con datos propios de la app)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  telefono text,
  rol text not null default 'miembro' check (rol in ('admin', 'miembro')),
  created_at timestamptz not null default now()
);

-- Crea automáticamente un perfil cuando alguien se registra (por correo o por teléfono)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nombre, telefono, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', new.email, new.phone, 'Sin nombre'),
    coalesce(new.raw_user_meta_data->>'telefono', new.phone),
    coalesce(new.raw_user_meta_data->>'rol', 'miembro')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- RUEDAS (grupos)
-- ------------------------------------------------------------
create table public.ruedas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  admin_id uuid not null references public.profiles(id),
  monto_aporte numeric(12,2) not null check (monto_aporte > 0),
  moneda text not null default 'PYG',
  frecuencia text not null check (frecuencia in ('semanal','quincenal','mensual')),
  fecha_inicio date not null,
  estado text not null default 'activa' check (estado in ('activa','finalizada','pausada')),
  ciclo_actual int not null default 1,
  token text not null unique default encode(gen_random_bytes(6), 'hex'), -- para el link público de solo lectura
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- MIEMBROS DE UNA RUEDA
-- ------------------------------------------------------------
create table public.rueda_miembros (
  id uuid primary key default gen_random_uuid(),
  rueda_id uuid not null references public.ruedas(id) on delete cascade,
  usuario_id uuid references public.profiles(id), -- null hasta que la persona se registra y se vincula
  nombre text not null,
  telefono text,
  estado text not null default 'activo' check (estado in ('activo','ganador','retirado')),
  ciclo_ganador int, -- en qué ciclo salió sorteado (null = todavía no)
  fecha_ingreso date not null default current_date,
  orden int -- posición opcional para mostrar en la rueda visual
);

-- ------------------------------------------------------------
-- APORTES (pagos periódicos de cada miembro)
-- ------------------------------------------------------------
create table public.aportes (
  id uuid primary key default gen_random_uuid(),
  rueda_id uuid not null references public.ruedas(id) on delete cascade,
  miembro_id uuid not null references public.rueda_miembros(id) on delete cascade,
  ciclo int not null,
  periodo int not null, -- número de sorteo dentro del ciclo
  monto numeric(12,2) not null,
  fecha_vencimiento date not null,
  fecha_pago date,
  estado text not null default 'pendiente' check (estado in ('pagado','pendiente','atrasado')),
  created_at timestamptz not null default now(),
  unique (miembro_id, ciclo, periodo)
);

-- ------------------------------------------------------------
-- SORTEOS
-- ------------------------------------------------------------
create table public.sorteos (
  id uuid primary key default gen_random_uuid(),
  rueda_id uuid not null references public.ruedas(id) on delete cascade,
  ciclo int not null,
  periodo int not null,
  fecha date not null default current_date,
  ganador_id uuid references public.rueda_miembros(id),
  monto_entregado numeric(12,2),
  semilla text, -- valor usado para el sorteo, permite auditar el resultado
  created_at timestamptz not null default now(),
  unique (rueda_id, ciclo, periodo)
);

-- ============================================================
-- SEGURIDAD A NIVEL DE FILA (RLS)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.ruedas enable row level security;
alter table public.rueda_miembros enable row level security;
alter table public.aportes enable row level security;
alter table public.sorteos enable row level security;

-- PROFILES: cada quien ve y edita su propio perfil
create policy "ver propio perfil" on public.profiles
  for select using (auth.uid() = id);
create policy "editar propio perfil" on public.profiles
  for update using (auth.uid() = id);
create policy "ver perfiles de compañeros de rueda" on public.profiles
  for select using (
    id in (
      select rm.usuario_id from public.rueda_miembros rm
      where rm.rueda_id in (
        select rueda_id from public.rueda_miembros where usuario_id = auth.uid()
      )
    )
  );

-- RUEDAS: el admin ve y gestiona las suyas; los miembros ven las suyas
create policy "admin gestiona sus ruedas" on public.ruedas
  for all using (admin_id = auth.uid());
create policy "miembros ven sus ruedas" on public.ruedas
  for select using (
    id in (select rueda_id from public.rueda_miembros where usuario_id = auth.uid())
  );

-- RUEDA_MIEMBROS: admin de la rueda gestiona; miembro ve su propia fila y las de su rueda
create policy "admin gestiona miembros" on public.rueda_miembros
  for all using (
    rueda_id in (select id from public.ruedas where admin_id = auth.uid())
  );
create policy "miembro ve integrantes de su rueda" on public.rueda_miembros
  for select using (
    rueda_id in (select rueda_id from public.rueda_miembros where usuario_id = auth.uid() and usuario_id is not null)
  );

-- APORTES: admin gestiona; miembro ve los aportes de su rueda (transparencia total)
create policy "admin gestiona aportes" on public.aportes
  for all using (
    rueda_id in (select id from public.ruedas where admin_id = auth.uid())
  );
create policy "miembro ve aportes de su rueda" on public.aportes
  for select using (
    rueda_id in (select rueda_id from public.rueda_miembros where usuario_id = auth.uid())
  );

-- SORTEOS: admin gestiona; miembro ve el historial de su rueda
create policy "admin gestiona sorteos" on public.sorteos
  for all using (
    rueda_id in (select id from public.ruedas where admin_id = auth.uid())
  );
create policy "miembro ve sorteos de su rueda" on public.sorteos
  for select using (
    rueda_id in (select rueda_id from public.rueda_miembros where usuario_id = auth.uid())
  );

-- ============================================================
-- CONSULTA PÚBLICA SIN LOGIN (link que el admin comparte por WhatsApp)
-- Devuelve solo lo necesario para transparencia: nombre de la rueda,
-- monto, fondo del período y el estado de cada integrante (sin teléfonos).
-- Al ser SECURITY DEFINER, funciona aunque el que consulta no tenga sesión.
-- ============================================================
create or replace function public.get_rueda_publica(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado jsonb;
begin
  select jsonb_build_object(
    'nombre', r.nombre,
    'monto_aporte', r.monto_aporte,
    'moneda', r.moneda,
    'frecuencia', r.frecuencia,
    'ciclo_actual', r.ciclo_actual,
    'estado', r.estado,
    'miembros', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', m.id, 'nombre', m.nombre, 'estado', m.estado)
        order by m.fecha_ingreso
      )
      from public.rueda_miembros m
      where m.rueda_id = r.id and m.estado <> 'retirado'
    ), '[]'::jsonb)
  )
  into resultado
  from public.ruedas r
  where r.token = p_token;

  return resultado;
end;
$$;

grant execute on function public.get_rueda_publica(text) to anon, authenticated;
