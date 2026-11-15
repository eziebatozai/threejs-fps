// DUSTLINE — shared tuning. Pure data, no rendering here.
// A round-based tactical FPS: Vanguard (attackers, blue) vs Jackals (defenders, amber)
// on the Kestrel Yard container map. One file holds every number the sim,
// the bots and the HUD agree on, so a balance change is one edit.

export const WORLD = {
  // Playable rectangle, metres. The map is an industrial yard, longer than wide.
  minX: -30, maxX: 30, minZ: -20, maxZ: 20,
  eyeHeight: 1.62, crouchEye: 1.12, playerRadius: 0.38, playerHeight: 1.8,
  walkSpeed: 4.4, runSpeed: 5.6, crouchSpeed: 2.4, jumpSpeed: 5.2, gravity: 14,
};

export const TEAMS = {
  atk: { key: 'atk', name: 'Vanguard', color: 0x3f8cff, css: '#5aa2ff', spawn: 'atk' },
  def: { key: 'def', name: 'Jackals', color: 0xffa22e, css: '#ffb347', spawn: 'def' },
};

// Weapons. damage is chest damage at close range; headMul multiplies it.
// spread is base radians of cone half-angle; bloom grows it while firing.
// recoil is radians of pitch kick per shot. adsMul shrinks spread while aiming.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', slot: 2, price: 0, auto: false,
    damage: 34, headMul: 3.0, rpm: 320, mag: 15, reserve: 60,
    spread: 0.011, moveSpread: 0.020, bloom: 0.004, recoil: 0.011, adsMul: 0.55,
    range: 60, reloadTime: 1.5, tracer: 0xffe08a,
  },
  hornet: {
    id: 'hornet', name: 'KS-9 Hornet', slot: 1, price: 1500, auto: true,
    damage: 26, headMul: 3.0, rpm: 780, mag: 32, reserve: 96,
    spread: 0.016, moveSpread: 0.026, bloom: 0.005, recoil: 0.009, adsMul: 0.5,
    range: 55, reloadTime: 2.1, tracer: 0xffd27a,
  },
  longbow: {
    id: 'longbow', name: 'AR-7 Longbow', slot: 1, price: 2700, auto: true,
    damage: 33, headMul: 3.5, rpm: 600, mag: 30, reserve: 90,
    spread: 0.009, moveSpread: 0.018, bloom: 0.004, recoil: 0.013, adsMul: 0.45,
    range: 90, reloadTime: 2.4, tracer: 0xfff2b0,
  },
  needle: {
    id: 'needle', name: 'DMR Needle', slot: 1, price: 4000, auto: false,
    damage: 88, headMul: 3.0, rpm: 75, mag: 8, reserve: 24,
    spread: 0.002, moveSpread: 0.012, bloom: 0.002, recoil: 0.045, adsMul: 0.25,
    range: 120, reloadTime: 3.0, tracer: 0xcfe8ff,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, fuse: 2.2, radius: 9, maxDmg: 130, minDmg: 18 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, fuse: 1.6, radius: 4.5, life: 16 },
};

export const ECONOMY = {
  start: 800, kill: 300, roundWin: 325, roundLoss: 150, plant: 300, defuse: 300,
};

export const ROUND = {
  buyTime: 12, duration: 100, plantTime: 3.0, defuseTime: 5.0, bombTime: 40,
  winScore: 5, maxRounds: 9, postTime: 5,
};

// Bot callsigns. The player is "You" on Vanguard; allies and enemies draw names here.
export const CALLSIGNS = {
  atk: ['Heron', 'Moss', 'Vega'],
  def: ['Rook', 'Sable', 'Dune', 'Ferro'],
};

export const SITES = {
  A: { key: 'A', name: 'Site A — Warehouse', x: -19, z: -12, r: 5 },
  B: { key: 'B', name: 'Site B — Gantry', x: 22, z: 12, r: 5 },
};

// Deterministic RNG (mulberry32) so shot poses and bot behaviour are repeatable.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
