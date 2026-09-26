#!/usr/bin/env node
/**
 * Package a built App.app for the iOS Simulator, with a manifest describing it.
 *
 *     node ../hypnopompia/tools/package-sim.mjs \
 *       --app "$RUNNER_TEMP/derived/Build/Products/Debug-iphonesimulator/App.app" \
 *       --out "$RUNNER_TEMP/sim" --repo . --name makemecookies
 *
 * Writes two files into --out: `<build>.zip` and `build.json`. Both go into one
 * Actions artifact, and `tools/deploy-sim.mjs` reads the manifest to build the
 * landing page, so nothing about a build is written down twice.
 *
 * ## Why this is here and not in each game's workflow
 *
 * Four repositories need it -- two games, two tools -- and all four already
 * check this repository out beside themselves to build their bundle at all, so
 * the alternative was the same forty lines of YAML copied four times and then
 * drifting. The same argument as pipeline/index.mjs, one step later in the
 * process.
 *
 * ## Everything on the page is read out of the bundle, not out of the project
 *
 * The architectures, the minimum iOS, the bundle id and the display name all
 * come from the app that was just built, via lipo and plutil. A deployment
 * target raised in project.pbxproj without a rebuild, or a display name changed
 * in capacitor.config.json and never synced, would otherwise reach a tester as
 * a page telling them something the app does not do. The page cannot be more
 * current than the zip beside it if it is generated from the zip.
 *
 * ## ditto, not zip
 *
 * An .app is a bundle, and a framework inside one uses symlinks. `zip -r`
 * stores those as copies of what they point at, which both inflates the archive
 * and can produce a bundle `simctl install` refuses. `ditto -c -k --keepParent`
 * is the Apple tool for exactly this, and --keepParent is what puts App.app
 * itself in the archive rather than its contents loose at the root.
 *
 * macOS only, by nature: ditto, lipo and plutil are all Apple's. It says so
 * rather than failing three frames deep in a spawn error.
 */
import { existsSync, mkdirSync, writeFileSync, appendFileSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function die(message) {
  console.error(`package-sim: ${message}`);
  process.exit(1);
}

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) die(`${flag} needs a value`);
  return value;
}

/** Output of `cmd`, trimmed, or null if it fails. Never throws. */
function tryRun(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function sha(repoPath) {
  const out = tryRun('git', ['-C', repoPath, 'rev-parse', '--short=8', 'HEAD']);
  if (!out) die(`${repoPath} is not a git checkout, so there is no sha to name the build after`);
  return out;
}

function plist(app, key) {
  return tryRun('plutil', ['-extract', key, 'raw', join(app, 'Info.plist')]);
}

if (process.platform !== 'darwin') {
  die('this needs ditto, lipo and plutil, so it only runs on macOS');
}

const app = resolve(arg('--app') ?? die('--app <path to App.app> is required'));
const out = resolve(arg('--out') ?? die('--out <directory> is required'));
const repo = resolve(arg('--repo', process.cwd()));
// The slug in the file name. Defaults to the repository directory's name, which
// is what CI checks the game out as, and is overridable because a directory
// name is a weak thing to hang a published file name on.
const name = arg('--name', basename(repo));

if (!existsSync(app)) die(`no app at ${app} -- did xcodebuild run, and is this the right configuration?`);
if (!existsSync(join(app, 'Info.plist'))) die(`${app} has no Info.plist, so it is not an app bundle`);

// The launcher stub carries the architectures even in a Debug build, where the
// project's own code is in App.debug.dylib. See the games' ios-build jobs.
const mainBinary = join(app, 'App');
if (!existsSync(mainBinary)) die(`${app} has no App executable inside it`);

const game = sha(repo);
const shell = sha(ROOT);
const archs = tryRun('lipo', ['-archs', mainBinary]) ?? 'unknown';
const minOS = plist(app, 'MinimumOSVersion') ?? 'unknown';
const bundleId = plist(app, 'CFBundleIdentifier') ?? 'unknown';
// CFBundleDisplayName is what a phone's home screen shows and is what a tester
// will look for; Capacitor writes it for some apps and not others, so CFBundleName
// is the fallback rather than an error.
const title = plist(app, 'CFBundleDisplayName') ?? plist(app, 'CFBundleName') ?? name;

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const build = `${name}-sim-${stamp}-${game}-${shell}`;
const zipName = `${build}.zip`;

mkdirSync(out, { recursive: true });
const zipPath = join(out, zipName);
try {
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zipPath], {
    stdio: 'inherit',
  });
} catch (e) {
  die(`ditto failed: ${e.message}`);
}
if (!existsSync(zipPath)) die('ditto reported success and produced no archive');
const bytes = statSync(zipPath).size;
if (bytes < 1024) die(`the archive is ${bytes} bytes, which cannot be an app`);

const manifest = {
  build,
  zip: zipName,
  bytes,
  name,
  title,
  bundleId,
  archs,
  minOS,
  game,
  shell,
  built: new Date().toISOString(),
};
writeFileSync(join(out, 'build.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// Under Actions, hand the same facts to the rest of the job as SIM_* variables.
// A later step that wants the build id or the minimum iOS then reads a shell
// variable instead of parsing JSON inside a YAML block scalar, which is a
// quoting problem with no good answer. Every value here is single-line by
// construction -- a sha, a version, a file name -- so the plain KEY=value form
// of GITHUB_ENV is safe and the heredoc form is not needed.
if (process.env.GITHUB_ENV) {
  const exported = {
    SIM_BUILD: build,
    SIM_ZIP: zipName,
    SIM_TITLE: title,
    SIM_BUNDLE_ID: bundleId,
    SIM_ARCHS: archs,
    SIM_MIN_OS: minOS,
    SIM_GAME: game,
    SIM_SHELL: shell,
  };
  const lines = Object.entries(exported).map(([k, v]) => `${k}=${v}`);
  for (const [k, v] of Object.entries(exported)) {
    if (String(v).includes('\n')) die(`${k} contains a newline, which GITHUB_ENV cannot carry`);
  }
  appendFileSync(process.env.GITHUB_ENV, `${lines.join('\n')}\n`);
}

const mb = (bytes / 1e6).toFixed(1);
console.log(`${zipName}  ${mb} MB  ${archs}  iOS ${minOS} or newer  ${bundleId}`);
console.log(`wrote ${readdirSync(out).sort().join(', ')} into ${out}`);
