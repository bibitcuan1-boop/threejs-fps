// bots.js — the seven AI opponents and teammates. A bot is a small state
// machine: follow its route, hold a position, engage what it can see, plant
// or defuse when the objective calls for it. Vision is distance + field of
// view + a line-of-sight raycast against the world, throttled to one think
// tick per bot so seven bots never raycast every frame.
import * as THREE from 'three';
import { WEAPONS, ROUTES } from './state.js';
import { collideCircle } from './world.js';
import { botFire } from './combat.js';

const _ray = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();

const TEAM_COLOR = { strikers: 0xd98a2b, wardens: 0x2e9e8f };
const TEAM_DARK = { strikers: 0x7a4a16, wardens: 0x155e55 };

export function createBot(G, name, team, spawn, weaponId, route) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: TEAM_DARK[team], roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.42), bodyMat);
  body.position.y = 1.02; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), darkMat);
  head.position.y = 1.68; head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05),
    new THREE.MeshBasicMaterial({ color: team === 'strikers' ? 0xffd27a : 0x7df0e0 }));
  visor.position.set(0, 1.7, 0.19);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5, metalness: 0.5 }));
  gun.position.set(0.28, 1.25, 0.35);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.55, 0.28), darkMat);
  legL.position.set(-0.18, 0.28, 0);
  const legR = legL.clone(); legR.position.x = 0.18;
  group.add(body, head, visor, gun, legL, legR);
  group.position.set(spawn[0], 0, spawn[1]);

  // Name sprite above the head, drawn once at creation.
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const c2 = canvas.getContext('2d');
  c2.font = 'bold 34px system-ui, sans-serif';
  c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillStyle = team === 'strikers' ? '#ffd27a' : '#7df0e0';
  c2.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 0.6, 1);
  sprite.position.y = 2.25;
  group.add(sprite);
  G.scene.add(group);

  const bot = {
    name, team, weapon: weaponId,
    x: spawn[0], z: spawn[1], y: 0, yaw: team === 'strikers' ? 0 : Math.PI,
    hp: 100, alive: true, moving: false,
    role: 'roam', // roam | rush | guard | camp — assigned per round in rounds.js
    route: route.slice(), wp: 0,
    state: 'route', target: null, targetSeen: 0,
    lastShot: -9, heat: 0, burstLeft: 0, burstAt: 0,
    thinkAt: Math.random() * 0.15, walkPhase: Math.random() * 6,
    plantProgress: 0, defuseProgress: 0, holdX: spawn[0], holdZ: spawn[1],
    group, body, head, legL, legR, sprite,
    skill: 0.75 + Math.random() * 0.4,
  };
  body.userData = { bot, part: 'body' };
  head.userData = { bot, part: 'head' };
  G.hitMeshes.push(body, head);
  return bot;
}

export function damageBot(G, bot, dmg, attacker) {
  if (!bot.alive) return false;
  bot.hp -= dmg;
  if (bot.hp <= 0) {
    bot.hp = 0; bot.alive = false;
    bot.group.rotation.x = -Math.PI / 2; // fall flat
    bot.group.position.y = 0.35;
    bot.sprite.visible = false;
    G.hitMeshes = G.hitMeshes.filter((m) => m.userData.bot !== bot);
    const who = attacker === G.player ? 'You' : (attacker ? attacker.name : '—');
    G.kills.push({ text: `${who}  ▸  ${bot.name}`, t: G.time });
    if (attacker && attacker.name) G.roundKills[attacker.name] = (G.roundKills[attacker.name] || 0) + 1;
    if (attacker === G.player) G.money += 300;
    return true;
  }
  return false;
}

function canSee(G, bot, tx, ty, tz) {
  const dx = tx - bot.x, dz = tz - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 42) return false;
  const ang = Math.atan2(-dx, -dz); // yaw convention matches player forward
  let diff = Math.abs(((ang - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (diff > 1.15) return false; // outside ~132° vision cone
  _from.set(bot.x, bot.y + 1.6, bot.z);
  _to.set(tx, ty, tz);
  _dir.copy(_to).sub(_from);
  const d = _dir.length();
  _dir.normalize();
  _ray.set(_from, _dir);
  _ray.far = d;
  const walls = _ray.intersectObjects(G.world.shootables, false);
  return walls.length === 0;
}

function nearestEnemy(G, bot) {
  let best = null, bestD = Infinity;
  const consider = (e, ex, ez, ey) => {
    if (!e.alive) return;
    const d = Math.hypot(ex - bot.x, ez - bot.z);
    if (d < bestD && canSee(G, bot, ex, ey, ez)) { best = e; bestD = d; }
  };
  if (bot.team === 'strikers') {
    for (const w of G.bots) if (w.team === 'wardens') consider(w, w.x, w.z, 1.2);
  } else {
    if (G.player.alive) consider(G.player, G.player.x, G.player.z, G.player.y + 1.2);
    for (const f of G.bots) if (f.team === 'strikers') consider(f, f.x, f.z, 1.2);
  }
  return best;
}

function moveToward(G, bot, tx, tz, dt, speed) {
  const dx = tx - bot.x, dz = tz - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  bot.x += vx * dt;
  [bot.x, bot.z] = collideCircle(G.world.colliders, bot.x, bot.z, 0.42, bot.y);
  bot.z += vz * dt;
  [bot.x, bot.z] = collideCircle(G.world.colliders, bot.x, bot.z, 0.42, bot.y);
  bot.moving = true;
  bot.walkPhase += dt * 9;
  bot.group.position.set(bot.x, 0, bot.z);
  bot.legL.rotation.x = Math.sin(bot.walkPhase) * 0.6;
  bot.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.6;
  return d < 1.1;
}

function faceToward(bot, tx, tz, dt) {
  const target = Math.atan2(-(tx - bot.x), -(tz - bot.z));
  let diff = ((target - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  bot.yaw += diff * Math.min(1, dt * 8);
}

function think(G, bot) {
  bot.target = nearestEnemy(G, bot);
  if (bot.target) { bot.state = 'engage'; bot.targetSeen = G.time; return; }
  // No visible enemy: objective behaviour.
  if (bot.team === 'wardens' && G.bomb.state === 'planted') {
    bot.state = 'defuse'; return; // rotate to the planted site
  }
  if (bot.team === 'strikers' && G.bomb.state === 'carried' && bot.wp >= bot.route.length) {
    bot.state = 'plant'; return; // at the site: plant the charge
  }
  if (bot.team === 'wardens' && G.lastHeard && G.time - G.lastHeard.t < 4
    && bot.role !== 'guard' && bot.role !== 'camp') {
    bot.state = 'investigate'; return; // heard shots: push toward the sound (roamers/rushers only)
  }
  if (bot.team === 'wardens' && bot.wp >= bot.route.length) { bot.state = 'hold'; return; }
  bot.state = 'route';
}

export function stepBot(G, bot, dt) {
  if (!bot.alive) return;
  if (bot.staged) { bot.group.rotation.y = bot.yaw; return; } // screenshot staging: hold the pose
  bot.heat = Math.max(0, bot.heat - dt * 0.5);
  bot.thinkAt -= dt;
  if (bot.thinkAt <= 0) { bot.thinkAt = 0.15 + Math.random() * 0.05; think(G, bot); }
  bot.moving = false;
  // Roles change the pace: rushers sprint in, campers barely move.
  const speed = (3.4 + bot.skill * 0.7) * (bot.role === 'rush' ? 1.15 : bot.role === 'camp' ? 0.9 : 1);

  if (bot.state === 'engage' && bot.target && bot.target.alive !== false) {
    const t = bot.target;
    const tx = t.x, tz = t.z;
    faceToward(bot, tx, tz, dt);
    const dist = Math.hypot(tx - bot.x, tz - bot.z);
    // Strafe sideways while firing, close distance if far away.
    const strafeDir = (Math.floor(G.time * 0.5) % 2 === 0) ? 1 : -1;
    const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
    const px = -fz * strafeDir, pz = fx * strafeDir;
    let mx = px * 1.6, mz = pz * 1.6;
    if (dist > 22) { mx += fx * 2.2; mz += fz * 2.2; }
    else if (dist < (bot.role === 'rush' ? 3 : 6)) { mx -= fx * 1.6; mz -= fz * 1.6; }
    bot.x += mx * dt;
    [bot.x, bot.z] = collideCircle(G.world.colliders, bot.x, bot.z, 0.42, bot.y);
    bot.z += mz * dt;
    [bot.x, bot.z] = collideCircle(G.world.colliders, bot.x, bot.z, 0.42, bot.y);
    bot.moving = true;
    bot.group.position.set(bot.x, 0, bot.z);
    // Burst fire.
    const w = WEAPONS[bot.weapon];
    if (bot.burstLeft <= 0 && G.time >= bot.burstAt) {
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
      bot.burstAt = G.time + 0.7 + Math.random() * 0.8;
    }
    if (bot.burstLeft > 0 && G.time - bot.lastShot > 60 / w.rpm) {
      botFire(G, bot, t, w);
      bot.burstLeft--;
    }
  } else if (bot.state === 'route') {
    const wp = bot.route[bot.wp];
    if (wp) {
      faceToward(bot, wp[0], wp[1], dt);
      if (moveToward(G, bot, wp[0], wp[1], dt, speed)) bot.wp++;
    }
  } else if (bot.state === 'hold') {
    faceToward(bot, bot.holdX + Math.sin(G.time * 0.4 + bot.wp) * 6, bot.holdZ + Math.cos(G.time * 0.3) * 6, dt);
  } else if (bot.state === 'investigate') {
    faceToward(bot, G.lastHeard.x, G.lastHeard.z, dt);
    moveToward(G, bot, G.lastHeard.x, G.lastHeard.z, dt, speed * 1.15);
  } else if (bot.state === 'defuse') {
    const s = G.bomb.site ? G.world.sites[G.bomb.site] : null;
    if (s) {
      faceToward(bot, s.x, s.z, dt);
      if (moveToward(G, bot, s.x, s.z, dt, speed * 1.1)) {
        bot.defuseProgress += dt;
        if (bot.defuseProgress >= 4.5) { G.bomb.defusedBy = bot; }
      } else bot.defuseProgress = 0;
    }
  } else if (bot.state === 'plant') {
    bot.plantProgress += dt;
    if (bot.plantProgress >= 3.2) { G.bomb.plantedBy = bot; }
  }

  bot.group.rotation.y = bot.yaw;
}
