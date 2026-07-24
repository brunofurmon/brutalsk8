export const inputState = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  // Valores analógicos do joystick (-1 a 1). São zero no teclado.
  analogX: 0, // -1 (esquerda) a 1 (direita)
  analogY: 0, // -1 (frente/cima) a 1 (trás/baixo)
}

export const initKeyboardControls = () => {
  const handleKey = (e: KeyboardEvent, state: boolean) => {
    const key = e.key.toLowerCase()
    if (key === 'w' || key === 'arrowup') inputState.w = state
    if (key === 'a' || key === 'arrowleft') inputState.a = state
    if (key === 's' || key === 'arrowdown') inputState.s = state
    if (key === 'd' || key === 'arrowright') inputState.d = state
    if (key === ' ' || key === 'spacebar') inputState.space = state
  }

  const downListener = (e: KeyboardEvent) => handleKey(e, true)
  const upListener = (e: KeyboardEvent) => handleKey(e, false)

  window.addEventListener('keydown', downListener)
  window.addEventListener('keyup', upListener)

  return () => {
    window.removeEventListener('keydown', downListener)
    window.removeEventListener('keyup', upListener)
  }
}
