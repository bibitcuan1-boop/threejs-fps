// world.js — the dockyard map. One job: build every mesh, light and
// collider, and hand back the spawn points, bomb sites and the AABB list the
// movement and shooting code collides against. Original map: "Rustline
// Dockyard", a container yard at dusk — two lanes, a mid connector, an
// A site under the gantry crane and a B site inside the warehouse shell.
import * as THREE from 'three';

const C = {
  ground: 0x2e3438, concrete: 0x565e66, darkWall: 0x3a4046, rust: 0xb45a28,
  rust2: 0x8f4a24, teal: 0x2e7f7a, tealDark: 0x1f5a56, amber: 0xd98a2b,
  amberBright: 0xffb347, crate: 0x6b5a43, crate2: 0x7d6a4e, steel: 0x4a545e,
  hazard: 0xc9a227, siteA: 0xff9f43, siteB: 0x35c4b5,
};

export function buildWorld(scene) {
  const colliders = []; // {x0,z0,x1,z1,top}
  const shootables = []; // meshes bullets can hit (walls, boxes, ground)
  const mats = {};
  const mat = (color, rough = 0.9) => {
    const key = color + '/' + rough;
    if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.08 });
    return mats[key];
  };

  function box(x, z, w, h, d, color, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts.rough ?? 0.9));
    m.position.set(x, h / 2 + (opts.y ?? 0), z);
    if (opts.ry) m.rotation.y = opts.ry;
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = true;
    scene.add(m);
    shootables.push(m);
    if (opts.solid !== false) colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, top: h + (opts.y ?? 0) });
    return m;
  }

  // Ground: cracked concrete yard with painted lane lines.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(76, 76), mat(C.ground, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x8a7a3a });
  for (const [x, z, w, d] of [[-8, 0, 0.25, 60], [8, 0, 0.25, 60], [0, -24, 40, 0.25], [0, 24, 40, 0.25]]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.02, z);
    scene.add(line);
  }

  // Perimeter walls with a gap-free ring; the yard is 72 x 72 inside.
  box(0, -36, 76, 5, 1.2, C.darkWall);
  box(0, 36, 76, 5, 1.2, C.darkWall);
  box(-36, 0, 1.2, 5, 76, C.darkWall);
  box(36, 0, 1.2, 5, 76, C.darkWall);

  // --- A site: the crane yard, north-west. A gantry crane straddles it.
  box(-16, -20, 12, 0.3, 12, C.siteA, { solid: false, shadow: false }); // site pad glow base
  const padA = new THREE.Mesh(new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({ color: C.siteA, transparent: true, opacity: 0.22 }));
  padA.rotation.x = -Math.PI / 2; padA.position.set(-16, 0.05, -20); scene.add(padA);
  // Crane legs and jib (visual only above head height, legs are solid).
  box(-22, -26, 1.4, 11, 1.4, C.amber);
  box(-10, -26, 1.4, 11, 1.4, C.amber);
  box(-22, -14, 1.4, 11, 1.4, C.amber);
  box(-10, -14, 1.4, 11, 1.4, C.amber);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 2), mat(C.amber));
  jib.position.set(-16, 11.4, -20); jib.castShadow = true; scene.add(jib); shootables.push(jib);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat(C.steel));
  hook.position.set(-16, 8.5, -20); scene.add(hook);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8), mat(0x222222));
  cable.position.set(-16, 10, -20); scene.add(cable);

  // --- B site: warehouse shell, north-east. Roof beams, open front.
  box(16, -20, 12, 0.3, 12, C.siteB, { solid: false, shadow: false });
  const padB = new THREE.Mesh(new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({ color: C.siteB, transparent: true, opacity: 0.22 }));
  padB.rotation.x = -Math.PI / 2; padB.position.set(16, 0.05, -20); scene.add(padB);
  box(16, -27.5, 16, 6, 1, C.tealDark); // back wall
  box(8.5, -20, 1, 6, 15, C.tealDark); // west wall
  box(23.5, -20, 1, 6, 15, C.tealDark); // east wall
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 15), mat(C.steel));
  roof.position.set(16, 6.2, -20); roof.castShadow = true; scene.add(roof); shootables.push(roof);

  // --- Container stacks: the lanes. Rust-red and teal boxes, 2 high in places.
  const containers = [
    [-12, 8, 0], [-12, 8, 2.6], [12, 8, 0], [12, 8, 2.6],
    [-20, -2, 0], [20, -2, 0], [-6, -10, 0], [6, -10, 0],
    [-24, 12, 0], [24, 12, 0], [-4, 20, 0], [4, 20, 0],
  ];
  for (const [x, z, y] of containers) {
    const col = ((x + z) % 3 === 0) ? C.rust : ((x * z) % 2 === 0 ? C.teal : C.rust2);
    box(x, z, 6, 2.6, 2.4, col, { y });
  }
  // Long container walls shaping mid and the two lanes.
  box(-14, 2, 2.4, 2.6, 10, C.teal, { ry: 0 });
  box(14, 2, 2.4, 2.6, 10, C.teal);
  box(0, -6, 10, 2.6, 2.4, C.rust2);
  box(-8, 18, 8, 2.6, 2.4, C.rust);
  box(10, 18, 8, 2.6, 2.4, C.rust);

  // --- Crates and barrels: low cover you can shoot over while crouched behind.
  const crates = [[-4, 6], [5, 6], [-2, -14], [3, -14], [-18, -8], [18, -8], [0, 12], [-10, -16], [10, -16], [-26, 0], [26, 0]];
  for (const [x, z] of crates) box(x, z, 1.6, 1.6, 1.6, ((x + z) % 4 === 0) ? C.crate2 : C.crate);
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 12);
  for (const [x, z] of [[-6, -2], [7, -4], [-19, 4], [19, 6], [-2, 22], [2, -24]]) {
    const b = new THREE.Mesh(barrelGeo, mat(C.amber, 0.6));
    b.position.set(x, 0.7, z); b.castShadow = true; scene.add(b); shootables.push(b);
    colliders.push({ x0: x - 0.55, z0: z - 0.55, x1: x + 0.55, z1: z + 0.55, top: 1.4 });
  }

  // --- Striker spawn: south gatehouse; warden spawn: north offices.
  box(-3, 32, 8, 3, 2, C.steel);
  box(3, 32, 8, 3, 2, C.steel);
  box(-3, -32, 8, 3.5, 2, C.steel);
  box(3, -32, 8, 3.5, 2, C.steel);

  // Site marker pylons: tall amber (A) / teal (B) beacons, readable at a glance.
  for (const [x, z, color] of [[-22, -26, C.siteA], [-10, -14, C.siteA], [8.5, -27, C.siteB], [23.5, -13, C.siteB]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.5, 8),
      new THREE.MeshBasicMaterial({ color }));
    p.position.set(x, 2.25, z); scene.add(p);
  }

  // Dusk lighting: low amber sun, cool sky fill, warm site lights.
  scene.fog = new THREE.Fog(0x1a2027, 45, 95);
  scene.background = new THREE.Color(0x1a2027);
  const hemi = new THREE.HemisphereLight(0x8fb4c7, 0x2a2118, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb347, 1.6);
  sun.position.set(-30, 26, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 90;
  scene.add(sun);
  const siteLightA = new THREE.PointLight(0xff9f43, 30, 22, 1.8);
  siteLightA.position.set(-16, 5, -20); scene.add(siteLightA);
  const siteLightB = new THREE.PointLight(0x35c4b5, 30, 22, 1.8);
  siteLightB.position.set(16, 5, -20); scene.add(siteLightB);
  const midLight = new THREE.PointLight(0xffd27a, 18, 20, 1.8);
  midLight.position.set(0, 4.5, 0); scene.add(midLight);

  return {
    colliders, shootables,
    sites: { A: { x: -16, z: -20 }, B: { x: 16, z: -20 } },
    spawns: {
      strikers: [[-4, 30], [0, 31], [4, 30], [0, 28]],
      wardens: [[-6, -30], [-2, -31], [2, -31], [6, -30]],
    },
  };
}

// Circle (player/bot radius r, feet y) vs AABB, resolved per axis so sliding
// along walls works. Returns the corrected x/z; call once per axis.
export function collideCircle(colliders, x, z, r, y) {
  for (const c of colliders) {
    if (y > c.top - 0.05) continue; // can step over low cover only if above it
    const nx = Math.max(c.x0, Math.min(x, c.x1));
    const nz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      z = nz + (dz / d) * r;
    } else if (d2 <= 1e-8) {
      // centre inside the box: push out along the smallest penetration axis
      const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.x0 - r; else if (m === pr) x = c.x1 + r;
      else if (m === pt) z = c.z0 - r; else z = c.z1 + r;
    }
  }
  // Hard yard bounds.
  x = Math.max(-34.5, Math.min(34.5, x));
  z = Math.max(-34.5, Math.min(34.5, z));
  return [x, z];
}
