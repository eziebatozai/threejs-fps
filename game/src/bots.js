// DUSTLINE — bot brains. Bots are not scripted: each one picks a role at
// round start, walks the waypoint graph, holds angles, reacts to what it
// sees and hears, and plays the objective. Difficulty is honest — reaction
// time, aim error and burst discipline — never wallhacks: a bot only knows
// an enemy it can actually see, or a gunshot it heard.

import { WAYPOINTS, findPath, nearestWaypoint, losClear, siteAt } from './mapdata.js';
import { clamp, rng } from './config.js';

const ROLES_ATK = ['pushA', 'pushB', 'mid', 'flank'];
const ROLES_DEF = ['holdA', 'holdB', 'mid', 'roam'];
const ROLE_TARGET = {
  pushA: 7, pushB: 18, mid: 11, flank: 14,
  holdA: 3, holdB: 13, roam: 11,
};

export function makeBrain(bot, round, rand) {
  const roles = bot.team === 'atk' ? ROLES_ATK : ROLES_DEF;
  const role = roles[(bot.idx + round) % roles.length];
  return {
    role, state: 'advance', path: [], pathIdx: 0,
    holdUntil: 0, reactT: 0, targetId: null, lastSeen: null, lostT: 0,
    strafeDir: rand() < 0.5 ? -1 : 1, strafeT: 0, burstLeft: 0, burstPause: 0,
    aimErrYaw: 0, aimErrPitch: 0, investigate: null, repathT: 0,
    skill: 0.75 + rand() * 0.4, // reaction/aim multiplier; 1.0 is average
  };
}

// Is the segment a->b blocked by any live smoke cloud?
function smokeBlocks(smokes, a, b) {
  for (const s of smokes) {
    // Closest point on the segment to the smoke centre.
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const len2 = abx * abx + aby * aby + abz * abz;
    if (len2 < 1e-9) continue;
    let t = ((s.x - a.x) * abx + (s.y - a.y) * aby + (s.z - a.z) * abz) / len2;
    t = clamp(t, 0, 1);
    const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t;
    const d = Math.hypot(s.x - cx, s.y - cy, s.z - cz);
    if (d < s.radius) return true;
  }
  return false;
}

function eyeOf(e) { return { x: e.x, y: 1.55, z: e.z }; }

export function canSee(sim, bot, enemy) {
  if (!enemy.alive) return false;
  const dx = enemy.x - bot.x, dz = enemy.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 55) return false;
  if (!losClear(eyeOf(bot), eyeOf(enemy))) return false;
  if (smokeBlocks(sim.smokes, eyeOf(bot), eyeOf(enemy))) return false;
  return true;
}

function nearestVisibleEnemy(sim, bot) {
  let best = null, bd = Infinity;
  for (const e of sim.entities) {
    if (e.team === bot.team || !e.alive || e.id === bot.id) continue;
    if (!canSee(sim, bot, e)) continue;
    const d = Math.hypot(e.x - bot.x, e.z - bot.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best ? { enemy: best, dist: bd } : null;
}

function setPath(bot, toId) {
  const from = nearestWaypoint(bot.x, bot.z);
  bot.ai.path = findPath(from, toId);
  bot.ai.pathIdx = 0;
}

function followPath(bot, dt, speed) {
  const path = bot.ai.path;
  if (!path || bot.ai.pathIdx >= path.length) return { x: 0, z: 0, arrived: true };
  const wp = WAYPOINTS[path[bot.ai.pathIdx]];
  const dx = wp.x - bot.x, dz = wp.z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.9) { bot.ai.pathIdx += 1; return { x: 0, z: 0, arrived: bot.ai.pathIdx >= path.length }; }
  const s = Math.min(speed, d / Math.max(dt, 0.001));
  return { x: (dx / d) * s, z: (dz / d) * s, arrived: false };
}

function aimAt(bot, tx, tz, ty, err) {
  const dx = tx - bot.x, dz = tz - bot.z;
  const dy = ty - 1.55;
  const dist = Math.hypot(dx, dy, dz);
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.asin(clamp(dy / Math.max(dist, 0.01), -1, 1));
  bot.aimYaw = wantYaw + err.yaw;
  bot.aimPitch = wantPitch + err.pitch;
}

// One tick of brain. Writes bot.moveX/moveZ, bot.aimYaw/aimPitch,
// bot.firing, bot.ads, bot.use. sim applies the physics.
export function updateBot(sim, bot, dt, now) {
  const ai = bot.ai;
  const rand = sim.rand;
  bot.firing = false; bot.use = false; bot.ads = false;

  // --- perception ---------------------------------------------------------
  const seen = nearestVisibleEnemy(sim, bot);
  if (seen) {
    if (ai.targetId !== seen.enemy.id) {
      ai.targetId = seen.enemy.id;
      ai.reactT = (0.28 + rand() * 0.25) / ai.skill;
      ai.lastSeen = { x: seen.enemy.x, z: seen.enemy.z };
      ai.lostT = 0;
    } else {
      ai.lastSeen = { x: seen.enemy.x, z: seen.enemy.z };
      ai.lostT = 0;
    }
  } else if (ai.targetId !== null) {
    ai.lostT += dt;
    if (ai.lostT > 2.5) ai.targetId = null;
  }

  // Gunfire the bot hears becomes an investigation point.
  for (const ev of sim.events) {
    if (ev.t !== 'shot' || ev.by === bot.id) continue;
    const d = Math.hypot(ev.from[0] - bot.x, ev.from[2] - bot.z);
    if (d < 26 && ai.state !== 'combat' && !ai.investigate) {
      ai.investigate = { x: ev.from[0], z: ev.from[2] };
    }
  }

  // --- bomb roles ---------------------------------------------------------
  const bomb = sim.bomb;
  if (bot.team === 'atk' && bomb.state === 'carried' && bomb.carrierId === bot.id) {
    ai.state = 'plant';
  } else if (bot.team === 'def' && bomb.state === 'planted') {
    ai.state = 'defuse';
  } else if (ai.state === 'plant' || ai.state === 'defuse') {
    ai.state = 'advance';
  }

  // --- combat -------------------------------------------------------------
  if (ai.targetId !== null && seen) {
    ai.state = 'combat';
    const e = seen.enemy;
    const dist = seen.dist;
    const speed = Math.hypot(e.vx || 0, e.vz || 0);
    // Aim error shrinks the longer the bot tracks this target.
    const track = Math.min(1, (ai.reactT > 0 ? 0 : 1) + 0.5);
    const errBase = (0.010 + dist * 0.00035 + speed * 0.003) / ai.skill;
    ai.aimErrYaw = (rand() - 0.5) * 2 * errBase * (1.6 - track);
    ai.aimErrPitch = (rand() - 0.5) * 2 * errBase * (1.6 - track);
    aimAt(bot, e.x, e.z, 1.45, { yaw: ai.aimErrYaw, pitch: ai.aimErrPitch });
    // The body faces the target in combat, so the strafe basis below is
    // perpendicular to the line of fire.
    bot.yaw = bot.aimYaw;
    // Strafe: change direction every 0.7–1.6 s, never into a wall blindly.
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafeDir *= -1; ai.strafeT = 0.7 + rand() * 0.9; }
    const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
    const sx = -fz * ai.strafeDir, sz = fx * ai.strafeDir;
    bot.moveX = sx * 2.6; bot.moveZ = sz * 2.6;
    bot.ads = dist > 14;
    if (ai.reactT > 0) {
      ai.reactT -= dt;
    } else if (ai.burstPause > 0) {
      ai.burstPause -= dt;
    } else {
      if (ai.burstLeft <= 0) ai.burstLeft = bot.weapon.id === 'needle' || bot.weapon.id === 'p9' ? 1 : 4 + Math.floor(rand() * 3);
      bot.firing = true;
      ai.burstLeft -= 1;
      if (ai.burstLeft <= 0) ai.burstPause = 0.35 + rand() * 0.4;
    }
    return;
  }

  // --- objective states ---------------------------------------------------
  if (ai.state === 'plant') {
    const site = siteAt(bot.x, bot.z);
    if (site) {
      bot.use = true; // sim runs the plant timer
      bot.moveX = 0; bot.moveZ = 0;
      bot.aimYaw = bot.yaw;
      return;
    }
    const target = bot.plantSite || (bot.plantSite = rand() < 0.5 ? 'A' : 'B');
    const wpId = target === 'A' ? 7 : 18;
    if (ai.path.length === 0 || ai.path[ai.path.length - 1] !== wpId) setPath(bot, wpId);
    const mv = followPath(bot, dt, 4.4);
    bot.moveX = mv.x; bot.moveZ = mv.z;
    if (mv.x || mv.z) bot.yaw = Math.atan2(-mv.x, -mv.z);
    return;
  }

  if (ai.state === 'defuse') {
    const site = bomb.site;
    const dx = bomb.x - bot.x, dz = bomb.z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.6) {
      bot.use = true; // sim runs the defuse timer
      bot.moveX = 0; bot.moveZ = 0;
      return;
    }
    const wpId = site === 'A' ? 7 : 18;
    if (ai.path.length === 0 || ai.path[ai.path.length - 1] !== wpId) setPath(bot, wpId);
    const mv = followPath(bot, dt, 4.6);
    bot.moveX = mv.x; bot.moveZ = mv.z;
    if (mv.x || mv.z) bot.yaw = Math.atan2(-mv.x, -mv.z);
    return;
  }

  // --- investigate a heard shot -------------------------------------------
  if (ai.investigate) {
    const dx = ai.investigate.x - bot.x, dz = ai.investigate.z - bot.z;
    if (Math.hypot(dx, dz) < 1.5) {
      ai.investigate = null;
      ai.state = 'hold'; ai.holdUntil = now + 2.0;
    } else {
      const wpId = nearestWaypoint(ai.investigate.x, ai.investigate.z);
      if (ai.path.length === 0 || ai.path[ai.path.length - 1] !== wpId) setPath(bot, wpId);
      const mv = followPath(bot, dt, 4.4);
      bot.moveX = mv.x; bot.moveZ = mv.z;
      if (mv.x || mv.z) bot.yaw = Math.atan2(-mv.x, -mv.z);
      return;
    }
  }

  // --- role movement ------------------------------------------------------
  if (ai.state === 'hold') {
    bot.moveX = 0; bot.moveZ = 0;
    // Slow scan: sweep the yaw across the lane.
    bot.yaw += Math.sin(now * 0.5 + bot.idx) * dt * 0.35;
    bot.aimYaw = bot.yaw; bot.aimPitch = 0;
    if (now > ai.holdUntil) ai.state = 'advance';
    return;
  }

  const targetWp = ROLE_TARGET[ai.role] ?? 11;
  if (ai.path.length === 0 || ai.path[ai.path.length - 1] !== targetWp) setPath(bot, targetWp);
  const mv = followPath(bot, dt, 4.2);
  bot.moveX = mv.x; bot.moveZ = mv.z;
  if (mv.x || mv.z) {
    bot.yaw = Math.atan2(-mv.x, -mv.z);
    bot.aimYaw = bot.yaw; bot.aimPitch = 0;
  }
  if (mv.arrived) {
    if (bot.team === 'def' && (ai.role === 'holdA' || ai.role === 'holdB')) {
      ai.state = 'hold'; ai.holdUntil = now + 4 + rand() * 4;
    } else {
      // Attackers reaching their lane end hold the angle briefly, then re-push.
      ai.state = 'hold'; ai.holdUntil = now + 1.5 + rand() * 2;
      ai.path = [];
    }
  }
}
