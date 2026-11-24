// Token Radar entrypoint (Node 22, standard library only).
//
//   node main.ts [--input <snapshot.json|dir>] [--output <dir>]
//
// Reads the sealed snapshot (default /input/snapshot.json), scores it with lib/model.ts and writes to
// MAKEFUN_OUTPUT_DIR, else --output, else /output: board.json, data.js, dashboard/, screenshots/ and,
// last, dossier.json. Nothing is written unless the board passes boardIssue and 3+ screenshots exist.
// Output holds no timestamps or random values, so two runs write the same bytes.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const IMAGE = /\.(png|jpe?g)$/i;

function fail(message: string, code = 1): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}

/** Regular, plainly named files of a directory, sorted so copies happen in a fixed order. */
function plainFiles(dir: string, filter: (name: string) => boolean = () => true): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.') && statSync(join(dir, n)).isFile() && filter(n))
    .sort();
}

const inputArg = arg('input') ?? '/input';
const inputFile = existsSync(inputArg) && statSync(inputArg).isDirectory() ? join(inputArg, 'snapshot.json') : inputArg;
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory>`, 2);
const out = process.env.MAKEFUN_OUTPUT_DIR || arg('output') || '/output';

let snapshot;
try {
  snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
} catch (e) {
  fail(`cannot read ${inputFile}: ${(e as Error).message}`, 2);
}

const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`refusing to write: the board fails the gate: ${issue}`);

const dashSrc = join(here, 'dashboard');
const shotSrc = join(here, 'screenshots');
const dashFiles = plainFiles(dashSrc);
for (const need of ['index.html']) if (!dashFiles.includes(need)) fail(`refusing to write: dashboard/ has no ${need}`);
const shots = plainFiles(shotSrc, (n) => IMAGE.test(n));
if (shots.length < 3) fail(`refusing to write: screenshots/ holds ${shots.length} image(s); 3 are required (board, detail, filtered)`);
if (shots.length > SCREENSHOT_CAPS.max) fail(`refusing to write: screenshots/ holds ${shots.length} images; at most ${SCREENSHOT_CAPS.max}`);
for (const n of [...dashFiles, ...shots]) if (!PLAIN_NAME.test(n)) fail(`refusing to write: ${n} is not a plain file name`);
for (const n of shots) {
  const size = statSync(join(shotSrc, n)).size;
  if (size > SCREENSHOT_CAPS.max_bytes) fail(`refusing to write: screenshots/${n} is ${size} bytes; the cap is ${SCREENSHOT_CAPS.max_bytes}`);
}

mkdirSync(join(out, 'dashboard'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));
for (const n of dashFiles) copyFileSync(join(dashSrc, n), join(out, 'dashboard', n));
for (const n of shots) copyFileSync(join(shotSrc, n), join(out, 'screenshots', n));

// Written last: the scorer rebuilds the dossier from this directory and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, watchlist ${snapshot.watchlist.length}, board ${board.length} rows ` +
    `(${radar.early_size} below the floor), live set ${radar.live_size}\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shots.length}) and dossier.json to ${out}\n`,
);
