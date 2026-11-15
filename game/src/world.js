// DUSTLINE — the yard, rendered. Builds every mesh from mapdata.js so the
// picture and the collision agree. Dusk light: a low warm sun, cool sky,
// sodium lamps over the lanes. All textures are painted on canvases at
// load time — no image files, no network.

import * as THREE from 'three';
import { SITES } from './config.js';
import { SOLIDS } from './mapdata.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function groundTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#33363d'; g.fillRect(0, 0, w, h);
    // Asphalt speckle.
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${20 + Math.random() * 40 | 0},${24 + Math.random() * 40 | 0},0.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // Expansion joints.
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke();
    }
    // Faded yellow centre line.
    g.strokeStyle = 'rgba(214,178,60,0.55)'; g.lineWidth = 5; g.setLineDash([26, 22]);
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.setLineDash([]);
    // Oil stains.
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 12 + Math.random() * 30;
      const grad = g.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(8,8,10,0.5)'); grad.addColorStop(1, 'rgba(8,8,10,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
}

function containerTexture() {
  // Vertical ribs, like corrugated container steel.
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 4, h);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 4, 0, 3, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  });
}

function letterSprite(letter, color) {
  return canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.font = 'bold 84px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(letter, 64, 68);
  });
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const animated = [];

  // Sky dome: dusk gradient, painted on a canvas.
  const skyTex = canvasTexture(4, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1c2340');
    grad.addColorStop(0.45, '#4a3a5e');
    grad.addColorStop(0.72, '#b45a3c');
    grad.addColorStop(1, '#e08a4a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  group.add(sky);
  scene.fog = new THREE.Fog(0x2c2a33, 45, 160);

  // Lights: dusk sun from the north-west, a soft fill from the east so
  // the faces turned away from the sun stay readable, and sky/ground bounce.
  const hemi = new THREE.HemisphereLight(0x8a7bb8, 0x2a2118, 1.0);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xffd9a0, 0.4);
  fill.position.set(30, 18, 22);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-40, 26, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  scene.add(sun);
  scene.add(sun.target);

  // Ground.
  const groundTex = groundTexture();
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(6, 4);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 48),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.94, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const ribTex = containerTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 14);

  for (const s of SOLIDS) {
    let mesh;
    if (s.kind === 'ramp') {
      // Sloped steel plate from the yard up to the gantry deck.
      const len = Math.hypot(2 * s.hw, s.h);
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.18, 2 * s.hd),
        new THREE.MeshStandardMaterial({ color: 0x565b66, roughness: 0.6, metalness: 0.55 }),
      );
      mesh.position.set(s.x, s.h / 2, s.z);
      mesh.rotation.z = -Math.atan2(s.h, 2 * s.hw);
    } else if (s.kind === 'crate' && s.hw <= 0.8) {
      mesh = new THREE.Mesh(barrelGeo, new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55, metalness: 0.35 }));
      mesh.position.set(s.x, 0.55, s.z);
      mesh.scale.set(1, s.h / 1.1, 1);
    } else if (s.kind === 'crate') {
      mesh = new THREE.Mesh(crateGeo, new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.9, metalness: 0.02 }));
      mesh.position.set(s.x, s.h / 2, s.z);
      mesh.scale.set(2 * s.hw, s.h, 2 * s.hd);
    } else {
      const mat = new THREE.MeshStandardMaterial({ map: ribTex, color: s.color, roughness: 0.62, metalness: 0.35 });
      mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(s.x, s.h / 2, s.z);
      mesh.scale.set(2 * s.hw, s.h, 2 * s.hd);
      // A darker cap so stacked boxes read as separate containers.
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(2 * s.hw + 0.06, 0.1, 2 * s.hd + 0.06),
        new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.8 }),
      );
      cap.position.set(s.x, s.h - 0.05, s.z);
      cap.castShadow = true; cap.receiveShadow = true;
      group.add(cap);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Sodium lamp poles over mid and both lanes.
  const lampPositions = [[-14, -8], [0, 0], [14, 8], [-24, 12], [24, -12]];
  for (const [lx, lz] of lampPositions) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 6.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.6, metalness: 0.6 }),
    );
    pole.position.set(lx, 3.25, lz);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb347, emissiveIntensity: 1.6 }),
    );
    head.position.set(lx, 6.5, lz);
    group.add(head);
    const light = new THREE.PointLight(0xffa64d, 30, 22, 1.8);
    light.position.set(lx, 6.2, lz);
    group.add(light);
  }

  // Bomb sites: glowing ring on the ground + floating letter.
  const siteRings = {};
  for (const key of Object.keys(SITES)) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 48),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? 0x59c2ff : 0xffc759, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.06, s.z);
    group.add(ring);
    siteRings[key] = ring;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: letterSprite(key, key === 'A' ? '#7cc8ff' : '#ffd27a'),
      transparent: true, depthWrite: false,
    }));
    sprite.scale.set(3.2, 3.2, 1);
    sprite.position.set(s.x, 4.2, s.z);
    group.add(sprite);
    animated.push((t) => { sprite.position.y = 4.2 + Math.sin(t * 1.4 + s.x) * 0.25; });
  }

  // A few distant silhouettes outside the walls so the yard feels placed.
  const silhouetteMat = new THREE.MeshStandardMaterial({ color: 0x23222b, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const r = 78 + (i % 3) * 14;
    const h = 14 + ((i * 37) % 22);
    const m = new THREE.Mesh(new THREE.BoxGeometry(10, h, 10), silhouetteMat);
    m.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    group.add(m);
  }

  return {
    group,
    update(t) { for (const fn of animated) fn(t); },
    pulseSite(key, strength) {
      const ring = siteRings[key];
      if (ring) ring.material.opacity = 0.45 + 0.45 * strength;
    },
  };
}
