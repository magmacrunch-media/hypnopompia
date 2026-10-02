/**
 * checkWebInventory(): every top-level entry in web/ is one the build has an
 * opinion about.
 *
 *     node --test tests/**\/*.test.mjs
 *
 * ## Why this check exists at all
 *
 * The shared allowlist refuses to guess about a file the arcade picked up.
 * Nothing said the same about a file appearing in the game's OWN web/, and the
 * asymmetry was a real hole rather than an untidiness: a PWA commit added
 * sw.js and a line registering it, this pipeline had no opinion, and an App
 * Store build shipped a service worker precaching the app's own html, css and
 * js cache-first under a cache name that never changes. Its first symptom
 * would have been a player on the SECOND release running code the update was
 * meant to replace.
 *
 * ## Why these assertions and not a fixture bundle
 *
 * The interesting part is the comparison, not the copying. This builds a real
 * directory because the check reads the filesystem, but it asserts on the two
 * directions the comparison can fail in, which is where a guard rots: one that
 * stops noticing new files reports nothing, and reporting nothing is exactly
 * what a clean tree looks like.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createBuild } from '../pipeline/index.mjs';

/** A throwaway game checkout: <root>/web/<entries> and <root>/ios. */
function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), 'web-inventory-'));
  mkdirSync(join(root, 'ios'), { recursive: true });
  mkdirSync(join(root, 'web'), { recursive: true });
  for (const rel of entries) {
    const full = join(root, 'web', rel);
    if (rel.endsWith('/')) {
      mkdirSync(full, { recursive: true });
    } else {
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, '');
    }
  }
  const build = createBuild({ ios: join(root, 'ios'), probe: 'anything.js' });
  return { root, build, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * die() exits the process, so the check cannot simply be called and caught.
 * Swapping process.exit for a throw is what makes it assertable, and it is
 * honest: the thing under test is whether it decides to stop the build.
 */
function stops(build, fn) {
  const exit = process.exit;
  const err = console.error;
  let stopped = false;
  process.exit = () => { stopped = true; throw new Error('die'); };
  console.error = () => {};
  try {
    fn();
  } catch {
    // die() throws through the stub above; anything else is a real failure
    // and `stopped` stays false, which the assertion catches.
  } finally {
    process.exit = exit;
    console.error = err;
  }
  return stopped;
}

test('a tree holding only declared entries passes', () => {
  const { build, cleanup } = fixture(['index.html', 'css/', 'js/', 'README.md']);
  try {
    assert.equal(
      stops(build, () => build.checkWebInventory(['index.html', 'css', 'js'], new Set(['README.md']))),
      false
    );
  } finally {
    cleanup();
  }
});

test('an undeclared top-level file stops the build', () => {
  // The case this was written for, by name.
  const { build, cleanup } = fixture(['index.html', 'sw.js']);
  try {
    assert.ok(stops(build, () => build.checkWebInventory(['index.html'], new Set())));
  } finally {
    cleanup();
  }
});

test('an undeclared top-level directory stops the build too', () => {
  const { build, cleanup } = fixture(['index.html', 'vendor/']);
  try {
    assert.ok(stops(build, () => build.checkWebInventory(['index.html'], new Set())));
  } finally {
    cleanup();
  }
});

test('excluding something counts as having an opinion about it', () => {
  const { build, cleanup } = fixture(['index.html', 'sw.js']);
  try {
    assert.equal(
      stops(build, () => build.checkWebInventory(['index.html'], new Set(['sw.js']))),
      false
    );
  } finally {
    cleanup();
  }
});

test('a nested exclusion is judged by its top-level folder', () => {
  // EXCLUDE carries paths like audio/README.txt, and audio/ is carried. The
  // check must not read that nested path as a top-level entry of its own.
  const { build, cleanup } = fixture(['index.html', 'audio/README.txt', 'audio/clip.mp3']);
  try {
    assert.equal(
      stops(build, () => build.checkWebInventory(['index.html', 'audio'], new Set(['audio/README.txt']))),
      false
    );
  } finally {
    cleanup();
  }
});

test('declaring something that is gone stops the build as well', () => {
  // The other direction, and the one that rots quietly: an exclusion for a
  // file that no longer exists excludes nothing, and reads exactly like one
  // that is doing its job.
  const { build, cleanup } = fixture(['index.html']);
  try {
    assert.ok(stops(build, () => build.checkWebInventory(['index.html'], new Set(['title-card.html']))));
  } finally {
    cleanup();
  }
});

test('a carried entry that is gone stops the build', () => {
  const { build, cleanup } = fixture(['index.html']);
  try {
    assert.ok(stops(build, () => build.checkWebInventory(['index.html', 'css'], new Set())));
  } finally {
    cleanup();
  }
});
