// hud.js — the DOM layer: health, ammo, timer, score, money, killfeed,
// round banners, the buy menu and a live minimap. The sim writes numbers
// into G; this module only paints them, at most every animation frame.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './state.js';
import { ammoOf } from './player.js';

let els = null;
let minimap = null;
let buyOpen = false;

export function initHud(G, onBuy, onCloseBuy) {
  els = {
    hp: document.getElementById('hp'),
    armor: document.getElementById('armor'),
    ammoMag: document.getElementById('ammo-mag'),
    ammoReserve: document.getElementById('ammo-reserve'),
    weaponName: document.getElementById('weapon-name'),
    timer: document.getElementById('timer'),
    score: document.getElementById('score'),
    money: document.getElementById('money'),
    round: document.getElementById('round'),
    banner: document.getElementById('banner'),
    killfeed: document.getElementById('killfeed'),
    crosshair: document.getElementById('crosshair'),
    hitmarker: document.getElementById('hitmarker'),
    vignette: document.getElementById('vignette'),
    bomb: document.getElementById('bomb'),
    objective: document.getElementById('objective'),
    progress: document.getElementById('progress'),
    progressFill: document.getElementById('progress-fill'),
    progressLabel: document.getElementById('progress-label'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayCopy: document.getElementById('overlay-copy'),
    buy: document.getElementById('buy'),
    buyMoney: document.getElementById('buy-money'),
    buyMsg: document.getElementById('buy-msg'),
    hint: document.getElementById('hint'),
  };
  minimap = document.getElementById('minimap');
  els.buy.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const msg = onBuy(btn.dataset.buy);
      if (msg) showBuyMsg(msg);
      refreshBuy(G);
    });
  });
  document.getElementById('buy-close').addEventListener('click', () => onCloseBuy());
  document.getElementById('play').addEventListener('click', () => {
    document.getElementById('overlay').hidden = true;
    G.startRequested = true;
  });
}

export function showBuyMsg(msg) {
  if (els.buyMsg) els.buyMsg.textContent = msg;
}

export function setBuyOpen(G, open) {
  buyOpen = open;
  els.buy.hidden = !open;
  if (open) refreshBuy(G);
}

export function isBuyOpen() { return buyOpen; }

export function refreshBuy(G) {
  const p = G.player;
  els.buyMoney.textContent = `$${G.money}`;
  els.buy.querySelectorAll('[data-buy]').forEach((btn) => {
    const kind = btn.dataset.buy;
    const price = WEAPONS[kind] ? WEAPONS[kind].price : kind === 'grenade' ? GRENADE_PRICE : ARMOR_PRICE;
    const owned = WEAPONS[kind] ? !!p.weapons[kind] : kind === 'armor' ? p.armor >= 100 : p.grenades >= 2;
    btn.querySelector('.price').textContent = owned ? (WEAPONS[kind] ? 'AMMO $' + Math.floor(price / 2) : 'MAX') : '$' + price;
    btn.classList.toggle('owned', !!owned);
    btn.classList.toggle('cant', G.money < price && !owned);
  });
}

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

let lastKillCount = 0;
export function updateHud(G) {
  if (!els) return;
  const p = G.player;
  els.hp.textContent = p.hp;
  els.hp.parentElement.classList.toggle('low', p.hp <= 30);
  els.armor.textContent = p.armor;
  const w = WEAPONS[p.weapon];
  const ammo = ammoOf(p, p.weapon);
  els.ammoMag.textContent = p.reloading ? '--' : ammo.mag;
  els.ammoReserve.textContent = `/ ${ammo.reserve}`;
  els.weaponName.textContent = `${w.name}  ·  ${p.grenades} grenade${p.grenades === 1 ? '' : 's'}`;
  els.timer.textContent = G.phase === 'live' && G.bomb.state === 'planted'
    ? fmtTime(G.bomb.fuse) : fmtTime(G.timer);
  els.timer.classList.toggle('danger', (G.phase === 'live' && G.bomb.state === 'planted') || G.timer < 15);
  els.score.textContent = `${G.score.strikers} — ${G.score.wardens}`;
  els.money.textContent = `$${G.money}`;
  els.round.textContent = `ROUND ${Math.min(G.round, 9)} / 9`;
  els.objective.textContent = G.bomb.state === 'planted'
    ? `CHARGE AT SITE ${G.bomb.site} — DEFEND IT`
    : G.bomb.state === 'carried' ? 'PLANT THE CHARGE AT A OR B' : '';
  els.bomb.textContent = G.bomb.state === 'planted' ? '●' : G.bomb.state === 'carried' ? '○' : '';
  els.bomb.className = G.bomb.state === 'planted' ? 'planted' : '';

  // Crosshair gap grows with spread; hitmarker flashes on a hit.
  const gap = 4 + p.spread * 900;
  els.crosshair.style.setProperty('--gap', `${Math.min(26, gap).toFixed(1)}px`);
  if (G.lastHit && G.time - G.lastHit.t < 0.18) {
    els.hitmarker.classList.add('on');
    els.hitmarker.classList.toggle('head', G.lastHit.part === 'head');
  } else els.hitmarker.classList.remove('on');

  // Damage vignette fades after a hit.
  G.hudFlash = Math.max(0, (G.hudFlash || 0) - 0.03);
  els.vignette.style.opacity = G.hudFlash.toFixed(2);

  // Banner: big centre text for a few seconds after round events.
  if (G.banner && G.bannerT > 0) {
    els.banner.textContent = G.banner;
    els.banner.hidden = false;
    G.bannerT -= 1 / 60;
  } else els.banner.hidden = true;

  // Plant / defuse progress bar.
  const prog = p.planting > 0 ? { v: p.planting / 3.2, label: 'PLANTING CHARGE…' }
    : p.defusing > 0 ? { v: p.defusing / 4.5, label: 'DEFUSING…' } : null;
  if (prog) {
    els.progress.hidden = false;
    els.progressFill.style.width = `${Math.min(100, prog.v * 100).toFixed(0)}%`;
    els.progressLabel.textContent = prog.label;
  } else els.progress.hidden = true;

  // Context hint near the site.
  const nearA = Math.hypot(p.x - G.world.sites.A.x, p.z - G.world.sites.A.z) < 3.2;
  const nearB = Math.hypot(p.x - G.world.sites.B.x, p.z - G.world.sites.B.z) < 3.2;
  const nearBomb = G.bomb.state === 'planted' && Math.hypot(p.x - G.bomb.x, p.z - G.bomb.z) < 2.6;
  els.hint.textContent = G.phase === 'live' && G.bomb.state === 'carried' && (nearA || nearB)
    ? 'Hold E to plant the charge'
    : G.phase === 'live' && nearBomb ? 'Hold E to defuse' : '';
  els.hint.hidden = !els.hint.textContent;

  // Killfeed: show the last 4 entries, newest first.
  if (G.kills.length !== lastKillCount) {
    lastKillCount = G.kills.length;
    els.killfeed.innerHTML = '';
    for (const k of G.kills.slice(-4).reverse()) {
      const div = document.createElement('div');
      div.textContent = k.text;
      els.killfeed.appendChild(div);
    }
  }
  drawMinimap(G);
}

// Top-down yard: walls, sites, the player (amber) and every living bot.
function drawMinimap(G) {
  if (!minimap) return;
  const ctx = minimap.getContext('2d');
  const W = minimap.width, H = minimap.height;
  const toMap = (x, z) => [(x + 36) / 72 * W, (z + 36) / 72 * H];
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(20,24,28,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(233,230,223,0.25)';
  ctx.strokeRect(1, 1, W - 2, H - 2);
  for (const c of G.world.colliders) {
    const [x0, y0] = toMap(c.x0, c.z0);
    const [x1, y1] = toMap(c.x1, c.z1);
    ctx.fillStyle = 'rgba(233,230,223,0.16)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  const site = (s, color, label) => {
    const [x, y] = toMap(s.x, s.z);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#14161a'; ctx.font = 'bold 8px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  };
  site(G.world.sites.A, '#ff9f43', 'A');
  site(G.world.sites.B, '#35c4b5', 'B');
  const dot = (x, z, color, r = 3) => {
    const [mx, my] = toMap(x, z);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
  };
  for (const b of G.bots) {
    if (!b.alive) continue;
    dot(b.x, b.z, b.team === 'strikers' ? '#ffb347' : '#35c4b5');
  }
  if (G.bomb.state === 'planted') dot(G.bomb.x, G.bomb.z, '#ff3b30', 4);
  if (G.player.alive) {
    const [mx, my] = toMap(G.player.x, G.player.z);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(mx, my);
    ctx.lineTo(mx - Math.sin(G.player.yaw) * 9, my - Math.cos(G.player.yaw) * 9); ctx.stroke();
  }
}

export function showOverlay(title, copy, button) {
  els.overlay.hidden = false;
  els.overlayTitle.textContent = title;
  els.overlayCopy.textContent = copy;
  document.getElementById('play').textContent = button;
}

export function hideOverlay() {
  els.overlay.hidden = true;
}
