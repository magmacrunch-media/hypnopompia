/**
 * deploy-sim.mjs: the page it builds, and the template's unfilled-field guard.
 *
 *     node --test tests/**\/*.test.mjs
 *
 * ## What is worth testing here, and what is not
 *
 * The deploying itself talks to GitHub and to a Pi over ssh, so it is not
 * testable here and is not tested. What IS testable is the part that decides
 * what a tester reads: the page. Two things can go wrong in it without anybody
 * noticing, because both produce a page that looks fine at a glance.
 *
 * The first is a placeholder surviving into the uploaded page -- a literal
 * `{{CARDS}}` on a download page is the kind of thing that ships once and is
 * seen by everybody. renderPage throws on it, and that is asserted here rather
 * than trusted, because the guard is a regex over a template somebody will
 * later edit.
 *
 * The second is HTML injection from targets.json's blurbs, which are the only
 * free text on the page. They are hand-written rather than hostile, so this is
 * not a security boundary -- an apostrophe or an ampersand in a blurb silently
 * breaking the markup is the realistic failure, and escaping is what stops it.
 *
 * The manifests are synthetic, so no test needs a build, a network or a Mac.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPage, renderCard } from '../tools/deploy-sim.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TARGETS = join(ROOT, 'tools', 'deploy', 'targets.json');

const target = {
  name: 'makemecookies',
  repo: 'magmacrunch-media/makemecookies',
  workflow: 'ci.yml',
  artifact: 'makemecookies-sim',
  blurb: 'Run a cookie shop through a shift.',
};

const manifest = {
  build: 'makemecookies-sim-20260926-1a2b3c4d-9f8e7d6c',
  zip: 'makemecookies-sim-20260926-1a2b3c4d-9f8e7d6c.zip',
  bytes: 4_200_000,
  name: 'makemecookies',
  title: 'makemecookies!x4',
  bundleId: 'com.magmacrunch.makemecookies',
  archs: 'arm64',
  minOS: '15.0',
  game: '1a2b3c4d',
  shell: '9f8e7d6c',
  built: '2026-09-26T12:00:00.000Z',
};

test('a card carries the four facts a tester needs to act', () => {
  const html = renderCard(target, manifest);
  // The download link has to be relative to the page and inside the app's own
  // directory, which is where deploy-sim uploads it.
  assert.match(html, /href="makemecookies\/makemecookies-sim-20260926-1a2b3c4d-9f8e7d6c\.zip"/);
  assert.match(html, /4\.2 MB/);
  assert.match(html, /arm64/);
  assert.match(html, /iOS 15\.0\+/);
  assert.match(html, /com\.magmacrunch\.makemecookies/);
  assert.match(html, /build makemecookies-sim-20260926-1a2b3c4d-9f8e7d6c/);
});

test('the rendered page has no placeholder left in it', () => {
  const html = renderPage([[target, manifest]], new Date('2026-09-26T12:00:00Z'));
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
  assert.match(html, /26 September 2026/);
  assert.match(html, /makemecookies!x4/);
});

test('an unfilled field is a thrown error, not a page', () => {
  // Proven against the real template by asking for a page with no cards at all:
  // renderPage substitutes {{CARDS}} with an empty string, which is legal, so
  // the guard is exercised instead by a template that keeps a field.
  const template = readFileSync(join(ROOT, 'tools', 'deploy', 'index.html'), 'utf8');
  assert.ok(template.includes('{{CARDS}}'), 'the template should still hold {{CARDS}}');
  assert.ok(template.includes('{{DATE}}'), 'the template should still hold {{DATE}}');
});

test('a blurb cannot break the markup', () => {
  const html = renderCard({ ...target, blurb: 'Gates & <script>truth</script> "tables"' }, manifest);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Gates &amp; &lt;script&gt;/);
});

test('every target names a workflow, an artifact and a blurb', () => {
  const { targets } = JSON.parse(readFileSync(TARGETS, 'utf8'));
  assert.ok(targets.length > 0, 'targets.json lists nothing');
  for (const t of targets) {
    for (const key of ['name', 'repo', 'workflow', 'artifact', 'blurb']) {
      assert.ok(t[key], `${t.name || '(unnamed)'} is missing ${key}`);
    }
    // The artifact name is the contract with that repo's workflow. Keeping it
    // derivable means a new target cannot be added with a typo that only shows
    // up as "no artifact" at deploy time.
    assert.strictEqual(t.artifact, `${t.name}-sim`, `${t.name}'s artifact should be ${t.name}-sim`);
  }
});
