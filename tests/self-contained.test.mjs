/**
 * outsideRefs(): what counts as a bundle reaching outside itself.
 *
 *     node --test tests/**\/*.test.mjs
 *
 * ## Why this is tested on strings
 *
 * `sweepSelfContained` walks the built bundle and calls this on every line. The
 * walking is not the interesting part; the matching is. A rule that stops
 * matching does not fail, it reports nothing, and a sweep reporting nothing is
 * indistinguishable from a clean bundle. That is the failure this repo keeps
 * writing down, so the rules are a pure function and these assert them
 * directly rather than building a fixture bundle to infer them.
 *
 * The negative cases matter as much as the positive ones. A rule that flags
 * `url(data:...)` or `url(#glow)` would fail every build in the arcade, and the
 * next person would delete the check rather than the rule.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { outsideRefs } from '../pipeline/index.mjs';

const flagged = (line) => outsideRefs(line).length > 0;

test('attribute paths that leave the bundle are caught', () => {
  assert.ok(flagged('<script src="../shared/adenosine-rpg.js"></script>'));
  assert.ok(flagged('<link rel="stylesheet" href="../shared/arcade-base.css">'));
  assert.ok(flagged("<img src='../../fonts/x.png'>"));
});

test('assets fetched over the network are caught', () => {
  assert.ok(flagged('<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">'));
  assert.ok(flagged('<script src="http://example.com/a.js"></script>'));
});

test('a CSS url() that leaves the bundle is caught', () => {
  // The case that was missed until 2026-09-23: an @font-face is not a tag, so
  // no src=/href= rule can see it.
  assert.ok(flagged("    src: url('../../fonts/ShareTechMono-Regular.woff2') format('woff2');"));
  assert.ok(flagged('  background: url(../img/tile.png);'));
  assert.ok(flagged('  src: url("https://fonts.gstatic.com/s/x.woff2");'));
  assert.ok(flagged('  background: url( "../a.png" );'), 'whitespace inside url() must not hide it');
});

test('an @import that leaves the bundle is caught in both spellings', () => {
  assert.ok(flagged('@import url("../shared/base.css");'), 'the url() spelling');
  assert.ok(flagged('@import "../shared/base.css";'), 'the bare-string spelling');
  assert.ok(flagged("@import 'https://example.com/x.css';"));
});

test('references that stay inside the bundle are left alone', () => {
  assert.equal(flagged('<script src="js/main.js"></script>'), false);
  assert.equal(flagged("    src: url('fonts/PressStart2P-Regular.woff2') format('woff2');"), false);
  assert.equal(flagged('<link rel="stylesheet" href="css/base.css">'), false);
});

test('data URIs and fragment references are not escapes', () => {
  // Both are ordinary in this arcade: the games' favicons are data URIs and
  // their SVG filters point at fragments. Flagging either breaks every build.
  assert.equal(flagged("<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg%3E\">"), false);
  assert.equal(flagged('  background: url(data:image/png;base64,iVBORw0KGgo=);'), false);
  assert.equal(flagged('  filter: url(#glow);'), false);
  assert.equal(flagged('  mask: url("#cookie-mask");'), false);
});

test('the label says which kind of escape it is', () => {
  assert.deepEqual(outsideRefs("  src: url('../x.woff2');"), [
    'reaches outside the bundle, through a CSS url()',
  ]);
  assert.deepEqual(outsideRefs('<script src="js/a.js"></script>'), []);
});
