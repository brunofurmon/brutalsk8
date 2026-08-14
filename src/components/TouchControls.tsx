import { useRef, useState, useCallback } from 'react'
import { inputState, tapTrick } from '@/lib/input'
import { cn } from '@/lib/utils'

const DEAD_ZONE = 10 // px — ignora toques muito perto do centro

export function TouchControls() {
  const baseRef = useRef<HTMLDivElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const [thumb, setThumb] = useState<{ x: number; y: number } | null>(null)

  const resetInput = useCallback(() => {
    inputState.a = false
    inputState.d = false
    inputState.analogX = 0
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

      const radius = rect.width / 2
      const clampedDist = Math.min(dist, radius)
      const scale = clampedDist / dist
      const analogX = (dx * scale) / radius

      // Movimento lateral apenas (usamos analogX).
      inputState.analogX = analogX
      inputState.a = analogX < -0.2
      inputState.d = analogX > 0.2

      // Limita o thumb ao raio do botão para feedback visual.
      if (dist > radius) {
        dx = (dx / dist) * radius
        dy = (dy / dist) * radius
      }
      setThumb({ x: dx, y: dy })
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

  // Botões de manobra: cada toque dispara a borda (tapTrick -> pressTrick).
  const trickBtn = (key: 'space' | 'g' | 'k' | 'l', label: string, color: string) => (
    <button
      className={cn(
        'active:scale-95 backdrop-blur-sm w-16 h-16 rounded-full flex items-center justify-center border-2 border-white/20 text-white font-black tracking-wide text-xs shadow-xl touch-none transition-transform',
        color,
      )}
      onPointerDown={(e) => {
        e.preventDefault()
        tapTrick(key)
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      className="absolute inset-0 z-20 pointer-events-none flex items-end justify-between p-4 md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
    >
      {/* Joystick analógico (lateral) */}
      <div
        ref={baseRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        className="pointer-events-auto relative w-36 h-36 rounded-full bg-white/20 backdrop-blur-sm border border-white/10 touch-none flex items-center justify-center select-none"
      >
        <div className="absolute inset-0 rounded-full border border-white/5" />
        <div
          className="absolute w-14 h-14 rounded-full bg-white/40 border border-white/30 shadow-lg pointer-events-none transition-transform duration-75"
          style={{
            transform: thumb ? `translate(${thumb.x}px, ${thumb.y}px)` : 'translate(0, 0)',
            opacity: thumb ? 1 : 0.6,
          }}
        />
      </div>

      {/* Botões de manobra */}
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {trickBtn('l', 'LIP', 'bg-purple-600/80 active:bg-purple-500')}
          {trickBtn('k', 'GRIND', 'bg-amber-600/80 active:bg-amber-500')}
        </div>
        <div className="flex gap-2">
          {trickBtn('g', 'GRAB', 'bg-sky-600/80 active:bg-sky-500')}
          {trickBtn('space', 'FLIP', 'bg-rose-600/80 active:bg-rose-500')}
        </div>
      </div>
    </div>
  )
}
