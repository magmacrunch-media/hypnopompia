/**
 * What sync.mjs vendors, and where each file lands inside a consumer.
 *
 * Its own module rather than a const in sync.mjs, because tests/consumers.test.mjs
 * needs it too and sync.mjs runs its work at import time, so importing from it
 * is not possible. That test used to carry a copy of the one destination path
 * under a comment saying "Mirrors its FILES map", which is the duplication this
 * removes: a third entry with a different destination would have left the test
 * building fake consumers that were missing a file and calling that drift.
 *
 * Two of the three are Swift, compiled into the app. The third is not native at
 * all -- it is the fake plugin a consumer's shim tests run against, and it is
 * here for the same reason the Swift is: it models the Swift's own guards, so
 * the two have to move together or the tests stop meaning anything. See
 * testkit/fake-gamecenter.cjs.
 */
export const FILES = {
  'native/GameCenterPlugin.swift': 'ios/App/App/App/GameCenterPlugin.swift',
  'native/GameViewController.swift': 'ios/App/App/App/GameViewController.swift',
  'testkit/fake-gamecenter.cjs': 'ios/tests/fake-gamecenter.cjs',
};
