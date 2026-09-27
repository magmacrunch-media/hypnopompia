#!/usr/bin/env node
/**
 * Put the iOS Simulator builds on magmacrunch-server, for testers with a Mac.
 *
 *     node tools/deploy-sim.mjs                     every target in tools/deploy/targets.json
 *     node tools/deploy-sim.mjs makemecookies       just that one
 *     node tools/deploy-sim.mjs --dry-run           render the page locally, upload nothing
 *     node tools/deploy-sim.mjs --announce          deploy, then post to Discord --
 *                                                   one thread for all of it, kept for
 *                                                   ever, and only the apps whose
 *                                                   build changed
 *     node tools/deploy-sim.mjs --announce --announce-all   post about every app
 *     node tools/deploy-sim.mjs --announce --new-thread     open a fresh thread
 *     node tools/deploy-sim.mjs --announce --note "the shop closes properly now"
 *     node tools/deploy-sim.mjs --announce --note gratinglab="a title screen"
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

/**
 * The Discord thread every announcement goes into, remembered by id.
 *
 * Gitignored beside the webhook, and for a weaker version of the same reason:
 * it is not a credential, but it is one machine's record of one Discord
 * channel's state and means nothing in a fresh clone.
 */
const THREAD_FILE = join(DEPLOY, 'discord-thread.json');

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

/**
 * What is new, per app, from the command line.
 *
 * `--note "text"`                  the same line under every app announced
 * `--note gratinglab="text"`       that line under gratinglab only
 *
 * Both forms may be repeated and mixed, because one deploy now carries several
 * apps and they are rarely new for the same reason. An app with no note of its
 * own falls back to the shared one, and an app with neither simply gets the
 * link and the build id.
 */
function notes() {
  const byApp = {};
  let shared = '';
  process.argv.forEach((a, i) => {
    if (a !== '--note') return;
    const value = process.argv[i + 1];
    if (!value || value.startsWith('--')) die('--note needs a value');
    const m = value.match(/^([A-Za-z0-9._-]+)=(.*)$/s);
    if (m) byApp[m[1]] = m[2];
    else shared = value;
  });
  return { shared, byApp, for: (name) => byApp[name] ?? shared };
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

/** The manifest the page is serving for an app right now, or null. */
function remoteManifest(name) {
  try {
    const out = ssh(`cat ${REMOTE}/${name}/build.json 2>/dev/null || true`);
    return out ? JSON.parse(out) : null;
  } catch {
    return null;              // never deployed, or unreadable
  }
}

/** The build id the page is serving for an app right now, or null. */
function remoteBuild(name) {
  return remoteManifest(name)?.build ?? null;
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

/**
 * The webhook file, decoded by its byte order mark rather than assumed UTF-8.
 *
 * This is not defensive padding. The obvious way to put a URL in a file on the
 * dev box is PowerShell, and **PS 5.1's `>` wrote UTF-16LE**, observed, not
 * guessed: `ff fe` then 248 bytes for a 124-character URL. Read as UTF-8 that
 * is mojibake with a null between every character, so the pattern check below
 * rejects it -- and the file looks perfect in every editor you open it in,
 * which makes "that does not look like a Discord webhook URL" one of the more
 * baffling things this tree could tell somebody.
 *
 * Exported so a test can prove all four encodings round-trip without anybody
 * needing a real webhook.
 */
export function decodeWebhook(buffer) {
  let text;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    text = buffer.subarray(2).toString('utf16le');
  } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    // UTF-16BE, which Node cannot decode directly. Swapping the pairs is
    // cheaper than refusing, and Buffer.swap16 throws on an odd length rather
    // than producing something subtly wrong.
    text = Buffer.from(buffer.subarray(2)).swap16().toString('utf16le');
  } else if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    text = buffer.subarray(3).toString('utf8');
  } else {
    text = buffer.toString('utf8');
  }
  return text.replace(/^﻿/, '').trim();
}

function readWebhookFile() {
  const raw = readFileSync(WEBHOOK_FILE);
  if (raw.includes(0) && !(raw[0] === 0xff && raw[1] === 0xfe) && !(raw[0] === 0xfe && raw[1] === 0xff)) {
    die(
      `${WEBHOOK_FILE} holds null bytes and has no byte order mark, so its\n` +
        '  encoding cannot be determined. Rewrite it as plain UTF-8 or ASCII.',
    );
  }
  return decodeWebhook(raw);
}

/**
 * The exact text that goes to Discord, for one app. Separate from posting it
 * so it can be read, tested and previewed without broadcasting anything.
 *
 * One post per app, all of them in the one thread below. Each carries its
 * build id, which is what a tester quotes when reporting something and what
 * makes the thread readable a month later, and its own line of news when the
 * deploy was given one.
 *
 * `<url>` rather than a bare one stops Discord unfurling the link into a
 * preview card, which for an unlisted page would put a rendered thumbnail of
 * it in the channel. The empty allowed_mentions at the call site is the other
 * half: a build announcement never pings anybody.
 */
export function announceMessage(url, target, manifest, note = '') {
  const news = note?.trim() ? `\n\n${note.trim()}` : '';
  return (
    `**${manifest.title}** has a new iOS test build.\n` +
    `\`${manifest.build}\`${news}\n\n` +
    `The page, updated in place:\n<${url}>\n\n` +
    `You need a Mac with Xcode, and nothing else: no Apple account, no signing. ` +
    `The page says what to do.\n` +
    `Found something odd? Reply here, and say which build id you were on.`
  );
}

/**
 * One thread, for ever, holding every build of every app.
 *
 * It was two other shapes first and both were wrong, which is worth recording
 * because each sounded reasonable. A thread per DAY split one app's builds
 * across two places and, because the day came from toISOString(), named the
 * first for tomorrow. A thread per APP meant four threads to follow and two
 * posts in two places for one page. Several posts in one thread is fine; the
 * thread is the section, and the channel is not a list of dates.
 *
 * The id is remembered in a gitignored file. Losing it costs one duplicate
 * thread rather than an announcement, so nothing here treats a missing or
 * unreadable file as an error.
 */
const THREAD_NAME = 'iOS test builds';

function readThread() {
  try {
    const v = JSON.parse(readFileSync(THREAD_FILE, 'utf8'));
    return typeof v?.threadId === 'string' ? v.threadId : null;
  } catch {
    return null;
  }
}

function writeThread(threadId) {
  try {
    writeFileSync(THREAD_FILE, JSON.stringify({ thread: THREAD_NAME, threadId }, null, 2) + '\n');
  } catch {
    /* see above */
  }
}

/** The thread id off a webhook response, which needs ?wait=true to exist. */
async function threadIdOf(res) {
  try {
    const msg = await res.clone().json();
    return typeof msg?.channel_id === 'string' ? msg.channel_id : null;
  } catch {
    return null;
  }
}

async function announce(url, pairs, notes) {
  let hook = (process.env.MAGMACRUNCH_IOS_WEBHOOK || '').trim();
  if (!hook && existsSync(WEBHOOK_FILE)) hook = readWebhookFile();
  if (!hook) {
    die(
      '--announce needs the webhook for #app-development in the magmacrunch\n' +
        '  executives server, in $MAGMACRUNCH_IOS_WEBHOOK or\n' +
        '  tools/deploy/discord-webhook.url (gitignored).\n' +
        '  Discord: #app-development -> Edit Channel -> Integrations -> Webhooks\n' +
        '  -> New Webhook -> Copy Webhook URL.\n' +
        "  NOT block-island-simulator's webhook: that one posts to the family\n" +
        '  channel, and these builds are not for that audience.',
    );
  }
  if (!WEBHOOK_RE.test(hook)) die('that does not look like a Discord webhook URL');

  if (!pairs.length) {
    console.log('nothing to announce: no app has a build it did not have before');
    console.log('  (--announce-all posts about every app this run deployed)');
    return;
  }

  // `?wait=true` makes Discord answer with the message it created rather than a
  // bare 204, and that answer carries `channel_id` -- which for a post that
  // opened a thread IS the thread. There is no other way to learn the id, and
  // without it every announcement starts a thread of its own.
  const post = (content, threadId) =>
    fetch(`${hook}${hook.includes('?') ? '&' : '?'}wait=true${threadId ? `&thread_id=${threadId}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'hypnopompia-deploy/1' },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
        // 220001 is "Webhooks posted to forum channels must have a thread_name
        // or thread_id": a forum channel holds no loose messages, every post is
        // a thread. Naming one creates it; the id posts into the one that
        // exists.
        ...(threadId ? {} : { thread_name: THREAD_NAME }),
      }),
    });

  let threadId = flag('--new-thread') ? null : readThread();

  for (const [target, manifest] of pairs) {
    const content = announceMessage(url, target, manifest, notes.for(manifest.name));
    // The terminal keeps a copy of whatever was broadcast. A post to a channel
    // other people read is not something to discover the wording of afterwards.
    console.log(`\n--- posting to Discord ---\n${content}\n--------------------------`);

    let res = await post(content, threadId);

    // Archived, deleted, or an id from another channel: open the thread again
    // rather than failing the deploy over a cache.
    if (!res.ok && threadId) {
      console.log(`  the remembered thread would not take it (${res.status}); opening a new one`);
      threadId = null;
      res = await post(content, null);
    }
    if (!res.ok) die(`Discord answered ${res.status}: ${(await res.text()).slice(0, 300)}`);

    if (!threadId) {
      threadId = await threadIdOf(res);
      if (threadId) writeThread(threadId);
      console.log(`announced on Discord, in a new thread: ${THREAD_NAME}`);
    } else {
      console.log(`announced on Discord, in ${THREAD_NAME}`);
    }
  }
}

async function main() {
  const dryRun = flag('--dry-run');
  const wantAnnounce = flag('--announce');
  const note = notes();
  // Positional arguments are target names. Every --note value is
  // positional-looking, so they are excluded BY POSITION rather than by value:
  // excluding by value would also drop a target whose name happened to match a
  // note. Each --note consumes the argument after it.
  const noteAt = new Set(
    process.argv.flatMap((a, i) => (a === '--note' ? [i + 1] : [])),
  );
  const named = process.argv
    .slice(2)
    .filter((a, i) => !a.startsWith('--') && !noteAt.has(i + 2));

  const { targets } = JSON.parse(readFileSync(TARGETS, 'utf8'));
  const chosen = named.length ? targets.filter((t) => named.includes(t.name)) : targets;
  if (!chosen.length) {
    die(`no target named ${named.join(', ')}. Known: ${targets.map((t) => t.name).join(', ')}`);
  }

  // Reach the Pi BEFORE downloading anything. Without this the first four
  // minutes are spent pulling artifacts from four repositories and the fifth
  // discovers the host is unreachable, which is how this was found: the Pi was
  // unplugged mid-deploy and the script had already fetched 14 MB. Nothing was
  // damaged, because the page uploads last and no upload had started, but the
  // wait was wasted and the error arrived nowhere near its cause.
  if (!dryRun) {
    try {
      execFileSync('ssh', [...SSH, HOST, 'true'], { encoding: 'utf8', stdio: 'pipe' });
    } catch {
      die(
        `cannot reach ${HOST} over ssh, so there is nowhere to deploy to.\n` +
          '  The Pi sleeps and can be unplugged; check it is up before retrying.\n' +
          '  --dry-run needs no Pi and renders the page locally.',
      );
    }
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

    // The page lists every app that has a build on the Pi, not just the ones
    // this run touched. Without this, deploying one app rewrote index.html
    // down to a single card and unlinked the other three, so the only safe way
    // to deploy anything was to deploy everything -- which in turn made every
    // announcement four announcements. An app is dropped from the page only
    // when the Pi has nothing for it.
    const deployed = new Map(pairs.map(([t, m]) => [t.name, [t, m]]));
    const pagePairs = targets
      .map((t) => deployed.get(t.name) || [t, remoteManifest(t.name)])
      .filter(([, m]) => m);

    const html = renderPage(pagePairs);
    const pagePath = join(work, 'index.html');
    writeFileSync(pagePath, html);

    if (dryRun) {
      console.log(
        `\nrendered ${pagePath}: ${pairs.length} app(s) built here, ` +
          `${pagePairs.length} listed on the page; uploaded nothing`,
      );
      console.log('open that file to see exactly what would go up');
      return;
    }

    // What the page offered before this run, read BEFORE anything is uploaded
    // and used only to decide what to announce.
    //
    // This deploy nearly always carries all four apps, because the page lists
    // the apps it was given and running one target rewrites it down to one
    // card. So without this, one changed app means four announcements, three
    // of them about a build that has been up for days. Read from the Pi rather
    // than remembered locally, so it is right on a machine that has never
    // deployed before.
    const before = {};
    for (const [, manifest] of pairs) before[manifest.name] = remoteBuild(manifest.name);

    // Zips first, then each manifest, then the page last, so the page never
    // links a file that has not arrived.
    for (const [, manifest, zipPath] of pairs) {
      upload(dirname(zipPath), [basename(zipPath), 'build.json'], `${REMOTE}/${manifest.name}`);
      prune(manifest.name);
    }
    upload(work, ['index.html'], REMOTE);

    const url = privateUrl();
    console.log(`\n${pairs.length} app(s) deployed, ${pagePairs.length} on the page: ${url}`);

    const fresh = pairs.filter(([, m]) => before[m.name] !== m.build);
    for (const [, m] of pairs) {
      if (before[m.name] === m.build) console.log(`  ${m.name.padEnd(15)} unchanged`);
    }
    if (wantAnnounce) {
      await announce(url, (flag('--announce-all') ? pairs : fresh).map(([t, m]) => [t, m]), note);
    } else console.log('(nothing posted to Discord; pass --announce for that)');
  } finally {
    // --dry-run's whole purpose is to leave a page to look at, so it keeps the
    // directory and says where it is. Deleting it here made the path printed
    // one line earlier a lie, which is the sort of thing that survives a long
    // time because the command appears to have worked.
    if (dryRun) console.log(`(kept ${work}; delete it when you are done)`);
    else rmSync(work, { recursive: true, force: true });
  }
}

// Importable for tests without deploying anything.
if (process.argv[1] && process.argv[1].endsWith('deploy-sim.mjs')) {
  await main();
}
