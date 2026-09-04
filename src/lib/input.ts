export type TrickKey = 'space' | 'g' | 'k' | 'l'

export const inputState = {
  // Deslocamento na rampa (teclado + joystick analógico)
  // up / w = movimento crescente (direção que antes era D / Direita)
  // down / s = movimento decrescente (direção que antes era A / Esquerda)
  up: false,
  down: false,
  analogY: 0, // -1 (baixo) a 1 (cima)

  // Estados "pressionado agora" (held) para as teclas de manobra.
  space: false,
  g: false,
  k: false,
  l: false,
}

// Buffers de borda (press/down) consumidos pelo loop de jogo uma única vez.
const pressEdge: Record<TrickKey, boolean> = {
  space: false,
  g: false,
  k: false,
  l: false,
}

/** Marca que uma tecla de manobra acabou de ser pressionada (borda de descida). */
export const pressTrick = (key: TrickKey) => {
  pressEdge[key] = true
}

/** Marca que um botão mobile de manobra acabou de ser tocado. */
export const tapTrick = pressTrick

/**
 * Consome a borda de pressão de uma tecla de manobra (retorna true apenas uma
 * vez por toque). Usado para disparar manobras com edge-trigger.
 */
export const consumeTrick = (key: TrickKey): boolean => {
  if (pressEdge[key]) {
    pressEdge[key] = false
    return true
  }
  return false
}

const keyMap: Record<string, TrickKey | 'up' | 'down'> = {
  ' ': 'space',
  spacebar: 'space',
  g: 'g',
  k: 'k',
  l: 'l',
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
}

export const initKeyboardControls = () => {
  const handleKey = (e: KeyboardEvent, state: boolean) => {
    const key = e.key.toLowerCase()
    const mapped = keyMap[key]
    if (!mapped) return

    if (mapped === 'up') {
      inputState.up = state
    } else if (mapped === 'down') {
      inputState.down = state
    } else {
      const trick = mapped as TrickKey
      const wasHeld = inputState[trick]
      inputState[trick] = state
      // Borda de descida (primeiro keydown) dispara a manobra. Ignora o
      // auto-repeat do SO enquanto a tecla permanece pressionada.
      if (state && !wasHeld) pressEdge[trick] = true
    }
  }

  const downListener = (e: KeyboardEvent) => {
    // Evita scroll da página com espaço/setas.
    if ([' ', 'spacebar', 'arrowup', 'arrowdown', 'w', 's'].includes(e.key.toLowerCase())) {
      e.preventDefault()
    }
    handleKey(e, true)
  }
  const upListener = (e: KeyboardEvent) => handleKey(e, false)

  window.addEventListener('keydown', downListener)
  window.addEventListener('keyup', upListener)

  return () => {
    window.removeEventListener('keydown', downListener)
    window.removeEventListener('keyup', upListener)
  }
}
