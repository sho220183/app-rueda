import { useMemo } from 'react'

/**
 * Representa la rueda como un círculo con cada integrante ubicado
 * alrededor. El centro muestra el fondo acumulado del período actual.
 * - activo: todavía puede salir sorteado (verde primario)
 * - ganador: ya salió sorteado en este ciclo (dorado, con anillo)
 * - retirado: ya no participa (gris, línea punteada)
 */
export default function WheelVisual({ miembros = [], montoFondo, moneda = 'PYG', size = 340 }) {
  const radius = size / 2 - 54
  const center = size / 2

  const posiciones = useMemo(() => {
    const n = Math.max(miembros.length, 1)
    return miembros.map((m, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2
      return {
        ...m,
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle)
      }
    })
  }, [miembros, radius, center])

  const formatMonto = (n) =>
    new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n || 0)

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" className="max-w-md mx-auto">
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#DCE1DA"
        strokeWidth="1.5"
        strokeDasharray="2 6"
      />

      {/* Centro: fondo acumulado */}
      <circle cx={center} cy={center} r={58} fill="#0F332C" />
      <text
        x={center}
        y={center - 6}
        textAnchor="middle"
        fill="#E8C77A"
        fontFamily="'Public Sans', sans-serif"
        fontSize="10"
        letterSpacing="1.5"
      >
        FONDO ACTUAL
      </text>
      <text
        x={center}
        y={center + 16}
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="'IBM Plex Mono', monospace"
        fontSize="17"
        fontWeight="600"
      >
        {moneda} {formatMonto(montoFondo)}
      </text>

      {posiciones.map((m, i) => {
        const isGanador = m.estado === 'ganador'
        const isRetirado = m.estado === 'retirado'
        const fill = isGanador ? '#C9962B' : isRetirado ? '#FFFFFF' : '#1B4B43'
        const stroke = isRetirado ? '#DCE1DA' : 'none'
        const dash = isRetirado ? '3 3' : '0'
        const textColor = isGanador ? '#0F332C' : isRetirado ? '#66766F' : '#FFFFFF'

        return (
          <g key={m.id ?? i}>
            <circle
              cx={m.x}
              cy={m.y}
              r={30}
              fill={fill}
              stroke={stroke}
              strokeDasharray={dash}
              strokeWidth={isRetirado ? 1.5 : 0}
            />
            {isGanador && (
              <circle cx={m.x} cy={m.y} r={34} fill="none" stroke="#C9962B" strokeWidth="1.5" opacity="0.5" />
            )}
            <text
              x={m.x}
              y={m.y + 5}
              textAnchor="middle"
              fill={textColor}
              fontFamily="'Public Sans', sans-serif"
              fontSize="13"
              fontWeight="600"
            >
              {(m.nombre || '?').slice(0, 2).toUpperCase()}
            </text>
            <text
              x={m.x}
              y={m.y + 46}
              textAnchor="middle"
              fill="#14231F"
              fontFamily="'Public Sans', sans-serif"
              fontSize="11"
            >
              {(m.nombre || '').split(' ')[0]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
