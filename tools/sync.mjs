#!/usr/bin/env node
/**
 * Vendor native/ into a game, or verify every consumer is still byte-identical.
 *
 *     node tools/sync.mjs ../../games/george-boole    # vendor into one game
 *     node tools/sync.mjs --check                     # every consumer, hash compare
 *     node tools/sync.mjs --check ../../games/george-boole
 *
 * ## Why these two files are vendored at all
 *
 * Everything else this repo owns is read by Node at build time and can simply be
 * imported from here, because a game's bundle build already cannot run from a
 * lone clone (it needs a magmacrunch.com checkout for the shared arcade scripts).
 * The Swift is different: the Mac runs `xcodebuild` inside the game's own
 * checkout, and an Xcode project referencing files outside it breaks a flat
 * clone. So these two live in both places, and that means they can drift.
 *
 * ## Drift is caught from the side that can see it
 *
 * A vendored file edited in a game is invisible from here until somebody looks,
 * and a file changed HERE and never synced out is invisible from the game --
 * which verifies clean against its own copy forever. `--check` is this end of
 * that: it runs at the moment the risk is created, which is the moment somebody
 * changes native/.
 *
 * ## It refuses to pass by finding nothing
 *
 * If no consumer path exists, this exits 2 and says so. That is not defensive
 * padding: the root CLAUDE.md documents four separate checks in this tree that
 * reported success over a comparison they never made -- the identity sweep run
 * from the wrong directory, `refresh.ps1` printing "card matches the staged
 * builds" with nothing staged, `crunch-c` sending an empty Authorization header
 * for three weeks, and the Wii Makefile's guard. A hash compare that compared
 * zero files is the same bug, and the exit code is the only place to say so.
 *
 * Bytes are read and written with readFileSync/writeFileSync and no encoding,
 * so a CR can neither be introduced nor stripped in transit. See .gitattributes.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Source here -> destination inside a game repo.
 *
 * Two entries, so this is a const rather than the separate manifest.json
 * magma-kit keeps. Move it out to its own file if it grows past a handful, and
 * note that magma-kit's reason for a separate file was that its list is long
 * enough to read as data.
 */
const FILES = {
  'native/GameCenterPlugin.swift': 'ios/App/App/App/GameCenterPlugin.swift',
  'native/GameViewController.swift': 'ios/App/App/App/GameViewController.swift',
};

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function die(msg, code = 1) {
  console.error(`sync.mjs: ${msg}`);
  process.exit(code);
}

function consumers() {
  const f = join(ROOT, 'consumers.json');
  if (!existsSync(f)) die('consumers.json is missing.');
  const { paths } = JSON.parse(readFileSync(f, 'utf8'));
  if (!Array.isArray(paths) || paths.length === 0) {
    die('consumers.json lists no paths. Nothing could be checked, which is not a pass.', 2);
  }
  return paths;
}

/** Read every source file once, failing loudly if one is missing. */
function sources() {
  const out = new Map();
  for (const src of Object.keys(FILES)) {
    const p = join(ROOT, src);
    if (!existsSync(p)) die(`source file missing: ${src}. This repo is incomplete.`);
    out.set(src, readFileSync(p));
  }
  return out;
}

function checkOne(gameRoot, src) {
  const results = [];
  for (const [rel, dest] of Object.entries(FILES)) {
    const p = join(gameRoot, dest);
    if (!existsSync(p)) {
      results.push({ dest, state: 'missing' });
      continue;
    }
    const theirs = readFileSync(p);
    const ours = src.get(rel);
    results.push({ dest, state: sha(theirs) === sha(ours) ? 'same' : 'differs' });
  }
  return results;
}

const argv = process.argv.slice(2);
const isCheck = argv.includes('--check');
const target = argv.find((a) => !a.startsWith('--'));

const src = sources();

if (isCheck) {
  const paths = target ? [target] : consumers();
  let compared = 0;
  let bad = 0;
  let skipped = 0;

  for (const rel of paths) {
    const gameRoot = resolve(ROOT, rel);
    if (!existsSync(gameRoot)) {
      console.log(`  skip  ${rel}  (not checked out here)`);
      skipped += 1;
      continue;
    }
    for (const r of checkOne(gameRoot, src)) {
      compared += 1;
      if (r.state === 'same') {
        console.log(`  ok    ${rel}/${r.dest}`);
      } else {
        bad += 1;
        console.log(`  ${r.state === 'missing' ? 'GONE ' : 'DIFF '} ${rel}/${r.dest}`);
      }
    }
  }

  // The whole point of the exit codes. Read them.
  if (compared === 0) {
    console.error(
      `\nNOTHING WAS COMPARED. ${skipped} consumer path(s) skipped, 0 files checked.\n` +
        'This is not a pass. Either no game is checked out beside this repo, or the\n' +
        'paths in consumers.json are wrong. Run this from a tree that holds a game.'
    );
    process.exit(2);
  }
  if (bad) {
    console.error(
      `\n${bad} of ${compared} vendored file(s) do not match native/.\n` +
        'Sync the game (drop --check) if native/ is right, or bring the change back\n' +
        'here if the game is. Do not leave them different.'
    );
    process.exit(1);
  }
  console.log(`\n${compared} vendored file(s) match native/, across ${paths.length - skipped} game(s).`);
  process.exit(0);
}

// ── vendor ───────────────────────────────────────────────────────────────────

if (!target) {
  die('give a game repo to vendor into, or --check.\n' +
    '  node tools/sync.mjs ../../games/george-boole\n' +
    '  node tools/sync.mjs --check');
}

const gameRoot = resolve(ROOT, target);
if (!existsSync(gameRoot)) die(`no such game repo: ${gameRoot}`);
if (!existsSync(join(gameRoot, 'ios'))) {
  die(`${relative(ROOT, gameRoot)} has no ios/ directory. Stamp the project first.`);
}

let written = 0;
for (const [rel, dest] of Object.entries(FILES)) {
  const p = join(gameRoot, dest);
  const ours = src.get(rel);
  if (existsSync(p) && sha(readFileSync(p)) === sha(ours)) {
    console.log(`  same  ${dest}`);
    continue;
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, ours);
  written += 1;
  console.log(`  wrote ${dest}`);
}
console.log(`\n${written} file(s) written into ${relative(ROOT, gameRoot)}.`);
