import { inputState } from '@/lib/input'
import { cn } from '@/lib/utils'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'

export function TouchControls() {
  const handleTouch =
    (key: keyof typeof inputState, state: boolean) => (e: React.SyntheticEvent) => {
      e.preventDefault()
      inputState[key] = state
    }

  const ControlButton = ({
    icon: Icon,
    action,
    className,
  }: {
    icon: any
    action: keyof typeof inputState
    className?: string
  }) => (
    <button
      className={cn(
        'bg-white/20 active:bg-white/40 backdrop-blur-sm p-4 rounded-lg flex items-center justify-center border border-white/10 touch-none',
        className,
      )}
      onPointerDown={handleTouch(action, true)}
      onPointerUp={handleTouch(action, false)}
      onPointerLeave={handleTouch(action, false)}
    >
      <Icon className="w-8 h-8 text-white" />
    </button>
  )

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex items-end justify-between p-6 md:hidden">
      {/* D-Pad */}
      <div className="grid grid-cols-3 gap-2 pointer-events-auto w-48 h-48">
        <div />
        <ControlButton icon={ArrowUp} action="w" />
        <div />
        <ControlButton icon={ArrowLeft} action="a" />
        <ControlButton icon={ArrowDown} action="s" />
        <ControlButton icon={ArrowRight} action="d" />
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
