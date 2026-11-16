// rounds.js — the match state machine: buy phase, live play, plant/defuse,
// round end, match end. Money flows here: kills pay in combat, round
// results pay here. The buy menu is DOM (hud.js); this module only decides
// what can be bought and applies it.
import { BUY_TIME, ROUND_TIME, BOMB_TIME, WIN_ROUNDS, MAX_ROUNDS, PLANT_TIME, DEFUSE_TIME,
  WEAPONS, GRENADE_PRICE, ARMOR_PRICE, WIN_REWARD, LOSS_REWARD, PLANT_REWARD, DEFUSE_REWARD,
  addPopup } from './state.js';
import { giveWeapon } from './player.js';
import { createBot } from './bots.js';
import { STRIKER_NAMES, WARDEN_NAMES, ROUTES } from './state.js';
import { plantBurst, blastFx } from './combat.js';
import { sfx } from './audio.js';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function startMatch(G) {
  G.score = { strikers: 0, wardens: 0 };
  G.round = 1;
  G.money = 800;
  G.streak = 0; // kill streak resets with the match, not the round
  G.hintUntil = G.time + 25; // control hint bar for the first 25 seconds
  G.player.kills = 0; G.player.deaths = 0;
  startRound(G);
}

export function startRound(G) {
  // Clear the previous round's bots and reset the player.
  for (const b of G.bots) G.scene.remove(b.group);
  G.bots = [];
  G.hitMeshes = [];
  G.grenades.forEach((g) => G.scene.remove(g.mesh));
  G.grenades = [];
  G.bomb = { state: 'carried', site: null, x: 0, z: 0, fuse: 0, planter: null, defusedBy: null, plantedBy: null };
  const p = G.player;
  // Spawn variety: shuffle the striker spawns each round so no two rounds
  // open the same way — the player gets a random one too.
  const strikerSpawns = shuffle(G.world.spawns.strikers);
  p.x = strikerSpawns[0][0]; p.z = strikerSpawns[0][1];
  p.y = 0; p.vy = 0; p.vx = 0; p.vz = 0;
  p.yaw = 0; p.pitch = 0;
  p.hp = 100; p.alive = true; p.planting = 0; p.defusing = 0;
  p.armor = p.armorKept ? p.armor : 0;
  // The rifle is the standard loadout: every round starts with it (the
  // pistol stays the sidearm). Buying is for the SMG, shotgun, grenades,
  // armour and ammo top-ups.
  if (!p.weapons.rifle) giveWeapon(p, 'rifle');
  for (const id of Object.keys(p.weapons)) {
    const w = WEAPONS[id];
    p.weapons[id].mag = w.mag;
    p.weapons[id].reserve = w.reserve;
  }
  p.weapon = p.weapons.rifle ? 'rifle' : 'pistol';
  p.grenades = p.grenadesKept || 0;

  // Difficulty ramps every round: wardens get faster and sharper.
  G.difficulty = 1 + (G.round - 1) * 0.12;
  G.roundKills = {};
  G.roundSummary = null;
  const pickWeapon = () => {
    const r = Math.random();
    return r < 0.6 ? 'rifle' : r < 0.85 ? 'smg' : 'shotgun';
  };

  // Friendly strikers split A/B; each round the routes, roles and weapons
  // are shuffled, so the same names play differently every round.
  const routesA = [ROUTES.toA_lane, ROUTES.toA_mid];
  const routesB = [ROUTES.toB_lane, ROUTES.toB_mid];
  const strikerRoles = shuffle(['rush', 'roam', 'roam']);
  STRIKER_NAMES.forEach((name, i) => {
    const spawn = strikerSpawns[i + 1];
    const pool = i === 0 ? routesA : i === 1 ? routesB : routesA.concat(routesB);
    const route = pool[Math.floor(Math.random() * pool.length)];
    const bot = createBot(G, name, 'strikers', spawn, pickWeapon(), route);
    bot.role = strikerRoles[i];
    bot.skill = Math.min(1.6, bot.skill * G.difficulty);
    G.bots.push(bot);
  });
  // Wardens: two site guards, one corner camper, one mid roamer — the roles
  // shuffle between names each round.
  const wardenRoles = shuffle(['guard', 'guard', 'camp', 'roam']);
  const campSpots = shuffle([[-24, -26], [24, -26], [-8, -28], [8, -28]]);
  const wardenRoutes = [ROUTES.wardenA, ROUTES.wardenB, ROUTES.wardenMid, ROUTES.wardenA];
  WARDEN_NAMES.forEach((name, i) => {
    const spawn = G.world.spawns.wardens[i];
    const bot = createBot(G, name, 'wardens', spawn, pickWeapon(), wardenRoutes[i]);
    bot.role = wardenRoles[i];
    bot.skill = Math.min(1.6, bot.skill * G.difficulty);
    if (bot.role === 'guard') { bot.holdX = i % 2 === 0 ? -14 : 15; bot.holdZ = -18; }
    else if (bot.role === 'camp') { bot.holdX = campSpots[0][0]; bot.holdZ = campSpots[0][1]; }
    else { bot.holdX = 0; bot.holdZ = -10; }
    G.bots.push(bot);
  });

  G.phase = 'buy';
  G.timer = BUY_TIME;
  G.banner = G.round >= 3
    ? `ROUND ${G.round} — BUY PHASE · WARDENS ARE HUNTING HARDER`
    : `ROUND ${G.round} — BUY PHASE`;
  G.bannerT = 2.5;
  G.lastHeard = null;
}

export function buy(G, kind) {
  const p = G.player;
  if (G.phase !== 'buy') return 'Buy phase is over — fight with what you have.';
  if (kind === 'grenade') {
    if (p.grenades >= 2) return 'Already carrying 2 grenades.';
    if (G.money < GRENADE_PRICE) return 'Not enough money for a grenade.';
    G.money -= GRENADE_PRICE; p.grenades++; sfx.buy();
    return 'Frag grenade bought. Press G to throw.';
  }
  if (kind === 'armor') {
    if (p.armor >= 100) return 'Armor already full.';
    if (G.money < ARMOR_PRICE) return 'Not enough money for armor.';
    G.money -= ARMOR_PRICE; p.armor = 100; sfx.buy();
    return 'Kevlar vest bought.';
  }
  const w = WEAPONS[kind];
  if (!w) return 'Unknown item.';
  if (p.weapons[kind]) {
    // Top up ammo for a weapon already owned, half the weapon price.
    const cost = Math.floor(w.price / 2);
    if (G.money < cost) return 'Not enough money for ammo.';
    G.money -= cost;
    p.weapons[kind].reserve = w.reserve;
    sfx.buy();
    return `${w.name} restocked.`;
  }
  if (G.money < w.price) return `Not enough money for ${w.name}.`;
  G.money -= w.price;
  giveWeapon(p, kind);
  sfx.buy();
  return `${w.name} bought. Press ${kind === 'smg' ? '2' : kind === 'shotgun' ? '3' : '1'} to equip.`;
}

export function endRound(G, winner, reason) {
  if (G.phase === 'roundEnd' || G.phase === 'matchEnd') return;
  G.score[winner]++;
  const won = winner === 'strikers';
  G.money += won ? WIN_REWARD : LOSS_REWARD;
  G.banner = won ? `ROUND WON — ${reason}` : `ROUND LOST — ${reason}`;
  G.bannerT = 4;
  G.phase = 'roundEnd';
  G.timer = 4;
  G.roundEndWinner = winner;
  // Round summary: MVP is whoever scored most this round.
  let mvp = 'You', mvpKills = G.roundKills['You'] || 0;
  for (const [name, k] of Object.entries(G.roundKills)) {
    if (k > mvpKills) { mvp = name; mvpKills = k; }
  }
  G.roundSummary = {
    winner, reason, mvp, mvpKills,
    playerKills: G.roundKills['You'] || 0,
    money: G.money, round: G.round,
  };
  addPopup(G, `+$${won ? WIN_REWARD : LOSS_REWARD}  ROUND ${won ? 'WON' : 'LOST'}`, 'info');
  if (won) sfx.roundWin(); else sfx.roundLose();
  G.kills.push({ text: G.banner, t: G.time });
}

export function checkRoundEnd(G) {
  if (G.phase !== 'live') return;
  const strikersAlive = G.player.alive || G.bots.some((b) => b.team === 'strikers' && b.alive);
  const wardensAlive = G.bots.some((b) => b.team === 'wardens' && b.alive);
  if (!strikersAlive) return endRound(G, 'wardens', 'Your crew was eliminated.');
  if (!wardensAlive) {
    if (G.bomb.state === 'planted') return; // planted charge still decides it
    return endRound(G, 'strikers', 'All wardens eliminated.');
  }
  if (G.bomb.state === 'planted' && G.bomb.fuse <= 0) {
    blastFx(G, G.bomb.x, 0.5, G.bomb.z); // the charge goes off as the round ends
    return endRound(G, 'strikers', 'The charge detonated at the site.');
  }
  if (G.bomb.defusedBy) return endRound(G, 'wardens', `${G.bomb.defusedBy.name} defused the charge.`);
  if (G.timer <= 0) {
    if (G.bomb.state === 'planted') return; // fuse keeps running past the clock
    return endRound(G, 'wardens', 'Time ran out before the plant.');
  }
}

// Plant / defuse progress while the player holds E near the objective.
export function stepObjective(G, input, dt) {
  const p = G.player;
  if (!p.alive || G.phase !== 'live') { p.planting = 0; p.defusing = 0; return; }
  const holding = input.keys.has('KeyE');
  const nearSite = (site) => {
    const s = G.world.sites[site];
    return Math.hypot(p.x - s.x, p.z - s.z) < 3.2;
  };
  if (holding && G.bomb.state === 'carried' && (nearSite('A') || nearSite('B'))) {
    p.planting += dt;
    if (Math.floor(p.planting * 4) !== Math.floor((p.planting - dt) * 4)) sfx.plantBeep();
    if (p.planting >= PLANT_TIME) {
      const site = nearSite('A') ? 'A' : 'B';
      const s = G.world.sites[site];
      G.bomb = { state: 'planted', site, x: s.x, z: s.z, fuse: BOMB_TIME, planter: p, defusedBy: null, plantedBy: null };
      G.money += PLANT_REWARD;
      G.banner = `CHARGE PLANTED AT SITE ${site} — DEFEND IT`;
      G.bannerT = 3;
      p.planting = 0;
      addPopup(G, `+$${PLANT_REWARD}  CHARGE PLANTED`);
      plantBurst(G, s.x, s.z);
    }
    return;
  }
  p.planting = 0;
  if (holding && G.bomb.state === 'planted') {
    const d = Math.hypot(p.x - G.bomb.x, p.z - G.bomb.z);
    if (d < 2.6) {
      p.defusing += dt;
      if (Math.floor(p.defusing * 4) !== Math.floor((p.defusing - dt) * 4)) sfx.plantBeep();
      if (p.defusing >= DEFUSE_TIME) {
        G.bomb.defusedBy = p;
        G.money += DEFUSE_REWARD;
        addPopup(G, `+$${DEFUSE_REWARD}  CHARGE DEFUSED`);
        sfx.defuseDone();
        p.defusing = 0;
      }
      return;
    }
  }
  p.defusing = 0;
}

export function stepRoundTimer(G, dt) {
  if (G.phase === 'buy') {
    G.timer -= dt;
    if (G.timer <= 0) {
      G.phase = 'live';
      G.timer = ROUND_TIME;
      G.banner = 'GO — PLANT THE CHARGE AT A OR B';
      G.bannerT = 2.5;
      sfx.roundStart();
    }
  } else if (G.phase === 'live') {
    if (G.bomb.state === 'planted') {
      G.bomb.fuse -= dt;
      if (Math.floor(G.bomb.fuse) !== Math.floor(G.bomb.fuse + dt)) sfx.bombBeep();
    } else {
      G.timer -= dt;
    }
    checkRoundEnd(G);
  } else if (G.phase === 'roundEnd') {
    G.timer -= dt;
    if (G.timer <= 0) {
      if (G.score.strikers >= WIN_ROUNDS || G.score.wardens >= WIN_ROUNDS || G.round >= MAX_ROUNDS) {
        G.phase = 'matchEnd';
        G.winner = G.score.strikers > G.score.wardens ? 'strikers' : 'wardens';
        G.banner = G.winner === 'strikers' ? 'MATCH WON — THE YARD IS YOURS' : 'MATCH LOST — THE WARDENS HOLD THE YARD';
        G.bannerT = 999;
      } else {
        G.round++;
        startRound(G);
      }
    }
  }
}

// A bot finishing a plant (bots.js sets bomb.plantedBy).
export function stepBotObjective(G) {
  if (G.bomb.plantedBy) {
    const bot = G.bomb.plantedBy;
    const site = Math.hypot(bot.x - G.world.sites.A.x, bot.z - G.world.sites.A.z) <
      Math.hypot(bot.x - G.world.sites.B.x, bot.z - G.world.sites.B.z) ? 'A' : 'B';
    const s = G.world.sites[site];
    G.bomb = { state: 'planted', site, x: s.x, z: s.z, fuse: BOMB_TIME, planter: bot, defusedBy: null, plantedBy: null };
    G.banner = `${bot.name} PLANTED THE CHARGE AT SITE ${site}`;
    G.bannerT = 3;
    plantBurst(G, s.x, s.z);
  }
  if (G.bomb.defusedBy && G.bomb.defusedBy !== G.player) {
    // handled by checkRoundEnd via bomb.defusedBy
  }
}
