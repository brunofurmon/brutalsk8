import { useRef, useState, useCallback } from 'react'
import { inputState } from '@/lib/input'
import { cn } from '@/lib/utils'

const DEAD_ZONE = 10 // px — ignora toques muito perto do centro

export function TouchControls() {
  const baseRef = useRef<HTMLDivElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const [thumb, setThumb] = useState<{ x: number; y: number } | null>(null)

  const resetInput = useCallback(() => {
    inputState.w = false
    inputState.a = false
    inputState.s = false
    inputState.d = false
    inputState.analogX = 0
    inputState.analogY = 0
  }, [])

  const updateInput = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current
      if (!base) return
      const rect = base.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      let dx = clientX - centerX
      let dy = clientY - centerY

      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < DEAD_ZONE) {
        resetInput()
        setThumb(null)
        return
      }

      // Raio do botão para feedback visual e normalização
      const radius = rect.width / 2

      // Valores analógicos normalizados (-1 a 1), preservando a intensidade
      const clampedDist = Math.min(dist, radius)
      const scale = clampedDist / dist
      const analogX = (dx * scale) / radius
      const analogY = (dy * scale) / radius

      inputState.analogX = analogX
      inputState.analogY = analogY

      // Limita o thumb ao raio do botão para feedback visual
      if (dist > radius) {
        dx = (dx / dist) * radius
        dy = (dy / dist) * radius
      }
      setThumb({ x: dx, y: dy })

      // Booleanos para compatibilidade com o teclado (ainda funciona)
      inputState.w = dy < 0 // metade superior
      inputState.s = dy > 0 // metade inferior
      inputState.a = dx < 0 // metade esquerda
      inputState.d = dx > 0 // metade direita
    },
    [resetInput],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      pointerIdRef.current = e.pointerId
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      updateInput(e.clientX, e.clientY)
    },
    [updateInput],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return
      e.preventDefault()
      updateInput(e.clientX, e.clientY)
    },
    [updateInput],
  )

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return
      e.preventDefault()
      pointerIdRef.current = null
      resetInput()
      setThumb(null)
    },
    [resetInput],
  )

  const handleTouch =
    (key: 'w' | 'a' | 's' | 'd' | 'space', state: boolean) => (e: React.SyntheticEvent) => {
      e.preventDefault()
      inputState[key] = state
    }

  return (
    <div
      className="absolute inset-0 z-20 pointer-events-none flex items-end justify-between p-6 md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
    >
      {/* Joystick analógico */}
      <div
        ref={baseRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        className="pointer-events-auto relative w-40 h-40 rounded-full bg-white/20 backdrop-blur-sm border border-white/10 touch-none flex items-center justify-center select-none"
      >
        {/* crosshair guia */}
        <div className="absolute inset-0 rounded-full border border-white/5" />
        {/* thumb que segue o dedo */}
        <div
          className="absolute w-16 h-16 rounded-full bg-white/40 border border-white/30 shadow-lg pointer-events-none transition-transform duration-75"
          style={{
            transform: thumb ? `translate(${thumb.x}px, ${thumb.y}px)` : 'translate(0, 0)',
            opacity: thumb ? 1 : 0.6,
          }}
        />
      </div>

      {/* Jump Button */}
      <div className="pointer-events-auto">
        <button
          className="bg-rose-600/80 active:bg-rose-500 backdrop-blur-sm w-24 h-24 rounded-full flex items-center justify-center border-4 border-white/20 text-white font-black tracking-widest text-lg shadow-xl touch-none"
          onPointerDown={handleTouch('space', true)}
          onPointerUp={handleTouch('space', false)}
          onPointerLeave={handleTouch('space', false)}
        >
          PULAR
        </button>
      </div>
    </div>
  )
}
