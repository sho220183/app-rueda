import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

export async function exportarRuedaExcel(rueda) {
  const [{ data: miembros }, { data: aportes }, { data: sorteos }] = await Promise.all([
    supabase.from('rueda_miembros').select('*').eq('rueda_id', rueda.id).order('fecha_ingreso'),
    supabase.from('aportes').select('*').eq('rueda_id', rueda.id).order('ciclo').order('periodo'),
    supabase.from('sorteos').select('*').eq('rueda_id', rueda.id).order('created_at')
  ])

  const nombrePorMiembro = Object.fromEntries((miembros || []).map((m) => [m.id, m.nombre]))

  const hojaIntegrantes = (miembros || []).map((m) => ({
    Nombre: m.nombre,
    Teléfono: m.telefono || '',
    Estado: m.estado,
    'Ciclo en que ganó': m.ciclo_ganador ?? '',
    'Fecha de ingreso': m.fecha_ingreso
  }))

  const hojaAportes = (aportes || []).map((a) => ({
    Integrante: nombrePorMiembro[a.miembro_id] || '',
    Ciclo: a.ciclo,
    Período: a.periodo,
    Monto: Number(a.monto),
    'Monto pagado': Number(a.monto_pagado || 0),
    Vencimiento: a.fecha_vencimiento,
    Estado: a.estado,
    'Fecha de pago': a.fecha_pago || ''
  }))

  const hojaSorteos = (sorteos || []).map((s) => ({
    Ciclo: s.ciclo,
    Período: s.periodo,
    Fecha: s.fecha,
    Ganador: nombrePorMiembro[s.ganador_id] || '',
    'Monto entregado': Number(s.monto_entregado)
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaIntegrantes), 'Integrantes')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaAportes), 'Aportes')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaSorteos), 'Sorteos')

  const nombreArchivo = `${rueda.nombre.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}-reporte.xlsx`
  XLSX.writeFile(wb, nombreArchivo)
}
