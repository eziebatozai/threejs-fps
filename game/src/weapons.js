// DUSTLINE — weapons. A weapon is a definition from config.js plus runtime
// state (magazine, reserve, timers, bloom). All firing math lives here so
// the sim stays thin: it asks "can this entity shoot now?" and "what cone
// does the shot leave in?".

import { WEAPONS, GRENADES, clamp } from './config.js';

export function makeWeapon(id) {
  const def = WEAPONS[id];
  return {
    id, mag: def.mag, reserve: def.reserve,
    cooldown: 0, reloadT: 0, bloom: 0, burst: 0,
  };
}

export function weaponDef(w) { return WEAPONS[w.id]; }

// Current spread cone (radians, half-angle) for an entity.
export function currentSpread(w, moving, airborne, crouching, ads, scoped) {
  const def = WEAPONS[w.id];
  let s = def.spread + w.bloom;
  if (moving) s += def.moveSpread;
  if (airborne) s += 0.03;
  if (crouching) s *= 0.75;
  if (ads) s *= def.adsMul;
  if (scoped && w.id === 'needle') s *= 0.6;
  return s;
}

export function canFire(w) {
  return w.mag > 0 && w.cooldown <= 0 && w.reloadT <= 0;
}

// Consume one round. Returns the definition, or null if it cannot fire.
export function fire(w) {
  if (!canFire(w)) return null;
  const def = WEAPONS[w.id];
  w.mag -= 1;
  w.cooldown = 60 / def.rpm;
  w.bloom = Math.min(0.05, w.bloom + def.bloom);
  w.burst += 1;
  return def;
}

export function startReload(w) {
  const def = WEAPONS[w.id];
  if (w.reloadT > 0 || w.mag >= def.mag || w.reserve <= 0) return false;
  w.reloadT = def.reloadTime;
  return true;
}

export function finishReload(w) {
  const def = WEAPONS[w.id];
  const need = def.mag - w.mag;
  const take = Math.min(need, w.reserve);
  w.mag += take;
  w.reserve -= take;
  w.reloadT = 0;
  w.bloom = 0;
}

// Per-tick decay. dt in seconds.
export function tickWeapon(w, dt) {
  if (w.cooldown > 0) w.cooldown -= dt;
  if (w.reloadT > 0) {
    w.reloadT -= dt;
    if (w.reloadT <= 0) finishReload(w);
  }
  w.bloom = Math.max(0, w.bloom - dt * 0.03);
  if (w.cooldown <= 0) w.burst = 0;
}

// Damage at range: full to 60% of range, then falls to 55% at max range.
export function damageAt(def, dist, head) {
  const fall = dist > def.range * 0.6
    ? 1 - 0.45 * clamp((dist - def.range * 0.6) / (def.range * 0.4), 0, 1)
    : 1;
  const base = def.damage * fall;
  return head ? base * def.headMul : base;
}

export function makeGrenades() {
  return { frag: 0, smoke: 0 };
}

export function grenadeDef(kind) { return GRENADES[kind]; }
