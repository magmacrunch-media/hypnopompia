/**
 * testkit/fake-gamecenter.js against the Swift it models.
 *
 *     node --test tests/**\/*.test.mjs
 *
 * ## Vendoring stops one kind of drift and this stops the other
 *
 * `sync.mjs --check` proves every consumer holds a byte-identical copy of the
 * fake. It says nothing about whether the fake still resembles
 * `native/GameCenterPlugin.swift`, and that is the drift that actually costs
 * something: a guard added upstream, no line added to the model, and both
 * games' shim suites go on passing while no longer testing the refusal they
 * think they are testing. A file can be perfectly in sync with itself and
 * wrong.
 *
 * So two halves below. The first asserts the fake refuses on each condition the
 * Swift's guards refuse on, in the order the Swift checks them, because the
 * order decides which rejection a caller gets. The second counts the rejection
 * sites in the Swift and fails when that number moves, which is the only way a
 * NEW guard can announce itself to a model written in another language.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SWIFT = readFileSync(join(ROOT, 'native', 'GameCenterPlugin.swift'), 'utf8');

/* The fake is CommonJS because a consumer's ios/tests/ is, and `.cjs` because
   this package is "type": "module" and createRequire does NOT escape that for a
   .js file. Its own header has the long version; this line is the other end. */
const { makeGameCenter } = createRequire(import.meta.url)('../testkit/fake-gamecenter.cjs');

/** The message a rejection carried, or null if it resolved. */
async function refusal(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return e.message;
  }
}

test('signIn answers from the current state, every time', async () => {
  const gc = makeGameCenter({ authenticated: false });
  assert.deepEqual(await gc.signIn(), { authenticated: false });
  gc.authenticated = true;
  assert.deepEqual(await gc.signIn(), { authenticated: true },
    'a second call reads the state now, which is what makes a re-check on resume safe');
  assert.equal(gc.calls.signIn, 2, 'and both are counted');
});

test('submitScore checks its arguments before the sign-in, as the Swift does', async () => {
  const gc = makeGameCenter({ authenticated: false });

  assert.equal(await refusal(gc.submitScore({ score: 10 })), 'leaderboardId is required');
  assert.equal(await refusal(gc.submitScore({ leaderboardId: 'b' })), 'score is required',
    'a missing score is refused for the score, not for the sign-in');
  assert.equal(await refusal(gc.submitScore({ leaderboardId: 'b', score: 1.5 })),
    'score is required',
    'and so is a fraction: the Swift reads it with call.getInt');
  assert.equal(await refusal(gc.submitScore({ leaderboardId: 'b', score: 10 })),
    'not signed in to Game Center',
    'only a well-formed call reaches the sign-in guard');

  gc.authenticated = true;
  assert.equal(await refusal(gc.submitScore({ leaderboardId: 'b', score: 10 })), null);
  assert.equal(gc.calls.submitScore.length, 5, 'every attempt is recorded, refused or not');
});

test('showLeaderboard has no argument guard, and that is deliberate upstream', async () => {
  const gc = makeGameCenter({ authenticated: true });
  assert.equal(await refusal(gc.showLeaderboard({ leaderboardId: null })), null,
    'a null id is a shim asking for the LIST, which the plugin honours');
  assert.equal(await refusal(gc.showLeaderboard({})), null, 'and so is an absent one');
  assert.match(SWIFT, /GKGameCenterViewController\(state: \.leaderboards\)/,
    'which is the branch upstream that makes those two legal');

  gc.authenticated = false;
  assert.equal(await refusal(gc.showLeaderboard({ leaderboardId: 'b' })),
    'not signed in to Game Center');
});

test('reportAchievement checks its id, and percent is optional', async () => {
  const gc = makeGameCenter({ authenticated: true });
  assert.equal(await refusal(gc.reportAchievement({ percent: 100 })), 'achievementId is required');
  assert.equal(await refusal(gc.reportAchievement({ achievementId: 'a' })), null,
    'percent is optional, defaulting to 100 upstream');
  assert.match(SWIFT, /call\.getDouble\("percent"\) \?\? 100/, 'which is where that default is');
});

test('a throwing bridge is a separate failure from a rejecting one', async () => {
  // Capacitor's proxy returns rejected promises and does not throw. Both games'
  // shims are written to survive either, and george-boole's refresh() was not
  // until 2026-09-29, so these switches are the difference being testable.
  const gc = makeGameCenter({ authenticated: true });

  gc.throwOnSignIn = true;
  assert.throws(() => gc.signIn(), /the bridge threw/);
  gc.throwOnSignIn = false;

  gc.throwOnShow = true;
  assert.throws(() => gc.showLeaderboard({ leaderboardId: 'b' }), /the bridge threw/);
  gc.throwOnShow = false;

  gc.throwOnReport = true;
  assert.throws(() => gc.reportAchievement({ achievementId: 'a' }), /the bridge threw/);
});

test('failSignIn rejects rather than answering false', async () => {
  // Not the same as signed out, and the shims must read it as signed out
  // anyway: it is what the plugin says when it cannot tell.
  const gc = makeGameCenter({ authenticated: true });
  gc.failSignIn = true;
  assert.equal(await refusal(gc.signIn()), 'sign-in failed');
});

/**
 * The census, and the point of the whole file.
 *
 * Nine `call.reject` sites upstream. Seven are guards, which the fake models;
 * two are GameKit itself failing inside a completion handler, which it does not
 * and should not -- a shim cannot tell those from any other refusal, and every
 * shim path that could see one already treats a rejection as a rejection.
 *
 * **When this fails, a guard moved.** Read the diff, decide which half it is,
 * and either add a line to the fake and a test above, or raise the runtime
 * count with a note saying why it is not modelled. Do not simply bump the
 * number: that is the check turning itself off.
 */
test('the Swift has not grown a rejection the fake has never heard of', () => {
  const rejects = SWIFT.match(/call\.reject\(/g) || [];
  assert.equal(rejects.length, 9, 'call.reject sites in GameCenterPlugin.swift');

  const guarded = [...SWIFT.matchAll(/else\s*\{\s*\n\s*call\.reject\("([^"]+)"\)/g)]
    .map((m) => m[1]);
  assert.equal(guarded.length, 7, 'of which this many are guard rejections');

  // Each distinct guard message, and the fake owes a refusal for every one.
  assert.deepEqual([...new Set(guarded)].sort(), [
    'achievementId is required',
    'leaderboardId is required',
    'no view controller to present from',
    'not signed in to Game Center',
    'score is required',
  ], 'the guard messages the fake is written against');
});

/**
 * One guard the fake deliberately does not model, recorded so its absence is a
 * decision rather than an oversight.
 */
test('the presentation guard is not modelled, on purpose', () => {
  assert.match(SWIFT, /no view controller to present from/);
  // It fires when the bridge has no host view controller, which is a broken app
  // rather than a state a shim can reach or do anything about: every caller of
  // showLeaderboard already treats a rejection as "the board did not open".
  // Modelling it would add a switch no test would ever set to anything else.
  const gc = makeGameCenter({ authenticated: true });
  assert.equal(typeof gc.throwOnShow, 'boolean',
    'the throwing switch covers the same observable outcome');
});
