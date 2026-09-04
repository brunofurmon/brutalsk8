import { useEffect, useState } from 'react'
import { HelpCircle, ChevronUp, ChevronDown, Settings2, Sliders, X } from 'lucide-react'
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

  // Controla se o card de controles/instruções está aberto (oculto por padrão no mobile, recolhido ou compacto no desktop)
  const [showControls, setShowControls] = useState(false)
  // Controla se as opções gráficas estão abertas ou se o popup de configurações está visível
  const [showSettings, setShowSettings] = useState(false)
  // Controla se a checklist de manobras está expandida (útil para economizar espaço em telas menores)
  const [showTrickList, setShowTrickList] = useState(false)

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

      {/* HUD Superior (Título, Pontuação, Checklist e Ações rápidas) */}
      <div className="absolute top-0 left-0 right-0 p-3 sm:p-5 z-10 pointer-events-none flex flex-row justify-between items-start gap-2">
        {/* Lado Esquerdo: Marca, Pontos e Última Manobra */}
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tighter drop-shadow-md">
            BRUTAL SK8
          </h1>
          <p className="text-orange-300 font-bold tracking-widest text-[9px] sm:text-[11px] drop-shadow">
            MINI-RAMP SESSION
          </p>

          <div className="mt-2 text-white font-bold tracking-wider flex items-center bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded shadow-md w-max">
            <span className="text-pink-400 mr-2 uppercase text-[10px] sm:text-xs">PONTOS</span>
            <span className="text-xl sm:text-2xl leading-none tabular-nums">{gameState.score}</span>
          </div>

          {/* Manobra recentemente feita */}
          {gameState.lastTrick && (
            <div className="mt-1.5 bg-amber-500/90 backdrop-blur-md border border-amber-300/60 px-2.5 py-1 rounded text-white font-bold text-xs sm:text-sm tracking-wide animate-pulse w-max max-w-[65vw] truncate shadow-lg">
              +{gameState.lastTrick.points} — {gameState.lastTrick.label}
            </div>
          )}
        </div>

        {/* Lado Direito do HUD: Checklist Compacta / Recolhível */}
        <div className="pointer-events-auto flex flex-col items-end">
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded shadow-md text-white/90 text-xs w-56 sm:w-64 max-w-[85vw] transition-all">
            <button
              onClick={() => setShowTrickList((prev) => !prev)}
              aria-label="Alternar lista de manobras"
              className="w-full flex items-center justify-between p-2 sm:px-3 sm:py-2 text-left font-bold text-white/80 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] sm:text-xs uppercase tracking-wide">MANOBRAS</span>
                <span className="text-pink-400 font-bold tabular-nums text-[11px] sm:text-xs">
                  {completedCount}/{TRICK_DEFS.length}
                </span>
              </div>
              <span className="text-white/60 text-[10px] flex items-center gap-1">
                {showTrickList ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </span>
            </button>

            {/* Conteúdo da checklist (visível quando expandido ou prévia) */}
            {showTrickList && (
              <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3 border-t border-white/10 pt-2">
                <ul className="space-y-1 max-h-[42dvh] overflow-y-auto pr-1 select-none">
                  {TRICK_DEFS.map((t) => {
                    const done = !!gameState.completed[t.id]
                    const count = gameState.counts[t.id] ?? 0
                    return (
                      <li
                        key={t.id}
                        className={`flex items-center justify-between gap-2 text-[11px] ${
                          done ? 'text-emerald-300' : 'text-white/70'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span
                            className={`inline-block w-3.5 h-3.5 rounded-sm border ${
                              done ? 'bg-emerald-400 border-emerald-300' : 'border-white/30'
                            } flex items-center justify-center text-[9px] leading-none text-black font-black`}
                          >
                            {done ? '✓' : ''}
                          </span>
                          <span className="truncate">{t.label}</span>
                        </span>
                        <span className="text-[9px] text-white/40 tabular-nums shrink-0">
                          {t.points}pt{count > 0 ? ` ×${count}` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-2 text-[9px] text-amber-300/80 font-bold">
                  Bônus de 1000 ao zerar!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Barra de utilitários no canto inferior direito: Botão de Controles (?), Opções Gráficas e FPS */}
      <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 z-20 pointer-events-auto flex flex-col items-end gap-2">
        {/* Popup / Card de Instruções de Controles (Compacto e Recolhível) */}
        {showControls && (
          <div className="bg-black/75 backdrop-blur-md border border-white/15 rounded-lg p-3 text-white/90 text-xs shadow-2xl w-72 sm:w-80 max-w-[92vw] animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
              <span className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-orange-400" />
                Controles do Jogo
              </span>
              <button
                onClick={() => setShowControls(false)}
                className="text-white/60 hover:text-white p-0.5 rounded transition-colors"
                aria-label="Fechar controles"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Teclado (Desktop) */}
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/70">Mover na rampa</span>
                <span className="font-bold text-white bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                  W / S ou ↑ / ↓
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/70">Kickflip (no ar)</span>
                <span className="font-bold text-white bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                  ESPAÇO
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/70">Grab (no ar)</span>
                <span className="font-bold text-white bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                  G
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/70">Lip Trick (stall no coping)</span>
                <span className="font-bold text-white bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                  K ou L
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/70">Grind (desliza no coping)</span>
                <span className="font-bold text-white bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                  K + Direção
                </span>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-white/50 leading-relaxed">
              Dica: Solte direção / K para descer do coping sem pulo. No mobile use o direcional
              touch e botões laterais.
            </div>
          </div>
        )}

        {/* Popup de Opções Gráficas (Compacto e Recolhível) */}
        {showSettings && (
          <div className="bg-black/75 backdrop-blur-md border border-white/15 rounded-lg p-3 text-white/90 text-xs shadow-2xl w-64 max-w-[90vw] animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
              <span className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-orange-400" />
                Opções Gráficas
              </span>
              <button
                onClick={() => setShowSettings(false)}
                className="text-white/60 hover:text-white p-0.5 rounded transition-colors"
                aria-label="Fechar opções"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={antialiasing}
                onChange={(e) => setAntialiasing(e.target.checked)}
                className="h-3.5 w-3.5 accent-orange-500 rounded cursor-pointer"
              />
              <span>Antialiasing (suavizar bordas)</span>
            </label>
          </div>
        )}

        {/* Mini barra de botões discretos: [ ? Controles ] [ Config ] [ FPS ] */}
        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 px-2 py-1 rounded-full shadow-lg">
          {/* Toggle Controles / Ajuda */}
          <button
            onClick={() => setShowControls((v) => !v)}
            title="Instruções de controles"
            aria-label="Instruções de controles"
            className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full transition-all ${
              showControls
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ajuda</span>
          </button>

          {/* Separador */}
          <span className="w-px h-3 bg-white/20" />

          {/* Toggle Opções Gráficas */}
          <button
            onClick={() => setShowSettings((v) => !v)}
            title="Opções gráficas"
            aria-label="Opções gráficas"
            className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full transition-all ${
              showSettings
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vídeo</span>
          </button>

          {/* Separador */}
          <span className="w-px h-3 bg-white/20" />

          {/* Contador FPS Compacto */}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold"
            title="Taxa de quadros por segundo"
          >
            <span className="text-white/50 text-[9px]">FPS</span>
            <span className="text-emerald-300 tabular-nums leading-none font-black">{fps}</span>
          </div>
        </div>
      </div>

      {/* Mobile touch controls */}
      <TouchControls />
    </div>
  )
}
