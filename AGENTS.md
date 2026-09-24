# AGENTS.md -- hypnopompia

Read README.md first for what this repo is. This file is the rules, and where
each was learned.

## What has landed and what has not

Created 2026-09-18 by extracting from `games/george-boole/ios/`, which had been
the only iOS build in the tree since 2026-09-09. **Only the pieces that needed no
guessing came over.** The rest is still in george-boole and moves when a second
game arrives, because with one example there is no way to tell an arcade-wide
rule from a george-boole one except by guessing, and a wrong guess here is a
shared file with a game's facts baked into it.

| | State |
|---|---|
| `native/GameCenterPlugin.swift`, `GameViewController.swift` | **here**, vendored into george-boole, hash-verified |
| `tools/sync.mjs` | **here**, new; the vendoring and its drift check |
| `tools/check-metadata.mjs` | **here**, generalized: takes a path, and reads its forbidden keywords from the file being checked |
| `pipeline/index.mjs` | **here** as of 2026-09-19: the machinery and the five transforms both games had written identically. Both now build through it, byte-identical output verified against a hash baseline |
| the transforms the two games write differently | still in the games: fonts, back-links, the audio drop, the credits block. Four solutions to four problems that only look like one problem, and folding them together would bake one game's markup into a shared file |
| the four JS shims (scores, achievements, haptics, personal bests) | still in george-boole |
| the safe-area CSS, generated inside the pipeline | still in george-boole |
| `tools/screenshots/`, `store/metadata.md`, the icon scripts | still in george-boole |
| `tests/consumers.test.mjs` | **here**, 12 tests over `sync.mjs`'s exit-code contract |
| `template/`, `tools/new-game-ios.mjs` | **not written**; the layout below is the plan for them |

So the Layout section is partly a plan. Directories that do not exist yet are
marked. Everything in `native/`, `tools/` and `tests/` is real and runs.

## The name, and what was ruled out

`Hypnopompia` is a Texas Hold'Em Lava Dome track, on *Pompous Fanfare for All
Occasions* (2019). It was chosen over five other candidates because it
**extends** adenosine rather than merely matching it: THLD has
`Adenosine`, `Hypnagogia` and `Hypnopompia`, and adenosine is the molecule that
builds sleep pressure while hypnopompia is surfacing out of it. The two engines
are two points on one arc, and `hypnagogia` stays free for a third. It also
cannot produce a false positive: `hypnopomp` appears nowhere in this tree but
the THLD track listing and the generated archive pages.

The name appears in four places (the title, this section, "Where it sits" and
the resolution table) plus a line in `consumers.json`. **Nothing derives a
symbol prefix from it**, unlike daffodil's `daffodil_` / `Dc` / `DC_`, which is
what keeps an eleven-character Greek word cheap: a mistyped path fails loudly
with the candidate list printed, never silently.

**What was ruled out, so nobody redoes this.** Each was checked against source
files, the theme registries, the music archive, magmascript's keywords and the
org's repo list.

| Candidate | Ruled out because |
|---|---|
| `pine` | A **live magmascript keyword**, the pointer type, in `magmascript/lang/parser.py`, `floorplan.py` and `dump.py`, and taught as `pine` in `libs/crunch-c`'s pointers module. `wiki/Asthenosphere.md` records it as named after the same THLD track that would have named this repo, so the org had already spent it. Not a colour: that is the separate `lilac` note in the root CLAUDE.md, and that rename was taste rather than a collision. |
| `AMBi040` | Already a recording title in the archive (juanito thompson), indexed in the public site search. Mixed case would also be the only such name among the org's repos, and `../AMBi040` resolves on Windows but not on the case-sensitive CI runners. |
| `birds` | Live game code: `very-long-boards/godot/Scripts/SceneryManager.cs` (21 hits), `AudioManager.cs`, `AudioKit.cs`, `AudioDesign.cs`, `AudioProbe.cs`, and `engines/daffodil/shaders/terrain.glsl`. |
| `tunacan` | A live theme id, `the-tuna-can`, in `sprite-forge/app/core/ops-themes.js`, `magmacrunch-ops/dashboard/static/theme.js` and 73 times in the website's `theme-audit.json`. Also an archive place with its own historian-tui entity card. |
| `mushroom` | Clean in code, and a THLD song-cycle, so it was the runner-up. Set aside only because it is a common noun and `block-island-simulator`'s 51-entry flora table plausibly gains fungi. |
| `casserole` | Also clean, and an in-house recording (Bottle Boys Collective), but a track name with no thematic link to adenosine. |

## Where the facts below come from

Everything stated below as fact about Capacitor, GameKit, Xcode and App Store
Connect was learned and verified in `games/george-boole/ios/` between
2026-09-09 and 2026-09-17, on one game and one Mac. Dates are kept so a reader
can tell a verified fact from a plan, and the table above says which parts of
this repo are which.

## It is a shell, not an engine

This repo holds the iOS half of an arcade game: the Capacitor and Xcode project,
the native Game Center plugin, the script that derives an App Store bundle from
a game's `web/`, and the store tooling. **It runs no game logic and it never
will.** The closest thing in the tree by function is magma-kit, which does the
same job one platform over for the Tauri desktop apps: a template, some scripts,
and a shared native half, serving consumers that each keep their own content.

Calling it an engine would be wrong in a way that costs something later. magnolia
and adenosine are reimplementations of a game's rules; this is not, and a game
that gained a fourth *implementation* here would break the rule every game repo
opens with.

## The two laws

**1. The bundle is derived, never written.** A game's App Store build is
`web/` plus a listed set of transforms. No copy of a game lives here and none
lives in a game's `ios/`. Every game repo's own AGENTS.md says a gameplay change
is not done until every version has it, and the count is three (web, tui, wii). A
hand-maintained iOS copy would be a fourth and the worst of them: a near
duplicate of `web/` differing in a handful of lines nobody can list from memory.
Deriving keeps the count at three and makes the site-to-store difference a file
you can read.

**2. Shared files are byte-identical in every game; anything game-specific is a
parameter.** Same law as magma-kit's. Leaderboard ids, event names, the bundle
id, the shot list, the excluded files: all parameters a game passes in. If a
shared file needs game-specific content, the design is wrong. Move the content
to the game.

## What is vendored and what is imported, and why the split

magma-kit byte-copies everything into consumers and carries sha256 rows to prove
it. This repo needs only a narrow version of that, because of one fact:

**The Node build already cannot run from a lone clone.** `bundle.mjs` needs a
magmacrunch.com checkout for `arcade/shared/*` and the self-hosted font. So
requiring *this* sibling too costs nothing new. The Xcode build is different: the
Mac runs `xcodebuild` inside the game's own checkout, and a project referencing
files outside it breaks a flat clone.

That gives the rule:

| Read by | Mechanism | Files |
|---|---|---|
| **Xcode** | **vendored, byte-identical, hash-checked** | `GameCenterPlugin.swift`, `GameViewController.swift` |
| Xcode, once | **stamped** at creation, then owned by the game | `project.pbxproj`, `Info.plist`, `App.entitlements`, `PrivacyInfo.xcprivacy`, `capacitor.config.json`, `package.json` |
| Node, at build time | **imported from this checkout**, never copied | `bundle.mjs`, the shims, `ios.css`, `check-metadata.mjs` |
| macOS shell, by hand | **imported**, run from here | `capture.sh`, `shots.js` |

So `sync.mjs --check` here has exactly two files to verify per game, not fourteen.
The shims are copied into `www/shim/`, which is generated and gitignored, so they
are never vendored and cannot drift.

## Layout

`+` exists today. `-` is planned and named here so the shape is agreed before
anything is written; see "What has landed and what has not" above.

```
+ README.md               what this is
+ AGENTS.md               this file
+ LICENSE  NOTICE         Apache-2.0, same as adenosine
+ .gitattributes          pins LF; see "Line endings" below
+ .gitignore
+ consumers.json          every game repo with an ios/, relative to this root
+ package.json            private, not published
+ .github/workflows/ci.yml  tests on node 22 and 24; drift against a real consumer

- lib/
-   bundle.mjs            web/ -> www/. The pipeline. Takes a game's config.
-   transforms.mjs        each transform, named, individually testable
-   resolve.mjs           sibling lookup: $WEBSITE, ../website, ../../web/website
- shim/
-   gamekit-scores.js     Game Center leaderboards (AdGameCenter candidate)
-   gamekit-achievements.js
-   haptics.js            Taptic feedback, driven by a game's own events
-   local-bests.js        the offline scoreboard that replaces the arcade board
- css/
-   ios.css               safe-area insets, no rubber-band, no tap highlight
+ native/
+   GameCenterPlugin.swift    vendored into each game's App target
+   GameViewController.swift  the one line that registers it
- template/
-   App/                  the Capacitor iOS project, placeholders unstamped
-   store/metadata.md     headings with Apple's limits, bodies empty
-   bundle.config.mjs     the per-game config, commented
+ tools/
-   new-game-ios.mjs      stamp template/ into games/<game>/ios/
+   sync.mjs              vendor native/ into a game; --check is a hash compare
+   check-metadata.mjs    a game's metadata.md against App Store Connect's limits
-   screenshots/
-     capture.sh          simctl: boot, inject, freeze the clock, shoot
-     shots.js            drives the real UI; the staging half
+ tests/
+   consumers.test.mjs    sync.mjs's exit-code contract, on synthetic games
-   transforms.test.mjs   each transform against a fixture page
-   fixtures/             a minimal arcade index.html and shared/
```

A game's `ios/` then holds only what is its own:

```
games/<game>/ios/
  AGENTS.md             the game's own iOS notes; points here for the shared half
  bundle.config.mjs     THE parameters: excludes, shims, leaderboard ids, regexes
  package.json          @capacitor/*, and the build/sync scripts
  App/                  the stamped Xcode project, including the vendored Swift
  assets/               apple-touch-icon.png and anything the build refuses to run without
  store/metadata.md     this app's App Store text
  tools/                only game-specific art scripts (make-boole-pixel.py stays)
  www/                  generated, gitignored
```

## The tests, and why they assert exit codes

`tests/consumers.test.mjs`, 12 tests, added 2026-09-18. They exist because
`sync.mjs` distinguishes three outcomes that look alike from the outside (in sync,
drifted, compared nothing) and **only the exit code carries that distinction to
CI.** A test that read the printed lines would pass on a script that printed
reassuring text and exited 0 regardless, which is the bug this repo is about. So:

| Asserted | |
|---|---|
| in sync | exit 0 |
| a drifted file | exit 1, named, and the undrifted one still reported ok |
| a file deleted from the game | exit 1, reported GONE rather than ok |
| **nothing to compare** | **exit 2, not 0** |
| a game with no `ios/` | refused, and the destination not created anyway |
| no target and no `--check` | usage error, not silent success |
| vendoring | byte-identical, idempotent, and repairs drift |
| `native/` itself | present, non-empty, and free of CR bytes |

Every fixture is a throwaway game tree in the OS temp directory, passed
explicitly, so no test depends on which games are checked out and none can touch
a real one.

**The suite was mutation-tested, which is the only way to know a test suite is
not itself a check that passes by finding nothing.** Making the exit-2 guard
return 0 turned the suite red; disabling the hash comparison so every file
reported `same` failed 5 tests. `sync.mjs` was restored byte-identical after each.
Do that again after changing `sync.mjs`: a green suite against a broken guard is
the only failure mode that would make all of this worse than nothing.

### Two `node --test` traps, both met while wiring this up

**`node --test` exits 0 when it finds no test files at all.** Verified on Node
24.19.0. The first version of `package.json` said `node --test tests/`, which
would have reported success over nothing from the first commit. And `node --test
tests/` and `node --test tests` both try to *load* `tests` as a module, exiting 1
with `MODULE_NOT_FOUND`, so a path argument has to be a glob. `npm test` is
therefore `node --test "tests/**/*.test.mjs"`, quoted so Node does the globbing on
every platform rather than `sh` doing it on some and `cmd` failing to on others.

**`npm test` and `npm run check` are deliberately different.** `test` is the
tolerant form: its consumers test *skips* when no game is checked out beside this
repo, because `consumers.json` promises the repo stays testable on a partial
checkout, and a fresh clone or a CI runner has no games. `check` is the strict
form, `sync.mjs --check`, which exits 2 in that situation. Drift in a real
consumer fails both.

## Where it sits, and how a game finds it

`engines/hypnopompia`, beside magma-kit and magnolia. Consumers are in `games/`.

**No junction.** `games/` has none and that is deliberate: the two that used to
be there were removed on 2026-09-03 and the repos now resolve sibling paths
themselves. Do the same here, with the documented order, so a flat clone and the
grouped tree both work:

| Tried | Layout |
|---|---|
| `$HYPNOPOMPIA` | anywhere, explicit |
| `../hypnopompia` | flat clone, beside the game |
| `../../engines/hypnopompia` | the grouped `dev/magmacrunch/` tree |

Same shape as the Wii Makefile's `MAGNOLIA`, `bundle.mjs`'s `WEBSITE` and
`js_oracle.mjs`'s website lookup. Fail with the list of paths tried when none of
them holds `lib/bundle.mjs`.

**Read the Makefile trap in the root CLAUDE.md before writing any of this.** A
relative candidate list evaluated from a directory one level deeper than the
paths were written against misses every candidate and fires the guard with the
target sitting exactly where the error says it looked. `bundle.mjs` resolves from
`import.meta.url`, not from the caller's cwd, which is what keeps it out of that
trap. Keep it that way.

## The guards, and why every one of them exists

Every guard here defends against the same failure: **a check that passes by
finding nothing.** That shape has burned this tree at least four times (the
identity sweep, `refresh.ps1`, `crunch-c`'s unset secret, the Wii Makefile), and
an App Store build adds a new way to lose: the website gains a widget one day,
the next sync carries it into `web/`, and it ships.

| Guard | Fails when | Learned |
|---|---|---|
| `SHARED` is an **allowlist** | `index.html` names a `../shared/` file the config does not classify as `vendor` or `drop` | Defaulting to vendor could bundle an unread script; defaulting to drop could silently break the game. Refusing to guess is the only default that cannot ship a surprise. |
| **a transform that matches nothing is fatal** | a regex stops matching because the markup moved | Otherwise the app keeps whatever the step was there to remove and the build still says it succeeded. Applies to `index.html` and to any other file the build edits. |
| the **self-contained sweep** | any `src`/`href` starts `../`, any `<script>`/`<link>`/`<img>`/`<source>` fetches over `http(s)`, or any CSS `url()` or `@import` does either | The claim being made is that the bundle runs with the network off. Guideline 4.2 treats a page that needs a server as a web page in a wrapper. Check the claim, do not assert it. **The CSS half was missing until 2026-09-23** and is the guard's own failure mode caught in itself: it read attributes, an `@font-face` reaches out through `url()`, and so a sweep that looked at nothing relevant reported nothing wrong. See below. |
| the `.ogg` drop **asserts it dropped something** | the audio layout changes | Finding none means the assumption changed, not that the step is obsolete. |
| **version agreement** | `MARKETING_VERSION` or `CURRENT_PROJECT_VERSION` differ between build configurations | The credits would show whichever configuration happened to be built. Read the version from `project.pbxproj`, never retype it. |
| **required assets** | `assets/apple-touch-icon.png` is missing | It is the only way to test a bundle on a phone without a Mac. |
| `check-metadata.mjs` | any `store/metadata.md` field exceeds Apple's limit | The form truncates or refuses at the moment of paste, which is the worst moment to be rewriting a description. Keywords count their commas, and a space after a comma costs a character for nothing. |
| **an unstamped template** | a game's bundle id, display name or team still holds a placeholder | New. The bundle id is permanent after the first submission; a placeholder reaching App Store Connect cannot be undone. |
| `sync.mjs --check` | a vendored Swift file was edited in the game, or changed here and never synced out | magma-kit's lesson: vendoring rots from both ends, and only the side that can see each end can catch it. Run `--check` per game in the game's own CI, and across `consumers.json` here. |

### The sweep was blind to CSS, and it took a font to show it

The rules live in `outsideRefs()`, exported from `pipeline/index.mjs` and
tested on strings in `tests/self-contained.test.mjs`. They are a pure function
on one line for a reason: the walking of the bundle is not the part that can go
wrong quietly, the matching is. A rule that stops matching does not fail, it
reports nothing, and nothing is exactly what a clean bundle reports.

For as long as every outside reference was a tag, reading `src=` and `href=`
was the whole story. An `@font-face` is not a tag. When makemecookies moved to
self-hosted faces on 2026-09-23 it put `url('../../fonts/...')` into a page for
the first time, and the sweep could not see that class of path at all. What
actually stood behind it was the no-op-is-fatal rule in `edit()`, which does
catch a path rewrite that stops matching but is a different guard for a
different failure and was never meant to cover this.

`@import` is handled in both spellings, because `@import url(...)` is caught by
the `url()` rules and `@import "../x.css"` is not.

**`url(data:...)` and `url(#fragment)` must never match.** Both are ordinary
here -- the games' favicons are data URIs, their filters point at fragments --
and a rule that flagged them would fail every build and teach the next person
to delete the check rather than the rule. There are negative tests for exactly
this.

Verified by planting `url('../../fonts/nope.png')` in a game's CSS and watching
the build stop, naming the file, the line and which kind of escape it was.
Both games' bundles were built against the tightened rules first: neither had
an offending path, so this tightened a guard without moving any consumer.

`consumers.json` skips a path that is not checked out and reports it rather than
failing, so this repo stays checkable on a machine holding only some of the
games. **Add a line when you stamp a new game.** `new-game-ios.mjs` prints the
reminder and nothing else will.

## The native traps, all of which look like nothing is wrong

These cost real time in george-boole. Every one is silent.

**A plugin written into the App target is not auto-discovered.** Capacitor 8
builds its plugin list from `packageClassList` in the generated
`App/App/App/capacitor.config.json`, which `cap sync` regenerates wholesale from
the npm dependency list, so a class name added there by hand does not survive a
build. `registerPluginType(_:)` returns immediately while `autoRegisterPlugins`
is true, which it is. There is no Objective-C runtime scan. The one door left
open is `bridge?.registerPluginInstance(_:)` from `capacitorDidLoad()` in a
`CAPBridgeViewController` subclass. Because the JS half degrades quietly by
design, an unregistered plugin produces no error anywhere, just a Game Center
that never does anything.

**`Base.lproj/Main.storyboard` must name that subclass too.** `Info.plist` sets
`UISceneStoryboardFile`, so UIKit instantiates the storyboard's controller before
`SceneDelegate` replaces it. Leaving the stock `CAPBridgeViewController` there
builds a second bridge and a second `WKWebView` on every launch, and one of the
two has no plugin registered.

**`authenticateHandler` is not a completion handler.** GameKit keeps it and calls
it again on every later state change, and it reports an outcome once. A `signIn`
arriving after that outcome must be answered from
`GKLocalPlayer.local.isAuthenticated` rather than queued: queued, it hangs
forever, and the app looks healthy because the one call made at page load is the
one that worked. Found by probing the running app, not by reading it
(`george-boole@e539924`).

**A `GKGameCenterViewController` with no delegate does not dismiss itself.** Done
does nothing and the player is stuck on Apple's screen with no way back.

**`GKAccessPoint.shared.isActive = false`** once authenticated, or the floating
badge overlaps a board that already fills the screen.

**`@capacitor/haptics` only string-matches `MEDIUM`/`LIGHT` for style and
`WARNING`/`ERROR` for type.** Everything else falls through to the initial
values, `.heavy` and `.success`. So `HEAVY` and `SUCCESS` are the documented API
and do the right thing by default rather than by comparison. Passing `''` would
behave identically, which is exactly why they are spelled out. Do not "fix" them.

**Capacitor 8 uses Swift Package Manager, not CocoaPods.** There is no `Podfile`.
`cap sync` rewrites `App/App/CapApp-SPM/Package.swift` from scratch every run and
the file says DO NOT MODIFY. Add plugins with `npm install`, never by hand.

**`cap copy` alone pushes a stale `www/`**, which looks like the build not taking
effect. The sync script runs the bundle build and then `cap sync`; use it.

**Set `ios.path` in `capacitor.config.json`.** The default makes `ios/ios/`.

## Facts that are permanent, so get them right before the first submission

| | |
|---|---|
| **Bundle id** | Trivial now, permanent after the first submission. It is the app's identity on the App Store and in Game Center and cannot be reused or renamed. |
| **Leaderboard and achievement ids** | Permanent once created in App Store Connect, and a deleted one cannot be reused. Take them from somewhere that already promised to keep them stable: george-boole's come from `tui/boole/modes.py`, whose docstring says the mode key *is* the leaderboard id. |
| **Achievement points** | At most **100 per achievement** and 1000 per app. A plan with any single award above 100 is a plan the form refuses. |
| **Privacy policy and support URLs** | One of each per app, not per site. A second app's answers are its own. |

Three `Info.plist` and project facts worth carrying into the template:

- `ITSAppUsesNonExemptEncryption` is `false`. True for an offline bundle, and
  without the key App Store Connect asks the export-compliance question on
  *every* upload and holds the build until it is answered.
- `UIRequiredDeviceCapabilities` is `arm64`, not the stock template's `armv7`.
- **No `NSAppTransportSecurity` block, ever.** The bundle makes no network
  requests, so the strict default costs nothing, and an ATS exception in an
  offline app is a question at review time with no good answer.

`App.entitlements` carries `com.apple.developer.game-center`, wired through
`CODE_SIGN_ENTITLEMENTS`. A simulator build signs ad hoc and ignores it; a device
build or archive **fails on it by name** until Game Center is enabled for that
bundle id on the account. That failure is expected until then, not a mistake in
the project.

The guidelines this shell is actually exposed to: **4.2** (a web page in a
wrapper, which native integration answers and polish does not), **1.2**
(user-generated content, which is why chat is dropped rather than configured),
and **4.3** (undisclosed clones, which is why a lineage credit *stays* in the
page rather than being stripped).

## The Mac, and what CI can do without it

Development happens on Windows; `xcodebuild` happens on the MacBook Pro. Keep the
repo portable and keep the Mac out of the loop for anything that is not a real
build.

```
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cd games/<game>/ios && npm run sync && cd App/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,name=iPhone 17 Pro" \
  -derivedDataPath ~/Library/Developer/<game>-derived CODE_SIGNING_ALLOWED=NO build
```

`DEVELOPER_DIR` because that Mac's `xcode-select` still points at the Command
Line Tools. Commit a **shared** scheme or `-scheme App` does not resolve from a
fresh clone, and commit `Package.resolved` or a fresh clone resolves different
versions than the last verified build. Both landed in george-boole on 2026-09-17.

**CI compiles the Swift on a GitHub-hosted `macos-latest` runner, and it lives in
the game's CI rather than here.** george-boole's `ios-build` job, added 2026-09-18,
checks the game out with a magmacrunch.com checkout beside it, builds the bundle,
runs `cap sync`, and does a full `xcodebuild` for a generic iOS Simulator
destination with signing off. 105 seconds, green on its first run. The vendored
plugin is compiled as part of the app, which is the only way it *can* be compiled:
see "What is left" below for why this repo cannot do it alone.

The root CLAUDE.md spends a section on the mirror-image mistake: a self-hosted
runner was registered for the Wii build that devkitPro publish as a container, and
the org's Default runner group has `allows_public_repositories = false`, so a
public repo's job would have queued against a runner it could never be offered.
The same two facts applied here, and the same conclusion held. Apple's toolchain is
on the hosted image, so the MacBook is needed for a *device* build and an archive,
not for knowing the plugin still compiles. macOS runner minutes bill at a
multiplier on private repos and are free on public ones, which is one argument
among several for this repo being public, and what made it affordable to run that
job unconditionally rather than behind a path filter.

What CI checks here with no Mac at all, in `.github/workflows/ci.yml`: the suite
on Node 22 and 24, and `sync.mjs --check` against george-boole checked out beside
it. Still to come, and both waiting on the pipeline moving: every transform
against a fixture page, and `shellcheck` on `capture.sh`. `check-metadata.mjs`
runs in the game's CI against the game's real `metadata.md`, which is better than
a fixture and needed no work here.

## Line endings: this repo is the tree's worst case

`core.autocrlf` is `true` on this machine and the root CLAUDE.md documents it
reaching `origin` twice. **This repo is the one where a CRLF blob does more than
bury a diff.** `capture.sh` runs on macOS, and a `.sh` with CRLF fails there with
an error naming nothing useful. Swift and `.pbxproj` are less fragile but no less
wrong.

So: ship a `.gitattributes` that pins `* text=auto eol=lf` and marks `*.sh`,
`*.swift`, `*.pbxproj`, `*.plist` and `*.entitlements` explicitly, and treat the
numstat pair from CLAUDE.md as the check when a diff looks too big:
`git diff --numstat` against `git diff --numstat --ignore-cr-at-eol`. Equal insert
and delete counts on a whole file is the tell. `git add --renormalize` is the
repair, in its own commit, before anything rebases onto it.

## Adding a game

```
node tools/new-game-ios.mjs ../../games/<game> --name "<Display Name>" \
    --bundle com.magmacrunch.<slug>
```

Stamps `template/` into `games/<game>/ios/`, vendors `native/`, and prints the
list of things only a person can do: the bundle id decision, the App Store
Connect entries, the icon, and the `consumers.json` line.

Then, in order: fill `bundle.config.mjs`, run the build, read what the guards
refuse, and only then open Xcode. A game whose `web/` names a shared file the
config has not classified will stop the build on the first run. That is the
intended first five minutes.

## The bookkeeping, done 2026-09-18

The root CLAUDE.md is explicit that a stale repo count reads as the tree
shrinking rather than as a scan having failed, so adding a repo means editing two
numbers that must stay exactly one apart. Both were moved when this repo was
created, from 41/42 to 42/43:

- `dev/git-status.ps1`: `$ExpectedRepos` 42 to 43, its header comment, and the
  paragraph explaining why it differs from the bash sweep by one.
- The root `CLAUDE.md`: the expected count 41 to 42, `6 engines` to `7`, the
  "reports 42" paragraph and its "do not reconcile 41 to 42" warning, the
  history line, and the tree diagram's `engines\` row.

**Do not reconcile the pair by raising one to match the other.** The bash sweep
scans `magmacrunch\` and `jamccoy\` and cannot see `dev\` itself; the script
scans from `dev\` and can. One apart is the correct state.

## What is left

In rough order of what buys the most:

1. **`transforms.test.mjs` and fixtures**, once the pipeline moves.
2. The pipeline, the shims and the template, when a second game needs them.

**The plugin cannot be compiled by this repo alone, and that is settled rather
than outstanding.** `GameViewController.swift` subclasses `CAPBridgeViewController`
and imports UIKit, so it needs an iOS SDK target and Capacitor built for iOS, not
a `swift build` on macOS. A `swiftc -parse` syntax check would run without either
and prove almost nothing. The version with teeth is a full `xcodebuild` of a
game's app, needing the game, this repo and a magmacrunch.com checkout, and that
is exactly what george-boole's `ios-build` job does. **Do not add a macOS job
here** expecting to compile `native/` in isolation; it is not a gap.

Both ends of the drift check are wired as of 2026-09-18: `drift` in this repo's
CI catches a change to `native/` that leaves a consumer stale, and `ios-shared`
in george-boole's CI catches a vendored file edited inside the game. Neither can
see the other's case, which is why there are two.

**"The vendored copy still builds" is verified as of 2026-09-18**, and by CI
rather than by a person on a Mac: george-boole's `ios-build` compiles the app,
plugin included, on every push. That sentence used to say the opposite and was
true when written; the extraction landed a day before the job that checks it.

## AI Attribution

**No AI attribution.** Do not append `Co-Authored-By: Claude ...`, "Generated
with ...", or any similar trailer to commit messages, PR bodies, or release
notes. If your tooling adds such a line by default, remove it before committing.
