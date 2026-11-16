// combat.js — everything that hurts: hitscan fire with head/body hit
// detection, tracers, impact sparks, grenades and explosions. One raycast
// per pellet; the nearest hit wins, walls included, so you cannot shoot
// through a container. Bots fire through the same code path with an
// accuracy model instead of a perfect aim.
import * as THREE from 'three';
import { HEAD_MULT, addPopup, STREAK_BONUS } from './state.js';
import { damagePlayer } from './player.js';
import { damageBot } from './bots.js';
import { sfx } from './audio.js';

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _tmp = new THREE.Vector3();

const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcf6b });

export function spawnTracer(G, from, to, color = 0xffe9a8) {
  const len = from.distanceTo(to);
  if (len < 0.5) return;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, len), tracerMat.clone());
  m.material.color.setHex(color);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.lookAt(to);
  G.scene.add(m);
  G.tracers.push({ mesh: m, ttl: 0.09 });
}

// Hitscan shot from `origin` along `dir` (already spread). shooter is the
// player object or a bot; victims are found in G.hitMeshes (bot hitboxes).
// Returns {hit: 'head'|'body'|null, bot} for the HUD hitmarker.
export function fireHitscan(G, origin, dir, weapon, shooter) {
  let best = null;
  const pellets = weapon.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    _dir.copy(dir);
    if (pellets > 1 || weapon.spread > 0) {
      _dir.x += (Math.random() - 0.5) * 2 * weapon.spread * 2;
      _dir.y += (Math.random() - 0.5) * 2 * weapon.spread * 2;
      _dir.z += (Math.random() - 0.5) * 2 * weapon.spread * 2;
      _dir.normalize();
    }
    _ray.set(origin, _dir);
    _ray.far = weapon.range;
    const hits = _ray.intersectObjects(G.hitMeshes, false);
    const walls = _ray.intersectObjects(G.world.shootables, false);
    const wallD = walls.length ? walls[0].distance : Infinity;
    if (hits.length && hits[0].distance < wallD) {
      const h = hits[0];
      const part = h.object.userData.part; // 'head' | 'body'
      const mult = part === 'head' ? weapon.head : 1;
      const dist = h.distance;
      const falloff = dist > 30 ? Math.max(0.55, 1 - (dist - 30) / 120) : 1;
      const dmg = weapon.damage * mult * falloff;
      const bot = h.object.userData.bot;
      const killed = damageBot(G, bot, dmg, shooter);
      spawnTracer(G, origin, h.point, weapon.tracer);
      spawnSparks(G, h.point, 5);
      if (shooter === G.player) {
        if (part === 'head') sfx.headshot(); else sfx.hit();
        if (killed) {
          sfx.kill();
          G.player.kills++;
          G.streak = (G.streak || 0) + 1;
          G.roundKills['You'] = (G.roundKills['You'] || 0) + 1;
          addPopup(G, `+$300  ELIMINATED ${bot.name}`);
          if (G.streak >= 3) {
            G.money += STREAK_BONUS;
            addPopup(G, `STREAK x${G.streak}  +$${STREAK_BONUS}`, 'streak');
            sfx.streak();
          }
        }
      }
      if (!best || part === 'head') best = { hit: part, bot, killed };
    } else {
      const end = _tmp.copy(_dir).multiplyScalar(walls.length ? walls[0].distance : weapon.range).add(origin);
      spawnTracer(G, origin, end, weapon.tracer);
      if (walls.length) spawnSparks(G, walls[0].point, 3);
      if (!best) best = { hit: null, bot: null };
    }
  }
  return best;
}

// Bot fire: an accuracy roll, not a raycast at the player. Distance,
// target movement and burst heat all widen the miss. A hit still draws a
// tracer so the player can see where it came from.
export function botFire(G, bot, target, weapon) {
  const dx = target.x - bot.x, dz = target.z - bot.z;
  const dist = Math.hypot(dx, dz);
  const targetMoving = target === G.player ? G.player.moving : (target.moving || false);
  let chance = 0.62 - dist * 0.009 - (targetMoving ? 0.14 : 0) - bot.heat * 0.12;
  if (bot.role === 'camp') chance += 0.08; // campers hold an angle and aim true
  if (bot.role === 'rush') chance -= 0.05; // rushers spray on the move
  chance += ((G.difficulty || 1) - 1) * 0.25; // wardens sharpen every round
  chance = Math.max(0.06, Math.min(0.8, chance));
  const from = _origin.set(bot.x, bot.y + 1.45, bot.z);
  const hit = Math.random() < chance;
  const head = hit && Math.random() < 0.12;
  const to = _tmp.set(target.x, target.y + (head ? 1.62 : 1.1), target.z);
  if (!hit) { // miss wide: offset the tracer end so it visibly whiffs past
    to.x += (Math.random() - 0.5) * 2.2;
    to.y += (Math.random() - 0.5) * 1.2;
    to.z += (Math.random() - 0.5) * 2.2;
  }
  spawnTracer(G, from.clone(), to.clone(), weapon.tracer);
  if (Math.random() < 0.5) sfx.distantShot();
  if (hit) {
    const dmg = weapon.damage * (head ? weapon.head : 1) * (dist > 30 ? 0.75 : 1);
    if (target === G.player) {
      const killed = damagePlayer(G.player, dmg);
      sfx.hurt();
      G.hudFlash = 1;
      G.damageFrom = { x: bot.x, z: bot.z, t: G.time };
      if (killed) { G.player.deaths++; G.streak = 0; }
    } else {
      damageBot(G, target, dmg, bot);
    }
  }
  bot.heat = Math.min(1, bot.heat + 0.25);
  bot.lastShot = G.time;
}

export function spawnSparks(G, point, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), sparkMat);
    m.position.copy(point);
    G.scene.add(m);
    G.particles.push({
      mesh: m, ttl: 0.35 + Math.random() * 0.2,
      vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4,
    });
  }
}

export function throwGrenade(G, from, dir, owner) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a5f3a, roughness: 0.5, metalness: 0.4 }));
  m.position.copy(from);
  G.scene.add(m);
  G.grenades.push({
    mesh: m, owner,
    vx: dir.x * 16, vy: dir.y * 16 + 3.5, vz: dir.z * 16,
    fuse: 1.7, bounced: 0,
  });
  sfx.grenadePin();
}

// Visual half of an explosion: light flash + expanding shell + shake.
// Used on its own for the charge detonation (no damage, round already over)
// and for the plant burst below.
export function blastFx(G, x, y, z, color = 0xffa040, power = 120) {
  const flash = new THREE.PointLight(color, power, 26, 1.6);
  flash.position.set(x, y + 0.5, z);
  G.scene.add(flash);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  shell.position.set(x, y + 0.5, z);
  G.scene.add(shell);
  G.flashes.push({ light: flash, shell, ttl: 0.45, max: 0.45 });
  G.shake = 1;
}

// Plant complete: amber spark burst at the site, no damage.
export function plantBurst(G, x, z) {
  spawnSparks(G, new THREE.Vector3(x, 0.6, z), 14);
  blastFx(G, x, 0.6, z, 0xff9f43, 60);
  sfx.plantDone();
}

export function explode(G, x, y, z, owner) {
  blastFx(G, x, y, z);
  sfx.explosion();
  const R = 7.5;
  for (const b of G.bots) {
    if (!b.alive || b === owner) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < R) damageBot(G, b, 110 * (1 - d / R) + 20, owner);
  }
  if (G.player.alive && owner !== G.player) {
    const d = Math.hypot(G.player.x - x, G.player.z - z);
    if (d < R) {
      const killed = damagePlayer(G.player, 110 * (1 - d / R) + 20);
      if (killed) { G.player.deaths++; G.streak = 0; }
      G.hudFlash = 1;
      G.damageFrom = { x, z, t: G.time };
    }
  }
}

// Ticks every visual effect and grenade. Called from the fixed step.
export function updateFx(G, dt) {
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    const t = G.tracers[i];
    t.ttl -= dt;
    t.mesh.material.opacity = Math.max(0, t.ttl / 0.09) * 0.9;
    if (t.ttl <= 0) { G.scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); G.tracers.splice(i, 1); }
  }
  for (let i = G.flashes.length - 1; i >= 0; i--) {
    const f = G.flashes[i];
    f.ttl -= dt;
    const k = Math.max(0, f.ttl / f.max);
    f.shell.scale.setScalar(1 + (1 - k) * 7);
    f.shell.material.opacity = k * 0.75;
    f.light.intensity = k * 120;
    if (f.ttl <= 0) { G.scene.remove(f.light); G.scene.remove(f.shell); f.shell.geometry.dispose(); f.shell.material.dispose(); G.flashes.splice(i, 1); }
  }
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.ttl -= dt;
    p.vy -= 12 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.ttl <= 0 || p.mesh.position.y < 0) { G.scene.remove(p.mesh); p.mesh.geometry.dispose(); G.particles.splice(i, 1); }
  }
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.vy -= 14 * dt;
    let nx = g.mesh.position.x + g.vx * dt;
    let ny = g.mesh.position.y + g.vy * dt;
    let nz = g.mesh.position.z + g.vz * dt;
    // Floor bounce, cheap wall bounce via the same AABB test as players.
    if (ny < 0.12) { ny = 0.12; g.vy = -g.vy * 0.45; g.vx *= 0.7; g.vz *= 0.7; g.bounced++; }
    for (const c of G.world.colliders) {
      if (ny < c.top && nx > c.x0 && nx < c.x1 && nz > c.z0 && nz < c.z1) {
        // push out on the smallest axis and reflect that velocity component
        const pl = nx - c.x0, pr = c.x1 - nx, pt = nz - c.z0, pb = c.z1 - nz;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) { nx = c.x0 - 0.12; g.vx = -Math.abs(g.vx) * 0.5; }
        else if (m === pr) { nx = c.x1 + 0.12; g.vx = Math.abs(g.vx) * 0.5; }
        else if (m === pt) { nz = c.z0 - 0.12; g.vz = -Math.abs(g.vz) * 0.5; }
        else { nz = c.z1 + 0.12; g.vz = Math.abs(g.vz) * 0.5; }
        g.bounced++;
      }
    }
    g.mesh.position.set(nx, ny, nz);
    g.fuse -= dt;
    if (g.fuse <= 0 || g.bounced > 4) {
      const p = g.mesh.position;
      G.scene.remove(g.mesh);
      G.grenades.splice(i, 1);
      explode(G, p.x, p.y, p.z, g.owner);
    }
  }
}
