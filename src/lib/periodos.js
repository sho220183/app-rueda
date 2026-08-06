export function calcularVencimiento(fechaInicio, frecuencia, periodo) {
  const d = new Date(fechaInicio + 'T00:00:00')
  const n = periodo - 1
  if (frecuencia === 'semanal') d.setDate(d.getDate() + 7 * n)
  else if (frecuencia === 'quincenal') d.setDate(d.getDate() + 15 * n)
  else if (frecuencia === 'mensual') d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export function estaVencido(fechaVencimiento) {
  const hoy = new Date().toISOString().slice(0, 10)
  return fechaVencimiento < hoy
}
