// Acceso a funciones del dispositivo en un solo lugar.
// Hoy usa las APIs del navegador; al pasar a app móvil (Capacitor / React
// Native) se reemplaza este archivo y el resto de la app no cambia.

/** Copia texto al portapapeles. Devuelve true si se pudo. */
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    /* sigue con el método alternativo */
  }
  try {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/** Abre un enlace fuera de la app (WhatsApp, sitio web). */
export function abrirExterno(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Vibración corta de confirmación, donde el dispositivo la soporte. */
export function vibrar(patron = 12) {
  try {
    navigator.vibrate?.(patron)
  } catch {
    /* sin vibración */
  }
}
