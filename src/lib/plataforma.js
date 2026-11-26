// Acceso a funciones del dispositivo en un solo lugar.
// En la web usa las APIs del navegador; dentro de la app (Capacitor) usa los
// plugins nativos. Los plugins se cargan solo en la app, así la web no los descarga.
import { Capacitor } from '@capacitor/core'

export const esNativo = Capacitor.isNativePlatform()
export const plataforma = Capacitor.getPlatform() // 'web' | 'android' | 'ios'

const URL_WEB = import.meta.env.VITE_PUBLIC_URL || 'https://app-rueda.netlify.app'

/**
 * Dirección pública de la app para armar links que se comparten
 * (invitaciones, link de consulta, confirmación de correo).
 * Dentro de la app el origen es https://localhost, que no sirve afuera.
 */
export function urlPublica(ruta = '') {
  const base = esNativo ? URL_WEB : window.location.origin
  return `${base}${ruta}`
}

/** Copia texto al portapapeles. Devuelve true si se pudo. */
export async function copiarTexto(texto) {
  if (esNativo) {
    try {
      const { Clipboard } = await import('@capacitor/clipboard')
      await Clipboard.write({ string: texto })
      return true
    } catch {
      return false
    }
  }
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
export async function abrirExterno(url) {
  if (esNativo) {
    const { AppLauncher } = await import('@capacitor/app-launcher')
    await AppLauncher.openUrl({ url })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Vibración corta: confirmación (ligera) o error (doble). */
export async function vibrar(tipo = 'ligera') {
  if (esNativo) {
    try {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics')
      if (tipo === 'error') await Haptics.notification({ type: NotificationType.Error })
      else await Haptics.impact({ style: ImpactStyle.Light })
    } catch {
      /* sin vibración */
    }
    return
  }
  try {
    navigator.vibrate?.(tipo === 'error' ? [20, 60, 20] : 12)
  } catch {
    /* sin vibración */
  }
}

/**
 * Guarda o comparte un archivo generado en la app (p. ej. el Excel).
 * Web: lo descarga. App: lo guarda en la caché y abre el menú de compartir
 * (WhatsApp, Drive, correo…), porque el WebView no descarga archivos.
 */
export async function guardarArchivo(nombre, base64, mime) {
  if (esNativo) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const { uri } = await Filesystem.writeFile({ path: nombre, data: base64, directory: Directory.Cache })
    await Share.share({ title: nombre, files: [uri] })
    return
  }
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Ajustes que solo corren dentro de la app nativa:
 *  - clase "nativo" en <html> para estilos (zonas seguras, imprimir oculto);
 *  - barra de estado con la paleta;
 *  - botón "atrás" de Android: cierra hojas/diálogos, vuelve atrás o sale;
 *  - links externos (WhatsApp) se abren en la app que corresponde;
 *  - links de la web (invitaciones) abren la pantalla correcta de la app.
 */
export async function instalarNativo(navegar) {
  if (!esNativo) return
  document.documentElement.classList.add('nativo', `nativo-${plataforma}`)

  const [{ App }, { StatusBar, Style }] = await Promise.all([import('@capacitor/app'), import('@capacitor/status-bar')])

  StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  if (plataforma === 'android') StatusBar.setBackgroundColor({ color: '#EEF1EC' }).catch(() => {})

  App.addListener('backButton', ({ canGoBack }) => {
    // Nuestras hojas y la ceremonia del sorteo se cierran con Escape. El evento
    // sale desde el diálogo de más arriba para que React lo reciba, y sube
    // hasta window, donde escucha la ruleta.
    const dialogos = document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
    if (dialogos.length) {
      dialogos[dialogos.length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return
    }
    if (canGoBack && window.location.pathname !== '/') window.history.back()
    else App.exitApp()
  })

  // https://app-rueda.netlify.app/unirme/abc → /unirme/abc dentro de la app.
  App.addListener('appUrlOpen', ({ url }) => {
    try {
      const destino = new URL(url)
      const ruta = destino.pathname + destino.search
      if (ruta.startsWith('/unirme/') || ruta.startsWith('/publico/') || ruta.startsWith('/ruedas/')) navegar(ruta)
    } catch {
      /* URL desconocida: se ignora */
    }
  })

  // <a target="_blank"> no funciona en el WebView: se abre afuera.
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest?.('a[href]')
      if (!a) return
      const href = a.getAttribute('href')
      if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(href) && !href.startsWith(window.location.origin)) {
        e.preventDefault()
        abrirExterno(href)
      }
    },
    true
  )
}
