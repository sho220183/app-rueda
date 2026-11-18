// Formatos compartidos para que montos y fechas se lean igual en toda la app.

const numero = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 })

/** "Gs. 20.000" (o "USD 20.000" si la rueda usa otra moneda). */
export function formatMonto(n, moneda = 'PYG') {
  const prefijo = !moneda || moneda === 'PYG' ? 'Gs.' : moneda
  return `${prefijo} ${numero.format(Number(n) || 0)}`
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2026-11-18" → "18 nov 2026". Con { corto: true } → "18 nov". */
export function formatFecha(iso, { corto = false } = {}) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return corto ? `${d} ${MESES[m - 1]}` : `${d} ${MESES[m - 1]} ${y}`
}

function palabras(nombre) {
  return String(nombre || '').trim().split(/\s+/).filter(Boolean)
}

/**
 * Etiquetas cortas que no se repiten dentro de una rueda.
 * "QA Uno" y "QA Dos" → iniciales "QU"/"QD", nombre corto "QA U."/"QA D.".
 */
export function etiquetasCortas(miembros) {
  const primeros = miembros.map((m) => palabras(m.nombre)[0] || '?')
  const repetidos = new Set(primeros.filter((p, i) => primeros.indexOf(p) !== i))

  return Object.fromEntries(
    miembros.map((m, i) => {
      const ps = palabras(m.nombre)
      const primero = ps[0] || '?'
      const ultimo = ps.length > 1 ? ps[ps.length - 1] : ''
      const iniciales = (ultimo ? primero[0] + ultimo[0] : primero.slice(0, 2)).toUpperCase()
      const corto = repetidos.has(primero) && ultimo ? `${primero} ${ultimo[0].toUpperCase()}.` : primero
      return [m.id ?? i, { iniciales, corto }]
    })
  )
}

/** Recorta un nombre largo para que entre en un segmento de la ruleta. */
export function recortar(texto, max) {
  const t = String(texto || '')
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}
