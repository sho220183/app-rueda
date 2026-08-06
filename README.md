# La Rueda — Sistema de fondos rotativos (tanda/pasanaku)

Aplicación web hecha con React, Vite y Supabase para administrar ruedas de
ahorro rotativas con roles de admin y miembro.

## Descripción

Este proyecto permite a un administrador crear y gestionar ruedas, agregar
integrantes y compartir el estado de la rueda mediante un enlace público. La
aplicación usa Supabase para autenticación, base de datos y seguridad a nivel
de fila.

## Tecnologías

- React 18
- Vite
- Tailwind CSS
- React Router DOM
- Supabase (Auth + Database)

## Requisitos

- Node.js 18+ / npm
- Cuenta de Supabase
- Variables de entorno del proyecto Supabase

## Instalación local

```bash
npm install
cp .env.example .env
```

Edita `.env` con estos valores:

```env
VITE_SUPABASE_URL=https://tuprojecturl.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_public_key
```

## Ejecutar en desarrollo

```bash
npm run dev
```

Abre `http://localhost:5173` en tu navegador.

## Scripts disponibles

- `npm run dev` — inicia el servidor de desarrollo
- `npm run build` — construye el sitio para producción
- `npm run preview` — sirve la versión de producción localmente

## Configuración de Supabase

1. Crea un proyecto en https://supabase.com.
2. Abre el editor SQL y ejecuta `supabase/schema.sql`.
   Esto crea tablas, relaciones, políticas RLS y la función
   `get_rueda_publica`.
3. En `Project Settings → API`, copia `Project URL` y `anon public key`.
4. Activa el proveedor de Phone en `Authentication → Providers → Phone` si
   quieres usar login por SMS.

## Estructura del proyecto

- `src/` — código fuente de React
- `src/components/` — componentes reutilizables
- `src/pages/` — páginas de la aplicación
- `src/context/` — contexto y auth
- `src/lib/` — helper para Supabase y WhatsApp
- `supabase/schema.sql` — esquema y políticas de la base de datos

## Funcionalidades principales

- Autenticación con roles `admin` y `miembro`
- CRUD de ruedas e integrantes
- Seguridad RLS para datos por administrador e integrante
- Enlace público de consulta: `/publico/<token>`
- Recordatorios por WhatsApp
- Visualización gráfica del estado de la rueda

## Despliegue

El sitio puede desplegarse como app estática en Netlify, Vercel o cualquier
hosting estático.

Para desplegar en Netlify:

1. Ejecuta `npm run build`
2. Usa la carpeta `dist/` como carpeta de publicación
3. Configura las variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Buenas prácticas

- No subas archivos `.env` a GitHub.
- Asegúrate de que `supabase/schema.sql` esté sincronizado con el proyecto.
- Revisa las políticas RLS en Supabase si agregas nuevas rutas o tablas.

## GitHub

Repositorio: `https://github.com/sho220183/app-rueda`

## Licencia

Este proyecto no tiene licencia explícita. Agrega una si deseas compartir el
código públicamente.
