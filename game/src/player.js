// player.js — first-person movement and the player's combat state.
// Acceleration + friction (no instant stops), crouch, jump, AABB collision
// via world.collideCircle, and per-weapon ammo. The camera reads yaw/pitch
// from here; the sim owns the numbers, rendering only displays them.
import { EYE_STAND, EYE_CROUCH, WEAPONS } from './state.js';
import { collideCircle } from './world.js';

const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 11;
const JUMP_VEL = 5.2;
const GRAVITY = 14;
const RADIUS = 0.42;
const HEIGHT = 1.75;

export function createPlayer(spawn) {
  return {
    name: 'You', team: 'strikers',
    x: spawn[0], z: spawn[1], y: 0, vy: 0, onGround: true,
    vx: 0, vz: 0,
    yaw: 0, pitch: 0, // facing north, up the yard toward the sites
    crouch: false, eye: EYE_STAND,
    hp: 100, armor: 0, alive: true,
    weapon: 'rifle', weapons: { pistol: { mag: 12, reserve: 48 } },
    grenades: 0,
    lastShot: -9, reloadUntil: 0, reloading: false,
    spread: 0, bloom: 0, recoil: 0,
    moving: false, planting: 0, defusing: 0,
    kills: 0, deaths: 0,
    stepT: 0,
  };
}

export function giveWeapon(p, id) {
  const w = WEAPONS[id];
  p.weapons[id] = { mag: w.mag, reserve: w.reserve };
  p.weapon = id;
  p.reloading = false;
}

export function currentWeapon(p) {
  return WEAPONS[p.weapon];
}

export function ammoOf(p, id) {
  return p.weapons[id] || { mag: 0, reserve: 0 };
}

// One fixed step of movement. Returns true while the player is moving.
export function stepPlayer(p, input, dt, colliders) {
  if (!p.alive) return false;
  const fwd = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
  const strafe = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
  p.crouch = input.keys.has('ControlLeft') || input.keys.has('ControlRight') || input.keys.has('KeyC');
  const speed = p.crouch ? CROUCH_SPEED : WALK_SPEED;

  // Mouse look: yaw around Y, pitch clamped so the view never flips.
  p.yaw -= input.mouseDX * 0.0021;
  p.pitch -= input.mouseDY * 0.0021;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));

  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let wx = (-sin * fwd + cos * strafe);
  let wz = (-cos * fwd - sin * strafe);
  const len = Math.hypot(wx, wz);
  if (len > 0) { wx /= len; wz /= len; }
  const targetVX = wx * speed, targetVZ = wz * speed;
  const rate = len > 0 ? ACCEL * dt : FRICTION * dt;
  p.vx += (targetVX - p.vx) * Math.min(1, rate);
  p.vz += (targetVZ - p.vz) * Math.min(1, rate);
  p.moving = len > 0 && Math.hypot(p.vx, p.vz) > 0.6;

  // Integrate one axis at a time so the circle-vs-AABB resolve slides.
  p.x += p.vx * dt;
  [p.x, p.z] = collideCircle(colliders, p.x, p.z, RADIUS, p.y);
  p.z += p.vz * dt;
  [p.x, p.z] = collideCircle(colliders, p.x, p.z, RADIUS, p.y);

  // Gravity + jump. Jump only from the ground, never while crouched.
  if (input.pressed.has('Space') && p.onGround && !p.crouch) {
    p.vy = JUMP_VEL; p.onGround = false;
  }
  p.vy -= GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }

  // Eye height eases toward stand/crouch so the view never snaps.
  const targetEye = p.crouch ? EYE_CROUCH : EYE_STAND;
  p.eye += (targetEye - p.eye) * Math.min(1, dt * 12);

  // Spread bloom decays when not firing; moving or airborne widens it.
  p.bloom = Math.max(0, p.bloom - dt * 0.09);
  p.recoil = Math.max(0, p.recoil - dt * 0.06);
  const w = currentWeapon(p);
  const movePenalty = p.moving ? w.moveSpread : 0;
  const airPenalty = p.onGround ? 0 : 0.03;
  p.spread = w.spread + p.bloom + movePenalty + airPenalty + (p.crouch ? -0.004 : 0);

  p.stepT += dt * Math.hypot(p.vx, p.vz);
  return p.moving;
}

// Damage with armor absorbing half until it breaks. Returns true if killed.
export function damagePlayer(p, amount) {
  if (!p.alive) return false;
  let rest = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest * 0.5);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  p.hp -= rest;
  if (p.hp <= 0) { p.hp = 0; p.alive = false; return true; }
  return false;
}

export function eyePos(p, out) {
  out.set(p.x, p.y + p.eye, p.z);
  return out;
}

export function forwardVec(p, out) {
  const cp = Math.cos(p.pitch);
  out.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  return out;
}
