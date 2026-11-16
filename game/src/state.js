// state.js — one place for every fact the game shares: constants, weapon
// definitions, map routes and the mutable match state G. No module keeps its
// own copy of match state; everything reads and writes G.
export const SIM_DT = 1 / 60;
export const ROUND_TIME = 100; // seconds of live play per round
export const BUY_TIME = 14; // seconds of buy phase before a round goes live
export const PLANT_TIME = 3.2; // seconds holding E at a site to plant
export const DEFUSE_TIME = 4.5; // seconds holding E at the charge to defuse
export const BOMB_TIME = 35; // seconds from plant to detonation
export const WIN_ROUNDS = 5; // first team to this many round wins takes the match
export const MAX_ROUNDS = 9;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.05;

// Weapons. damage is per body hit; headshots multiply by HEAD_MULT.
// spread is radians at rest, bloom grows it while firing or moving.
export const HEAD_MULT = 2.0;
export const WEAPONS = {
  pistol: { name: 'P2000 "Harbor"', price: 0, damage: 26, head: 2.0, rpm: 320, mag: 12, reserve: 48, reload: 1.5, spread: 0.011, moveSpread: 0.02, recoil: 0.011, auto: false, range: 60, tracer: 0xffe9a8 },
  smg: { name: 'VK-9 "Riptide"', price: 1500, damage: 22, head: 1.8, rpm: 720, mag: 28, reserve: 112, reload: 1.9, spread: 0.02, moveSpread: 0.03, recoil: 0.008, auto: true, range: 45, tracer: 0xffd27a },
  rifle: { name: 'AR-77 "Longshore"', price: 2700, damage: 34, head: 2.2, rpm: 600, mag: 30, reserve: 90, reload: 2.3, spread: 0.006, moveSpread: 0.026, recoil: 0.016, auto: true, range: 90, tracer: 0xffe9a8 },
  shotgun: { name: 'M590 "Breakwater"', price: 1100, damage: 14, head: 1.6, rpm: 75, mag: 6, reserve: 24, reload: 2.8, spread: 0.055, moveSpread: 0.05, recoil: 0.05, auto: false, pellets: 8, range: 22, tracer: 0xffc46b },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const PLANT_REWARD = 300;

// Bot names. Original characters, two crews fighting over a dockyard.
export const STRIKER_NAMES = ['Marlow', 'Kestrel', 'Bishop'];
export const WARDEN_NAMES = ['Varga', 'Onyx', 'Hale', 'Rook'];
export const PLAYER_NAME = 'You';

export function createState() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    score: { strikers: 0, wardens: 0 },
    money: 800,
    timer: BUY_TIME,
    bomb: { state: 'carried', site: null, x: 0, z: 0, fuse: 0, planter: null },
    player: null, // filled by player.js: {pos, vel, yaw, pitch, hp, armor, ...}
    bots: [], // bot objects, see bots.js
    tracers: [], // live tracer meshes with a ttl
    flashes: [], // explosion / muzzle light flashes with a ttl
    grenades: [], // live grenade projectiles
    particles: [], // impact sparks, one pooled array
    kills: [], // killfeed entries {text, t}
    events: [], // timed callbacks the sim drains, e.g. delayed bot actions
    time: 0, // sim time, seconds
    shotMode: null, // ?shot= staging for screenshots, null in normal play
    started: false,
    winner: null,
  };
}

// Waypoint routes through the dockyard. Two lanes to each site plus a mid
// connector, so bots never march single file down one corridor.
export const ROUTES = {
  // from striker spawn (south) to A site (crane yard, north-west)
  toA_lane: [[0, 26], [-6, 14], [-12, 4], [-16, -8], [-14, -18]],
  toA_mid: [[0, 26], [2, 12], [0, 0], [-8, -8], [-14, -18]],
  // from striker spawn to B site (warehouse, north-east)
  toB_lane: [[0, 26], [7, 14], [13, 4], [16, -8], [15, -18]],
  toB_mid: [[0, 26], [2, 12], [0, 0], [9, -8], [15, -18]],
  // warden rotations from their spawn (north) toward mid / sites
  wardenA: [[-2, -26], [-10, -18], [-14, -18]],
  wardenB: [[2, -26], [10, -18], [15, -18]],
  wardenMid: [[0, -26], [0, -12], [0, 0]],
};
