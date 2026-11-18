import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { describirError } from '../lib/errores.js'
import { vibrar } from '../lib/plataforma.js'

// Mensajes dentro de la app, pensados primero para el celular:
//  - aviso.exito / aviso.error / aviso.info: avisos breves abajo, en la zona
//    del pulgar. Se pueden deslizar hacia el costado para descartarlos y
//    pueden traer una acción ("Deshacer").
//  - confirmar({...}): hoja que sube desde abajo en el celular (diálogo
//    centrado en pantallas grandes). Devuelve una promesa con true/false.

const AvisosContext = createContext(null)

const DURACION = { exito: 4000, info: 5000, error: 8000 }
const MAXIMO_VISIBLES = 3

function IconoAviso({ tipo }) {
  const comun = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }
  if (tipo === 'exito')
    return (
      <svg {...comun} stroke="#8FD3BF">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.6 2.6L16 9.6" />
      </svg>
    )
  if (tipo === 'error')
    return (
      <svg {...comun} stroke="#F3A08C">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </svg>
    )
  return (
    <svg {...comun} stroke="#E8C77A">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.01" />
    </svg>
  )
}

function Toast({ aviso, onCerrar }) {
  const [saliendo, setSaliendo] = useState(false)
  const [arrastre, setArrastre] = useState(0)
  const inicioX = useRef(null)
  const restante = useRef(aviso.duracion)
  const timer = useRef(null)
  const desde = useRef(0)
  const pausado = useRef(false)

  const cerrar = useCallback(() => {
    setSaliendo(true)
    setTimeout(() => onCerrar(aviso.id), 180)
  }, [aviso.id, onCerrar])

  const pausar = () => {
    if (pausado.current) return
    pausado.current = true
    clearTimeout(timer.current)
    restante.current -= Date.now() - desde.current
  }
  const reanudar = useCallback(() => {
    if (!aviso.duracion) return
    pausado.current = false
    desde.current = Date.now()
    clearTimeout(timer.current)
    timer.current = setTimeout(cerrar, Math.max(1200, restante.current))
  }, [aviso.duracion, cerrar])

  useEffect(() => {
    reanudar()
    return () => clearTimeout(timer.current)
  }, [reanudar])

  // Deslizar hacia el costado para descartar (gesto de celular).
  function alTocar(e) {
    if (e.target.closest('button')) return
    inicioX.current = e.clientX
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pausar()
  }
  function alMover(e) {
    if (inicioX.current == null) return
    setArrastre(e.clientX - inicioX.current)
  }
  function alSoltar() {
    if (inicioX.current == null) return
    inicioX.current = null
    if (Math.abs(arrastre) > 80) cerrar()
    else {
      setArrastre(0)
      reanudar()
    }
  }

  const estilo = arrastre
    ? { transform: `translateX(${arrastre}px)`, opacity: Math.max(0.2, 1 - Math.abs(arrastre) / 260), transition: 'none' }
    : undefined

  return (
    <div
      role={aviso.tipo === 'error' ? 'alert' : 'status'}
      className={`aviso ${saliendo ? 'aviso--saliendo' : ''}`}
      style={estilo}
      onPointerEnter={(e) => e.pointerType === 'mouse' && pausar()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && reanudar()}
      onFocus={pausar}
      onBlur={reanudar}
      onPointerDown={alTocar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
    >
      <span className="mt-0.5 shrink-0">
        <IconoAviso tipo={aviso.tipo} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{aviso.titulo}</p>
        {aviso.detalle && <p className="text-sm text-white/75 mt-0.5 leading-snug">{aviso.detalle}</p>}
      </div>
      {aviso.accion && (
        <button
          type="button"
          className="aviso-accion"
          onClick={() => {
            aviso.accion.alHacer()
            cerrar()
          }}
        >
          {aviso.accion.etiqueta}
        </button>
      )}
      <button type="button" onClick={cerrar} aria-label="Cerrar aviso" className="aviso-cerrar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  )
}

function HojaConfirmacion({ pedido, onResponder }) {
  const [saliendo, setSaliendo] = useState(false)
  const [arrastre, setArrastre] = useState(0)
  const inicioY = useRef(null)
  const panelRef = useRef(null)
  const confirmarRef = useRef(null)
  const cancelarRef = useRef(null)

  const responder = useCallback(
    (valor) => {
      if (saliendo) return
      setSaliendo(true)
      setTimeout(() => onResponder(valor), 170)
    },
    [saliendo, onResponder]
  )

  useEffect(() => {
    const previoFoco = document.activeElement
    const previoOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // En acciones peligrosas el foco arranca en "Cancelar", por seguridad.
    ;(pedido.peligro ? cancelarRef : confirmarRef).current?.focus()
    return () => {
      document.body.style.overflow = previoOverflow
      previoFoco?.focus?.()
    }
  }, [pedido])

  function alTeclado(e) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      responder(false)
    }
    if (e.key === 'Tab') {
      const focos = [confirmarRef.current, cancelarRef.current].filter(Boolean)
      const i = focos.indexOf(document.activeElement)
      e.preventDefault()
      focos[(i + (e.shiftKey ? -1 : 1) + focos.length) % focos.length].focus()
    }
  }

  // Deslizar la hoja hacia abajo la cierra (como en las apps nativas).
  function alTocar(e) {
    inicioY.current = e.clientY
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function alMover(e) {
    if (inicioY.current == null) return
    setArrastre(Math.max(0, e.clientY - inicioY.current))
  }
  function alSoltar() {
    if (inicioY.current == null) return
    inicioY.current = null
    if (arrastre > 90) responder(false)
    else setArrastre(0)
  }

  return (
    <div className={`hoja-fondo ${saliendo ? 'hoja-fondo--saliendo' : ''}`} onClick={() => responder(false)}>
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hoja-titulo"
        aria-describedby={pedido.detalle ? 'hoja-detalle' : undefined}
        className={`hoja ${saliendo ? 'hoja--saliendo' : ''}`}
        style={arrastre ? { transform: `translateY(${arrastre}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={alTeclado}
      >
        <div
          className="hoja-agarre sm:hidden"
          onPointerDown={alTocar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          aria-hidden="true"
        >
          <span />
        </div>
        <h2 id="hoja-titulo" className="font-display text-xl text-ink leading-snug text-balance">
          {pedido.titulo}
        </h2>
        {pedido.detalle && (
          <p id="hoja-detalle" className="text-[15px] text-muted mt-2 leading-relaxed">
            {pedido.detalle}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <button
            ref={confirmarRef}
            type="button"
            onClick={() => {
              vibrar()
              responder(true)
            }}
            className={`hoja-boton ${pedido.peligro ? 'hoja-boton--peligro' : 'hoja-boton--principal'}`}
          >
            {pedido.confirmar}
          </button>
          <button ref={cancelarRef} type="button" onClick={() => responder(false)} className="hoja-boton hoja-boton--secundario">
            {pedido.cancelar}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AvisosProvider({ children }) {
  const [avisos, setAvisos] = useState([])
  const [pedido, setPedido] = useState(null)
  const contador = useRef(0)

  const quitar = useCallback((id) => setAvisos((lista) => lista.filter((a) => a.id !== id)), [])

  const mostrar = useCallback((tipo, titulo, opciones = {}) => {
    const id = ++contador.current
    const aviso = {
      id,
      tipo,
      titulo,
      detalle: opciones.detalle,
      accion: opciones.accion,
      duracion: opciones.duracion ?? DURACION[tipo]
    }
    setAvisos((lista) => [...lista, aviso].slice(-MAXIMO_VISIBLES))
    if (tipo === 'error') vibrar('error')
    return id
  }, [])

  const api = useMemo(
    () => ({
      exito: (titulo, opciones) => mostrar('exito', titulo, opciones),
      info: (titulo, opciones) => mostrar('info', titulo, opciones),
      /** error(errorDeSupabase, 'No se pudo X') o error('Título', { detalle }) */
      error: (errorOTitulo, contextoOOpciones) => {
        if (typeof errorOTitulo === 'string' && typeof contextoOOpciones !== 'string') {
          return mostrar('error', errorOTitulo, contextoOOpciones)
        }
        const { titulo, detalle } = describirError(errorOTitulo, contextoOOpciones)
        return mostrar('error', titulo, { detalle })
      },
      confirmar: ({ titulo, detalle, confirmar = 'Confirmar', cancelar = 'Cancelar', peligro = false }) =>
        new Promise((resolver) => setPedido({ titulo, detalle, confirmar, cancelar, peligro, resolver }))
    }),
    [mostrar]
  )

  return (
    <AvisosContext.Provider value={api}>
      {children}
      <div className="avisos-pila no-print">
        {avisos.map((a) => (
          <Toast key={a.id} aviso={a} onCerrar={quitar} />
        ))}
      </div>
      {pedido && (
        <HojaConfirmacion
          pedido={pedido}
          onResponder={(valor) => {
            pedido.resolver(valor)
            setPedido(null)
          }}
        />
      )}
    </AvisosContext.Provider>
  )
}

export function useAvisos() {
  const ctx = useContext(AvisosContext)
  if (!ctx) throw new Error('useAvisos debe usarse dentro de <AvisosProvider>')
  return ctx
}
