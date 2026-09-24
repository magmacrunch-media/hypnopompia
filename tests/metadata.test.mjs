/**
 * check-metadata.mjs: the field contract and the house copyright rule.
 *
 *     node --test tests/**\/*.test.mjs
 *
 * ## Why the copyright rule is tested at all
 *
 * The length checks have a natural witness: a field that is too long fails, and
 * you can see the number. The copyright rule has none. It is a string that is
 * correct in both games today, and was correct in both games before anything
 * checked it -- so a broken guard and a working guard produce identical output
 * on the real files. The only way to know the rule is live is to hand it a
 * wrong string and require a non-zero exit. That is most of what is below.
 *
 * This matters more than it sounds. Before this file, `## Copyright` was not a
 * field at all: the heading carried no `(n)`, so the parser skipped it and the
 * one piece of branding in `metadata.md` was invisible to the only thing that
 * reads `metadata.md`. Both games agreed by imitation. A check that cannot see
 * its subject passes forever, which is the failure this repo keeps meeting.
 *
 * ## The fixtures are synthetic
 *
 * Every case builds its own file in the OS temp directory, so no test depends
 * on which games are checked out and none can touch a real one. The real games
 * are checked separately, by the `ios-shared` job in each game's own CI.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK = join(ROOT, 'tools', 'check-metadata.mjs');

function run(file) {
  const r = spawnSync(process.execPath, [CHECK, file], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const trash = [];
test.after(() => {
  for (const p of trash) rmSync(p, { recursive: true, force: true });
});

/**
 * A minimal metadata.md. `copyright: null` omits the heading entirely.
 * Bodies are indented four spaces, which is what the parser reads.
 */
function metadata({ copyright = '2026 magmacrunch media', keywords = 'logic,gate,binary', extra = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hypno-meta-'));
  trash.push(dir);
  const file = join(dir, 'metadata.md');
  const body = [
    '# Store listing',
    '',
    '## Name (30)',
    '',
    '    A Game',
    '',
    '## Keywords (100)',
    '',
    `    ${keywords}`,
    '',
    ...(copyright === null ? [] : ['## Copyright', '', `    ${copyright}`, '']),
    extra,
    '',
  ].join('\n');
  writeFileSync(file, body);
  return file;
}

test('the house copyright passes', () => {
  const { code, out } = run(metadata());
  assert.equal(code, 0, out);
  assert.match(out, /Copyright\s+2026 magmacrunch media/);
});

test('any year passes: the year is the game\'s fact, not the house\'s', () => {
  for (const year of ['2024', '2026', '2031']) {
    const { code, out } = run(metadata({ copyright: `${year} magmacrunch media` }));
    assert.equal(code, 0, `${year}: ${out}`);
  }
});

test('title case fails -- the engines spell it that way and a game must not', () => {
  const { code, out } = run(metadata({ copyright: '2026 Magma Crunch Media' }));
  assert.equal(code, 1, out);
  assert.match(out, /WRONG/);
  assert.match(out, /HOUSE\.md/);
});

test('a (c) or the word Copyright fails -- the form supplies both', () => {
  for (const bad of [
    'Copyright 2026 magmacrunch media',
    '(c) 2026 magmacrunch media',
    '© 2026 magmacrunch media',
  ]) {
    const { code, out } = run(metadata({ copyright: bad }));
    assert.equal(code, 1, `${bad}: ${out}`);
  }
});

test('a missing year, or a missing name, fails', () => {
  for (const bad of ['magmacrunch media', '2026', '2026 magmacrunch', '2026  magmacrunch media']) {
    const { code, out } = run(metadata({ copyright: bad }));
    assert.equal(code, 1, `${JSON.stringify(bad)}: ${out}`);
  }
});

test('no ## Copyright heading is a failure, not a quiet pass', () => {
  const { code, out } = run(metadata({ copyright: null }));
  assert.equal(code, 1, out);
  assert.match(out, /MISS/);
});

test('an uncounted heading does not swallow the field after it', () => {
  // The block reader used to stop only at a COUNTED heading, so an uncounted
  // one sitting between two fields was not a boundary. Keywords is last here
  // on purpose: if ## Copyright failed to terminate, its body would land in
  // the previous field and the count would be wrong.
  const file = metadata({ extra: ['## Subtitle (30)', '', '    Slide tiles, learn logic', ''].join('\n') });
  const { code, out } = run(file);
  assert.equal(code, 0, out);
  assert.match(out, /Subtitle\s+24 \/ 30/);
});

test('counted fields still fail on length, and the guard still counts them', () => {
  const { code, out } = run(metadata({ keywords: 'x'.repeat(101) }));
  assert.equal(code, 1, out);
  assert.match(out, /OVER/);
});

test('a file with no counted fields at all is a format failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hypno-meta-'));
  trash.push(dir);
  const file = join(dir, 'metadata.md');
  writeFileSync(file, '# Store listing\n\n## Copyright\n\n    2026 magmacrunch media\n');
  const { code, out } = run(file);
  assert.equal(code, 1, out);
  assert.match(out, /no counted fields found/);
});
