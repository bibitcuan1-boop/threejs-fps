// render.js — everything the eye sees: renderer, camera, the viewmodel gun
// with its muzzle flash, and the bomb charge mesh. The sim never builds
// meshes here except through combat.js effects; this module only mirrors
// sim state onto the camera and the gun each frame.
import * as THREE from 'three';
import { WEAPONS } from './state.js';
import { eyePos } from './player.js';

const _eye = new THREE.Vector3();

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 220);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  return { renderer, scene, camera };
}

// The gun the player holds: boxes only, styled per weapon, bobbing with
// movement and kicking with recoil. No model files, no network.
export function createViewmodel(camera) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.45, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd98a2b, roughness: 0.6, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), dark);
  barrel.position.set(0, 0.03, -0.46);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), accent);
  grip.position.set(0, -0.14, 0.18);
  grip.rotation.x = 0.35;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.09), dark);
  mag.position.set(0, -0.14, -0.05);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), accent);
  sight.position.set(0, 0.09, -0.15);
  group.add(body, barrel, grip, mag, sight);
  const flashLight = new THREE.PointLight(0xffc46b, 0, 9, 1.8);
  flashLight.position.set(0, 0, -0.6);
  group.add(flashLight);
  const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  flashQuad.position.set(0, 0.03, -0.68);
  group.add(flashQuad);
  group.position.set(0.32, -0.32, -0.55);
  camera.add(group);
  return { group, flashLight, flashQuad, body, barrel };
}

export function setViewmodelWeapon(vm, weaponId) {
  const w = WEAPONS[weaponId];
  // Longer barrel for the rifle, stubby for the shotgun, slim for the SMG.
  const len = weaponId === 'rifle' ? 0.42 : weaponId === 'shotgun' ? 0.3 : weaponId === 'smg' ? 0.26 : 0.2;
  vm.barrel.scale.z = len / 0.34;
  vm.barrel.position.z = -0.46 - (len - 0.34) / 2;
  vm.body.scale.z = weaponId === 'shotgun' ? 1.15 : 1;
}

// The planted charge: a blinking amber box at the site, with a beeping light.
export function createBombMesh(scene) {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.4 }));
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  light.position.set(0, 0.18, 0);
  const glow = new THREE.PointLight(0xff3b30, 0, 8, 2);
  glow.position.y = 0.4;
  group.add(box, light, glow);
  group.visible = false;
  scene.add(group);
  return { group, light, glow };
}

export function updateBombMesh(G, bombMesh) {
  const planted = G.bomb.state === 'planted';
  bombMesh.group.visible = planted;
  if (!planted) return;
  bombMesh.group.position.set(G.bomb.x, 0.16, G.bomb.z);
  const blink = Math.sin(G.time * 9) > 0;
  bombMesh.light.material.color.setHex(blink ? 0xff3b30 : 0x551512);
  bombMesh.glow.intensity = blink ? 6 : 0.5;
}

// Mirror sim state onto the camera + viewmodel. dt is real frame time.
export function renderFrame(G, vm, dt) {
  const p = G.player;
  eyePos(p, _eye);
  G.camera.position.copy(_eye);
  // Camera shake decays; recoil adds a small upward pitch offset.
  G.shake = Math.max(0, G.shake - dt * 2.2);
  const sh = G.shake * 0.02;
  G.camera.rotation.order = 'YXZ';
  G.camera.rotation.y = p.yaw + (Math.random() - 0.5) * sh;
  G.camera.rotation.x = p.pitch + p.recoil + (Math.random() - 0.5) * sh;
  G.camera.rotation.z = (Math.random() - 0.5) * sh * 0.5;

  // Viewmodel: walk bob, crouch lower, recoil kick, muzzle flash.
  const bob = p.moving && p.onGround ? Math.sin(p.stepT * 2.2) * 0.012 : 0;
  const bobY = p.moving && p.onGround ? Math.abs(Math.cos(p.stepT * 2.2)) * 0.01 : 0;
  vm.group.position.x = 0.32 + bob;
  vm.group.position.y = -0.32 - (p.crouch ? 0.04 : 0) + bobY;
  vm.group.position.z = -0.55 + p.recoil * 2.2;
  vm.group.rotation.x = p.recoil * 3;
  if (G.muzzleT > 0) {
    G.muzzleT -= dt;
    vm.flashLight.intensity = 14;
    vm.flashQuad.material.opacity = 0.9;
    vm.flashQuad.rotation.z = Math.random() * Math.PI;
  } else {
    vm.flashLight.intensity = 0;
    vm.flashQuad.material.opacity = 0;
  }
  G.renderer.render(G.scene, G.camera);
}
