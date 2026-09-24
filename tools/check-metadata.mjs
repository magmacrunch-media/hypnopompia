#!/usr/bin/env node
/**
 * Check a game's store/metadata.md against App Store Connect's field limits.
 *
 *     node tools/check-metadata.mjs ../../games/george-boole/ios
 *     node tools/check-metadata.mjs ../../games/george-boole/ios/store/metadata.md
 *     node tools/check-metadata.mjs            # cwd, for running from a game
 *
 * The limits are Apple's, and the form enforces them by truncating or refusing
 * at the moment of paste, which is the worst moment to be rewriting a
 * description. Counting them here means the text in the repo is known to fit
 * before anybody opens the browser.
 *
 * Each field is the indented block under its heading. The heading carries the
 * limit in parentheses, so a heading and its rule cannot drift apart: there is
 * nothing to keep in step, because the limit is read from the same line the
 * reader sees.
 *
 * Apple counts characters, not bytes, and a newline counts as one. Keywords are
 * a special case: the 100 characters include the commas, and a space after a
 * comma costs one of them for nothing, so they are checked for that too.
 *
 * ## What changed when this moved out of george-boole
 *
 * Two things, both because a shared checker cannot know one game's facts.
 *
 * The path is an argument rather than derived from this file's own location.
 * It used to resolve `../store/metadata.md` relative to itself, which was right
 * while it lived in a game and would look in THIS repo now.
 *
 * And the forbidden-keyword list is declared by the file being checked, not
 * hardcoded here. george-boole must not ship "2048" as a keyword -- its credits
 * state the lineage, which is the disclosure guideline 4.3 asks for, while a
 * keyword is a search grab on another app's name. That is a fact about
 * george-boole, so george-boole says it:
 *
 *     <!-- forbid-keywords: 2048 -->
 *
 * Anywhere in the file, comma-separated, matched as whole words in the Keywords
 * field only.
 *
 * ## The one thing this file does hardcode, and why it is not a game's fact
 *
 * The publisher is the same for every consumer, so `## Copyright` is checked
 * against `<year> magmacrunch media` here rather than restated per game. The
 * year is a per-release fact and stays free; the casing is a house fact, and a
 * shared checker is the right place for it. HOUSE.md carries the same rule in
 * prose, and lists the four legitimate spellings of the name.
 *
 * Headings without a `(n)` are read too, for this. They were invisible before:
 * `## Copyright`, `## Support URL` and `## Category` never became fields at
 * all, so the copyright string was the one piece of branding in this file that
 * nothing could see. Both games happened to agree; nothing was holding them to
 * it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Accept an ios/ directory, a store/ directory, or the file itself. */
function resolveTarget(arg) {
  const p = resolve(arg || process.cwd());
  if (!existsSync(p)) {
    console.error(`check-metadata: no such path: ${p}`);
    process.exit(1);
  }
  if (statSync(p).isFile()) return p;

  const candidates = [
    join(p, 'store', 'metadata.md'),
    join(p, 'metadata.md'),
    join(p, 'ios', 'store', 'metadata.md'),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    console.error(
      `check-metadata: no metadata.md under ${p}\nLooked in:\n` +
        candidates.map((c) => `  ${c}`).join('\n')
    );
    process.exit(1);
  }
  return found;
}

const FILE = resolveTarget(process.argv[2]);
const text = readFileSync(FILE, 'utf8');
const lines = text.split(/\r?\n/);

/**
 * Headings of the form `## Name (30)`, and the uncounted ones like
 * `## Copyright`. `m[2]` is the limit, or undefined where there is none.
 *
 * Matching both also means the block reader below stops at an uncounted
 * heading, which it did not do before.
 */
const HEADING = /^##\s+(.+?)(?:\s+\((\d+)\))?\s*$/;

/** `<!-- forbid-keywords: 2048, something -->`, declared by the game. */
const forbidden = [...text.matchAll(/<!--\s*forbid-keywords:\s*([^>]*?)\s*-->/gi)]
  .flatMap((m) => m[1].split(','))
  .map((s) => s.trim())
  .filter(Boolean);

const fields = [];
for (let i = 0; i < lines.length; i += 1) {
  const m = HEADING.exec(lines[i]);
  if (!m) continue;

  // The field is the first indented block after the heading; prose between the
  // two is commentary for whoever is pasting.
  const body = [];
  let started = false;
  for (let j = i + 1; j < lines.length && !HEADING.test(lines[j]); j += 1) {
    const indented = /^ {4}(.*)$/.exec(lines[j]);
    if (indented) {
      started = true;
      body.push(indented[1]);
    } else if (started && lines[j].trim() === '') {
      // A blank line inside the block is part of the text; one after it ends
      // the block only if nothing indented follows.
      const more = lines.slice(j + 1).findIndex((l) => l.trim() !== '');
      if (more === -1 || !/^ {4}/.test(lines[j + 1 + more])) break;
      body.push('');
    } else if (started) {
      break;
    }
  }

  const limit = m[2] === undefined ? null : Number(m[2]);
  fields.push({ name: m[1], limit, value: body.join('\n').trim() });
}

// It is the COUNTED fields whose absence means the heading format changed, so
// this guard keeps its original subject rather than widening to all headings.
const counted = fields.filter((f) => f.limit !== null);
if (counted.length === 0) {
  console.error(`no counted fields found in ${FILE}; has the heading format changed?`);
  process.exit(1);
}

/** The house copyright line. The year is the game's; the name is not. */
const COPYRIGHT = /^\d{4} magmacrunch media$/;
const isCopyright = (name) => /^copyright$/i.test(name);

let failed = 0;
for (const f of fields) {
  if (f.limit === null) {
    // Nothing to count against; only the house rules apply.
    if (isCopyright(f.name)) {
      const ok = COPYRIGHT.test(f.value);
      if (!ok) failed += 1;
      console.log(`${ok ? '  ok ' : 'WRONG'} ${f.name.padEnd(18)} ${f.value}`);
      if (!ok) {
        console.log('       copyright: expected "<year> magmacrunch media" -- lowercase,');
        console.log('       no (c), and not the word Copyright. See HOUSE.md.');
      }
    }
    continue;
  }
  const n = [...f.value].length;
  const over = n > f.limit;
  if (over) failed += 1;
  console.log(
    `${over ? 'OVER ' : '  ok '} ${f.name.padEnd(18)} ${String(n).padStart(4)} / ${f.limit}`
  );
  if (f.name.toLowerCase().startsWith('keywords')) {
    if (/,\s/.test(f.value)) {
      console.log('       keywords: a space after a comma costs a character and buys nothing');
      failed += 1;
    }
    for (const word of forbidden) {
      if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f.value)) {
        console.log(`       keywords: "${word}" is forbidden by this file's forbid-keywords note`);
        failed += 1;
      }
    }
  }
}

// App Store Connect requires a copyright, so its absence is a failure rather
// than something to pass over quietly. A check that passes by finding nothing
// is the failure mode this repo exists to avoid.
if (!fields.some((f) => isCopyright(f.name))) {
  console.log('MISS  Copyright          no ## Copyright heading in this file');
  failed += 1;
}

if (failed) {
  console.error(`\n${failed} problem(s) in ${FILE}`);
  process.exit(1);
}
console.log(
  `\n${counted.length} field(s) within their limits.` +
    (forbidden.length ? ` ${forbidden.length} forbidden keyword(s) absent.` : '') +
    ' Copyright as HOUSE.md has it.'
);
