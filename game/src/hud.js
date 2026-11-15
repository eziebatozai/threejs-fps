// DUSTLINE — the HUD. All DOM, no three.js. One root div holds the
// crosshair, health, ammo, timer, score, money, killfeed, buy menu,
// minimap and banners; the game updates it from sim state every frame.

import { WEAPONS, GRENADES, WORLD, SITES } from './config.js';
import { SOLIDS } from './mapdata.js';

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

export function createHUD(onBuy) {
  const root = document.getElementById('hud');
  const cross = el('div', 'crosshair', root);
  el('div', 'ch-dot', cross);
  const chLines = [];
  for (const c of ['t', 'b', 'l', 'r']) chLines.push(el('div', 'ch-' + c, cross));
  const hitmark = el('div', 'hitmarker', root);
  const vignette = el('div', 'vignette', root);
  const dmgDir = el('div', 'dmgdir', root);

  const top = el('div', 'topbar', root);
  const timerEl = el('div', 'timer', top);
  const scoreEl = el('div', 'score', top);
  const aliveEl = el('div', 'alive', top);
  const bombEl = el('div', 'bombstat', top);

  const feed = el('div', 'killfeed', root);
  const center = el('div', 'center', root);
  const banner = el('div', 'banner', root);
  const bannerTitle = el('h2', '', banner);
  const bannerSub = el('div', 'banner-sub', banner);

  const bottom = el('div', 'bottombar', root);
  const healthWrap = el('div', 'health', bottom);
  const healthNum = el('div', 'health-num', healthWrap);
  const healthBar = el('div', 'health-bar', healthWrap);
  const healthFill = el('div', 'health-fill', healthBar);
  const ammoWrap = el('div', 'ammo', bottom);
  const ammoMag = el('div', 'ammo-mag', ammoWrap);
  const ammoRes = el('div', 'ammo-res', ammoWrap);
  const weaponName = el('div', 'weapon-name', ammoWrap);
  const moneyEl = el('div', 'money', bottom);

  const mapWrap = el('div', 'minimap-wrap', root);
  const mapCanvas = el('canvas', 'minimap', mapWrap);
  mapCanvas.width = 176; mapCanvas.height = 132;
  const mapCtx = mapCanvas.getContext('2d');

  // Buy menu.
  const buy = el('div', 'buy hidden', root);
  el('h2', '', buy).textContent = 'BUY — Round ' + 1;
  const buyTitle = buy.querySelector('h2');
  const buyGrid = el('div', 'buy-grid', buy);
  const buyItems = [];
  for (const id of ['longbow', 'hornet', 'needle']) {
    const w = WEAPONS[id];
    const b = el('button', 'buy-item', buyGrid);
    b.innerHTML = `<b>${w.name}</b><span>$${w.price} · ${w.damage} dmg · ${w.mag} rnd</span><i>key ${id === 'longbow' ? 1 : id === 'hornet' ? 2 : 3}</i>`;
    b.addEventListener('click', () => onBuy('weapon', id));
    buyItems.push({ b, id, price: w.price });
  }
  for (const id of ['frag', 'smoke']) {
    const g = GRENADES[id];
    const b = el('button', 'buy-item', buyGrid);
    b.innerHTML = `<b>${g.name}</b><span>$${g.price}</span><i>key ${id === 'frag' ? 4 : 5}</i>`;
    b.addEventListener('click', () => onBuy('grenade', id));
    buyItems.push({ b, id, price: g.price });
  }
  const buyHint = el('div', 'buy-hint', buy);
  buyHint.textContent = 'Keys 1–5 buy · B closes · ammo refills free each round';

  let hitT = 0, dmgT = 0, bannerT = 0;

  function drawMinimap(sim, player) {
    const c = mapCtx, W = 176, H = 132;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,12,16,0.72)'; c.fillRect(0, 0, W, H);
    const sx = (x) => ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * W;
    const sy = (z) => ((z - -20) / 40) * H;
    c.fillStyle = 'rgba(140,150,170,0.5)';
    for (const s of SOLIDS) {
      if (s.kind === 'wall') continue;
      c.fillRect(sx(s.x - s.hw), sy(s.z - s.hd), Math.max(2, sx(s.x + s.hw) - sx(s.x - s.hw)), Math.max(2, sy(s.z + s.hd) - sy(s.z - s.hd)));
    }
    for (const key of Object.keys(SITES)) {
      const s = SITES[key];
      c.strokeStyle = key === 'A' ? '#59c2ff' : '#ffc759';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(sx(s.x), sy(s.z), 7, 0, 7); c.stroke();
      c.fillStyle = c.strokeStyle; c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
      c.fillText(key, sx(s.x), sy(s.z) + 3);
    }
    if (sim.bomb.state === 'dropped') {
      c.fillStyle = '#ff5a4d'; c.beginPath(); c.arc(sx(sim.bomb.x), sy(sim.bomb.z), 4, 0, 7); c.fill();
    }
    if (sim.bomb.state === 'planted') {
      c.fillStyle = '#ff3b2f'; c.beginPath(); c.arc(sx(sim.bomb.x), sy(sim.bomb.z), 5, 0, 7); c.fill();
    }
    for (const e of sim.entities) {
      if (!e.alive) continue;
      c.fillStyle = e.isPlayer ? '#ffffff' : e.team === 'atk' ? '#5aa2ff' : '#ffb347';
      c.beginPath(); c.arc(sx(e.x), sy(e.z), e.isPlayer ? 3.5 : 2.5, 0, 7); c.fill();
    }
    // Player facing tick.
    const px = sx(player.x), pz = sy(player.z);
    c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px, pz);
    c.lineTo(px - Math.sin(player.yaw) * 9, pz - Math.cos(player.yaw) * 9); c.stroke();
  }

  return {
    root, buy,
    showHitmarker(head) {
      hitmark.className = 'hitmarker show' + (head ? ' head' : '');
      hitT = 0.18;
    },
    showDamage(angleDeg) {
      vignette.className = 'vignette show';
      dmgDir.style.transform = `rotate(${angleDeg}deg)`;
      dmgDir.className = 'dmgdir show';
      dmgT = 0.5;
    },
    showBanner(title, sub, ms = 2600) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub || '';
      banner.classList.add('show');
      bannerT = ms / 1000;
    },
    hideBanner() { banner.classList.remove('show'); bannerT = 0; },
    setCenter(text) { center.textContent = text || ''; },
    addKill(text, good) {
      const line = el('div', 'feed-line' + (good ? ' good' : ' bad'), feed);
      line.textContent = text;
      setTimeout(() => line.remove(), 5200);
      while (feed.children.length > 5) feed.firstChild.remove();
    },
    setBuy(open, round, money) {
      buyTitle.textContent = 'BUY — Round ' + round;
      buy.classList.toggle('hidden', !open);
      for (const it of buyItems) {
        it.b.classList.toggle('cant', money < it.price);
      }
    },
    update(sim, player, dt, spreadPx) {
      // Crosshair gap follows the live spread.
      const gap = 6 + spreadPx * 900;
      chLines[0].style.transform = `translate(-50%, calc(-100% - ${gap}px))`;
      chLines[1].style.transform = `translate(-50%, ${gap}px)`;
      chLines[2].style.transform = `translate(calc(-100% - ${gap}px), -50%)`;
      chLines[3].style.transform = `translate(${gap}px, -50%)`;
      cross.style.opacity = player.alive && sim.phase === 'live' ? '1' : '0.25';

      if (hitT > 0) { hitT -= dt; if (hitT <= 0) hitmark.className = 'hitmarker'; }
      if (dmgT > 0) {
        dmgT -= dt;
        if (dmgT <= 0) { vignette.className = 'vignette'; dmgDir.className = 'dmgdir'; }
      }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }

      const t = Math.max(0, Math.ceil(sim.phaseT));
      timerEl.textContent = sim.phase === 'buy' ? `BUY ${t}` : sim.phase === 'live'
        ? (sim.bomb.state === 'planted' ? `💣 ${Math.ceil(sim.bomb.timer)}` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)
        : sim.phase === 'over' ? 'ROUND OVER' : 'MATCH OVER';
      timerEl.classList.toggle('urgent', sim.phase === 'live' && t <= 15);
      scoreEl.textContent = `Vanguard ${sim.score.atk} — ${sim.score.def} Jackals`;
      const atkAlive = sim.entities.filter((e) => e.team === 'atk' && e.alive).length;
      const defAlive = sim.entities.filter((e) => e.team === 'def' && e.alive).length;
      aliveEl.textContent = `●`.repeat(atkAlive) + '  vs  ' + `●`.repeat(defAlive);
      aliveEl.style.color = '#5aa2ff';
      bombEl.textContent = sim.phase !== 'live' && sim.phase !== 'buy' ? ''
        : sim.bomb.state === 'planted'
        ? `BOMB PLANTED — ${sim.bomb.site} · ${Math.ceil(sim.bomb.timer)}s`
        : sim.bomb.state === 'dropped' ? 'BOMB DROPPED — pick it up'
        : sim.bomb.state === 'carried' && sim.bomb.carrierId === 'p0' ? 'YOU CARRY THE BOMB — plant at A or B'
        : '';
      bombEl.classList.toggle('hot', sim.bomb.state === 'planted');

      const hp = Math.max(0, Math.round(player.hp));
      healthNum.textContent = hp;
      healthFill.style.width = hp + '%';
      healthFill.style.background = hp > 50 ? '#58d68d' : hp > 25 ? '#f5b942' : '#e74c3c';
      const w = player.weapon;
      ammoMag.textContent = player.alive ? w.mag : '—';
      ammoRes.textContent = player.alive ? `/ ${w.reserve}` : '';
      weaponName.textContent = WEAPONS[w.id].name + (w.reloadT > 0 ? ' — reloading…' : '');
      moneyEl.textContent = '$' + player.money;

      drawMinimap(sim, player);
    },
  };
}
