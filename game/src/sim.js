// DUSTLINE — fixed-step simulation. Pure logic, no three.js, no DOM:
// movement + collision, hitscan gunfire, grenades, the bomb, rounds and
// the economy. The renderer only reads this state; the sim never reads the
// renderer. One step is 1/60 s; the main loop feeds it fixed steps.

import { WORLD, WEAPONS, GRENADES, ECONOMY, ROUND, CALLSIGNS, SITES, clamp, rng } from './config.js';
import { SOLIDS, SPAWNS, collideCircle, groundHeight, raySolids, rayBox, siteAt } from './mapdata.js';
import { makeWeapon, currentSpread, fire as fireWeapon, startReload, tickWeapon, damageAt, makeGrenades } from './weapons.js';
import { makeBrain, updateBot } from './bots.js';

export const STEP = 1 / 60;

function eyePos(e) {
  return { x: e.x, y: e.y + (e.crouch ? WORLD.crouchEye : WORLD.eyeHeight), z: e.z };
}

function bodyHeight(e) { return e.crouch ? 1.3 : WORLD.playerHeight; }
function headY(e) { return e.y + (e.crouch ? 1.12 : 1.55); }

export function makeEntity(id, name, team, isPlayer, idx, spawn) {
  return {
    id, name, team, isPlayer, idx,
    x: spawn.x, z: spawn.z, y: 0, vx: 0, vy: 0, vz: 0,
    yaw: spawn.yaw, pitch: 0, hp: 100, alive: true,
    weapon: makeWeapon('p9'), primary: null, grenades: makeGrenades(),
    money: ECONOMY.start, kills: 0, deaths: 0,
    moveX: 0, moveZ: 0, firing: false, ads: false, crouch: false, walk: false,
    use: false, reloadKey: false, slot: 2, grenadeKey: null, jump: false,
    aimYaw: spawn.yaw, aimPitch: 0, ai: null, plantSite: null,
    grounded: true, stepT: 0, hurtT: 0, spawnYaw: spawn.yaw,
  };
}

export function createSim(seed = 1337) {
  const sim = {
    time: 0, phase: 'buy', phaseT: ROUND.buyTime,
    round: 1, score: { atk: 0, def: 0 },
    entities: [], bomb: { state: 'carried', carrierId: 'p0', x: 0, z: 0, site: null, timer: 0, plantT: 0, defuseT: 0, defuserId: null },
    grenades: [], smokes: [], events: [], rand: rng(seed), seed,
    roundWinner: null, roundReason: null, matchWinner: null, lastBeep: -1,
  };
  setupRound(sim, true);
  return sim;
}

function setupRound(sim, first = false) {
  sim.phase = 'buy';
  sim.phaseT = ROUND.buyTime;
  sim.roundWinner = null; sim.roundReason = null;
  sim.grenades = []; sim.smokes = [];
  sim.bomb = { state: 'carried', carrierId: 'p0', x: 0, z: 0, site: null, timer: 0, plantT: 0, defuseT: 0, defuserId: null };
  const ents = [];
  // Player first, then allies, then enemies.
  const pSpawn = SPAWNS.atk[0];
  const player = makeEntity('p0', 'You', 'atk', true, 0, pSpawn);
  if (!first) {
    // Keep the player's loadout and money between rounds; refill reserves.
    const prev = sim.entities.find((e) => e.isPlayer);
    if (prev) {
      player.money = prev.money;
      player.primary = prev.primary;
      player.weapon = prev.primary ? makeWeapon(prev.primary) : makeWeapon('p9');
      player.grenades = { frag: 0, smoke: 0 };
      player.kills = prev.kills; player.deaths = prev.deaths;
    }
  }
  player.weapon = player.primary ? makeWeapon(player.primary) : makeWeapon('p9');
  if (player.primary) { player.primaryWeapon = player.weapon; player.slot = 1; }
  ents.push(player);
  for (let i = 0; i < 3; i++) {
    const b = makeEntity('a' + (i + 1), CALLSIGNS.atk[i], 'atk', false, i + 1, SPAWNS.atk[i + 1]);
    b.ai = makeBrain(b, sim.round, sim.rand);
    armBot(sim, b);
    ents.push(b);
  }
  for (let i = 0; i < 4; i++) {
    const b = makeEntity('d' + (i + 1), CALLSIGNS.def[i], 'def', false, i + 1, SPAWNS.def[i]);
    b.ai = makeBrain(b, sim.round, sim.rand);
    armBot(sim, b);
    ents.push(b);
  }
  sim.entities = ents;
}

function armBot(sim, bot) {
  const r = sim.rand();
  const id = sim.round === 1
    ? (r < 0.5 ? 'hornet' : 'p9')
    : (r < 0.55 ? 'longbow' : r < 0.8 ? 'hornet' : 'needle');
  bot.primary = id === 'p9' ? null : id;
  bot.weapon = makeWeapon(id);
}

// --- shooting -------------------------------------------------------------

function shoot(sim, e) {
  const def = fireWeapon(e.weapon);
  if (!def) {
    // Empty click, throttled so holding the trigger does not spam it.
    if (e.weapon.mag === 0 && e.weapon.reloadT <= 0 && e.weapon.cooldown <= 0) {
      sim.events.push({ t: 'dry', by: e.id });
      e.weapon.cooldown = 0.3;
    }
    return;
  }
  const eye = eyePos(e);
  // Bots aim with aimYaw/aimPitch (their brain), the player with yaw/pitch.
  const yaw = e.isPlayer ? e.yaw : e.aimYaw;
  const pitch = e.isPlayer ? e.pitch : e.aimPitch;
  const moving = Math.hypot(e.vx, e.vz) > 0.6;
  const spread = currentSpread(e.weapon, moving, !e.grounded, e.crouch, e.ads, false);
  // Random point in the spread disc.
  const a = sim.rand() * Math.PI * 2;
  const r = spread * Math.sqrt(sim.rand());
  const cy = Math.cos(pitch), sy = Math.sin(pitch);
  const sx = -Math.sin(yaw), sz = -Math.cos(yaw);
  // Camera basis: forward, right (right = (cos yaw, 0, -sin yaw)).
  const fx = sx * cy, fy = sy, fz = sz * cy;
  const rX = Math.cos(yaw), rZ = -Math.sin(yaw);
  const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
  let dx = fx + rX * ox;
  let dy = fy + oy;
  let dz = fz + rZ * ox;
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl; dy /= dl; dz /= dl;
  const dir = { x: dx, y: dy, z: dz };
  const from = { x: eye.x + fx * 0.5, y: eye.y - 0.08, z: eye.z + fz * 0.5 };
  let bestT = raySolids(from, dir, def.range);
  let hitEnt = null, hitHead = false;
  for (const o of sim.entities) {
    if (o.id === e.id || !o.alive || o.team === e.team) continue;
    // Head sphere first.
    const hx = o.x - from.x, hy = headY(o) - from.y, hz = o.z - from.z;
    const proj = hx * dx + hy * dy + hz * dz;
    let headT = Infinity;
    if (proj > 0) {
      const cx = from.x + dx * proj, cy2 = from.y + dy * proj, cz = from.z + dz * proj;
      const d2 = (o.x - cx) ** 2 + (headY(o) - cy2) ** 2 + (o.z - cz) ** 2;
      if (d2 < 0.26 * 0.26) headT = proj - Math.sqrt(Math.max(0, 0.26 * 0.26 - d2));
    }
    const bodyT = rayBox(from, dir,
      { x: o.x - 0.38, y: o.y, z: o.z - 0.38 },
      { x: o.x + 0.38, y: o.y + bodyHeight(o), z: o.z + 0.38 });
    const t = Math.min(headT, bodyT);
    if (t < bestT) { bestT = t; hitEnt = o; hitHead = headT <= bodyT; }
  }
  const to = { x: from.x + dx * bestT, y: from.y + dy * bestT, z: from.z + dz * bestT };
  sim.events.push({ t: 'shot', by: e.id, weapon: def.id, from: [from.x, from.y, from.z], to: [to.x, to.y, to.z], hit: !!hitEnt, head: hitHead, dist: bestT });
  if (hitEnt) {
    const dmg = damageAt(def, bestT, hitHead);
    hurt(sim, hitEnt, dmg, e);
  }
  // Recoil kicks the shooter's pitch up; the player feels it, bots absorb it.
  if (e.isPlayer) {
    e.pitch = Math.min(1.2, e.pitch + def.recoil * (e.ads ? 0.7 : 1));
    e.yaw += (sim.rand() - 0.5) * def.recoil * 0.4;
  }
}

function hurt(sim, victim, dmg, attacker) {
  if (!victim.alive) return;
  victim.hp -= dmg;
  victim.hurtT = 0.25;
  // Taking damage interrupts a defuse in progress.
  if (sim.bomb.defuserId === victim.id) { sim.bomb.defuserId = null; sim.bomb.defuseT = 0; }
  sim.events.push({ t: 'hurt', victim: victim.id, by: attacker ? attacker.id : null, dmg: Math.round(dmg), hp: Math.max(0, Math.round(victim.hp)) });
  if (attacker && attacker.isPlayer) sim.events.push({ t: 'hitmark', head: false });
  if (victim.hp <= 0) {
    victim.alive = false;
    victim.deaths += 1;
    if (attacker) attacker.kills += 1;
    sim.events.push({ t: 'kill', by: attacker ? attacker.id : null, victim: victim.id, head: false });
    if (attacker) attacker.money += ECONOMY.kill;
    if (sim.bomb.carrierId === victim.id && sim.bomb.state === 'carried') {
      sim.bomb.state = 'dropped';
      sim.bomb.x = victim.x; sim.bomb.z = victim.z;
      sim.events.push({ t: 'bombDrop', x: victim.x, z: victim.z });
    }
  }
}

// --- grenades ---------------------------------------------------------------

function throwGrenade(sim, e, kind) {
  if (e.grenades[kind] <= 0) return false;
  e.grenades[kind] -= 1;
  const eye = eyePos(e);
  const cy = Math.cos(e.pitch), sy = Math.sin(e.pitch);
  const fx = -Math.sin(e.yaw) * cy, fy = sy, fz = -Math.cos(e.yaw) * cy;
  sim.grenadeSeq = (sim.grenadeSeq || 0) + 1;
  sim.grenades.push({
    id: 'g' + sim.grenadeSeq, kind, by: e.id,
    x: eye.x + fx * 0.6, y: eye.y, z: eye.z + fz * 0.6,
    vx: fx * 13, vy: fy * 13 + 3.2, vz: fz * 13,
    fuse: GRENADES[kind].fuse,
  });
  sim.events.push({ t: 'grenade', by: e.id, kind });
  return true;
}

function updateGrenades(sim, dt) {
  for (const g of sim.grenades) {
    g.fuse -= dt;
    g.vy -= 12 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    const gh = groundHeight(g.x, g.z);
    if (g.y < gh + 0.12) { g.y = gh + 0.12; g.vy = Math.abs(g.vy) > 1 ? -g.vy * 0.35 : 0; g.vx *= 0.6; g.vz *= 0.6; }
    const c = collideCircle(g.x, g.z, 0.15, g.y);
    if (c.x !== g.x || c.z !== g.z) { g.x = c.x; g.z = c.z; g.vx *= -0.3; g.vz *= -0.3; }
    if (g.fuse > 0) continue;
    g.dead = true;
    if (g.kind === 'frag') {
      const def = GRENADES.frag;
      sim.events.push({ t: 'explode', x: g.x, y: g.y, z: g.z, by: g.by });
      for (const e of sim.entities) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - g.x, e.z - g.z, (e.y + 1 - g.y));
        if (d > def.radius) continue;
        const blocked = !(() => {
          const a = { x: g.x, y: g.y + 0.2, z: g.z };
          const b = { x: e.x, y: e.y + 1, z: e.z };
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const len = Math.hypot(dx, dy, dz);
          return raySolids(a, { x: dx / len, y: dy / len, z: dz / len }, len - 0.1) >= len - 0.1;
        })();
        const fall = 1 - (d / def.radius) * 0.85;
        hurt(sim, e, Math.max(def.minDmg, def.maxDmg * fall) * (blocked ? 0.5 : 1), sim.entities.find((x) => x.id === g.by) || null);
      }
    } else {
      sim.smokes.push({ x: g.x, y: g.y + 0.6, z: g.z, radius: GRENADES.smoke.radius, life: GRENADES.smoke.life });
      sim.events.push({ t: 'smoke', x: g.x, y: g.y, z: g.z });
    }
  }
  sim.grenades = sim.grenades.filter((g) => !g.dead);
  for (const s of sim.smokes) s.life -= dt;
  sim.smokes = sim.smokes.filter((s) => s.life > 0);
}

// --- movement ---------------------------------------------------------------

function moveEntity(sim, e, dt) {
  const speed = e.crouch ? WORLD.crouchSpeed : e.walk ? 2.6 : WORLD.walkSpeed;
  const wantX = e.moveX, wantZ = e.moveZ;
  const wl = Math.hypot(wantX, wantZ);
  let tx = 0, tz = 0;
  if (wl > 0.01) {
    const s = Math.min(speed, wl);
    tx = (wantX / wl) * s; tz = (wantZ / wl) * s;
  }
  const accel = e.grounded ? 14 : 4;
  e.vx += clamp(tx - e.vx, -accel * dt, accel * dt);
  e.vz += clamp(tz - e.vz, -accel * dt, accel * dt);
  e.x += e.vx * dt;
  e.z += e.vz * dt;
  e.x = clamp(e.x, -29.4, 29.4);
  e.z = clamp(e.z, -19.4, 19.4);
  const c = collideCircle(e.x, e.z, WORLD.playerRadius, e.y);
  e.x = c.x; e.z = c.z;
  // Gravity / jumping.
  e.vy -= WORLD.gravity * dt;
  e.y += e.vy * dt;
  const gh = groundHeight(e.x, e.z);
  if (e.y <= gh) { e.y = gh; e.vy = 0; e.grounded = true; }
  else e.grounded = false;
  // Footstep sounds are emitted by the renderer from distance travelled.
  e.stepT -= Math.hypot(e.vx, e.vz) * dt;
}

// --- buying -----------------------------------------------------------------

export function buyItem(sim, e, kind, id) {
  if (sim.phase !== 'buy') return false;
  if (kind === 'weapon') {
    const def = WEAPONS[id];
    if (!def || def.price === 0 || e.money < def.price) return false;
    e.money -= def.price;
    e.primary = id;
    e.weapon = makeWeapon(id);
    e.primaryWeapon = e.weapon;
    e.slot = 1;
    sim.events.push({ t: 'buy', by: e.id, what: def.name });
    return true;
  }
  if (kind === 'grenade') {
    const def = GRENADES[id];
    if (!def || e.money < def.price || e.grenades[id] >= 1) return false;
    e.money -= def.price;
    e.grenades[id] += 1;
    sim.events.push({ t: 'buy', by: e.id, what: def.name });
    return true;
  }
  return false;
}

// --- round flow ---------------------------------------------------------------

function teamAlive(sim, team) {
  return sim.entities.some((e) => e.team === team && e.alive);
}

function endRound(sim, winner, reason) {
  if (sim.phase === 'over' || sim.phase === 'match') return;
  sim.phase = 'over';
  sim.phaseT = ROUND.postTime;
  sim.roundWinner = winner;
  sim.roundReason = reason;
  sim.score[winner] += 1;
  for (const e of sim.entities) {
    e.money += e.team === winner ? ECONOMY.roundWin : ECONOMY.roundLoss;
  }
  sim.events.push({ t: 'roundEnd', winner, reason, score: { ...sim.score } });
  if (sim.score[winner] >= ROUND.winScore || sim.round >= ROUND.maxRounds) {
    sim.matchWinner = sim.score.atk > sim.score.def ? 'atk' : sim.score.def > sim.score.atk ? 'def' : (winner === 'atk' ? 'atk' : 'def');
  }
}

function nextRound(sim) {
  if (sim.matchWinner) { sim.phase = 'match'; sim.phaseT = 0; return; }
  sim.round += 1;
  setupRound(sim);
  sim.events.push({ t: 'roundStart', round: sim.round });
}

// --- main step ------------------------------------------------------------------

export function simStep(sim, dt, input) {
  sim.time += dt;
  sim.events.length = 0;
  const player = sim.entities[0];

  if (sim.phase === 'match') return;

  if (sim.phase === 'buy') {
    if (input && input.buy) buyItem(sim, player, input.buy.kind, input.buy.id);
    if (input && input.slot) player.slot = input.slot;
    sim.phaseT -= dt;
    if (sim.phaseT <= 0) {
      sim.phase = 'live';
      sim.phaseT = ROUND.duration;
      sim.events.push({ t: 'roundStart', round: sim.round });
    }
    return;
  }

  if (sim.phase === 'over') {
    sim.phaseT -= dt;
    if (sim.phaseT <= 0) nextRound(sim);
    return;
  }

  // --- live phase ---
  sim.phaseT -= dt;

  // Player input -> entity intent.
  if (input && player.alive) {
    player.moveX = input.moveX || 0;
    player.moveZ = input.moveZ || 0;
    player.firing = !!input.fire;
    player.ads = !!input.ads;
    player.crouch = !!input.crouch;
    player.walk = !!input.walk;
    player.use = !!input.use;
    if (input.jump && player.grounded) { player.vy = WORLD.jumpSpeed; player.grounded = false; }
    if (input.reload) startReload(player.weapon);
    if (input.slot) {
      // Switching restores the stored weapon object, so magazines survive.
      player.slot = input.slot;
      if (input.slot === 1 && player.primary) player.weapon = player.primaryWeapon || makeWeapon(player.primary);
      else if (input.slot === 2) player.weapon = player.sideWeapon || makeWeapon('p9');
    }
    if (input.grenade) throwGrenade(sim, player, input.grenade);
    // Stash the live weapon objects so switching preserves magazines.
    if (player.slot === 1 && player.primary) player.primaryWeapon = player.weapon;
    if (player.slot === 2) player.sideWeapon = player.weapon;
  }

  // Bots think, then everyone moves.
  for (const e of sim.entities) {
    if (e.isPlayer || !e.alive) continue;
    updateBot(sim, e, dt, sim.time);
    // Bots reload on their own when the magazine runs dry.
    if (e.weapon.mag === 0 && e.weapon.reloadT <= 0) startReload(e.weapon);
    // updateBot owns the bot's yaw (aimYaw is its firing direction).
    if (e.firing) shoot(sim, e);
  }
  if (player.alive && player.firing) shoot(sim, player);
  if (player.alive && player.use) {
    // Planting / defusing handled below; use is consumed there.
  }

  for (const e of sim.entities) {
    if (!e.alive) continue;
    tickWeapon(e.weapon, dt);
    moveEntity(sim, e, dt);
    if (e.hurtT > 0) e.hurtT -= dt;
  }

  updateGrenades(sim, dt);

  // Bomb pickup.
  if (sim.bomb.state === 'dropped') {
    for (const e of sim.entities) {
      if (!e.alive || e.team !== 'atk') continue;
      if (Math.hypot(e.x - sim.bomb.x, e.z - sim.bomb.z) < 1.3) {
        sim.bomb.state = 'carried';
        sim.bomb.carrierId = e.id;
        sim.events.push({ t: 'bombPickup', by: e.id });
        break;
      }
    }
  }

  // Plant / defuse progress.
  const bomb = sim.bomb;
  if (bomb.state === 'carried') {
    const carrier = sim.entities.find((e) => e.id === bomb.carrierId);
    if (carrier && carrier.alive && carrier.use) {
      const site = siteAt(carrier.x, carrier.z);
      if (site) {
        bomb.plantT += dt;
        const sec = Math.floor(bomb.plantT);
        if (sec !== sim.lastBeep) { sim.lastBeep = sec; sim.events.push({ t: 'beep' }); }
        if (bomb.plantT >= ROUND.plantTime) {
          bomb.state = 'planted';
          bomb.site = site;
          bomb.x = carrier.x; bomb.z = carrier.z;
          bomb.timer = ROUND.bombTime;
          bomb.plantT = 0;
          carrier.money += ECONOMY.plant;
          sim.events.push({ t: 'plant', by: carrier.id, site });
        }
      } else bomb.plantT = 0;
    } else bomb.plantT = 0;
  } else if (bomb.state === 'planted') {
    bomb.timer -= dt;
    const sec = Math.ceil(bomb.timer);
    if (sec <= 10 && sec !== sim.lastBeep) { sim.lastBeep = sec; sim.events.push({ t: 'beep' }); }
    // Defuse attempt by any defender standing on the bomb, holding use.
    let defuser = null;
    for (const e of sim.entities) {
      if (!e.alive || e.team !== 'def' || !e.use) continue;
      if (Math.hypot(e.x - bomb.x, e.z - bomb.z) < 1.6) { defuser = e; break; }
    }
    if (defuser) {
      if (bomb.defuserId !== defuser.id) { bomb.defuserId = defuser.id; bomb.defuseT = 0; }
      bomb.defuseT += dt;
      if (bomb.defuseT >= ROUND.defuseTime) {
        defuser.money += ECONOMY.defuse;
        sim.events.push({ t: 'defuse', by: defuser.id });
        endRound(sim, 'def', 'defused');
        return;
      }
    } else { bomb.defuserId = null; bomb.defuseT = 0; }
    if (bomb.timer <= 0) {
      sim.events.push({ t: 'explode', x: bomb.x, y: 0.6, z: bomb.z, by: bomb.carrierId });
      // Blast hurts everyone near the site.
      for (const e of sim.entities) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - bomb.x, e.z - bomb.z);
        if (d < 8) hurt(sim, e, 200, null);
      }
      endRound(sim, 'atk', 'detonation');
      return;
    }
  }

  // Round end by elimination / time.
  const atkAlive = teamAlive(sim, 'atk');
  const defAlive = teamAlive(sim, 'def');
  if (!atkAlive && !defAlive) endRound(sim, 'def', 'elimination');
  else if (!atkAlive) endRound(sim, bomb.state === 'planted' ? 'atk' : 'def', 'elimination');
  else if (!defAlive) endRound(sim, 'atk', 'elimination');
  else if (sim.phaseT <= 0) endRound(sim, bomb.state === 'planted' ? 'atk' : 'def', 'time');
}
