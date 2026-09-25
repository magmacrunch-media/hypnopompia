#!/usr/bin/env node
/**
 * Check a game's launch-image crop limits against its own Info.plist.
 *
 *     node tools/check-launch-crop.mjs ../../games/george-boole/ios
 *     node tools/check-launch-crop.mjs ../../games/makemecookies/ios
 *     node tools/check-launch-crop.mjs            # cwd, for running from a game
 *
 * ## The failure this exists for
 *
 * `LaunchScreen.storyboard` scales a square with `scaleAspectFill`, so the
 * image covers the view and the view's SHORTER side decides how much of the
 * square survives, on that side's axis:
 *
 *     a landscape view (W > H)  ->  full width,  H/W of the HEIGHT
 *     a portrait  view (W < H)  ->  full height, W/H of the WIDTH
 *
 * So which axis is at risk is decided by `Info.plist`, and the two games
 * already differ: george-boole's phone is portrait and makemecookies' is
 * landscape, which puts the same two figures on opposite axes.
 *
 * makemecookies was written from george-boole's script and took its two
 * constants unchanged, so from 2026-09-19 to 2026-09-24 it guarded the width
 * at 46% on a device that never crops the width, and allowed 70% of the height
 * on one that shows 46%. **It was green the whole time**, because the art was
 * small enough to clear both limits either way round. A guard pointed at the
 * wrong axis passes for exactly as long as nobody tests it, which is the
 * failure mode this repo keeps meeting.
 *
 * Both games' numbers are correct today and were arrived at by hand. Nothing
 * tied them to the orientations they are derived from, so flipping an
 * orientation in `Info.plist` would have silently invalidated a guard again.
 * This ties them.
 *
 * ## The contract, and why it is two constants rather than parsing the script
 *
 * A game declares the limits it enforces as `CROP_WIDTH` and `CROP_HEIGHT`,
 * module-level, in whichever file under `ios/tools/` draws its launch image.
 * This finds that file by looking for both names rather than by filename,
 * because the two games do not agree on one: `make-art.py` here, and
 * `make-splash.py` there.
 *
 * It deliberately does not try to read the assertions themselves. That would
 * mean understanding two scripts' shapes, which is what check-metadata.mjs's
 * header refuses to do on the same grounds. A named constant is a thing a game
 * states; an `if` is a thing it does.
 *
 * Exit codes: 0 checked and correct, 1 a limit is too lax for what the device
 * shows, 2 nothing to check -- no plist, or no file declaring the constants.
 * The third is separate because a game whose splash script stopped declaring
 * them must not read as a pass.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The narrowest current devices, as a shorter/longer ratio. These are Apple's
 * facts rather than a game's, which is what makes them shared.
 *
 *   iPhone  1320 x 2868  ->  0.460
 *   iPad    1024 x 1366  ->  0.750
 *
 * A new device narrower than either moves these; nothing else here changes.
 */
const RATIO = { phone: 1320 / 2868, pad: 1024 / 1366 };

function resolveIos(arg) {
  const p = resolve(arg || process.cwd());
  if (!existsSync(p)) {
    console.error(`check-launch-crop: no such path: ${p}`);
    process.exit(1);
  }
  for (const c of [p, join(p, 'ios')]) {
    if (existsSync(join(c, 'tools'))) return c;
  }
  console.error(`check-launch-crop: no tools/ under ${p} or ${join(p, 'ios')}`);
  process.exit(1);
}

const IOS = resolveIos(process.argv[2]);

/** The `<string>` values of the `<array>` following `<key>NAME</key>`. */
function plistArray(xml, key) {
  const at = xml.indexOf(`<key>${key}</key>`);
  if (at === -1) return null;
  const open = xml.indexOf('<array>', at);
  const close = xml.indexOf('</array>', open);
  if (open === -1 || close === -1) return null;
  return [...xml.slice(open, close).matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
}

const plistPath = join(IOS, 'App', 'App', 'App', 'Info.plist');
if (!existsSync(plistPath)) {
  console.error(
    `check-launch-crop: no Info.plist at ${plistPath}\n` +
      '  Without it there is nothing to derive the limits from, which is not\n' +
      '  the same as the limits being right. Exiting 2.'
  );
  process.exit(2);
}
const xml = readFileSync(plistPath, 'utf8');

const phone = plistArray(xml, 'UISupportedInterfaceOrientations') || [];
// An absent ~ipad key means the base list applies to iPad too.
const pad = plistArray(xml, 'UISupportedInterfaceOrientations~ipad') || phone;
if (phone.length === 0) {
  console.error('check-launch-crop: Info.plist declares no iPhone orientations');
  process.exit(2);
}

// Each supported orientation caps exactly one axis. The binding cap is the
// smallest, and an axis nothing crops stays at 1.0.
const shows = { width: 1, height: 1 };
const why = { width: null, height: null };
for (const [list, ratio, device] of [[phone, RATIO.phone, 'phone'], [pad, RATIO.pad, 'iPad']]) {
  for (const o of list) {
    const landscape = o.includes('Landscape');
    const axis = landscape ? 'height' : 'width';
    if (ratio < shows[axis]) {
      shows[axis] = ratio;
      why[axis] = `${device} ${landscape ? 'landscape' : 'portrait'}`;
    }
  }
}

/** The game's declared limits, from whichever tool defines both. */
function declared() {
  const dir = join(IOS, 'tools');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.py')).sort()) {
    const src = readFileSync(join(dir, file), 'utf8');
    const w = /^CROP_WIDTH\s*=\s*([0-9.]+)/m.exec(src);
    const h = /^CROP_HEIGHT\s*=\s*([0-9.]+)/m.exec(src);
    if (w && h) return { file, width: Number(w[1]), height: Number(h[1]) };
  }
  return null;
}

const limits = declared();
if (!limits) {
  console.error(
    `check-launch-crop: no file under ${join(IOS, 'tools')} declares both\n` +
      '  CROP_WIDTH and CROP_HEIGHT. A launch-image script that stopped\n' +
      '  declaring them must not read as a pass, so this exits 2.'
  );
  process.exit(2);
}

console.log(`orientations   iPhone ${phone.length}, iPad ${pad.length}`);
console.log(`limits from    tools/${limits.file}`);
console.log('');

let failed = 0;
for (const axis of ['width', 'height']) {
  const device = shows[axis];
  const enforced = limits[axis];
  const pct = (n) => `${Math.round(n * 100)}%`;
  const source = why[axis] ? ` (${why[axis]})` : ' (never cropped)';

  if (enforced > device) {
    failed += 1;
    console.log(`WRONG ${axis.padEnd(6)} device shows ${pct(device)}${source}, script allows ${pct(enforced)}`);
    console.log(`        Art that passes would still be cropped. Lower CROP_${axis.toUpperCase()}`);
    console.log(`        to ${pct(device)} or less, and check it is on the axis you meant.`);
  } else {
    console.log(`  ok  ${axis.padEnd(6)} device shows ${pct(device)}${source}, script allows ${pct(enforced)}`);
  }
}

console.log('');
if (failed) {
  console.error(`${failed} limit(s) too lax for what Info.plist says this app runs in.`);
  process.exit(1);
}
console.log('Both limits are at or inside what the supported orientations show.');
