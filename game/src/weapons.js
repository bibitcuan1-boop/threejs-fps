// weapons.js — the player's trigger: fire, reload, switch, throw. Fire
// rate is enforced from the sim clock, recoil kicks the pitch up and bloom
// out, and every shot is a raycast from the camera so what you see is what
// you hit. Movement punishes accuracy through the spread in player.js.
import * as THREE from 'three';
import { WEAPONS } from './state.js';
import { currentWeapon, ammoOf, eyePos, forwardVec } from './player.js';
import { fireHitscan, throwGrenade } from './combat.js';
import { sfx } from './audio.js';

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function stepWeapons(G, input, dt) {
  const p = G.player;
  if (!p.alive) return;

  // Weapon switching: 1 rifle, 2 smg, 3 shotgun, 4 pistol — only if owned.
  const switchTo = input.pressed.has('Digit1') ? 'rifle'
    : input.pressed.has('Digit2') ? 'smg'
    : input.pressed.has('Digit3') ? 'shotgun'
    : input.pressed.has('Digit4') ? 'pistol' : null;
  if (switchTo && p.weapons[switchTo] && p.weapon !== switchTo) {
    p.weapon = switchTo;
    p.reloading = false;
    sfx.reload();
  }

  // Reload: R, or auto when the magazine is dry and the trigger is pulled.
  const w = currentWeapon(p);
  const ammo = ammoOf(p, p.weapon);
  if (input.pressed.has('KeyR') && !p.reloading && ammo.mag < w.mag && ammo.reserve > 0) {
    p.reloading = true;
    p.reloadUntil = G.time + w.reload;
    sfx.reload();
  }
  if (p.reloading && G.time >= p.reloadUntil) {
    const need = w.mag - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
    p.reloading = false;
  }

  // Grenade: G throws one in the look direction.
  if (input.pressed.has('KeyG') && p.grenades > 0 && G.phase === 'live') {
    p.grenades--;
    eyePos(p, _origin);
    forwardVec(p, _dir);
    throwGrenade(G, _origin, _dir, p);
  }

  // Fire: hold for autos, click for semi-autos. Fire rate gates the shots.
  const wantFire = w.auto ? input.mouseDown : input.mouseDown && !p._fired;
  p._fired = input.mouseDown;
  if (!wantFire || p.reloading || G.phase !== 'live') return;
  if (G.time - p.lastShot < 60 / w.rpm) return;
  if (ammo.mag <= 0) {
    sfx.dryFire();
    p.lastShot = G.time; // rate-limit the dry click
    if (ammo.reserve > 0) {
      p.reloading = true;
      p.reloadUntil = G.time + w.reload;
      sfx.reload();
    }
    return;
  }
  ammo.mag--;
  p.lastShot = G.time;
  eyePos(p, _origin);
  forwardVec(p, _dir);
  // Spread: random cone around the look direction, wider while moving.
  const s = p.spread;
  _dir.x += (Math.random() - 0.5) * 2 * s;
  _dir.y += (Math.random() - 0.5) * 2 * s;
  _dir.z += (Math.random() - 0.5) * 2 * s;
  _dir.normalize();
  // Muzzle point slightly forward so the tracer starts at the gun, not the eye.
  const muzzle = _origin.clone().addScaledVector(_dir, 0.7);
  muzzle.y -= 0.12;
  const result = fireHitscan(G, muzzle, _dir, w, p);
  if (result && result.hit) G.lastHit = { part: result.hit, t: G.time, killed: result.killed };
  // Recoil: pitch kick + bloom. Stopping to aim pays; spraying does not.
  p.pitch += w.recoil * (0.7 + Math.random() * 0.6);
  p.bloom = Math.min(0.09, p.bloom + w.recoil * 0.9);
  p.recoil = Math.min(0.05, p.recoil + w.recoil);
  G.muzzleT = 0.06;
  G.lastHeard = { x: p.x, z: p.z, t: G.time }; // bots hear the shot
  sfx.shot(p.weapon);
  G.shake = Math.max(G.shake, 0.25 + w.recoil * 4); // harder kick, bigger shake
}
