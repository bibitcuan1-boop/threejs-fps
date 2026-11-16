[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/bibitcuan1-boop/threejs-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/bibitcuan1-boop/threejs-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# RUSTLINE — Dockyard Strike

A complete round-based tactical FPS in three.js 0.187.0, built for the
[make.fun](https://make.fun/bounty/threejs-fps-02) bounty
**"Make the best three.js tactical FPS"**
([threejs-fps-02](https://make.fun/bounty/threejs-fps-02)).

You are a Striker fighting over Rustline Dockyard, a container yard at dusk:
plant the charge at site A (under the gantry crane) or site B (inside the
warehouse), or eliminate the defending Wardens. Win the round, earn money,
buy better guns — first crew to 5 rounds takes the match.

## How to play

```sh
node serve.ts   # then open http://localhost:8080
```

- **WASD** move · **Mouse** look · **Click** fire · **R** reload
- **E** plant / defuse the charge (hold, near a site) · **G** throw grenade
- **B** buy menu (keys 1–5) · **1–4** switch weapon
- **Ctrl** crouch · **Space** jump

Gunplay rewards stopping to aim: recoil and spread punish firing on the
move, headshots deal more damage, and bots strafe, burst-fire, hear your
shots, rotate to the sound, plant, and defuse. The HUD shows health, armor,
ammo, the round timer, the score, your money, a live minimap and a killfeed.
All sounds are synthesized with WebAudio — no audio files, no network.

## Layout

- `game/` — the playable game as static ES modules (no build step)
  - `index.html` — HUD + import map for vendored three.js
  - `src/main.js` — bootstrap + fixed-step (60 Hz) game loop
  - `src/state.js` — the one shared match state, weapon + route tables
  - `src/world.js` — the dockyard map, colliders, spawns, bomb sites
  - `src/player.js` — movement physics, crouch/jump, damage + armor
  - `src/weapons.js` — fire / reload / switch / grenade throw
  - `src/bots.js` — bot AI: routes, vision, bursts, plant / defuse
  - `src/combat.js` — hitscan fire, tracers, grenades, explosions
  - `src/rounds.js` — buy phase, rounds, money, match end
  - `src/hud.js` — HUD, buy menu, minimap, killfeed
  - `src/render.js` — renderer, camera, viewmodel gun, bomb mesh
  - `src/audio.js` — procedural WebAudio sound effects
  - `vendor/three/` — three.js 0.187.0, vendored byte-for-byte (MIT)
- `screenshots/` — real renders of the game running in a browser
- `main.ts` — the driver: copies `game/` + `screenshots/` to `/output` and
  writes `/output/dossier.json` with `vendor/makefun-threejs.ts`
- `serve.ts` — tiny static server for local play-testing

## License

MIT. See [LICENSE](LICENSE). three.js is MIT, see
[game/vendor/three/LICENSE](game/vendor/three/LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=1kbmej5w&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
