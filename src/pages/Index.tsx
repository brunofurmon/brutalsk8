import { useEffect, useState } from 'react'
import { GameCanvas } from '@/components/GameCanvas'
import { TouchControls } from '@/components/TouchControls'
import { initKeyboardControls } from '@/lib/input'

export default function Index() {
  const [flips, setFlips] = useState(0)

  useEffect(() => {
    const cleanup = initKeyboardControls()
    return cleanup
  }, [])

  return (
    <div className="relative w-full h-screen overflow-hidden font-mono select-none">
      <GameCanvas onJump={() => setFlips((f) => f + 1)} />

      {/* HUD overlay */}
      <div className="absolute top-0 left-0 right-0 p-6 z-10 pointer-events-none flex flex-col sm:flex-row justify-between items-start">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter drop-shadow-md">
            BRUTAL SKATE
          </h1>
          <p className="text-orange-300 font-bold tracking-widest text-xs mt-1 drop-shadow">
            ENDLESS CONCRETE
          </p>
          <div className="mt-3 text-white font-bold text-sm tracking-wider flex items-center bg-black/40 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded w-max">
            <span className="text-pink-500 mr-2 uppercase">FLIPS:</span>
            <span className="text-2xl leading-none">{flips}</span>
          </div>
        </div>

        <div className="hidden md:flex flex-col items-end text-right mt-4 sm:mt-0">
          <div className="bg-black/40 backdrop-blur-sm border border-white/10 p-4 rounded text-white/90 text-sm">
            <p className="mb-2">
              <span className="font-black text-white bg-white/20 px-2 py-1 rounded mr-2">WASD</span>{' '}
              OU{' '}
              <span className="font-black text-white bg-white/20 px-2 py-1 rounded ml-2">
                SETAS
              </span>{' '}
              <span className="ml-2">PARA MOVER</span>
            </p>
            <p>
              <span className="font-black text-white bg-white/20 px-2 py-1 rounded mr-2">
                ESPAÇO
              </span>{' '}
              <span className="ml-2">PARA PULAR</span>
            </p>
          </div>
        </div>
      </div>

      {/* Mobile touch controls */}
      <TouchControls />
    </div>
  )
}
