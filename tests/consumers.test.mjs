/**
 * sync.mjs: the vendoring contract and its exit codes.
 *
 *     node --test tests/**\/*.test.mjs
 *
 * ## Why the exit codes are the subject, not the output
 *
 * This repo's whole argument is that a check which passes by finding nothing is
 * worse than no check, because it reads as a clean result. `sync.mjs` therefore
 * distinguishes three outcomes that all look similar from the outside: in sync
 * (0), drifted (1), and compared nothing at all (2). Only the exit code carries
 * that distinction to CI, so that is what these assert. A test that read the
 * printed lines instead would pass on a script that printed reassuring text and
 * exited 0 regardless, which is the exact bug.
 *
 * ## The fixtures are synthetic, and the real consumers are checked separately
 *
 * Everything below builds its own throwaway game tree in the OS temp directory
 * and passes it explicitly, so no test depends on which games happen to be
 * checked out and none can touch a real one. The single test that does look at
 * `consumers.json` treats a missing checkout as a skip rather than a failure,
 * because that is `consumers.json`'s own stated contract: this repo stays
 * testable on a machine holding only part of the tree. Drift in a real consumer
 * is still a failure there, which is the point of having it.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SYNC = join(ROOT, 'tools', 'sync.mjs');
const NATIVE = join(ROOT, 'native');

/** Where sync.mjs puts each native file inside a game. Mirrors its FILES map. */
const DEST = 'ios/App/App/App';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const nativeNames = () => readdirSync(NATIVE).filter((f) => f.endsWith('.swift'));

function run(...args) {
  const r = spawnSync(process.execPath, [SYNC, ...args], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/** A throwaway game tree. `vendored` seeds it with in-sync copies. */
function fakeGame({ vendored = true, only = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hypno-game-'));
  mkdirSync(join(root, DEST), { recursive: true });
  if (vendored) {
    for (const f of nativeNames()) {
      if (only && !only.includes(f)) continue;
      cpSync(join(NATIVE, f), join(root, DEST, f));
    }
  }
  return root;
}

const trash = [];
const keep = (p) => (trash.push(p), p);
test.after(() => {
  for (const p of trash) rmSync(p, { recursive: true, force: true });
});

// ── the repo's own state ─────────────────────────────────────────────────────

test('native/ holds the Swift this repo exists to vendor', () => {
  const names = nativeNames();
  assert.ok(names.includes('GameCenterPlugin.swift'), 'GameCenterPlugin.swift is missing');
  assert.ok(names.includes('GameViewController.swift'), 'GameViewController.swift is missing');
  for (const f of names) {
    assert.ok(readFileSync(join(NATIVE, f)).length > 0, `${f} is empty`);
  }
});

test('the Swift is committed and stored LF, which .gitattributes promises', () => {
  for (const f of nativeNames()) {
    const bytes = readFileSync(join(NATIVE, f));
    assert.ok(!bytes.includes(0x0d), `${f} contains a CR byte; a CRLF Swift file is a macOS build hazard`);
  }
});

// ── the exit-code contract ──────────────────────────────────────────────────

test('in sync: exit 0', () => {
  const game = keep(fakeGame());
  const { code, out } = run('--check', game);
  assert.equal(code, 0, `expected 0, got ${code}:\n${out}`);
  assert.match(out, /match native\//);
});

test('a drifted vendored file: exit 1, and the file is named', () => {
  const game = keep(fakeGame());
  const victim = join(game, DEST, 'GameViewController.swift');
  writeFileSync(victim, Buffer.concat([readFileSync(victim), Buffer.from('// drifted\n')]));

  const { code, out } = run('--check', game);
  assert.equal(code, 1, `expected 1, got ${code}:\n${out}`);
  assert.match(out, /DIFF/);
  assert.match(out, /GameViewController\.swift/);
  // The one that did NOT drift must still be reported ok, or a single failure
  // would hide the state of everything after it.
  assert.match(out, /ok\s+.*GameCenterPlugin\.swift/);
});

test('a vendored file deleted from the game: exit 1, reported GONE not ok', () => {
  const game = keep(fakeGame({ only: ['GameCenterPlugin.swift'] }));
  const { code, out } = run('--check', game);
  assert.equal(code, 1, `expected 1, got ${code}:\n${out}`);
  assert.match(out, /GONE/);
  assert.match(out, /GameViewController\.swift/);
});

test('nothing to compare: exit 2, NOT 0', () => {
  const { code, out } = run('--check', join(tmpdir(), 'hypno-does-not-exist-ever'));
  assert.equal(code, 2, `expected 2, got ${code}:\n${out}`);
  assert.match(out, /NOTHING WAS COMPARED/);
  assert.match(out, /not a pass/i);
});

test('a game with no ios/ is refused rather than half-vendored', () => {
  const bare = keep(mkdtempSync(join(tmpdir(), 'hypno-bare-')));
  const { code, out } = run(bare);
  assert.equal(code, 1, `expected 1, got ${code}:\n${out}`);
  assert.match(out, /no ios\//);
  assert.ok(!existsSync(join(bare, DEST)), 'it created the destination anyway');
});

test('neither a target nor --check is a usage error, not a silent success', () => {
  const { code, out } = run();
  assert.equal(code, 1, `expected 1, got ${code}:\n${out}`);
  assert.match(out, /--check/);
});

// ── vendoring ───────────────────────────────────────────────────────────────

test('vendoring writes bytes, so a CR can be neither added nor stripped', () => {
  const game = keep(fakeGame({ vendored: false }));
  const { code } = run(game);
  assert.equal(code, 0);

  for (const f of nativeNames()) {
    const ours = readFileSync(join(NATIVE, f));
    const theirs = readFileSync(join(game, DEST, f));
    assert.equal(sha(theirs), sha(ours), `${f} was not copied byte for byte`);
  }
  // And the copy it just made must satisfy its own check.
  assert.equal(run('--check', game).code, 0, 'a freshly vendored game does not verify');
});

test('vendoring is idempotent and says so rather than rewriting', () => {
  const game = keep(fakeGame());
  const { code, out } = run(game);
  assert.equal(code, 0);
  assert.match(out, /same/);
  assert.match(out, /0 file\(s\) written/);
});

test('vendoring repairs drift', () => {
  const game = keep(fakeGame());
  const victim = join(game, DEST, 'GameCenterPlugin.swift');
  writeFileSync(victim, Buffer.from('// clobbered\n'));
  assert.equal(run('--check', game).code, 1, 'the drift was not detected first');

  const { code, out } = run(game);
  assert.equal(code, 0);
  assert.match(out, /wrote/);
  assert.equal(run('--check', game).code, 0, 'still drifted after a sync');
});

// ── the real consumers ──────────────────────────────────────────────────────

test('every checked-out consumer in consumers.json is in sync', (t) => {
  const { paths } = JSON.parse(readFileSync(join(ROOT, 'consumers.json'), 'utf8'));
  assert.ok(Array.isArray(paths) && paths.length > 0, 'consumers.json lists no paths');

  const present = paths.filter((p) => existsSync(join(ROOT, p)));
  if (present.length === 0) {
    // Not a failure: consumers.json promises this repo stays testable on a
    // machine holding only part of the tree. `npm run check` is the strict form
    // and exits 2 here; this test is the tolerant one, on purpose.
    t.skip(`no consumer checked out beside this repo (${paths.length} listed)`);
    return;
  }

  const { code, out } = run('--check');
  assert.notEqual(code, 1, `a real consumer has drifted:\n${out}`);
  assert.equal(code, 0, `expected 0 with ${present.length} consumer(s) present, got ${code}:\n${out}`);
});
