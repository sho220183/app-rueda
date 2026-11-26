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

### 1b. Migración 002 (seguridad, sorteo en servidor, invitaciones)

Después de `schema.sql`, ejecutá **`supabase/002_seguridad_sorteo_invitaciones.sql`**
en el SQL Editor. Si tu proyecto ya estaba en producción, ejecutala **antes**
de desplegar esta versión del frontend (la app nueva llama a funciones que
crea esta migración). Es re-ejecutable.

Qué hace:
- La vinculación automática por teléfono solo usa teléfonos **verificados por SMS**.
- Corrige `asignar_coadmin` (antes podía asignar a un usuario cualquiera).
- El co-admin ya no puede cambiar el admin, el co-admin, el token ni cerrar o borrar la rueda.
- Sorteo, avance de período, reinicio de ciclo y generación de aportes se ejecutan
  en el servidor. El sorteo guarda la semilla y los participantes para auditarlo:
  ganador = `participantes[(semilla hex mod n) + 1]`.
- Vencimientos continuos entre ciclos (y recalcula los no pagados de ciclos ≥ 2).
- El rol ya no se elige al registrarse: quien crea una rueda la administra.
- Invitaciones personales de un solo uso (`/unirme/<token>`, válidas 14 días).

Después ejecutá también **`supabase/003_ajustes_advisors.sql`** (ajustes del Security Advisor de Supabase).

Pruebas de la base: `npm run test:db` (Postgres embebido, no toca tu proyecto).

Al final del archivo 002 hay una consulta comentada para revisar integrantes que
quedaron vinculados con un teléfono no verificado.

## 2. Configurar el proyecto local

```bash
cp .env.example .env
# completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY con los valores de arriba

npm install
npm run dev
```

Abrí http://localhost:5173

## 3. Probar el flujo

1. Registrate con tu correo (ya no se elige rol: cualquier cuenta puede crear ruedas).
2. Creá una rueda (monto de aporte, frecuencia, fecha de inicio).
3. Agregá integrantes por nombre y teléfono (todavía no necesitan cuenta propia).
4. Tocá **Invitar** en un integrante y mandale el link por WhatsApp. Al abrirlo,
   crea su cuenta (o inicia sesión) y queda vinculado a su lugar en la rueda.
5. En el inicio, cada cuenta ve "Ruedas que administrás" y "Ruedas en las que participás".

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
- **Umbral de pago para sortear**: el botón de sorteo también queda
  bloqueado si menos del 85% de los integrantes pagó su aporte del período,
  además de la fecha programada.
- **Co-administrador**: el admin principal (quien creó la rueda) puede
  asignar a una segunda persona —que ya tenga cuenta, por correo o
  teléfono— como co-administrador de esa rueda puntual. El co-admin puede
  gestionar todo excepto asignar o quitar a otro co-admin.
- **Ruleta animada del sorteo**: al presionar "Realizar sorteo" ahora se ve
  una ruleta que gira entre los integrantes elegibles y frena en el ganador,
  seguida de una explosión de confetti/papel picado con su nombre y el monto
  que le corresponde. El resultado ya quedó guardado en la base antes de la
  animación — la ruleta solo la presenta con más show.
- **Cerrar / reabrir rueda**: en vez de eliminar datos, el admin principal
  puede cerrar una rueda (por ejemplo si los integrantes se retiran). Una
  rueda cerrada no permite nuevos aportes ni sorteos, pero todo el historial
  sigue disponible para consulta y exportación, y se puede reabrir.
- **Editar ruedas e integrantes**: se puede corregir el nombre, teléfono de
  un integrante, y el nombre/monto/frecuencia/fecha de inicio de una rueda
  ya creada, sin tener que empezar de nuevo.
- **Vínculo automático de cuenta**: si un integrante cargado por nombre y
  teléfono se registra en la app con ese mismo número (en cualquier orden),
  su cuenta se conecta sola a esa fila — deja de estar "sin cuenta" y ve la
  rueda en su panel de integrante.
- **Pagos parciales**: un aporte ya no es solo pagado/pendiente — se pueden
  registrar abonos parciales, y el sistema calcula automáticamente cuánto
  falta para completarlo.
- **Duplicar rueda**: desde "Tus ruedas", un botón clona el nombre, monto y
  frecuencia de una rueda existente para arrancar un grupo nuevo sin cargar
  todo de cero (no copia integrantes ni historial).

## Qué falta

- Recordatorios automáticos (pendiente: activar Twilio) y la migración a
  Android/iOS (esquema ya definido, pendiente de arrancar).

## Despliegue

Este proyecto es un sitio estático (Vite + React), igual que la landing de
JCG Infotech. Se puede desplegar en Netlify: `npm run build` genera la carpeta
`dist/`, y hay que cargar las mismas variables de entorno (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`) en la configuración de Netlify.

## App móvil (Capacitor)

La misma app web se empaqueta como app nativa con [Capacitor](https://capacitorjs.com) 8.
El código que toca el dispositivo (portapapeles, WhatsApp, vibración, compartir
archivos, botón atrás, links que abren la app) está en `src/lib/plataforma.js`:
en la web usa el navegador y en la app usa los plugins nativos.

### Requisitos
- Android: Android Studio (incluye el SDK) y JDK 21.
- iOS: una Mac con Xcode (`npx cap add ios` la primera vez).

### Configuración
Creá `.env.production.local` (no se sube a git) con las mismas variables que
`.env.example`, incluida `VITE_PUBLIC_URL`. La app la usa para armar los links
que se comparten (invitaciones, link de consulta), porque adentro de la app el
origen es `https://localhost`.

### Comandos
```bash
npm run movil:sync      # compila la web y la copia a los proyectos nativos
npm run movil:android   # abre el proyecto en Android Studio (Run ▶ para probar)
npm run movil:apk       # genera android/app/build/outputs/apk/debug/app-debug.apk
```

### Íconos y pantalla de inicio
Las fuentes están en `assets/`. Para regenerarlas:
`npx @capacitor/assets@4.0.0 generate --android --iconBackgroundColor '#F6EFDC' --splashBackgroundColor '#1B4B43' --splashBackgroundColorDark '#0F332C'`

### Links que abren la app (App Links)
El manifiesto ya declara `https://app-rueda.netlify.app/unirme/…` y `/publico/…`.
Para que Android los abra directo en la app sin preguntar, hay que publicar
`public/.well-known/assetlinks.json` con la huella SHA-256 de la llave con la
que se firma la versión de Play Store.
