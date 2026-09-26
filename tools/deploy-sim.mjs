#!/usr/bin/env node
/**
 * Put the iOS Simulator builds on magmacrunch-server, for testers with a Mac.
 *
 *     node tools/deploy-sim.mjs                     every target in tools/deploy/targets.json
 *     node tools/deploy-sim.mjs makemecookies       just that one
 *     node tools/deploy-sim.mjs --dry-run           render the page locally, upload nothing
 *     node tools/deploy-sim.mjs --announce          deploy, then post the link to Discord
 *     node tools/deploy-sim.mjs --announce --note "the shop closes properly now"
 *
 * The files go to /srv/private/ios/ on the Pi, which nginx serves at an
 * unguessable path; tools/deploy/nginx-private.conf describes the arrangement
 * and how it is installed. That path exists only on the Pi, so it is read back
 * from there to print the link rather than kept anywhere in this repository.
 *
 * Nothing is posted to Discord without --announce, and then only through a
 * webhook this repository does not contain: $MAGMACRUNCH_IOS_WEBHOOK, or the
 * gitignored tools/deploy/discord-webhook.url. It is #app-development in the
 * magmacrunch executives server. Deliberately NOT the webhook
 * block-island-simulator announces through: that is the family channel, which
 * wants a finished game to play rather than four unsigned simulator builds.
 *
 * ## Why this page and not a GitHub release
 *
 * Two of the four targets are private repositories, and a release asset on one
 * needs a GitHub account with access to that repo. An Actions artifact needs an
 * account for public repos too. A tester with a Mac and no GitHub login is the
 * case this exists for, and an unlisted URL is what serves it.
 *
 * ## The builds come from CI because they cannot be made here
 *
 * xcodebuild runs on macOS and the dev box is Windows, so every zip is fetched
 * from the Actions run that built it, exactly as block-island-simulator's
 * deploy_pi.py fetches its Mac and Linux builds. Each target's iOS job uploads
 * one artifact holding the zip and the build.json that package-sim.mjs wrote
 * beside it, and everything on the page is read out of that manifest.
 *
 * Unlike deploy_pi.py this does NOT require the local checkout to match
 * origin/main, because there are four repositories here and demanding all four
 * be pushed and current would block the ordinary case of sharing whatever is
 * built. Instead the newest successful run on main is used and its commit is
 * printed and put on the page, so what a tester has is always identifiable.
 *
 * ## Upload order, and passing by finding nothing
 *
 * The zips go up first, then each manifest, and index.html last, so the page
 * never links a file that has not arrived. If no target yielded a build at all
 * this exits 2 rather than uploading a page listing nothing -- the same rule as
 * sync.mjs --check, and for the same reason the root CLAUDE.md gives.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEPLOY = join(ROOT, 'tools', 'deploy');
const TEMPLATE = join(DEPLOY, 'index.html');
const TARGETS = join(DEPLOY, 'targets.json');
const WEBHOOK_FILE = join(DEPLOY, 'discord-webhook.url');

const HOST = process.env.MAGMACRUNCH_PI_HOST || 'jake@100.74.172.4';
const SITE = 'https://magmacrunch.duckdns.org';
const REMOTE = '/srv/private/ios';
const PRIVATE_CONF = '/etc/nginx/private.d/ios.conf';
const SSH = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];

// Old builds are pruned on each deploy, per target rather than in total, so
// deploying one app never drops a build somebody is already testing of another.
// The Pi's card was 70% full with 4.1 GB free when this was written and these
// zips are a few MB each, so this is tidiness rather than necessity.
const KEEP_ZIPS = 3;

const WEBHOOK_RE = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\S+$/;

function die(message, code = 1) {
  console.error(`deploy-sim: ${message}`);
  process.exit(code);
}

function flag(name) {
  return process.argv.includes(name);
}

function opt(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) die(`${name} needs a value`);
  return value;
}

function run(cmd, args, options = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', ...options }).trim();
  } catch (e) {
    const detail = [e.stderr, e.stdout].filter(Boolean).join('').trim();
    die(`${cmd} ${args.join(' ')} failed\n${detail}`);
  }
}

function ssh(command) {
  return run('ssh', [...SSH, HOST, command]);
}

/** HTML-escape, for the one place a blurb from targets.json reaches the page. */
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** One card per app, in the order targets.json lists them. Exported for tests. */
export function renderCard(target, manifest) {
  const mb = (manifest.bytes / 1e6).toFixed(1);
  return `  <section class="card">
    <h2>${esc(manifest.title)}</h2>
    <p>${esc(target.blurb)}</p>
    <a class="button" href="${esc(manifest.name)}/${esc(manifest.zip)}">Download
      <small>(${mb} MB zip)</small></a>
    <div class="facts">
      <span>${esc(manifest.archs)}</span>
      <span>iOS ${esc(manifest.minOS)}+</span>
      <span>${esc(manifest.bundleId)}</span>
      <span>build ${esc(manifest.build)}</span>
    </div>
  </section>
`;
}

/** The whole page. Throws if the template still holds an unfilled field. */
export function renderPage(pairs, date = new Date()) {
  const template = readFileSync(TEMPLATE, 'utf8');
  const cards = pairs.map(([target, manifest]) => renderCard(target, manifest)).join('\n');
  const stamp = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  // replaceAll, not replace, for both: replace() takes only the first match, and
  // a second mention of a field anywhere in the template -- a comment, say --
  // then consumes the substitution and leaves the real one in place.
  const html = template.replaceAll('{{CARDS}}', cards).replaceAll('{{DATE}}', stamp);
  const left = html.match(/\{\{[A-Z_]+\}\}/g);
  if (left) {
    throw new Error(`index.html template has unfilled fields: ${[...new Set(left)].join(', ')}`);
  }
  return html;
}

/**
 * Download `target`'s newest successful iOS artifact into `dir`.
 *
 * Returns [manifest, zipPath], or null having said why not. A target with no
 * build yet is normal -- its repo may not have the packaging step -- so it is
 * reported and skipped rather than fatal, and main() counts how many succeeded.
 */
function fetchBuild(target, dir) {
  const { repo, workflow, artifact, name } = target;
  const listed = run('gh', [
    'run', 'list', '-R', repo, '--workflow', workflow, '--branch', 'main',
    '--json', 'databaseId,headSha,conclusion,status,createdAt', '--limit', '20',
  ]); // prettier-ignore
  const runs = JSON.parse(listed || '[]');
  const chosen = runs.find((r) => r.conclusion === 'success');
  if (!chosen) {
    console.log(`${name.padEnd(15)} no successful ${workflow} run on main to take a build from`);
    return null;
  }

  const into = join(dir, name);
  mkdirSync(into, { recursive: true });
  // Not run() here: a run without this artifact is an ordinary state for a repo
  // whose iOS job has not been given the packaging step, and must skip rather
  // than kill a deploy of the other three.
  try {
    execFileSync(
      'gh',
      ['run', 'download', String(chosen.databaseId), '-R', repo, '--name', artifact, '--dir', into],
      { encoding: 'utf8', stdio: 'pipe' },
    );
  } catch (e) {
    const detail = [e.stderr, e.stdout].filter(Boolean).join('').trim().split('\n')[0];
    console.log(`${name.padEnd(15)} no ${artifact} artifact on run ${chosen.databaseId}: ${detail}`);
    return null;
  }

  const manifestPath = join(into, 'build.json');
  if (!existsSync(manifestPath)) {
    console.log(
      `${name.padEnd(15)} run ${chosen.databaseId} has no ${artifact} artifact with a build.json` +
        `\n${' '.repeat(16)}(has that repo's iOS job been given the package-sim step yet?)`,
    );
    return null;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const zipPath = join(into, manifest.zip);
  if (!existsSync(zipPath)) {
    console.log(`${name.padEnd(15)} build.json names ${manifest.zip}, which is not in the artifact`);
    return null;
  }
  // The manifest names the project itself; a mismatch means targets.json and the
  // artifact have drifted, and the page's download links would be wrong.
  if (manifest.name !== name) {
    die(`${name}'s artifact holds a build of "${manifest.name}" -- check targets.json`);
  }
  console.log(
    `${name.padEnd(15)} ${manifest.build}  ${(manifest.bytes / 1e6).toFixed(1)} MB` +
      `  from run ${chosen.databaseId} (${chosen.headSha.slice(0, 8)})`,
  );
  return [manifest, zipPath];
}

function upload(localDir, files, remoteDir) {
  ssh(`mkdir -p ${remoteDir}`);
  // cwd + bare file names, because scp on Windows reads a leading "C:" as a
  // hostname and there is no quoting that fixes it.
  run('scp', [...SSH, ...files, `${HOST}:${remoteDir}/`], { cwd: localDir });
}

function prune(name) {
  // ls -t is by mtime, and scp stamps each file as it arrives, so this keeps the
  // most recently DEPLOYED rather than the most recently built. tail -n +N is
  // 1-indexed, hence the +1.
  const out = ssh(
    `cd ${REMOTE}/${name} 2>/dev/null && ls -t *.zip 2>/dev/null | tail -n +${KEEP_ZIPS + 1} || true`,
  );
  const stale = out.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!stale.length) return;
  ssh(`cd ${REMOTE}/${name} && rm -f ${stale.map((s) => `'${s}'`).join(' ')}`);
  console.log(`${name.padEnd(15)} pruned ${stale.length} older zip(s)`);
}

function privateUrl() {
  const out = ssh(`grep -o 'location /ios-[0-9a-f]*/' ${PRIVATE_CONF} || true`);
  const m = out.match(/location (\/ios-[0-9a-f]+\/)/);
  if (!m) {
    die(
      `no private location in ${HOST}:${PRIVATE_CONF}.\n` +
        '  Install it once as tools/deploy/nginx-private.conf describes.',
    );
  }
  return SITE + m[1];
}

async function announce(url, pairs, note) {
  let hook = (process.env.MAGMACRUNCH_IOS_WEBHOOK || '').trim();
  if (!hook && existsSync(WEBHOOK_FILE)) hook = readFileSync(WEBHOOK_FILE, 'utf8').trim();
  if (!hook) {
    die(
      '--announce needs the webhook for #app-development in the magmacrunch\n' +
        '  executives server, in $MAGMACRUNCH_IOS_WEBHOOK or\n' +
        '  tools/deploy/discord-webhook.url (gitignored).\n' +
        '  Discord: #app-development -> Edit Channel -> Integrations -> Webhooks\n' +
        '  -> New Webhook -> Copy Webhook URL.\n' +
        '  NOT block-island-simulator\'s webhook: that one posts to the family\n' +
        '  channel, and these builds are not for that audience.',
    );
  }
  if (!WEBHOOK_RE.test(hook)) die('that does not look like a Discord webhook URL');

  const names = pairs.map(([, m]) => m.title);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const news = note?.trim() ? `\n\nNew in this one: ${note.trim()}` : '';
  // <...> stops Discord unfurling the link into a preview card, and the empty
  // allowed_mentions means a build announcement never pings anybody.
  const content =
    `**${list}** ${names.length === 1 ? 'has' : 'have'} a new iOS test build.\n\n` +
    `You need a Mac with Xcode, and nothing else -- no Apple account, no signing. ` +
    `The page says what to do:\n<${url}>${news}\n\n` +
    `Found something odd? Post it here with the build id from under the app you downloaded.`;
  const body = { content, allowed_mentions: { parse: [] } };

  const post = async (extra) => {
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'hypnopompia-deploy/1' },
      body: JSON.stringify({ ...body, ...(extra || {}) }),
    });
    return res;
  };

  let res = await post();
  if (!res.ok) {
    const detail = await res.text();
    let code = null;
    try {
      code = JSON.parse(detail).code;
    } catch {
      /* not JSON; the status is all there is */
    }
    // 220001 is "Webhooks posted to forum channels must have a thread_name or
    // thread_id": a forum channel holds no loose messages, every post is a
    // thread. That suits a build -- replies about it land under it -- so the
    // thread is named for the day, and the channel reads as a list of builds.
    if (res.status === 400 && code === 220001) {
      const day = new Date().toISOString().slice(0, 10);
      res = await post({ thread_name: `iOS test builds ${day}` });
      if (!res.ok) die(`Discord answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
      console.log(`announced on Discord, as a new thread: iOS test builds ${day}`);
      return;
    }
    die(`Discord answered ${res.status}: ${detail.slice(0, 300)}`);
  }
  console.log('announced on Discord');
}

async function main() {
  const dryRun = flag('--dry-run');
  const wantAnnounce = flag('--announce');
  const note = opt('--note', '');
  // Positional arguments are target names. --note's value is positional-looking,
  // so it is excluded BY POSITION rather than by value: excluding it by value
  // would also drop a target whose name happened to match the note.
  const noteAt = process.argv.indexOf('--note');
  const named = process.argv
    .slice(2)
    .filter((a, i) => !a.startsWith('--') && i + 2 !== noteAt + 1);

  const { targets } = JSON.parse(readFileSync(TARGETS, 'utf8'));
  const chosen = named.length ? targets.filter((t) => named.includes(t.name)) : targets;
  if (!chosen.length) {
    die(`no target named ${named.join(', ')}. Known: ${targets.map((t) => t.name).join(', ')}`);
  }

  const work = join(tmpdir(), `deploy-sim-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const pairs = [];
  try {
    for (const target of chosen) {
      const got = fetchBuild(target, work);
      if (got) pairs.push([target, got[0], got[1]]);
    }
    if (!pairs.length) {
      die(
        `nothing to deploy: none of ${chosen.map((t) => t.name).join(', ')} had a build.\n` +
          '  Refusing to upload a page that lists no apps.',
        2,
      );
    }

    const html = renderPage(pairs.map(([t, m]) => [t, m]));
    const pagePath = join(work, 'index.html');
    writeFileSync(pagePath, html);

    if (dryRun) {
      console.log(`\nrendered ${pagePath} for ${pairs.length} app(s); uploaded nothing`);
      return;
    }

    // Zips first, then each manifest, then the page last, so the page never
    // links a file that has not arrived.
    for (const [, manifest, zipPath] of pairs) {
      upload(dirname(zipPath), [basename(zipPath), 'build.json'], `${REMOTE}/${manifest.name}`);
      prune(manifest.name);
    }
    upload(work, ['index.html'], REMOTE);

    const url = privateUrl();
    console.log(`\n${pairs.length} app(s) deployed: ${url}`);
    if (wantAnnounce) await announce(url, pairs.map(([t, m]) => [t, m]), note);
    else console.log('(nothing posted to Discord; pass --announce for that)');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Importable for tests without deploying anything.
if (process.argv[1] && process.argv[1].endsWith('deploy-sim.mjs')) {
  await main();
}
