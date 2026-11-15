// DUSTLINE — boot, render loop and game flow. The sim owns the truth;
// this file only shows it: meshes for the map and the fighters, a gun in
// the player's hands, tracers, smoke, the bomb, and the screens between
// rounds. Fixed-step simulation (1/60 s) is kept apart from rendering.

import * as THREE from 'three';
import { WORLD, WEAPONS, ROUND, rng } from './config.js';
import { createSim, simStep, STEP, buyItem } from './sim.js';
import { createWorld } from './world.js';
import { createHUD } from './hud.js';
import { createInput, shotMode } from './input.js';
import { sfx, ensureAudio } from './audio.js';
import { currentSpread } from './weapons.js';

window.addEventListener('error', (e) => { window.__DUSTLINE_ERROR__ = String(e.message || e.error); });
// Tiny debug handle for local verification (read-only state, no cheats).
// Getters, so nothing is read before the module finishes loading.
window.__DUSTLINE__ = {
  get sim() { return sim; },
  get gun() { return { visible: viewmodel.visible, pos: viewmodel.position.toArray() }; },
  get player() { const p = sim.entities[0]; return { alive: p.alive, hp: p.hp, x: p.x, z: p.z, yaw: p.yaw }; },
};

const sim = createSim(20261115);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2c2a33);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const hud = createHUD((kind, id) => {
  const player = sim.entities[0];
  if (buyItem(sim, player, kind, id)) sfx.buy(); else sfx.denied();
});
const input = createInput(renderer.domElement, {
  onKey(code, down) {
    if (!down) return;
    const player = sim.entities[0];
    if (code === 'KeyB') buyOpen = !buyOpen && sim.phase === 'buy';
    // Keys 1-5 do double duty, exactly as the buy menu says: in the buy
    // phase they buy (Longbow / Hornet / Needle / frag / smoke); live,
    // 1-2 switch weapons and 4-5 throw grenades.
    if (code === 'Digit1') { if (sim.phase === 'buy') buyKey('longbow'); else pendingSlot = 1; }
    if (code === 'Digit2') { if (sim.phase === 'buy') buyKey('hornet'); else pendingSlot = 2; }
    if (code === 'Digit3') buyKey('needle');
    if (code === 'Digit4') { if (sim.phase === 'buy') buyKey('frag'); else pendingGrenade = 'frag'; }
    if (code === 'Digit5') { if (sim.phase === 'buy') buyKey('smoke'); else pendingGrenade = 'smoke'; }
    if (code === 'KeyR') pendingReload = true;
    if (code === 'KeyG') pendingGrenade = 'frag';
    if (code === 'KeyH') pendingGrenade = 'smoke';
    if (code === 'KeyP' || code === 'Escape') { /* pause via lock loss */ }
    void player;
  },
  onLock(locked) {
    if (!locked && sim.phase === 'live' && !shot) showMenu(true, 'Paused — click to resume');
    if (locked) showMenu(false);
  },
});

function buyKey(id) {
  if (sim.phase !== 'buy') return;
  const player = sim.entities[0];
  const kind = id === 'frag' || id === 'smoke' ? 'grenade' : 'weapon';
  if (buyItem(sim, player, kind, id)) sfx.buy(); else sfx.denied();
}

// --- menu / overlays --------------------------------------------------------
const menuEl = document.getElementById('menu');
const menuTitle = document.getElementById('menu-title');
const menuSub = document.getElementById('menu-sub');
let buyOpen = false;
let pendingSlot = 0, pendingReload = false, pendingGrenade = null;
let menuVisible = true;

function showMenu(show, title, sub) {
  menuVisible = show;
  menuEl.classList.toggle('hidden', !show);
  if (title) menuTitle.textContent = title;
  if (sub !== undefined) menuSub.textContent = sub;
}
menuEl.addEventListener('click', () => {
  ensureAudio();
  showMenu(false);
  input.lock();
});

const shot = shotMode();
if (shot) {
  // Screenshot poses: no menu, no pointer lock, deterministic scene.
  showMenu(false);
  menuVisible = false;
  poseShot(shot);
} else {
  showMenu(true, 'DUSTLINE', 'Tactical FPS — Vanguard vs Jackals · first to 5 rounds · plant the bomb at A or B');
}

function poseShot({ shot: mode, seed }) {
  const r = rng(seed * 7919 + 13);
  const player = sim.entities[0];
  // Yaw basis: forward = (-sin yaw, -cos yaw), so east is -PI/2.
  if (mode === 'start') {
    // Buy phase at the attacker spawn, looking down mid toward Site B.
    player.yaw = -Math.PI / 2 - 0.3;
    player.pitch = 0.01;
  } else if (mode === 'buy') {
    buyOpen = true;
    player.yaw = -Math.PI / 2;
  } else if (mode === 'play') {
    sim.phase = 'live';
    sim.phaseT = 78;
    player.x = -2; player.z = -2; player.yaw = -1.39; player.pitch = 0.02;
    player.primary = 'longbow'; player.weapon = { id: 'longbow', mag: 30, reserve: 90, cooldown: 0, reloadT: 0, bloom: 0, burst: 0 };
    // Pose two enemies in the lane and an ally beside the player.
    const d1 = sim.entities.find((e) => e.id === 'd1');
    const d2 = sim.entities.find((e) => e.id === 'd2');
    const a1 = sim.entities.find((e) => e.id === 'a1');
    if (d1) { d1.x = 10; d1.z = -5; d1.yaw = Math.PI / 2; d1.ai.state = 'hold'; d1.ai.holdUntil = 9999; d1.ai.path = []; }
    if (d2) { d2.x = 13; d2.z = 3; d2.yaw = Math.PI / 2 + 0.4; d2.ai.state = 'hold'; d2.ai.holdUntil = 9999; d2.ai.path = []; }
    if (a1) { a1.x = -4; a1.z = 1; a1.yaw = -Math.PI / 2; a1.ai.state = 'hold'; a1.ai.holdUntil = 9999; a1.ai.path = []; }
    void r;
  } else if (mode === 'end') {
    sim.phase = 'over';
    sim.phaseT = 5;
    sim.score = { atk: 2, def: 1 };
    sim.roundWinner = 'atk';
    sim.roundReason = 'elimination';
    const d1 = sim.entities.find((e) => e.id === 'd1');
    if (d1) { d1.alive = false; d1.hp = 0; }
    hud.showBanner('ROUND WON', 'Jackals eliminated — Vanguard leads 2–1', 60000);
  }
}

// --- fighter meshes ---------------------------------------------------------
const VEST = { atk: 0x2b5cb8, def: 0xc47b1e };
const SKIN = [0xc9a184, 0x8a5f43, 0x6b4a35, 0xe0b48f];

function makeFighter(e) {
  const g = new THREE.Group();
  const vest = new THREE.MeshStandardMaterial({ color: VEST[e.team], roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[e.idx % SKIN.length], roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), vest);
  torso.position.y = 1.12; torso.castShadow = true;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.3), dark);
  legs.position.y = 0.36; legs.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), skin);
  head.position.y = 1.62; head.castShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.44), new THREE.MeshStandardMaterial({ color: VEST[e.team], roughness: 0.6 }));
  band.position.y = 1.74;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.06), new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.25, metalness: 0.6 }));
  visor.position.set(0, 1.63, -0.19);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.72), dark);
  gun.position.set(0.22, 1.28, -0.42);
  g.add(torso, legs, head, band, visor, gun);
  g.userData = { torso, legs, head, gun, vest, baseY: 0 };
  scene.add(g);
  return g;
}

const fighterMeshes = new Map();
for (const e of sim.entities) {
  if (e.isPlayer) continue;
  fighterMeshes.set(e.id, makeFighter(e));
}

// --- player viewmodel -------------------------------------------------------
const viewmodel = new THREE.Group();
{
  // Brighter than the world metal: the gun sits against dark asphalt and
  // must read at a glance. A small light rides with the camera for the same reason.
  const metal = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.42, metalness: 0.65 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x3f8cff, roughness: 0.4, metalness: 0.4, emissive: 0x0a2a55, emissiveIntensity: 0.6 });
  const camLight = new THREE.PointLight(0xfff2dd, 1.0, 4, 2);
  camLight.position.set(0, 0.1, 0);
  camera.add(camLight);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.52), metal);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 10), metal);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.4);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), accent);
  sight.position.set(0, 0.09, -0.12);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), metal);
  mag.position.set(0, -0.12, -0.05);
  viewmodel.add(body, barrel, sight, mag);
  viewmodel.position.set(0.28, -0.26, -0.6);
  viewmodel.scale.setScalar(0.8);
  camera.add(viewmodel);
}
const muzzleLight = new THREE.PointLight(0xffc46b, 0, 9, 2);
muzzleLight.position.set(0.26, -0.12, -0.9);
camera.add(muzzleLight);
let muzzleT = 0, recoilKick = 0, reloadDip = 0;

// --- tracers / grenades / smoke / explosion ---------------------------------
const tracerPool = [];
{
  const geo = new THREE.BoxGeometry(0.02, 0.02, 1);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    m.visible = false;
    scene.add(m);
    tracerPool.push({ mesh: m, life: 0 });
  }
}
function spawnTracer(from, to, color) {
  const t = tracerPool.find((x) => x.life <= 0) || tracerPool[0];
  const f = new THREE.Vector3(from[0], from[1], from[2]);
  const tt = new THREE.Vector3(to[0], to[1], to[2]);
  const mid = f.clone().add(tt).multiplyScalar(0.5);
  t.mesh.position.copy(mid);
  t.mesh.lookAt(tt);
  t.mesh.scale.set(1, 1, f.distanceTo(tt));
  t.mesh.material.color.setHex(color || 0xffe9a8);
  t.mesh.material.opacity = 0.9;
  t.mesh.visible = true;
  t.life = 0.09;
}

const grenadeMeshes = new Map();
function grenadeMesh(id) {
  let m = grenadeMeshes.get(id);
  if (!m) {
    m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 0.5, metalness: 0.4 }));
    m.castShadow = true;
    scene.add(m);
    grenadeMeshes.set(id, m);
  }
  return m;
}

const smokeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(200,200,205,0.85)');
  grad.addColorStop(1, 'rgba(200,200,205,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const smokeSprites = [];
for (let i = 0; i < 40; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
  s.visible = false;
  scene.add(s);
  smokeSprites.push({ sprite: s, life: 0, seed: i });
}
function spawnSmokeBurst(x, y, z) {
  let n = 0;
  for (const s of smokeSprites) {
    if (s.life > 0) continue;
    s.sprite.position.set(x + (Math.random() - 0.5) * 3, y + Math.random() * 1.5, z + (Math.random() - 0.5) * 3);
    s.sprite.scale.set(3 + Math.random() * 2, 3 + Math.random() * 2, 1);
    s.life = 14 + Math.random() * 3;
    if (++n >= 7) break;
  }
}

const explosion = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0 }),
);
explosion.visible = false;
scene.add(explosion);
const explosionLight = new THREE.PointLight(0xff8a3c, 0, 30, 1.6);
scene.add(explosionLight);
let explosionT = 0;

const bombMesh = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5, metalness: 0.5 }));
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1e, emissiveIntensity: 2 }));
  led.position.set(0.14, 0.14, 0.12);
  bombMesh.add(body, led);
  bombMesh.userData.led = led;
  bombMesh.visible = false;
  scene.add(bombMesh);
}

// --- events -----------------------------------------------------------------
const player = sim.entities[0];
let lastScore = { atk: 0, def: 0 };
let stepAcc = 0;

function nameOf(id) {
  const e = sim.entities.find((x) => x.id === id);
  return e ? e.name : '—';
}

function handleEvents() {
  for (const ev of sim.events) {
    switch (ev.t) {
      case 'shot': {
        spawnTracer(ev.from, ev.to, 0xffe9a8);
        const shooter = sim.entities.find((e) => e.id === ev.by);
        const dist = shooter ? Math.hypot(shooter.x - player.x, shooter.z - player.z) : 0;
        sfx.shot(ev.weapon, shooter && shooter.isPlayer ? 0 : dist);
        if (shooter && shooter.isPlayer) { muzzleT = 0.045; recoilKick = Math.min(0.09, recoilKick + 0.02); }
        break;
      }
      case 'hitmark': hud.showHitmarker(false); break;
      case 'hurt': {
        const v = sim.entities.find((e) => e.id === ev.victim);
        if (v && v.isPlayer) {
          const atk = sim.entities.find((e) => e.id === ev.by);
          if (atk) {
            const ang = Math.atan2(-(atk.x - player.x), -(atk.z - player.z)) - player.yaw;
            hud.showDamage(((ang * 180) / Math.PI + 360) % 360);
          }
          sfx.hurt();
        } else if (ev.by === 'p0') {
          hud.showHitmarker(false);
          sfx.hit(false);
        }
        break;
      }
      case 'kill': {
        const good = ev.by === 'p0';
        hud.addKill(`${nameOf(ev.by)} ▸ ${nameOf(ev.victim)}`, good);
        if (good) sfx.kill();
        break;
      }
      case 'dry': if (ev.by === 'p0') sfx.dry(); break;
      case 'roundStart':
        hud.showBanner(`ROUND ${ev.round}`, sim.bomb.carrierId === 'p0' ? 'You carry the bomb — plant at A or B' : 'Eliminate the Jackals or plant the bomb');
        break;
      case 'roundEnd': {
        const won = ev.winner === 'atk';
        hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST',
          ev.reason === 'detonation' ? 'The bomb detonated — Site cleared'
            : ev.reason === 'defused' ? 'The bomb was defused'
            : ev.reason === 'time' ? 'Time expired'
            : 'Enemy team eliminated');
        if (won) sfx.roundWin(); else sfx.roundLose();
        break;
      }
      case 'plant': hud.showBanner('BOMB PLANTED', `${nameOf(ev.by)} planted at Site ${ev.site} — defend it!`); sfx.plantBeep(); break;
      case 'defuse': hud.showBanner('BOMB DEFUSED', 'Jackals defused the bomb'); break;
      case 'explode': {
        explosion.position.set(ev.x, ev.y + 0.4, ev.z);
        explosion.visible = true;
        explosionT = 0.45;
        sfx.explode(Math.hypot(ev.x - player.x, ev.z - player.z));
        break;
      }
      case 'grenade': sfx.grenadePin(); break;
      case 'smoke': spawnSmokeBurst(ev.x, ev.y, ev.z); break;
      case 'beep': sfx.plantBeep(); break;
      case 'buy': sfx.buy(); break;
      case 'bombDrop': hud.setCenter('Bomb dropped — pick it up'); break;
      case 'bombPickup': hud.setCenter(''); break;
      default: break;
    }
  }
}

// --- main loop ----------------------------------------------------------------
let last = performance.now();
let acc = 0;
let fovTarget = 75;
let prevPhase = sim.phase;

function buildPlayerInput() {
  const look = input.takeLook();
  player.yaw -= look.dx * 0.0021;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - look.dy * 0.0021));
  const mv = input.moveVector(player.yaw);
  const walk = input.state.mouseRight ? true : (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight'));
  const inputObj = {
    moveX: mv.x, moveZ: mv.z,
    fire: input.state.mouseDown && input.state.locked,
    ads: input.state.mouseRight && input.state.locked,
    crouch: input.keys.has('ControlLeft') || input.keys.has('KeyC'),
    walk,
    use: input.keys.has('KeyE'),
    jump: input.keys.has('Space'),
    reload: pendingReload,
    slot: pendingSlot,
    grenade: pendingGrenade,
    buy: null,
  };
  pendingReload = false; pendingSlot = 0; pendingGrenade = null;
  return inputObj;
}

function frame() {
  requestAnimationFrame(frame);
  // performance.now() for the clock, never the rAF timestamp: in headless
  // Chromium the two clocks disagree by seconds, and a negative dt once
  // blew the viewmodel recoil/reload offsets off the screen.
  const now = performance.now();
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  const t = now / 1000;

  const paused = menuVisible && !shot && sim.phase === 'live';
  if (paused) input.takeLook(); // drain mouse deltas so resume does not snap
  if (!paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      const inp = buildPlayerInput();
      simStep(sim, STEP, inp);
      handleEvents();
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
  }

  // Buy menu opens at the start of each buy phase; B toggles it.
  if (sim.phase === 'buy' && prevPhase !== 'buy') buyOpen = true;
  prevPhase = sim.phase;
  hud.setBuy(buyOpen && sim.phase === 'buy', sim.round, player.money);
  if (sim.phase !== 'buy') buyOpen = false;

  // Camera from the player.
  const eyeY = player.y + (player.crouch ? WORLD.crouchEye : WORLD.eyeHeight);
  camera.position.set(player.x, eyeY + Math.sin(t * 9) * (Math.hypot(player.vx, player.vz) > 0.5 ? 0.025 : 0), player.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = 0;
  fovTarget = player.ads && input.state.locked ? 55 : 75;
  if (Math.abs(camera.fov - fovTarget) > 0.1) {
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  // Viewmodel kick + reload dip.
  recoilKick = Math.max(0, recoilKick - dt * 0.35);
  const reloading = player.weapon.reloadT > 0;
  reloadDip = reloading ? Math.min(1, reloadDip + dt * 3) : Math.max(0, reloadDip - dt * 3);
  viewmodel.position.z = -0.6 + recoilKick;
  viewmodel.position.y = -0.26 - reloadDip * 0.16;
  viewmodel.rotation.x = reloadDip * 0.7 + recoilKick * 1.2;
  viewmodel.visible = player.alive;
  muzzleT = Math.max(0, muzzleT - dt);
  muzzleLight.intensity = muzzleT > 0 ? 14 : 0;

  // Footsteps.
  stepAcc += Math.hypot(player.vx, player.vz) * dt;
  if (stepAcc > 2.4 && player.grounded && player.alive) { stepAcc = 0; sfx.step(0); }

  // Fighters.
  for (const e of sim.entities) {
    if (e.isPlayer) continue;
    const m = fighterMeshes.get(e.id);
    if (!m) continue;
    m.position.set(e.x, e.y, e.z);
    if (!e.alive) {
      m.rotation.set(0, e.yaw, Math.PI / 2 * 0.94);
      m.position.y = 0.28;
      continue;
    }
    m.rotation.set(0, e.yaw, 0);
    const moving = Math.hypot(e.vx, e.vz) > 0.5;
    m.userData.legs.position.y = 0.36 + (moving ? Math.abs(Math.sin(t * 11 + e.idx)) * 0.06 : 0);
    m.userData.gun.position.y = 1.28 + Math.sin(t * 2 + e.idx) * 0.01;
  }

  // Grenades in flight.
  const seenGrenades = new Set();
  for (const g of sim.grenades) {
    const m = grenadeMesh(g.id);
    m.position.set(g.x, g.y, g.z);
    m.visible = true;
    seenGrenades.add(m);
  }
  for (const m of grenadeMeshes.values()) if (!seenGrenades.has(m)) m.visible = false;

  // Smoke.
  for (const s of smokeSprites) {
    if (s.life <= 0) { s.sprite.visible = false; continue; }
    s.life -= dt;
    s.sprite.visible = true;
    s.sprite.material.opacity = Math.min(0.55, s.life * 0.06);
    s.sprite.position.y += dt * 0.25;
  }

  // Explosion.
  if (explosionT > 0) {
    explosionT -= dt;
    const k = 1 - explosionT / 0.45;
    explosion.scale.setScalar(1 + k * 9);
    explosion.material.opacity = Math.max(0, 0.85 - k);
    explosionLight.intensity = 120 * (1 - k);
    explosionLight.position.copy(explosion.position);
    if (explosionT <= 0) { explosion.visible = false; explosionLight.intensity = 0; }
  }

  // Tracers fade.
  for (const tr of tracerPool) {
    if (tr.life <= 0) continue;
    tr.life -= dt;
    tr.mesh.material.opacity = Math.max(0, tr.life / 0.09) * 0.9;
    if (tr.life <= 0) tr.mesh.visible = false;
  }

  // Bomb mesh.
  const bomb = sim.bomb;
  if (bomb.state === 'planted' || bomb.state === 'dropped') {
    bombMesh.visible = true;
    bombMesh.position.set(bomb.x, 0.14, bomb.z);
    const blink = Math.sin(t * 9) > 0;
    bombMesh.userData.led.material.emissiveIntensity = blink ? 2.5 : 0.2;
    world.pulseSite(bomb.site, 0.5 + 0.5 * Math.sin(t * 4));
  } else {
    bombMesh.visible = false;
  }

  world.update(t);

  // HUD: spread in radians for the crosshair.
  const spread = currentSpread(player.weapon,
    Math.hypot(player.vx, player.vz) > 0.6, !player.grounded, player.crouch,
    player.ads && input.state.locked, false);
  hud.update(sim, player, dt, spread);

  // Center prompt.
  if (sim.phase === 'live' && player.alive) {
    if (bomb.state === 'carried' && bomb.carrierId === 'p0') {
      const site = ['A', 'B'].find((k) => {
        const s = { A: { x: -19, z: -12 }, B: { x: 22, z: 12 } }[k];
        return Math.hypot(player.x - s.x, player.z - s.z) < 5;
      });
      hud.setCenter(site ? `Hold E to plant at Site ${site}` : 'Carry the bomb to Site A or B');
    } else if (bomb.state === 'planted' && player.team === 'def') {
      hud.setCenter(Math.hypot(player.x - bomb.x, player.z - bomb.z) < 1.6 ? 'Hold E to defuse' : '');
    } else hud.setCenter('');
  } else hud.setCenter('');

  // Match end overlay.
  if (sim.phase === 'match' && !shot) {
    const won = sim.matchWinner === 'atk';
    showMenu(true, won ? 'VICTORY — Vanguard takes the match' : 'DEFEAT — Jackals take the match',
      `Final score ${sim.score.atk}–${sim.score.def} · refresh to play again`);
  }

  renderer.render(scene, camera);
  if (!window.__DUSTLINE_READY__) window.__DUSTLINE_READY__ = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(frame);
