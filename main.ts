// DUSTLINE — threejs-fps-02 entry program (Node 22, standard library only).
//
// It hands the game in: game/ and screenshots/ are copied from beside this
// file into the output directory, and /output/dossier.json is written with
// the vendored make.fun library so the judge can read the entry.
//
// Locally the output directory is MAKEFUN_OUTPUT_DIR:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader it is /output. The run is deterministic: copying the same
// files twice writes the same bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The competition's own caps: only text_max_bytes shapes the dossier's
// bytes; the rest refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files in all).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
