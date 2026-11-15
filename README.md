# DUSTLINE — Tactical FPS (threejs-fps-02)

A three.js tactical FPS for the make.fun bounty
**"Make the best three.js tactical FPS"** (`threejs-fps-02`).

## The game

Vanguard (attackers, blue) vs Jackals (defenders, amber), 4v4 — you plus
three ally bots against four enemy bots — on **Kestrel Yard**, an original
industrial container yard at dusk. First to 5 rounds wins (max 9).

- **Objective:** plant the bomb at Site A or B (hold E, 3 s) and defend it
  until it detonates (40 s), or eliminate the enemy team. Defenders can
  defuse (hold E, 5 s). Rounds end on elimination, detonation, defuse, or
  the 100 s timer.
- **Economy:** start $800; kill +$300, round win +$325, loss +$150,
  plant/defuse +$300. Buy phase (12 s) before each round: P9 pistol (free),
  KS-9 Hornet SMG $1,500, AR-7 Longbow $2,700, DMR Needle $4,000, frag and
  smoke grenades $300 each. Ammo refills free each round.
- **Gunplay:** hitscan with headshot bonus (×2), range falloff, recoil and
  bloom, spread that punishes firing on the move and rewards crouching and
  aiming down sights, reloads, finite magazines and reserve ammo, tracers
  and muzzle flash.
- **Bots:** attacker roles push A / push B / mid / flank, defender roles
  hold A / hold B / mid / roam; they follow waypoint routes, hold angles,
  react to gunfire and visible enemies, strafe in combat, plant and defuse,
  and cannot see through smoke.
- **Map:** two bomb sites, three lanes (A, mid, B), containers, crates,
  barrels, a gantry platform with a ramp, sightlines and corners — all
  collision from the same data the renderer draws.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Aim (click to lock the pointer) |
| Left click | Fire |
| Right click (hold) | Aim down sights |
| R | Reload |
| Shift | Walk (quiet, accurate) |
| Ctrl / C | Crouch |
| Space | Jump |
| E (hold) | Plant / defuse the bomb |
| 1 / 2 | Primary / sidearm — in buy phase: buy Longbow / Hornet |
| 3 | Buy DMR Needle (buy phase) |
| 4 / 5 | Throw frag / smoke grenade — in buy phase: buy them |
| B | Buy menu (during buy phase) |

## How it is built

- `game/index.html` — the shell: import map (`three` → vendored
  three.js 0.187.0), HUD DOM and styles, the start/pause menu.
- `game/src/config.js` — tuning: weapons, economy, rounds, sites.
- `game/src/mapdata.js` — the yard: solids, waypoints, spawns, collision
  and line-of-sight, BFS pathfinding.
- `game/src/sim.js` — the fixed-step (1/60 s) simulation: movement,
  hitscan shooting, grenades, bomb, rounds, economy. No rendering here.
- `game/src/bots.js` — bot brains: roles, routes, reactions, aim error.
- `game/src/weapons.js` — weapon state: spread, recoil, reload, falloff.
- `game/src/world.js` — the three.js yard: sky, lights, containers,
  gantry, lamps, bomb-site markers.
- `game/src/hud.js` — DOM HUD: health, ammo, timer, score, money,
  killfeed, buy menu, minimap, banners, damage direction.
- `game/src/input.js` — keyboard / mouse / pointer lock, `?shot=` poses.
- `game/src/audio.js` — synthesised WebAudio effects (no audio files).
- `game/src/main.js` — boot, render loop, viewmodel gun, tracers, smoke,
  explosions, game flow.

The simulation and the rendering are separate: `sim.js` knows nothing
about three.js, and `main.js` only shows what the sim says.

## Run it

```sh
node serve.ts            # http://localhost:8080 — click to deploy
```

Screenshot poses (deterministic, used for `screenshots/`):

- `?shot=start` — spawn view down mid
- `?shot=buy` — buy menu open
- `?shot=play` — mid-round firefight
- `?shot=end` — round-won banner

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored `vendor/makefun-threejs.ts`.

## License

MIT — see `LICENSE`.
