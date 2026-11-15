// Kestrel Yard — map data and pure geometry helpers. No three.js here:
// the sim, the bots and the renderer all read the same boxes, so what you
// see is exactly what you collide with and shoot through.
//
// Layout (x east, z south, metres). Three lanes:
//   north lane  (z -16..-8):  containers, Site A in the warehouse corner
//   mid  (z -8..8):          open yard, crates, the gantry platform
//   south lane (z 8..16):    containers, Site B by the gantry
// Attackers spawn west (-27), defenders east (+27).

import { SITES } from './config.js';

// Every solid is an axis-aligned box: {x, z, hw, hd, h, kind, color}.
// hw/hd are half extents in x/z, h is height. kind: 'wall' | 'box' | 'crate'
// | 'platform' (walkable top) | 'ramp' (walkable slope, not a collider).
export const SOLIDS = [
  // Perimeter walls.
  { x: 0, z: -21.5, hw: 32, hd: 1.5, h: 5.5, kind: 'wall', color: 0x5a5f6b },
  { x: 0, z: 21.5, hw: 32, hd: 1.5, h: 5.5, kind: 'wall', color: 0x5a5f6b },
  { x: -31.5, z: 0, hw: 1.5, hd: 23, h: 5.5, kind: 'wall', color: 0x5a5f6b },
  { x: 31.5, z: 0, hw: 1.5, hd: 23, h: 5.5, kind: 'wall', color: 0x5a5f6b },
  // North lane containers (rust red / olive). The middle two are shorter,
  // leaving a centre gap (x -2.5..2.5) so the north lane is reachable
  // from mid — a continuous row would seal the lane off entirely.
  { x: -18, z: -14, hw: 6, hd: 1.3, h: 2.6, kind: 'box', color: 0x9a4a32 },
  { x: -6, z: -14, hw: 3.5, hd: 1.3, h: 2.6, kind: 'box', color: 0x6b7248 },
  { x: 6, z: -14, hw: 3.5, hd: 1.3, h: 2.6, kind: 'box', color: 0x2f6f7a },
  { x: 18, z: -14, hw: 6, hd: 1.3, h: 2.6, kind: 'box', color: 0x9a4a32 },
  { x: 12, z: -10.5, hw: 1.3, hd: 3.2, h: 2.6, kind: 'box', color: 0x6b7248 },
  // Warehouse block guarding Site A. (A second box used to stand at
  // (-24,-4); its north face lay exactly on the attackers' z=0 exit lane
  // and collideCircle shoved every attacker back to x=-25.6 forever.
  // Deleted rather than moved — one block guards the site well enough.)
  { x: -24, z: -12, hw: 4, hd: 4, h: 5.2, kind: 'box', color: 0x4d5462 },
  // South lane containers. Same centre gap as the north row (x -2.5..2.5).
  { x: -18, z: 14, hw: 6, hd: 1.3, h: 2.6, kind: 'box', color: 0x2f6f7a },
  { x: -6, z: 14, hw: 3.5, hd: 1.3, h: 2.6, kind: 'box', color: 0x9a4a32 },
  { x: 6, z: 14, hw: 3.5, hd: 1.3, h: 2.6, kind: 'box', color: 0x6b7248 },
  { x: 18, z: 14, hw: 6, hd: 1.3, h: 2.6, kind: 'box', color: 0x2f6f7a },
  { x: 12, z: 10.5, hw: 1.3, hd: 3.2, h: 2.6, kind: 'box', color: 0x6b7248 },
  // Mid crates — low cover you can shoot over while standing, hide behind crouched.
  { x: -10, z: 0.5, hw: 1.6, hd: 1.6, h: 1.2, kind: 'crate', color: 0x8a6b42 },
  { x: 0, z: 2, hw: 1.6, hd: 1.6, h: 1.2, kind: 'crate', color: 0x8a6b42 },
  { x: 8, z: -2, hw: 1.6, hd: 1.6, h: 1.2, kind: 'crate', color: 0x8a6b42 },
  { x: -2, z: -6, hw: 1.1, hd: 1.1, h: 1.0, kind: 'crate', color: 0x7a5c38 },
  { x: 3, z: 7, hw: 1.1, hd: 1.1, h: 1.0, kind: 'crate', color: 0x7a5c38 },
  // Gantry platform (walkable top at h 2.4) with a ramp on its west side.
  { x: 20, z: 0, hw: 5, hd: 4, h: 2.4, kind: 'platform', color: 0x4a4f58 },
  { x: 13.5, z: 0, hw: 1.8, hd: 1.4, h: 2.4, kind: 'ramp', color: 0x565b66 },
  // Barrels (short cylinders approximated as small boxes for collision).
  { x: -16, z: 6, hw: 0.7, hd: 0.7, h: 1.1, kind: 'crate', color: 0xb03a2a },
  { x: 17, z: -3, hw: 0.7, hd: 0.7, h: 1.1, kind: 'crate', color: 0xb03a2a },
  { x: -5, z: 13, hw: 0.7, hd: 0.7, h: 1.1, kind: 'crate', color: 0x2a6b3a },
];

// Waypoint graph for bots. Nodes sit in open lanes; links are walkable lines.
// id, x, z, links[]
// Every link is a straight walkable segment: it must not cross a solid
// (checked by tests/sim-headless.mjs). The container rows have a centre
// gap, so the north/south lanes connect through mid; the gantry platform
// is deliberately off the graph (bots may cross its ramp, never stall on it).
export const WAYPOINTS = [
  { id: 0, x: -26, z: 0, links: [1, 4] },
  { id: 1, x: -20, z: 0, links: [0, 2, 5, 8] },
  { id: 2, x: -14, z: -6, links: [1, 3, 6] },
  { id: 3, x: -14, z: -10, links: [2, 7] },
  { id: 4, x: -20, z: 10, links: [0, 5] },
  { id: 5, x: -10, z: 6, links: [1, 4, 6, 10] },
  { id: 6, x: -4, z: -2, links: [2, 5, 11] },
  { id: 7, x: -19, z: -12, links: [3] },       // Site A
  { id: 8, x: -27, z: 3, links: [1] },
  { id: 9, x: -16, z: 16, links: [14] },
  { id: 10, x: -2, z: 12, links: [5, 11, 14] },
  { id: 11, x: 4, z: 0, links: [6, 10, 15] },
  { id: 12, x: 12, z: -6, links: [6, 13, 16] },
  { id: 13, x: 19, z: -9, links: [12, 17] },
  { id: 14, x: 0, z: 16, links: [9, 10] },
  { id: 15, x: 14, z: 6, links: [11, 16, 19] },
  { id: 16, x: 16, z: -6, links: [12, 15, 17] },
  { id: 17, x: 26, z: -8, links: [13, 16, 20] },
  { id: 18, x: 22, z: 12, links: [19] },       // Site B
  { id: 19, x: 26, z: 9, links: [15, 18, 20] },
  { id: 20, x: 26, z: 0, links: [17, 19] },
];

export const SPAWNS = {
  // Yaw follows the camera basis: forward = (-sin yaw, -cos yaw), so
  // attackers (west) face east with yaw -PI/2, defenders face west with +PI/2.
  atk: [
    { x: -27, z: -4, yaw: -Math.PI / 2 },
    { x: -27, z: 0, yaw: -Math.PI / 2 },
    { x: -27, z: 4, yaw: -Math.PI / 2 },
    { x: -25, z: -2, yaw: -Math.PI / 2 },
  ],
  def: [
    { x: 27, z: -4, yaw: Math.PI / 2 },
    { x: 27, z: 0, yaw: Math.PI / 2 },
    { x: 27, z: 4, yaw: Math.PI / 2 },
    { x: 25, z: 2, yaw: Math.PI / 2 },
  ],
};

// --- pure geometry -------------------------------------------------------

// Circle (x,z,r) vs solid AABBs. Returns the push-out {x, z} or null.
// y (the circle's height) lets walkers stand ON a platform instead of
// being pushed out of its footprint: a platform only blocks below its top.
export function collideCircle(x, z, r, y) {
  let px = x, pz = z;
  for (const s of SOLIDS) {
    if (s.kind === 'ramp') continue;
    // The ramp reaches the deck height only at the platform's west face,
    // so the skip must kick in while the walker is still on the ramp
    // (y >= h - 0.8); with h - 0.3 the walker stalled 0.4 m short of the deck.
    if (s.kind === 'platform' && y !== undefined && y >= s.h - 0.8) continue;
    const nx = Math.max(s.x - s.hw, Math.min(px, s.x + s.hw));
    const nz = Math.max(s.z - s.hd, Math.min(pz, s.z + s.hd));
    const dx = px - nx, dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      px = nx + (dx / d) * r;
      pz = nz + (dz / d) * r;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const ox = s.hw + r - Math.abs(px - s.x);
      const oz = s.hd + r - Math.abs(pz - s.z);
      if (ox < oz) px = s.x + (px < s.x ? -(s.hw + r) : s.hw + r);
      else pz = s.z + (pz < s.z ? -(s.hd + r) : s.hd + r);
    }
  }
  return { x: px, z: pz };
}

// Ground height at (x,z): platform top, ramp slope, else 0.
export function groundHeight(x, z) {
  for (const s of SOLIDS) {
    if (s.kind === 'platform' && Math.abs(x - s.x) <= s.hw && Math.abs(z - s.z) <= s.hd) return s.h;
    if (s.kind === 'ramp' && Math.abs(x - s.x) <= s.hw && Math.abs(z - s.z) <= s.hd) {
      // Ramp rises from west edge (h 0) to east edge (h 2.4).
      const t = (x - (s.x - s.hw)) / (2 * s.hw);
      return Math.max(0, Math.min(s.h, t * s.h));
    }
  }
  return 0;
}

// Ray vs AABB slab test. Origin o, direction d (unit). Box: min/max per axis.
// Returns distance t or Infinity.
export function rayBox(o, d, min, max) {
  let tmin = 0, tmax = Infinity;
  const axes = ['x', 'y', 'z'];
  for (const a of axes) {
    const od = o[a], dd = d[a];
    if (Math.abs(dd) < 1e-9) {
      if (od < min[a] || od > max[a]) return Infinity;
    } else {
      let t1 = (min[a] - od) / dd, t2 = (max[a] - od) / dd;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Ray vs all solids. Returns nearest distance or Infinity.
export function raySolids(o, d, maxDist) {
  let best = maxDist;
  for (const s of SOLIDS) {
    if (s.kind === 'ramp') continue;
    const t = rayBox(o, d,
      { x: s.x - s.hw, y: 0, z: s.z - s.hd },
      { x: s.x + s.hw, y: s.h, z: s.z + s.hd });
    if (t < best) best = t;
  }
  // World floor/ceiling not needed: shots stay inside the yard.
  return best;
}

// Line of sight between two eye points, ignoring smoke (caller handles it).
export function losClear(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const d = { x: dx / len, y: dy / len, z: dz / len };
  return raySolids(a, d, len - 0.05) >= len - 0.05;
}

// BFS path over the waypoint graph. Returns array of waypoint ids.
export function findPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = new Map([[fromId, -1]]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of WAYPOINTS[cur].links) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      if (nb === toId) {
        const path = [nb];
        let c = cur;
        while (c !== -1) { path.unshift(c); c = prev.get(c); }
        return path;
      }
      queue.push(nb);
    }
  }
  return [fromId];
}

export function nearestWaypoint(x, z) {
  let best = 0, bd = Infinity;
  for (const w of WAYPOINTS) {
    const d = (w.x - x) ** 2 + (w.z - z) ** 2;
    if (d < bd) { bd = d; best = w.id; }
  }
  return best;
}

export function siteAt(x, z) {
  for (const key of Object.keys(SITES)) {
    const s = SITES[key];
    if ((x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r) return key;
  }
  return null;
}
