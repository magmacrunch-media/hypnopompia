#!/usr/bin/env node
/**
 * Check a game's Game Center ids and art before anything is created.
 *
 *     node tools/check-game-center.mjs ../../games/george-boole/ios
 *     node tools/check-game-center.mjs ../../games/makemecookies/ios
 *     node tools/check-game-center.mjs            # cwd, for running from a game
 *
 * HOUSE.md says every Game Center id is permanent and a deleted one cannot be
 * reused, and that the ids must be checked before anything is created in App
 * Store Connect. Nothing implemented that. This does.
 *
 * ## What it reads, and why it is the art rather than the shim
 *
 * The obvious source is the shim, and it is the wrong one for a SHARED tool.
 * The two games build their ids differently -- makemecookies lists eight in a
 * flat `IDS` array, george-boole composes `overflow.<bits>bit` and
 * `learn.<id>` from the modes and the codex -- so a shared parser would have to
 * know both shapes, which is exactly the thing check-metadata.mjs's header
 * refuses to do.
 *
 * Both games instead name one image per entry, `<id>.png`, under
 * `store/game-center/`. That is a real artifact with one naming rule, and each
 * game already guarantees its art matches its own shim: george-boole's
 * make-boards.py refuses to draw when the codex and the shim disagree, and
 * makemecookies' cross-checks the shim against web/js/config.js and has a
 * --check for the committed PNGs. So the game owns shim-to-art, and this owns
 * what is genuinely shared:
 *
 *   - the id prefix agrees with the bundle id in capacitor.config.json
 *   - the ids are legal for App Store Connect, and unique
 *   - every image is 1024x1024 and has no alpha channel
 *   - an achievement HAS an image, which Apple requires and which is the gap
 *     that stopped makemecookies dead
 *
 * ## The PNG header is read by hand, and that is deliberate
 *
 * A dependency would be a poor trade for 25 bytes. A PNG's IHDR is at a fixed
 * offset: width and height big-endian at 16 and 20, colour type at 25, where 2
 * is truecolour and 6 is truecolour with alpha. Apple rejects an upload with an
 * alpha channel, so 6 is a failure and not a warning.
 *
 * Exit codes are the contract, the way sync.mjs's are: 0 checked and clean,
 * 1 a problem, 2 nothing to check -- because a game with no art directory must
 * not read as a pass.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Accept an ios/ directory, a store/ directory, or a game root. */
function resolveIos(arg) {
  const p = resolve(arg || process.cwd());
  if (!existsSync(p)) {
    console.error(`check-game-center: no such path: ${p}`);
    process.exit(1);
  }
  for (const c of [p, join(p, 'ios')]) {
    if (existsSync(join(c, 'capacitor.config.json'))) return c;
  }
  console.error(
    `check-game-center: no capacitor.config.json under ${p} or ${join(p, 'ios')}`
  );
  process.exit(1);
}

const IOS = resolveIos(process.argv[2]);
const ART = join(IOS, 'store', 'game-center');

const config = JSON.parse(readFileSync(join(IOS, 'capacitor.config.json'), 'utf8'));
const appId = config.appId;
if (!appId) {
  console.error('check-game-center: capacitor.config.json has no appId');
  process.exit(1);
}

if (!existsSync(ART)) {
  console.error(
    `check-game-center: no store/game-center/ under ${IOS}\n` +
      '  An achievement image is REQUIRED by App Store Connect, so a game\n' +
      '  without this directory cannot create its achievements at all.\n' +
      '  This exits 2 rather than 0: there was nothing to check, which is not\n' +
      '  the same as everything being fine.'
  );
  process.exit(2);
}

/**
 * App Store Connect ids: A-Z a-z 0-9 . _ - and at most 100 characters.
 * Checked against Apple's reference on 2026-09-24. The dot is what both games
 * use to namespace (`overflow.4bit`), so it matters that it is legal.
 */
const LEGAL = /^[A-Za-z0-9._-]+$/;
const MAX_LENGTH = 100;

/** width, height and colour type out of a PNG's IHDR. */
function png(path) {
  const b = readFileSync(path);
  if (b.length < 26 || b.readUInt32BE(12) !== 0x49484452) return null; // 'IHDR'
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colour: b[25] };
}

const REQUIRED = 1024;
const kinds = [
  { dir: 'achievements', label: 'achievement', artRequired: true },
  { dir: 'leaderboards', label: 'leaderboard', artRequired: false },
];

let failed = 0;
const seen = new Map();
let total = 0;

console.log(`bundle id  ${appId}`);
console.log(`prefix     ${appId}.`);
console.log('');

for (const { dir, label, artRequired } of kinds) {
  const here = join(ART, dir);
  if (!existsSync(here) || !statSync(here).isDirectory()) {
    if (artRequired) {
      console.log(`MISS  ${dir}/ does not exist; App Store Connect requires an image per achievement`);
      failed += 1;
    }
    continue;
  }

  const files = readdirSync(here).filter((f) => f.toLowerCase().endsWith('.png')).sort();
  if (files.length === 0 && artRequired) {
    console.log(`MISS  ${dir}/ holds no PNG; App Store Connect requires an image per achievement`);
    failed += 1;
    continue;
  }

  for (const file of files) {
    const suffix = file.replace(/\.png$/i, '');
    const id = `${appId}.${suffix}`;
    total += 1;

    const problems = [];
    if (!LEGAL.test(suffix)) problems.push('illegal characters in the id');
    if (id.length > MAX_LENGTH) problems.push(`id is ${id.length} characters, over ${MAX_LENGTH}`);
    if (seen.has(id)) problems.push(`duplicate of the ${seen.get(id)} with the same id`);
    seen.set(id, label);

    const head = png(join(here, file));
    if (!head) {
      problems.push('not a readable PNG');
    } else {
      if (head.width !== REQUIRED || head.height !== REQUIRED) {
        problems.push(`${head.width}x${head.height}, not ${REQUIRED}x${REQUIRED}`);
      }
      // 6 is truecolour with alpha, 4 is greyscale with alpha.
      if (head.colour === 6 || head.colour === 4) {
        problems.push('has an alpha channel, which Apple rejects');
      }
    }

    if (problems.length) {
      failed += problems.length;
      console.log(`WRONG ${id}`);
      for (const p of problems) console.log(`        ${p}`);
    } else {
      console.log(`  ok  ${id}`);
    }
  }
}

console.log('');
if (total === 0) {
  console.error('check-game-center: no images found at all, so nothing was checked');
  process.exit(2);
}
if (failed) {
  console.error(`${failed} problem(s). Every id is permanent once created; fix before creating any.`);
  process.exit(1);
}
console.log(
  `${total} Game Center entr${total === 1 ? 'y' : 'ies'} ready to create under ${appId}.` +
    '\nEvery id is permanent and a deleted one cannot be reused. Check the list above twice.'
);
