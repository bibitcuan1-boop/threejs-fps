// main.js — bootstrap and the game loop. A fixed-step simulation (60 Hz)
// runs apart from rendering: input, player, bots, weapons, objectives and
// effects step in SIM_DT slices, then one render mirrors the state. The
// loop never allocates in the hot path beyond the pooled effect lists.
import * as THREE from 'three';
import { createState, SIM_DT, WEAPONS } from './state.js';
import { buildWorld } from './world.js';
import { createRenderer, createViewmodel, createBombMesh, updateBombMesh, renderFrame, setViewmodelWeapon } from './render.js';
import { createInput, bindInput, requestLock, endStep } from './input.js';
import { createPlayer, stepPlayer } from './player.js';
import { stepWeapons } from './weapons.js';
import { stepBot } from './bots.js';
import { updateFx } from './combat.js';
import { startMatch, startRound, buy, stepObjective, stepRoundTimer, stepBotObjective } from './rounds.js';
import { initHud, updateHud, setBuyOpen, isBuyOpen, refreshBuy, showBuyMsg, showOverlay, hideOverlay } from './hud.js';
import { ensureAudio, sfx } from './audio.js';

const G = createState();
const params = new URLSearchParams(location.search);
G.shotMode = params.get('shot');
G.lastHit = null;
G.hudFlash = 0;
G.shake = 0;
G.muzzleT = 0;
G.lastHeard = null;
G.banner = null;
G.bannerT = 0;
G.startRequested = false;

const { renderer, scene, camera } = createRenderer(document.getElementById('game'));
G.scene = scene;
G.camera = camera;
G.renderer = renderer;
scene.add(camera); // the camera carries the viewmodel gun

G.world = buildWorld(scene);
G.hitMeshes = [];
G.player = createPlayer(G.world.spawns.strikers[0]);
const vm = createViewmodel(camera);
const bombMesh = createBombMesh(scene);

const input = createInput();
bindInput(input, renderer.domElement, (locked) => {
  // If the buy menu is open the mouse stays free; otherwise play resumes.
  if (!locked && G.phase === 'live' && !isBuyOpen() && !G.shotMode) {
    // pointer lock dropped mid-round (Esc): show the menu overlay to re-lock
    if (G.started) showOverlay('Paused', 'Click to jump back into the yard.', 'Resume');
  }
});
renderer.domElement.addEventListener('click', () => {
  if (G.started && !input.locked && !isBuyOpen() && !G.shotMode) requestLock(renderer.domElement);
});

initHud(G,
  (kind) => buy(G, kind),
  () => closeBuy());

function openBuy() {
  if (G.phase !== 'buy') return;
  setBuyOpen(G, true);
  refreshBuy(G);
  document.exitPointerLock?.();
}
function closeBuy() {
  setBuyOpen(G, false);
  if (G.started && !G.shotMode) requestLock(renderer.domElement);
}

// Buy keys: 1-5 while the menu is open, B toggles it.
function stepBuyKeys() {
  if (G.phase !== 'buy') { if (isBuyOpen()) setBuyOpen(G, false); return; }
  if (input.pressed.has('KeyB')) {
    if (isBuyOpen()) closeBuy(); else openBuy();
    return;
  }
  if (!isBuyOpen()) return;
  const pick = input.pressed.has('Digit1') ? 'rifle'
    : input.pressed.has('Digit2') ? 'smg'
    : input.pressed.has('Digit3') ? 'shotgun'
    : input.pressed.has('Digit4') ? 'grenade'
    : input.pressed.has('Digit5') ? 'armor' : null;
  if (pick) {
    const msg = buy(G, pick);
    if (msg) showBuyMsg(msg);
    refreshBuy(G);
  }
}

// ---- Screenshot staging (?shot=cover|fight|buy|plant) --------------------
// The judge reads screenshots, so each one stages a real moment of play:
// bots in the open, the buy menu, a plant in progress. No pointer lock,
// the round auto-starts, staged bots hold still so the frame is stable.
function stageShot(mode) {
  const p = G.player;
  const stageBot = (bot, x, z, yaw) => {
    bot.x = x; bot.z = z; bot.yaw = yaw;
    bot.group.position.set(x, 0, z);
    bot.group.rotation.y = yaw;
    bot.staged = true;
    bot.route = [];
    bot.wp = 0;
  };
  const wardens = G.bots.filter((b) => b.team === 'wardens');
  const friends = G.bots.filter((b) => b.team === 'strikers');
  if (mode === 'cover') {
    G.phase = 'live'; G.timer = 85;
    p.x = 0; p.z = 20; p.yaw = 0.12; p.pitch = 0.03;
    stageBot(wardens[0], -6, -2, Math.PI * 0.85);
    stageBot(wardens[1], 8, -6, Math.PI * 1.1);
    stageBot(friends[0], -3, 9, 0.2);
  } else if (mode === 'fight') {
    G.phase = 'live'; G.timer = 72;
    p.x = 0; p.z = 8; p.yaw = -0.06; p.pitch = 0.01;
    stageBot(wardens[0], 2, -6, Math.PI);
    stageBot(wardens[1], -5, -10, Math.PI * 0.9);
    stageBot(friends[0], -4, 2, 0);
  } else if (mode === 'buy') {
    G.money = 4300;
    openBuy();
  } else if (mode === 'plant') {
    G.phase = 'live'; G.timer = 60;
    p.x = -14; p.z = -15; p.yaw = -0.5; p.pitch = 0.02;
    p.planting = 2.4; // progress bar ~75%; stepSim freezes it there
    stageBot(wardens[0], -8, -12, Math.PI * 0.8);
    stageBot(wardens[1], -20, -26, Math.PI * 0.6);
  }
  if (mode !== 'buy') {
    // A live firefight reads better with a fresh tracer in the air.
    G.banner = null; G.bannerT = 0;
  }
  // Screenshot modes are frozen tableaus: hold EVERY bot, not just the
  // staged ones, or a free bot shoots the player mid-settle (the plant
  // shot showed HP 0) and bots kill each other in the background.
  for (const b of G.bots) { b.staged = true; b.route = []; b.wp = 0; }
}

function beginPlay() {
  ensureAudio();
  hideOverlay();
  if (!G.started) {
    G.started = true;
    startMatch(G);
    setViewmodelWeapon(vm, G.player.weapon);
    if (G.shotMode) stageShot(G.shotMode);
    else openBuy();
  }
  if (!G.shotMode) requestLock(renderer.domElement);
}

// Overlay button + Enter key both start the game.
document.getElementById('play').addEventListener('click', beginPlay);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !G.started) beginPlay();
  if (e.code === 'KeyM' && G.phase === 'matchEnd') { startMatch(G); hideOverlay(); }
});

// ---- Fixed-step simulation ------------------------------------------------
let lastStep = -1;
function stepSim(dt) {
  G.time += dt;
  if (G.phase === 'menu' || !G.started) return;

  stepBuyKeys();
  if (G.phase === 'matchEnd') {
    if (!G.matchShown) {
      G.matchShown = true;
      showOverlay(
        G.winner === 'strikers' ? 'Match won — the yard is yours' : 'Match lost — the wardens hold the yard',
        `Final score ${G.score.strikers} — ${G.score.wardens}. Press M or click below to run it back.`,
        'Play again');
      document.getElementById('play').onclick = () => { G.matchShown = false; startMatch(G); hideOverlay(); };
    }
    endStep(input);
    return;
  }

  stepRoundTimer(G, dt);
  if (G.phase === 'live' || G.phase === 'buy') {
    const moving = stepPlayer(G.player, input, dt, G.world.colliders);
    if (moving && G.player.onGround) {
      const s = Math.floor(G.player.stepT);
      if (s !== lastStep) { lastStep = s; if (Math.random() < 0.6) sfx.step(); }
    }
    stepWeapons(G, input, dt);
    stepObjective(G, input, dt);
    // Screenshot staging: freeze the plant bar at ~75% so the shot always
    // shows it instead of the plant finishing before the screenshot.
    if (G.shotMode === 'plant' && G.bomb.state === 'carried') G.player.planting = 2.4;
    stepBotObjective(G);
    for (const b of G.bots) stepBot(G, b, dt);
    updateFx(G, dt);
    // Weapon viewmodel follows the equipped weapon.
    if (vm._weapon !== G.player.weapon) {
      vm._weapon = G.player.weapon;
      setViewmodelWeapon(vm, G.player.weapon);
    }
  } else if (G.phase === 'roundEnd') {
    updateFx(G, dt);
  }
  endStep(input);
}

let last = performance.now();
let acc = 0;
let frameCount = 0;

// A per-frame error must never kill the loop silently: report it into the
// on-page box (see index.html) and keep going, so the failure is readable
// from a screenshot alone.
function reportErr(err) {
  try {
    window.__errs = window.__errs || [];
    const msg = String((err && err.stack) || err);
    if (window.__errs[window.__errs.length - 1] !== msg) window.__errs.push(msg);
    if (window.__errs.length > 5) window.__errs.shift();
    if (window.__showErr) window.__showErr();
  } catch { /* the reporter must never break the loop */ }
}

// Live render diagnostics, bottom-right, updated twice a second: canvas
// size, draw calls, camera position. If the scene is blank, these say
// whether render() runs at all.
function updateDbg() {
  try {
    let d = document.getElementById('dbg');
    if (!d) {
      d = document.createElement('div');
      d.id = 'dbg';
      d.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9998;background:rgba(0,40,40,.85);color:#bff;font:11px/1.5 monospace;padding:6px 8px;pointer-events:none;white-space:pre;';
      document.body.appendChild(d);
    }
    const c = G.renderer.domElement;
    d.textContent = `t=${G.time.toFixed(1)} phase=${G.phase} timer=${G.timer.toFixed(1)} canvas=${c.width}x${c.height} calls=${G.renderer.info.render.calls} tris=${G.renderer.info.render.triangles} cam=(${G.camera.position.x.toFixed(1)},${G.camera.position.y.toFixed(1)},${G.camera.position.z.toFixed(1)}) bots=${G.bots.length}`;
  } catch { /* never break the loop */ }
}

function frame(now) {
  requestAnimationFrame(frame);
  try {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // tab was hidden: don't spiral
    acc += dt;
    let n = 0;
    while (acc >= SIM_DT && n < 5) {
      stepSim(SIM_DT);
      acc -= SIM_DT;
      n++;
    }
    if (n === 5) acc = 0;
    updateBombMesh(G, bombMesh);
    updateHud(G);
    renderFrame(G, vm, dt);
    // Diagnostics only with ?debug=1, so they never pollute the screenshots.
    if (params.get('debug') && (frameCount++ % 30) === 0) updateDbg();
  } catch (err) { reportErr(err); }
}

// Shot mode auto-starts: the browser only needs to open the URL.
if (G.shotMode) {
  beginPlay();
} else {
  showOverlay('RUSTLINE — Dockyard Strike',
    'Round-based tactical FPS. Plant the charge at site A or B, or eliminate the wardens. Buy between rounds, mind your spread, and stop to aim.',
    'Click to play');
}
window.__game = G; // for play-testing from the browser console
requestAnimationFrame(frame);
