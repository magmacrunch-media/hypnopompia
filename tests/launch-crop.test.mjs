/**
 * check-launch-crop.mjs: the crop limits against the declared orientations.
 *
 *     node --test tests/**\/*.test.mjs
 *
 * ## What is actually being asserted
 *
 * That a limit pointed at the wrong axis FAILS. That is the whole subject,
 * because the bug this tool was written for was green for five days:
 * makemecookies took george-boole's two constants unchanged, guarding the
 * width at 46% on a landscape phone that never crops the width, while allowing
 * 70% of the height on one that shows 46%. Its art was small enough to clear
 * both limits either way round, so nothing failed and nothing was wrong-looking.
 *
 * A test that only checked the two real games would have passed on the broken
 * version too, for the same reason. So the cases below build plists the games
 * do not have, and require the tool to object.
 *
 * ## Exit codes are the contract
 *
 * 0 checked and correct, 1 a limit is too lax, 2 nothing to check. The third
 * matters as much as the first: a splash script that stops declaring its
 * constants, or a missing Info.plist, must not read as a pass.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK = join(ROOT, 'tools', 'check-launch-crop.mjs');

const PORTRAIT = ['UIInterfaceOrientationPortrait'];
const LANDSCAPE = ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];
const ALL_FOUR = [...PORTRAIT, 'UIInterfaceOrientationPortraitUpsideDown', ...LANDSCAPE];

function run(dir) {
  const r = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const trash = [];
test.after(() => {
  for (const p of trash) rmSync(p, { recursive: true, force: true });
});

const array = (key, values) =>
  `\t<key>${key}</key>\n\t<array>\n${values.map((v) => `\t\t<string>${v}</string>`).join('\n')}\n\t</array>\n`;

/**
 * A throwaway ios/ tree. `constants: null` writes a splash script that
 * declares neither name; `plist: false` omits Info.plist entirely.
 */
function fakeGame({
  phone = PORTRAIT,
  pad = ALL_FOUR,
  constants = { width: 0.44, height: 0.7 },
  plist = true,
  file = 'make-art.py',
} = {}) {
  const ios = mkdtempSync(join(tmpdir(), 'hypno-crop-'));
  trash.push(ios);

  if (plist) {
    mkdirSync(join(ios, 'App', 'App', 'App'), { recursive: true });
    const body =
      '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n' +
      array('UISupportedInterfaceOrientations', phone) +
      (pad ? array('UISupportedInterfaceOrientations~ipad', pad) : '') +
      '</dict>\n</plist>\n';
    writeFileSync(join(ios, 'App', 'App', 'App', 'Info.plist'), body);
  }

  mkdirSync(join(ios, 'tools'), { recursive: true });
  const src = constants
    ? `CROP_WIDTH = ${constants.width}\nCROP_HEIGHT = ${constants.height}\n`
    : 'SAFE_WIDTH = 0.38\n';
  writeFileSync(join(ios, 'tools', file), src);
  return ios;
}

test('a portrait phone with portrait-shaped limits passes', () => {
  const { code, out } = run(fakeGame());
  assert.equal(code, 0, out);
  assert.match(out, /width.*46%.*phone portrait/);
});

test('a landscape phone with landscape-shaped limits passes', () => {
  const { code, out } = run(
    fakeGame({ phone: LANDSCAPE, constants: { width: 0.72, height: 0.44 } })
  );
  assert.equal(code, 0, out);
  assert.match(out, /height.*46%.*phone landscape/);
});

test('the real bug: a landscape phone carrying the portrait limits fails', () => {
  // Exactly makemecookies between 2026-09-19 and 2026-09-24.
  const { code, out } = run(fakeGame({ phone: LANDSCAPE, constants: { width: 0.44, height: 0.7 } }));
  assert.equal(code, 1, out);
  assert.match(out, /WRONG height/);
  assert.match(out, /CROP_HEIGHT/);
});

test('and the mirror: a portrait phone carrying the landscape limits fails', () => {
  const { code, out } = run(fakeGame({ phone: PORTRAIT, constants: { width: 0.72, height: 0.44 } }));
  assert.equal(code, 1, out);
  assert.match(out, /WRONG width/);
});

test('a limit exactly equal to what the device shows is allowed', () => {
  // 1320/2868 is 0.4603, so 0.46 is inside it and 0.47 is not.
  assert.equal(run(fakeGame({ constants: { width: 0.46, height: 0.7 } })).code, 0);
  assert.equal(run(fakeGame({ constants: { width: 0.47, height: 0.7 } })).code, 1);
});

test('an axis nothing crops is unconstrained', () => {
  // Phone landscape and iPad landscape only: no portrait view anywhere, so
  // nothing crops the width and any CROP_WIDTH is fine.
  const { code, out } = run(
    fakeGame({ phone: LANDSCAPE, pad: LANDSCAPE, constants: { width: 0.99, height: 0.44 } })
  );
  assert.equal(code, 0, out);
  assert.match(out, /never cropped/);
});

test('an absent ~ipad key means the phone list applies to iPad too', () => {
  const { code, out } = run(
    fakeGame({ phone: LANDSCAPE, pad: null, constants: { width: 0.99, height: 0.44 } })
  );
  assert.equal(code, 0, out);
});

test('the file is found by its constants, not by its name', () => {
  const { code, out } = run(fakeGame({ file: 'make-splash.py' }));
  assert.equal(code, 0, out);
  assert.match(out, /make-splash\.py/);
});

test('no file declaring both constants is exit 2, not a pass', () => {
  const { code, out } = run(fakeGame({ constants: null }));
  assert.equal(code, 2, out);
  assert.match(out, /CROP_WIDTH and CROP_HEIGHT/);
});

test('no Info.plist is exit 2, not a pass', () => {
  const { code, out } = run(fakeGame({ plist: false }));
  assert.equal(code, 2, out);
});
