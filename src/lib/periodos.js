// Los vencimientos se calculan en el servidor (función generar_aportes),
// de forma continua entre ciclos. Acá solo quedan utilidades de fecha.

/** Fecha de hoy en la zona horaria del dispositivo, formato YYYY-MM-DD.
 *  (toISOString() usa UTC: en Paraguay, después de las 21 h ya daba "mañana"). */
export function hoyLocal() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function estaVencido(fechaVencimiento) {
  return fechaVencimiento < hoyLocal()
}

/** Evita redirecciones a otros sitios: solo rutas internas como "/ruedas/123". */
export function rutaSegura(next) {
  if (typeof next !== 'string') return '/'
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}
