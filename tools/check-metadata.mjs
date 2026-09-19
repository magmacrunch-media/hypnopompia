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

/** Headings of the form `## Name (30)` -- the ones with a counted limit. */
const HEADING = /^##\s+(.+?)\s+\((\d+)\)\s*$/;

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

  fields.push({ name: m[1], limit: Number(m[2]), value: body.join('\n').trim() });
}

if (fields.length === 0) {
  console.error(`no counted fields found in ${FILE}; has the heading format changed?`);
  process.exit(1);
}

let failed = 0;
for (const f of fields) {
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

if (failed) {
  console.error(`\n${failed} problem(s) in ${FILE}`);
  process.exit(1);
}
console.log(
  `\n${fields.length} field(s) within their limits.` +
    (forbidden.length ? ` ${forbidden.length} forbidden keyword(s) absent.` : '')
);
