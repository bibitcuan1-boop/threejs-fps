// input.js — keyboard + mouse, pointer lock, and the per-frame intent the
// simulation reads. The sim never touches DOM events directly.
export function createInput() {
  return {
    keys: new Set(),
    mouseDX: 0, mouseDY: 0,
    mouseDown: false,
    locked: false,
    // edge-triggered actions consumed by the sim each step
    pressed: new Set(),
  };
}

export function bindInput(input, canvas, onLockChange) {
  const el = canvas;
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.mouseDX += e.movementX;
    input.mouseDY += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && input.locked) input.mouseDown = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === el;
    if (onLockChange) onLockChange(input.locked);
  });
  document.addEventListener('pointerlockerror', () => { input.locked = false; });
}

export function requestLock(canvas) {
  try { canvas.requestPointerLock(); } catch { /* shot mode: no lock needed */ }
}

export function endStep(input) {
  input.mouseDX = 0;
  input.mouseDY = 0;
  input.pressed.clear();
}
