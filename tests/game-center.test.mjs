/**
 * check-game-center.mjs: the id contract and its exit codes.
 *
 *     node --test tests/**\/*.test.mjs
 *
 * ## Why exit 2 has its own tests
 *
 * Every Game Center id is permanent and a deleted one cannot be reused, so the
 * worst outcome here is not a failure but a pass that checked nothing. A game
 * with no `store/game-center/` has no achievement art, which means its
 * achievements cannot be created at all -- and the natural way to write this
 * tool would have walked an empty directory and printed a clean result. So
 * "nothing to check" is exit 2, distinct from clean (0) and from wrong (1),
 * the same three-way contract sync.mjs has, and it is asserted below.
 *
 * ## The fixtures write PNG headers, not PNGs
 *
 * The checker reads a PNG's first 26 bytes -- signature, then IHDR's width,
 * height and colour type -- and nothing after them. These fixtures write
 * exactly that, so a case can be a 26-byte file instead of a real image. If the
 * checker is ever made to read further, these become invalid and that is the
 * correct moment for this comment to stop being true.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK = join(ROOT, 'tools', 'check-game-center.mjs');

function run(dir) {
  const r = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const trash = [];
test.after(() => {
  for (const p of trash) rmSync(p, { recursive: true, force: true });
});

/** A 26-byte PNG head: signature + IHDR width, height and colour type. */
function pngHead({ width = 1024, height = 1024, colour = 2 } = {}) {
  const b = Buffer.alloc(26);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b[24] = 8;
  b[25] = colour;
  return b;
}

/**
 * A throwaway ios/ tree. `achievements` and `leaderboards` are maps of
 * suffix -> png options; pass null for either to omit the directory entirely.
 */
function fakeGame({
  appId = 'com.magmacrunch.testgame',
  achievements = { shipped: {}, spotless: {} },
  leaderboards = { shift: {} },
  art = true,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hypno-gc-'));
  trash.push(root);
  const ios = join(root, 'ios');
  mkdirSync(ios, { recursive: true });
  writeFileSync(join(ios, 'capacitor.config.json'), JSON.stringify({ appId, appName: 'Test' }));

  if (!art) return ios;

  for (const [dir, entries] of [['achievements', achievements], ['leaderboards', leaderboards]]) {
    if (entries === null) continue;
    const here = join(ios, 'store', 'game-center', dir);
    mkdirSync(here, { recursive: true });
    for (const [suffix, opts] of Object.entries(entries)) {
      writeFileSync(join(here, `${suffix}.png`), pngHead(opts));
    }
  }
  return ios;
}

test('a clean game passes and prints the ids it would create', () => {
  const { code, out } = run(fakeGame());
  assert.equal(code, 0, out);
  assert.match(out, /com\.magmacrunch\.testgame\.shipped/);
  assert.match(out, /com\.magmacrunch\.testgame\.shift/);
  assert.match(out, /3 Game Center entries/);
});

test('the prefix comes from the bundle id, not from the folder name', () => {
  const { code, out } = run(fakeGame({ appId: 'com.magmacrunch.somethingelse' }));
  assert.equal(code, 0, out);
  assert.match(out, /com\.magmacrunch\.somethingelse\.shipped/);
});

test('no store/game-center/ at all is exit 2, never a quiet pass', () => {
  const { code, out } = run(fakeGame({ art: false }));
  assert.equal(code, 2, out);
  assert.match(out, /REQUIRED/);
});

test('an achievements directory that exists but is empty fails', () => {
  const { code, out } = run(fakeGame({ achievements: {}, leaderboards: { shift: {} } }));
  assert.equal(code, 1, out);
  assert.match(out, /MISS/);
});

test('missing achievement art fails; missing leaderboard art does not', () => {
  const without = run(fakeGame({ achievements: null }));
  assert.equal(without.code, 1, without.out);

  // Apple requires an achievement image and treats a leaderboard image as
  // optional, so a game with achievements and no leaderboard art is fine.
  const ok = run(fakeGame({ leaderboards: null }));
  assert.equal(ok.code, 0, ok.out);
});

test('art that is not 1024x1024 fails, and says what it found', () => {
  const { code, out } = run(fakeGame({ achievements: { shipped: { width: 512, height: 512 } } }));
  assert.equal(code, 1, out);
  assert.match(out, /512x512/);
  assert.match(out, /1024x1024/);
});

test('an alpha channel fails, because Apple rejects the upload', () => {
  for (const colour of [6, 4]) {
    const { code, out } = run(fakeGame({ achievements: { shipped: { colour } } }));
    assert.equal(code, 1, `colour type ${colour}: ${out}`);
    assert.match(out, /alpha channel/);
  }
});

test('an id with illegal characters fails', () => {
  const { code, out } = run(fakeGame({ achievements: { 'ship a box': {} } }));
  assert.equal(code, 1, out);
  assert.match(out, /illegal characters/);
});

test('an id over 100 characters fails', () => {
  const { code, out } = run(fakeGame({ achievements: { ['x'.repeat(90)]: {} } }));
  assert.equal(code, 1, out);
  assert.match(out, /over 100/);
});

test('the same id as both an achievement and a leaderboard fails', () => {
  const { code, out } = run(fakeGame({ achievements: { shift: {} }, leaderboards: { shift: {} } }));
  assert.equal(code, 1, out);
  assert.match(out, /duplicate/);
});

test('a dot in an id is legal, since both games namespace with one', () => {
  const { code, out } = run(fakeGame({ achievements: { 'overflow.4bit': {}, 'learn.all_lit': {} } }));
  assert.equal(code, 0, out);
  assert.match(out, /com\.magmacrunch\.testgame\.overflow\.4bit/);
});

test('a path with no capacitor.config.json is a usage error, not a pass', () => {
  const empty = mkdtempSync(join(tmpdir(), 'hypno-gc-'));
  trash.push(empty);
  const { code, out } = run(empty);
  assert.equal(code, 1, out);
  assert.match(out, /capacitor\.config\.json/);
});
