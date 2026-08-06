# La Rueda — Sistema de fondos rotativos (tanda/pasanaku)

Sprint 1: autenticación con roles, alta de ruedas, alta/baja de integrantes,
visual de la rueda y esquema completo de base de datos en Supabase.

## 1. Crear el proyecto en Supabase

1. Andá a https://supabase.com y creá un proyecto nuevo (gratis).
2. En **SQL Editor**, pegá y ejecutá el contenido de `supabase/schema.sql`.
   Esto crea todas las tablas, relaciones, políticas de seguridad (RLS) y la
   función `get_rueda_publica` que sirve el link de solo lectura sin login.
3. En **Project Settings → API**, copiá:
   - `Project URL`
   - `anon public key`
4. Para el login por teléfono (código SMS): andá a **Authentication → Providers → Phone**,
   activalo, y configurá un proveedor de SMS (Twilio es el más común). Esto
   tiene un costo por SMS enviado — Twilio te da crédito gratis para probar.
   Si todavía no lo configurás, el login por correo sigue funcionando igual.

## 2. Configurar el proyecto local

```bash
cp .env.example .env
# completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY con los valores de arriba

npm install
npm run dev
```

Abrí http://localhost:5173

## 3. Probar el flujo

1. Registrate como **"Administro ruedas"** con tu correo.
2. Creá una rueda (monto de aporte, frecuencia, fecha de inicio).
3. Agregá integrantes por nombre y teléfono (todavía no necesitan cuenta propia).
4. Mirá la visualización circular de la rueda con el fondo acumulado.

## Qué incluye este sprint

- Autenticación real (Supabase Auth) con dos roles: `admin` y `miembro`,
  con dos vías de acceso: correo/contraseña o teléfono con código SMS.
- Base de datos con: perfiles, ruedas, integrantes, aportes y sorteos
  (las dos últimas ya están en el esquema, listas para el próximo sprint).
- Seguridad a nivel de fila: cada administrador solo ve y edita sus propias
  ruedas; cada integrante solo ve las ruedas de las que forma parte.
- CRUD de ruedas e integrantes (agregar / quitar / reactivar). Los integrantes
  se cargan por nombre y teléfono, no necesitan cuenta propia.
- **Link público de consulta** por rueda (`/publico/<token>`): cualquiera con
  el link ve el estado de la rueda sin necesidad de iniciar sesión. Pensado
  para compartir por WhatsApp.
- **Recordatorios por WhatsApp**: el admin puede abrir WhatsApp con el mensaje
  de recordatorio ya armado para cada integrante, o compartir el link público.
- Visual de la rueda: los integrantes alrededor de un círculo con el fondo
  acumulado en el centro, y color distinto según su estado.

- **Control de aportes**: el admin genera los aportes del período con un clic
  (uno por integrante activo, según el monto y frecuencia de la rueda), marca
  cada uno como pagado, y puede recordar por WhatsApp a quien está atrasado.
  Un botón cierra el período y abre el siguiente. Hay un historial resumido
  de períodos anteriores.

- **Motor de sorteo**: sorteo aleatorio entre los integrantes que aún no
  ganaron en el ciclo, con resultado auditable (semilla guardada). El ganador
  queda excluido de próximos sorteos pero sigue apareciendo en los aportes.
  Cuando todos ya ganaron, la app detecta el fin del ciclo y el admin puede
  reiniciarlo con un clic (todos vuelven a estar elegibles, empieza el ciclo
  siguiente). Historial completo de sorteos, visible también en el link
  público sin login.
- **Reportes exportables**: el admin descarga un Excel (.xlsx) con tres hojas
  — Integrantes, Aportes y Sorteos — como respaldo contable completo. También
  hay una vista de impresión/PDF limpia (sin botones ni menús) para cualquiera
  que prefiera papel.
- **Fecha de sorteo programable**: se sugiere automáticamente al generar los
  aportes del período (mismo día que el vencimiento de pago), el admin la
  puede editar en cualquier momento, y el botón "Realizar sorteo" queda
  bloqueado hasta que llegue esa fecha.
- **Calendario visual**: un calendario mensual navegable (en el panel del
  admin y en el link público) que marca el vencimiento de pago, la fecha de
  sorteo programada y los sorteos ya realizados.

## Qué falta (próximos sprints)

- **Sprint 6**: permisos por rueda (co-administradores), recordatorios
  automáticos (requiere WhatsApp Business API) y vínculo automático entre un
  integrante cargado por el admin y su propia cuenta cuando se registra.

## Despliegue

Este proyecto es un sitio estático (Vite + React), igual que la landing de
JCG Infotech. Se puede desplegar en Netlify: `npm run build` genera la carpeta
`dist/`, y hay que cargar las mismas variables de entorno (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`) en la configuración de Netlify.
