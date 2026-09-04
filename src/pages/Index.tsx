import { useEffect, useState } from 'react'
import { GameCanvas, TRICK_DEFS, type GameState } from '@/components/GameCanvas'
import { TouchControls } from '@/components/TouchControls'
import { initKeyboardControls } from '@/lib/input'

export default function Index() {
  const [antialiasing, setAntialiasing] = useState(true)
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    completed: {},
    lastTrick: null,
    counts: {},
  })
  const [fps, setFps] = useState(0)

  useEffect(() => {
    const cleanup = initKeyboardControls()
    return cleanup
  }, [])

  const completedCount = TRICK_DEFS.filter((t) => gameState.completed[t.id]).length

  return (
    <div
      className="relative w-full overflow-hidden font-mono select-none"
      style={{ height: '100dvh' }}
    >
      <GameCanvas antialiasing={antialiasing} onState={setGameState} onFps={setFps} />

      {/* HUD overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 z-10 pointer-events-none flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter drop-shadow-md">
            BRUTAL SK8
          </h1>
          <p className="text-orange-300 font-bold tracking-widest text-[10px] sm:text-xs mt-1 drop-shadow">
            MINI-RAMP SESSION
          </p>
          <div className="mt-3 text-white font-bold tracking-wider flex items-center bg-black/40 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded w-max">
            <span className="text-pink-400 mr-2 uppercase text-xs">PONTOS</span>
            <span className="text-2xl leading-none tabular-nums">{gameState.score}</span>
          </div>

          {/* Manobra recentemente feita */}
          {gameState.lastTrick && (
            <div className="mt-2 bg-amber-500/80 backdrop-blur-sm border border-amber-300/50 px-3 py-1 rounded text-white font-bold text-sm tracking-wide animate-pulse w-max max-w-[70vw] truncate">
              +{gameState.lastTrick.points} — {gameState.lastTrick.label}
            </div>
          )}
        </div>

        {/* Checklist de manobras */}
        <div className="bg-black/40 backdrop-blur-sm border border-white/10 p-3 sm:p-4 rounded text-white/90 text-xs sm:text-sm w-full sm:w-64 max-w-[80vw]">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-white/80 tracking-wide">MANOBRAS</p>
            <span className="text-pink-400 font-bold tabular-nums">
              {completedCount}/{TRICK_DEFS.length}
            </span>
          </div>
          <ul className="space-y-1">
            {TRICK_DEFS.map((t) => {
              const done = !!gameState.completed[t.id]
              const count = gameState.counts[t.id] ?? 0
              return (
                <li
                  key={t.id}
                  className={`flex items-center justify-between gap-2 ${
                    done ? 'text-emerald-300' : 'text-white/70'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className={`inline-block w-4 h-4 rounded-sm border ${
                        done ? 'bg-emerald-400 border-emerald-300' : 'border-white/30'
                      } flex items-center justify-center text-[10px] leading-none text-black font-black`}
                    >
                      {done ? '✓' : ''}
                    </span>
                    <span className="truncate">{t.label}</span>
                  </span>
                  <span className="text-[10px] text-white/40 tabular-nums shrink-0">
                    {t.points}pt{count > 0 ? ` ×${count}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-[10px] text-amber-300/80 font-bold">
            Complete todas para bônus de 1000!
          </p>
        </div>
      </div>

      {/* Controles (desktop) */}
      <div className="hidden md:flex absolute bottom-0 right-0 z-10 pointer-events-auto flex-col items-end text-right p-6 gap-3">
        <div className="bg-black/40 backdrop-blur-sm border border-white/10 p-4 rounded text-white/90 text-sm">
          <p className="mb-2">
            <span className="font-black text-white bg-white/20 px-2 py-1 rounded mr-2">W / S</span>
            <span className="font-black text-white bg-white/20 px-2 py-1 rounded mr-2">↑ / ↓</span>
            <span className="ml-2">MOVER NA RAMPA</span>
          </p>
          <p>
            <span className="font-black text-white bg-white/20 px-2 py-1 rounded mr-2">ESPAÇO</span>
            <span className="ml-2">KICKFLIP (no ar)</span>
          </p>
          <p className="mt-2">
            <span className="font-black text-white bg-white/20 px-2 py-1 rounded mr-2">G</span>
            <span className="ml-2">GRAB (no ar)</span>
          </p>
          <p>
            <span className="font-black text-white bg-white/20 px-2 py-1 rounded mr-2">K</span>
            <span className="ml-2">GRIND (no coping)</span>
          </p>
          <p>
            <span className="font-black text-white bg-white/20 px-2 py-1 rounded mr-2">L</span>
            <span className="ml-2">LIP TRICK (no ar/coping)</span>
          </p>
        </div>

        <div className="flex items-stretch gap-3">
          <div className="bg-black/40 backdrop-blur-sm border border-white/10 p-4 rounded text-white/90 text-sm">
            <p className="mb-2 font-bold text-white/80">OPÇÕES GRÁFICAS</p>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={antialiasing}
                onChange={(e) => setAntialiasing(e.target.checked)}
                className="h-4 w-4 accent-orange-500 cursor-pointer"
              />
              <span>Antialiasing (suavizar bordas)</span>
            </label>
          </div>

          <div className="bg-black/40 backdrop-blur-sm border border-white/10 p-4 rounded text-white/90 text-sm flex flex-col justify-center min-w-[88px]">
            <p className="font-bold text-white/80">FPS</p>
            <p className="text-2xl font-black tabular-nums leading-none mt-1 text-emerald-300">
              {fps}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile touch controls */}
      <TouchControls />
    </div>
  )
}
