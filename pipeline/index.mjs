/**
 * The bundle pipeline, shared.
 *
 * A game's `ios/package.mjs` derives `ios/www/` from its own `web/`. Two games
 * wrote that script independently and arrived at the same machinery: `die`,
 * `editFile`, `edit` and `sweep` were **byte-identical** between george-boole
 * and makemecookies, and `findWebsite` differed by the two characters of the
 * file it probes for. Five transforms were identical too. That is what this
 * file is: the parts where two answers agreed exactly, which is the only
 * evidence available that a rule is arcade-wide rather than one game's habit.
 *
 * Deliberately NOT here: the transforms where the two games differ. Fonts,
 * back-links, the audio drop and the credits block each solve the same problem
 * with different markup, and folding them together would mean a shared file
 * carrying one game's facts, which is exactly what AGENTS.md says to avoid.
 * They stay in the games until a third one shows which shape is general.
 *
 * ## How a game reaches this
 *
 * By path, like the Wii Makefiles reach magnolia: `$HYPNOPOMPIA`, then
 * `../hypnopompia`, then `../../engines/hypnopompia`. There is no npm package
 * and no junction for `games/`. `resolveShell()` below is that lookup, and a
 * game imports this file from the path it returns.
 *
 * ## The contract this keeps
 *
 * Every step is loud. A missing file stops the build; a transform that matches
 * nothing stops the build, because a bundle built on an assumption that has
 * stopped being true is worse than no bundle. The final sweep refuses to write
 * a bundle that reaches outside itself, which is what makes the "no network
 * connection of any kind" line in both store listings a checked claim rather
 * than a promise.
 */

import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Find the hypnopompia checkout from a game repo, the way the Wii Makefiles
 * find magnolia. Exported so a game's package.mjs can call it before importing
 * anything else from here.
 */
export function resolveShell(repo) {
  const roots = [];
  if (process.env.HYPNOPOMPIA) roots.push(resolve(process.env.HYPNOPOMPIA));
  roots.push(resolve(repo, '..', 'hypnopompia'));
  roots.push(resolve(repo, '..', '..', 'engines', 'hypnopompia'));
  return roots.find((r) => existsSync(join(r, 'pipeline', 'index.mjs'))) || null;
}

/**
 * Everything a game's package.mjs needs, bound to that game's paths.
 *
 * `probe` is the shared file whose presence proves a website checkout is real.
 * It differs per game because it is the arcade engine that game uses, and a
 * game that probed for an engine it does not use would accept a checkout that
 * cannot build it.
 *
 * The other three options exist for the one consumer that is not a game. An
 * arcade game keeps its page in `web/` and names the website's
 * `arcade/shared/` as `../shared/`, which is what every default below says.
 * A ware tool (apps/crunchscope) keeps its page in `app/` and names
 * `ware/shell/` as `../shell/`, so it passes `web: 'app'`,
 * `sharedDir: 'ware/shell'` and `sharedName: 'shell'`. A game passes none of
 * them and gets exactly the bundle it got before they existed.
 */
export function createBuild({
  ios, probe, web = 'web', sharedDir = 'arcade/shared', sharedName = 'shared',
}) {
  const IOS = ios;
  const REPO = resolve(IOS, '..');
  const WEB = join(REPO, web);
  const OUT = join(IOS, 'www');
  const sharedRef = new RegExp(`\\.\\./${sharedName}/([A-Za-z0-9._-]+)`, 'g');

  function die(msg, detail) {
    console.error(`\npackage.mjs: ${msg}`);
    if (detail) console.error(detail);
    process.exit(1);
  }

  /**
   * Find a website checkout, the same way everything else here resolves a
   * sibling repo: the documented flat layout first, then the grouped tree,
   * with an env override for anywhere else. Mirrors the Wii Makefile's
   * MAGNOLIA.
   */
  function findWebsite() {
    const roots = [];
    if (process.env.WEBSITE) roots.push(resolve(process.env.WEBSITE));
    roots.push(resolve(REPO, '..', 'website'));
    roots.push(resolve(REPO, '..', '..', 'web', 'website'));
    const found = roots.find((r) => existsSync(join(r, ...sharedDir.split('/'), probe)));
    if (!found) {
      die(
        'no website checkout found.',
        `The shared scripts (${sharedDir}/) and the self-hosted fonts live there, not in this repo.\nLooked in:\n${roots.map((r) => `  ${r}`).join('\n')}\nSet WEBSITE=<path to the magmacrunch.com checkout> to look elsewhere.`
      );
    }
    return found;
  }

  const website = findWebsite();
  const shared = join(website, ...sharedDir.split('/'));
  const siteFonts = join(website, 'fonts');

  /** Apply one named edit to a file in `www/` other than the page, no-op fatal. */
  function editFile(rel, name, fn) {
    const p = join(OUT, rel);
    if (!existsSync(p)) die(`the "${name}" step has nothing to edit: ${rel} is not in the bundle.`);
    const before = readFileSync(p, 'utf8');
    const after = fn(before);
    if (after === before) {
      die(
        `the "${name}" step matched nothing.`,
        `web/${rel} no longer looks the way this script expects. That is not\nnecessarily a problem with the file -- but it means the bundle would be\nbuilt on an assumption that has stopped being true, so it stops here.`
      );
    }
    writeFileSync(p, after);
    return name;
  }

  /** Apply one named edit to the page, and fail if it changed nothing. */
  function edit(state, name, fn) {
    const next = fn(state.html);
    if (next === state.html) {
      die(
        `the "${name}" step matched nothing.`,
        'web/index.html no longer looks the way this script expects. That is not\nnecessarily a problem with the page -- but it means the bundle would be\nbuilt on an assumption that has stopped being true, so it stops here.'
      );
    }
    state.html = next;
    state.applied.push(name);
  }

  /**
   * Empty `www/` and copy `web/` into it.
   *
   * `exclude` is the set of paths that exist for developing the browser version
   * and have no business in a bundle. `drop` is an optional predicate for files
   * decided by rule rather than by name, such as an audio format the platform
   * cannot decode; it returns true to leave the file out, and the count of what
   * it dropped comes back so the caller can insist it dropped something.
   */
  function copyWeb({ exclude = new Set(), drop = null } = {}) {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    let dropped = 0;
    cpSync(WEB, OUT, {
      recursive: true,
      filter: (src) => {
        const rel = relative(WEB, src).split('\\').join('/');
        if (drop && rel && drop(rel)) {
          dropped += 1;
          return false;
        }
        return rel === '' || !exclude.has(rel);
      },
    });
    return dropped;
  }

  /** Read the page and start a transform state. */
  function openPage() {
    return { html: readFileSync(join(OUT, 'index.html'), 'utf8'), applied: [] };
  }

  function writePage(state) {
    writeFileSync(join(OUT, 'index.html'), state.html);
  }

  /**
   * Every `../shared/` file the page names must be in the allowlist.
   *
   * This is the whole safety mechanism. The arcade's shared folder is
   * maintained in the website repo by people who are not thinking about the App
   * Store, and a page that gains a script there gains it here on the next sync.
   * Defaulting to "vendor whatever we find" would carry that into the bundle
   * unread; defaulting to "drop what we don't know" would silently break the
   * game. Refusing to guess is the only option that cannot ship a surprise.
   */
  function checkAllowlist(state, allow) {
    const asked = [...state.html.matchAll(sharedRef)].map((m) => m[1]);
    const unknown = [...new Set(asked)].filter((f) => !(f in allow));
    if (unknown.length) {
      die(
        `web/index.html names ${unknown.length} shared file(s) this script does not know about:`,
        `${unknown.map((f) => `  ../${sharedName}/${f}`).join('\n')}\n\nDecide what each one is and add it to SHARED as 'vendor' or 'drop'.\nRefusing to guess: vendoring an unread script could ship anything the\narcade picked up, and dropping it silently could break the game.`
      );
    }
  }

  function vendorShared(allow) {
    mkdirSync(join(OUT, sharedName), { recursive: true });
    const vendored = Object.keys(allow).filter((f) => allow[f] === 'vendor');
    for (const f of vendored) {
      const src = join(shared, f);
      if (!existsSync(src)) die(`shared asset missing from the website checkout: ${src}`);
      cpSync(src, join(OUT, sharedName, f));
    }
    return vendored;
  }

  function copyShims(shims) {
    mkdirSync(join(OUT, 'shim'), { recursive: true });
    for (const f of shims) {
      const src = join(IOS, 'shim', f);
      if (!existsSync(src)) die(`shim missing: ${src}`);
      cpSync(src, join(OUT, 'shim', f));
    }
  }

  function copyFonts(fonts) {
    mkdirSync(join(OUT, 'fonts'), { recursive: true });
    for (const f of fonts) {
      const src = join(siteFonts, f);
      if (!existsSync(src)) die(`font missing from the website checkout: ${src}`);
      cpSync(src, join(OUT, 'fonts', f));
    }
  }

  /**
   * Refuse to write a bundle that reaches outside itself.
   *
   * Guideline 4.2 treats a page that needs a server to be useful as a web page
   * in a wrapper, and both store listings claim the app makes no network
   * requests of any kind. This is what makes that a checked claim.
   */
  function sweepSelfContained() {
    const TEXT = /\.(html|css|js|mjs|json|txt|md)$/i;
    const offences = [];

    function sweep(dir) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          sweep(p);
          continue;
        }
        if (!TEXT.test(name)) continue;
        const rel = relative(OUT, p).split('\\').join('/');
        readFileSync(p, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/(?:src|href)\s*=\s*["']\.\.\//.test(line)) {
              offences.push(`${rel}:${i + 1}  reaches outside the bundle: ${line.trim()}`);
            }
            if (/<(?:script|link|img|source|video|audio)\b[^>]*(?:src|href)\s*=\s*["']https?:/i.test(line)) {
              offences.push(`${rel}:${i + 1}  loads an asset over the network: ${line.trim()}`);
            }
          });
      }
    }
    sweep(OUT);

    if (offences.length) {
      die(
        `the bundle is not self-contained (${offences.length} problem(s)):`,
        `${offences.map((o) => `  ${o}`).join('\n')}\n\nAn App Store build has to run with the network off -- Guideline 4.2 treats a\npage that needs a server to be useful as a web page in a wrapper. Vendor the\nasset in this script, or remove the reference in web/.`
      );
    }
  }

  return {
    IOS, REPO, WEB, OUT, website, shared, siteFonts, sharedName,
    die, editFile, edit, copyWeb, openPage, writePage,
    checkAllowlist, vendorShared, copyShims, copyFonts, sweepSelfContained,
  };
}

/**
 * The transforms both games wrote identically.
 *
 * Each takes the build and the state and applies one named edit, so a game's
 * package.mjs reads as an ordered list of what happens to the page. Order
 * matters in two places and both are commented at the call site in the games:
 * the shims load after the ScoreClient bootstrap, and the publisher mark is
 * unlinked before outbound links are pointed at Safari.
 */
export const transforms = {
  /**
   * Inject the app-only shims after the ScoreClient bootstrap.
   *
   * The anchor is the bootstrap rather than the game's own scripts, because a
   * shim has to be listening before the game can dispatch anything and script
   * order is the only thing guaranteeing that.
   */
  loadShims: (b, state, shims) =>
    b.edit(state, 'load the app-only shims', (html) =>
      html.replace(
        /(<script>const scoreClient = new AdScore\.ScoreClient\(\)[^<]*<\/script>)/,
        (_, bootstrap) =>
          `${bootstrap}\n` + shims.map((f) => `<script src="shim/${f}"></script>`).join('\n')
      )
    ),

  pointSharedAssets: (b, state) =>
    b.edit(state, 'point shared assets at the bundle', (html) =>
      html.split(`../${b.sharedName}/`).join(`${b.sharedName}/`)
    ),

  /** A bundle ships its assets; a stamp is a cache trick a bundle has no use for. */
  stripStamps: (b, state) =>
    b.edit(state, 'strip cache-buster stamps', (html) =>
      html.replace(/\?v=[0-9a-f]{8}/g, '')
    ),

  viewportNotch: (b, state) =>
    b.edit(state, 'let the viewport reach the notch', (html) =>
      html.replace(
        /(<meta name="viewport" content="[^"]*?)(">)/,
        (_, head, tail) => (head.includes('viewport-fit') ? _ : `${head}, viewport-fit=cover${tail}`)
      )
    ),

  /**
   * Outbound links open the system browser rather than navigating the app away
   * from itself, which is a dead end with no back button.
   */
  outboundLinks: (b, state) =>
    b.edit(state, 'open outbound links in the system browser', (html) =>
      html.replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener"')
    ),
};
