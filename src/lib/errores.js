// Convierte errores de Supabase/Postgres/red en mensajes claros en español:
// qué pasó (titulo) y qué hacer (detalle).

const MAPA = [
  [/Invalid login credentials/i, 'El correo o la contraseña no coinciden', 'Revisá los datos. Si no tenés cuenta, creá una.'],
  [/Email not confirmed/i, 'Todavía no confirmaste tu correo', 'Abrí el enlace que te mandamos por correo y volvé a intentar.'],
  [/User already registered|already been registered/i, 'Ya existe una cuenta con ese correo', 'Iniciá sesión con tu contraseña.'],
  [/Password should be at least (\d+)/i, (m) => [`La contraseña es muy corta`, `Usá al menos ${m[1]} caracteres.`]],
  [/after (\d+) seconds/i, (m) => ['Pediste un código hace muy poco', `Esperá ${m[1]} segundos y volvé a pedirlo.`]],
  [/Token has expired or is invalid|otp_expired|expired.*token/i, 'El código venció o no es correcto', 'Pedí uno nuevo y probá otra vez.'],
  [/rate limit|too many requests|429/i, 'Hiciste muchos intentos seguidos', 'Esperá un minuto y volvé a intentar.'],
  [/Unable to validate email|invalid.*email|email.*invalid/i, 'Ese correo no parece válido', 'Revisá que esté bien escrito.'],
  [/phone.*(provider|disabled|not.*enabled)|Unsupported phone|sms.*(disabled|provider)/i, 'El ingreso con SMS todavía no está habilitado', 'Por ahora entrá con tu correo.'],
  [/Failed to fetch|NetworkError|Network request failed|Load failed/i, 'No hay conexión con el servidor', 'Revisá tu internet y volvé a intentar.'],
  [/JWT expired|session.*(expired|missing)|Auth session missing/i, 'Tu sesión venció', 'Volvé a iniciar sesión.'],
  [/row-level security|permission denied|42501/i, 'No tenés permiso para hacer esto', 'Solo el administrador de la rueda puede hacerlo.'],
  [/duplicate key|unique constraint/i, 'Ese registro ya existe', 'Actualizá la pantalla para ver los datos actuales.']
]

// Los mensajes de nuestras funciones del servidor ya vienen en español.
const PARECE_ESPANOL = /[áéíóúñ¿¡]|^(Ya|No|Primero|Solo|Todavía|Generá|Ingresá|Iniciá|Hay|Cada|Ese|Esa|Este|Esta|El|La|Un|Una)\b/

/**
 * @param {unknown} error  Error de Supabase, de red o un string.
 * @param {string} contexto  Qué se intentaba, p. ej. "No se pudo registrar el pago".
 * @returns {{ titulo: string, detalle: string }}
 */
export function describirError(error, contexto = 'Algo salió mal') {
  const mensaje = String(error?.message ?? error ?? '').trim()

  for (const [patron, salida, detalleFijo] of MAPA) {
    const m = mensaje.match(patron)
    if (m) {
      const [titulo, detalle] = typeof salida === 'function' ? salida(m) : [salida, detalleFijo]
      return { titulo, detalle }
    }
  }

  if (mensaje && PARECE_ESPANOL.test(mensaje)) {
    return { titulo: contexto, detalle: mensaje.endsWith('.') ? mensaje : `${mensaje}.` }
  }

  if (mensaje) console.error(`[La Rueda] ${contexto}:`, mensaje)
  return { titulo: contexto, detalle: 'Volvé a intentar en un momento. Si sigue pasando, avisale a soporte.' }
}

/** Versión en una sola línea, para mostrar debajo de un formulario. */
export function mensajeDeError(error, contexto) {
  const { titulo, detalle } = describirError(error, contexto)
  return `${titulo}. ${detalle}`
}
