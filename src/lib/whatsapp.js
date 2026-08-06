/**
 * Normaliza un número paraguayo a formato internacional sin '+' ni espacios,
 * que es lo que espera wa.me. Acepta variantes comunes:
 *  0981 123 456  ->  595981123456
 *  +595981123456 ->  595981123456
 *  595981123456  ->  595981123456
 */
export function normalizarTelefonoPY(telefono) {
  if (!telefono) return null
  let digitos = telefono.replace(/[^\d]/g, '')
  if (digitos.startsWith('0')) {
    digitos = '595' + digitos.slice(1)
  } else if (!digitos.startsWith('595')) {
    digitos = '595' + digitos
  }
  return digitos
}

export function buildWaLink(telefono, mensaje) {
  const numero = normalizarTelefonoPY(telefono)
  if (!numero) return null
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
}
