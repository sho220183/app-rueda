// Prueba schema.sql + migración 002 sobre un Postgres embebido (PGlite) con un
// esquema "auth" simulado de Supabase. Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite'

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const repo = process.argv[2] ?? fileURLToPath(new URL("../..", import.meta.url))
const db = new PGlite()
let ok = 0, fail = 0
const check = (cond, msg) => { cond ? ok++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`) }

await db.exec(`
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, phone text,
    email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
    raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated;
  grant usage on schema public, auth to anon, authenticated;
`)
await db.exec(fs.readFileSync(`${repo}/supabase/schema.sql`, 'utf8').replace('create extension if not exists "pgcrypto";', () => "create function gen_random_bytes(n int) returns bytea language sql as $$ select decode(substr(md5(random()::text), 1, n*2), 'hex') $$;"))
// Privilegios por defecto de Supabase sobre las tablas
await db.exec(`grant all on all tables in schema public to anon, authenticated;`)
await db.exec(fs.readFileSync(`${repo}/supabase/002_seguridad_sorteo_invitaciones.sql`, 'utf8'))
await db.exec(fs.readFileSync(`${repo}/supabase/002_seguridad_sorteo_invitaciones.sql`, 'utf8'))
console.log('Migración 002 aplicada DOS veces sin errores\n')

async function as(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
  try {
    const r = await db.query(sql, params)
    return { rows: r.rows, affected: r.affectedRows }
  } catch (e) {
    return { error: e.message }
  } finally {
    await db.exec(`reset role;`)
  }
}
async function root(sql, p) { await db.exec('reset role;'); return (await db.query(sql, p)).rows }

const user = async (email, phone, phoneOk, meta = {}) =>
  (await root(`insert into auth.users (email, phone, email_confirmed_at, phone_confirmed_at, raw_user_meta_data)
               values ($1, $2, now(), $3, $4) returning id`, [email, phone, phoneOk ? new Date() : null, meta]))[0].id

const A = await user('admin@x.com', null, false, { nombre: 'Admin', rol: 'admin' })
const V = await user(null, '+595981111111', true, { nombre: 'Victima' })
const X = await user('atacante@x.com', null, false, { nombre: 'Atacante', telefono: '0981111111', rol: 'admin' })
const C = await user('coadmin@x.com', null, false, { nombre: 'Coadmin' })

check((await root(`select rol from profiles where id=$1`, [X]))[0].rol === 'miembro', 'El rol del registro se ignora (queda miembro)')
let r = await as(X, `update profiles set rol='admin' where id=$1`, [X])
check(!!r.error, `Usuario no puede cambiar su rol (${r.error})`)
r = await as(X, `update profiles set nombre='Nuevo' where id=$1`, [X])
check(!r.error && r.affected === 1, 'Usuario sí puede editar su nombre')

// Rueda
r = await as(A, `insert into ruedas (nombre, admin_id, monto_aporte, frecuencia, fecha_inicio)
                 values ('Rueda test', $1, 100000, 'mensual', '2026-01-31') returning id`, [A])
const RID = r.rows[0].id
r = await as(X, `insert into ruedas (nombre, admin_id, co_admin_id, monto_aporte, frecuencia, fecha_inicio)
                 values ('Falsa', $1, $2, 1, 'mensual', '2026-01-01')`, [A, X])
check(!!r.error, 'No se puede crear una rueda a nombre de otro poniéndose de co-admin')

const addM = async (nombre, tel) =>
  (await as(A, `insert into rueda_miembros (rueda_id, nombre, telefono) values ($1,$2,$3) returning id`, [RID, nombre, tel])).rows[0].id
const MV = await addM('Victima', '0981 111 111')
const M2 = await addM('Dos', null)
const M3 = await addM('Tres', null)

r = await as(A, `insert into rueda_miembros (rueda_id, nombre, usuario_id) values ($1,'Forzado',$2)`, [RID, X])
check(!!r.error, 'Admin no puede vincular la cuenta de otra persona a la fuerza')

// 1. Robo de lugar por teléfono
r = await as(X, `select public.vincular_miembro_por_telefono() n`)
check(r.rows?.[0]?.n === 0, 'Atacante con teléfono NO verificado no se vincula (n=0)')
r = await as(V, `select public.vincular_miembro_por_telefono() n`)
check(r.rows?.[0]?.n === 1, 'Dueña real con teléfono verificado sí se vincula (n=1)')
check(!!(await as(X, `select public.vincular_nuevo_miembro($1)`, [MV])).error, 'vincular_nuevo_miembro ya no existe')

// 2. Co-admin
r = await as(A, `select public.asignar_coadmin($1, 'noexiste@x.com')`, [RID])
check(!!r.error, `Correo inexistente da error (${r.error})`)
check((await root(`select co_admin_id from ruedas where id=$1`, [RID]))[0].co_admin_id === null, '...y no asigna a nadie')
r = await as(A, `select public.asignar_coadmin($1, '12')`, [RID])
check(!!r.error, 'Identificador inválido da error')
r = await as(A, `select public.asignar_coadmin($1, 'COADMIN@x.com')`, [RID])
check(!r.error, 'Asignar co-admin por correo funciona')
r = await as(X, `select public.asignar_coadmin($1, 'atacante@x.com')`, [RID])
check(!!r.error, 'Un extraño no puede asignarse co-admin')

// 3. Límites del co-admin
check(!!(await as(C, `update ruedas set admin_id=$2 where id=$1`, [RID, C])).error, 'Co-admin no puede quedarse con la rueda')
check(!!(await as(C, `update ruedas set co_admin_id=null where id=$1`, [RID])).error, 'Co-admin no puede cambiar el co-admin')
check(!!(await as(C, `update ruedas set token='abc' where id=$1`, [RID])).error, 'Co-admin no puede cambiar el token')
check(!!(await as(C, `update ruedas set estado='finalizada' where id=$1`, [RID])).error, 'Co-admin no puede cerrar la rueda')
r = await as(C, `delete from ruedas where id=$1`, [RID])
check(r.affected === 0, 'Co-admin no puede borrar la rueda')
r = await as(C, `update ruedas set nombre='Rueda test' where id=$1`, [RID])
check(!r.error && r.affected === 1, 'Co-admin sí puede editar datos operativos')

// 4. Manipulación directa bloqueada
check(!!(await as(A, `update ruedas set ciclo_actual=5 where id=$1`, [RID])).error, 'No se puede cambiar ciclo/período a mano')
check(!!(await as(A, `update rueda_miembros set estado='ganador' where id=$1`, [M2])).error, 'No se puede marcar ganador a mano')
check(!!(await as(A, `insert into sorteos (rueda_id, ciclo, periodo, ganador_id) values ($1,1,1,$2)`, [RID, M2])).error, 'No se puede insertar un sorteo a mano')
check(!!(await as(X, `select public.realizar_sorteo($1)`, [RID])).error, 'Un extraño no puede sortear')

// Flujo completo: 3 períodos del ciclo 1 + inicio del ciclo 2
const venc = async () => (await root(`select distinct fecha_vencimiento::text v from aportes where rueda_id=$1 and
  (ciclo, periodo) = (select ciclo_actual, periodo_actual from ruedas where id=$1)`, [RID]))[0]?.v
check(!!(await as(A, `select public.realizar_sorteo($1)`, [RID])).error, 'Sortear sin aportes da error')
const esperado = ['2026-01-31', '2026-02-28', '2026-03-31']
const ganadores = new Set()
for (let p = 1; p <= 3; p++) {
  r = await as(C, `select public.generar_aportes($1) n`, [RID])
  check(r.rows?.[0]?.n === 3, `Período ${p}: co-admin genera 3 aportes`)
  check((await venc()) === esperado[p - 1], `Período ${p}: vence ${esperado[p - 1]} (obtuvo ${await venc()})`)
  r = await as(A, `select public.realizar_sorteo($1)`, [RID])
  check(!!r.error, `Período ${p}: sin 85% pagado no deja sortear`)
  await as(A, `update aportes set estado='pagado', monto_pagado=monto where rueda_id=$1`, [RID])
  r = await as(A, `select public.realizar_sorteo($1) res`, [RID])
  check(!r.error, `Período ${p}: sorteo OK ${r.error ?? ''}`)
  const res = r.rows?.[0]?.res
  if (res) {
    ganadores.add(res.ganador_id)
    const idx = Number(BigInt('0x' + res.semilla) % BigInt(res.participantes.length))
    check(res.participantes[idx] === res.ganador_id, `Período ${p}: sorteo auditable (semilla mod n → ganador)`)
  }
  check(!!(await as(A, `select public.realizar_sorteo($1)`, [RID])).error, `Período ${p}: no se puede sortear dos veces`)
  if (p < 3) {
    check(!!(await as(A, `select public.reiniciar_ciclo($1)`, [RID])).error, `Período ${p}: no deja reiniciar con elegibles pendientes`)
    check(!(await as(A, `select public.avanzar_periodo($1)`, [RID])).error, `Período ${p}: avanzar período`)
  }
}
check(ganadores.size === 3, 'Cada integrante ganó exactamente una vez en el ciclo')

// Reactivar a un ganador retirado en el mismo ciclo lo deja como ganador
const g = [...ganadores][0]
await as(A, `update rueda_miembros set estado='retirado' where id=$1`, [g])
await as(A, `update rueda_miembros set estado='activo' where id=$1`, [g])
check((await root(`select estado from rueda_miembros where id=$1`, [g]))[0].estado === 'ganador', 'Reactivar a un ganador no lo vuelve elegible en el mismo ciclo')

r = await as(A, `select public.reiniciar_ciclo($1)`, [RID])
check(!r.error, `Reiniciar ciclo ${r.error ?? ''}`)
await as(A, `select public.generar_aportes($1)`, [RID])
check((await venc()) === '2026-04-30', `Ciclo 2 período 1 vence 2026-04-30, sigue la serie (obtuvo ${await venc()})`)

// Integrante agregado después de generar
const M4 = await addM('Cuatro', null)
r = await as(A, `select public.generar_aportes($1) n`, [RID])
check(r.rows?.[0]?.n === 1, 'Generar de nuevo agrega solo el aporte del integrante nuevo')

// Fecha de sorteo futura
await as(A, `update aportes set estado='pagado' where rueda_id=$1`, [RID])
await as(A, `update ruedas set fecha_sorteo='2099-01-01' where id=$1`, [RID])
r = await as(A, `select public.realizar_sorteo($1)`, [RID])
check(!!r.error && r.error.includes('01/01/2099'), `Sorteo antes de la fecha programada bloqueado (${r.error})`)

// 7. Invitaciones
check(!!(await as(V, `select public.crear_invitacion($1)`, [M2])).error, 'Un integrante no puede generar invitaciones')
r = await as(A, `select public.crear_invitacion($1) t`, [M2])
const tok = r.rows?.[0]?.t
check(tok?.length === 64, 'Admin genera invitación (token de 64 caracteres)')
check(!!(await as(V, `select * from invitaciones`)).error, 'Nadie puede leer la tabla de invitaciones directamente')
r = await as(null, `select public.ver_invitacion($1) i`, [tok])
check(r.rows?.[0]?.i?.miembro_nombre === 'Dos', 'Sin sesión se ve la invitación (nombre del lugar)')
check(!!(await as(null, `select public.aceptar_invitacion($1)`, [tok])).error, 'Sin sesión no se puede aceptar')
r = await as(X, `select public.aceptar_invitacion($1) rid`, [tok])
check(r.rows?.[0]?.rid === RID, 'Usuario con sesión acepta y queda vinculado')
check((await root(`select usuario_id from rueda_miembros where id=$1`, [M2]))[0].usuario_id === X, '...el lugar queda a su nombre')
check(!!(await as(C, `select public.aceptar_invitacion($1)`, [tok])).error, 'El link no sirve una segunda vez')
check(!!(await as(A, `select public.crear_invitacion($1)`, [M2])).error, 'No se invita a un lugar ya vinculado')
r = await as(X, `select count(*)::int n from rueda_miembros where rueda_id=$1`, [RID])
check(r.rows?.[0]?.n === 4, 'El invitado ve a los integrantes de su rueda')
r = await as(A, `update rueda_miembros set usuario_id=null where id=$1`, [M2])
check(!r.error && r.affected === 1, 'Admin puede desvincular')
const t1 = (await as(A, `select public.crear_invitacion($1) t`, [M3])).rows[0].t
const t2 = (await as(A, `select public.crear_invitacion($1) t`, [M3])).rows[0].t
check(!!(await as(X, `select public.aceptar_invitacion($1)`, [t1])).error && t1 !== t2, 'Regenerar invalida el link anterior')

console.log(`\n${ok} OK, ${fail} fallas`)
process.exit(fail ? 1 : 0)
