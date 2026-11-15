// DUSTLINE — input. Keyboard state, pointer-lock mouse look, and the
// ?shot= pose modes used for screenshots (start / buy / play / end).
// The game never reads keys anywhere else.

export function createInput(canvas, callbacks) {
  const keys = new Set();
  const state = {
    locked: false,
    lookDX: 0, lookDY: 0,
    mouseDown: false, mouseRight: false,
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (callbacks.onKey) callbacks.onKey(e.code, true);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (callbacks.onKey) callbacks.onKey(e.code, false);
  });
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (callbacks.onLock) callbacks.onLock(state.locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.lookDX += e.movementX;
    state.lookDY += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) state.mouseDown = true;
    if (e.button === 2) state.mouseRight = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.mouseDown = false;
    if (e.button === 2) state.mouseRight = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    state, keys,
    lock() { canvas.requestPointerLock(); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    // Camera-relative movement vector, world space, from WASD + arrows.
    moveVector(yaw) {
      let f = 0, s = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      return { x: fx * f + rx * s, z: fz * f + rz * s };
    },
    takeLook() {
      const dx = state.lookDX, dy = state.lookDY;
      state.lookDX = 0; state.lookDY = 0;
      return { dx, dy };
    },
    get down() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
  };
}

export function shotMode() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  const seed = parseInt(q.get('seed') || '1', 10) || 1;
  return { shot, seed };
}
