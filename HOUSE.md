# HOUSE.md -- what makes it a magmacrunch game

`AGENTS.md` is how the shell works. This file is what the games have in common
on purpose, so that the fourth one feels like the first two without anybody
having to remember why.

Written 2026-09-19, from the two games that had shipped an `ios/` by then:
`george-boole` and `makemecookies`. Nothing here is aspiration. Every rule is
something both games already do, or something one of them learned the hard way
and the other should not have to.

---

## Part 1: the feel, named

The goal is that somebody who has played one recognises the next one before
they have read a word of it. Six things do that, and only two of them are
visual.

### 1. Every game comes from a song

`george-boole` is named after "George Boole Has Entered the Chat" by Juanito
Thompson, and its rules screen is called HAS ENTERED THE CHAT.
`makemecookies!x4` is named after "makemecookies! x4." by Jimmi, and one play
of that track is one shift: the song is the clock, the four RUSH windows are
the x4, and the end of the song is the end of the round.

magmacrunch is a record label and an arcade in the same company, which almost
nobody else can say. A game that carries a track is using the thing that makes
the company unusual. **Pick the song before the mechanic where you can**, and
let it decide the round length, the pacing, or the name.

### 2. The screens speak the game's own language

Neither game has a screen called Start, Pause, Game Over or High Scores.

| | george-boole | makemecookies |
|---|---|---|
| begin | TAP TO START, then SELECT MODE | CLOCK IN |
| pause | | BREAK, "the line is stopped" |
| round over | | SHIFT OVER, "the whistle blew" |
| again | | ANOTHER SHIFT |
| leave | | CLOCK OUT |
| scores | | BEST SHIFTS |
| rules | HAS ENTERED THE CHAT | HOW TO PLAY |
| reference | GATE CODEX | |

This is the cheapest and most distinctive rule in this file. A factory game
clocks in and takes a break; a logic game has a codex. **Name every button in
the world of the game.** If a label could appear in any other app, it is the
wrong label.

### 3. Pixel type, neon, and one dark ground

Press Start 2P for everything that is not body text. A saturated palette of two
or three accents against a near-black ground, different per game: cyan and
magenta on navy for george-boole, neon pink and butter and mint on plum for
makemecookies. Glow made by blurring a copy of crisp art and screening it back
under itself, never by blurring the art. A quiet repeating texture over the
ground, scanlines or a checkerboard.

The palette is per game. The recipe is not.

### 4. It respects the player, and the build proves it

Both store listings carry a version of this:

```
No ads. No tracking. No account. No purchases. No network connection of any kind.
```

That sentence is the strongest thing either app says, and unlike most claims of
its kind it is enforced: `package.mjs` fails the build if any asset in the
bundle references an external URL, and the chat widget and score server are
dropped on the way in. **Do not write that sentence into a listing the build
does not check.** See Part 4 before adding anything that would make a word of
it false.

### 5. Failure is gentle, and time is the currency

makemecookies has no failure state at all: the health inspector freezes the
line for four seconds while the song keeps playing, and the shift ends when the
music does. george-boole ends when the board fills, and the next game is one
tap away.

Nothing in a magmacrunch game punishes a player by taking their progress away
or by making them wait outside the game. The penalty for doing badly is doing
less well.

### 6. It tells the truth, including when it is awkward

george-boole's credits state that it is inspired by Gabriele Cirulli's 2048 and
reimagined with Boolean logic, because guideline 4.3 is about undisclosed
clones and saying it is the protection. Neither game bids on a competitor's
name in its keywords, and both declare the forbidden words in their own
metadata file rather than leaving it to memory.

The rules screens explain rather than tease. The star thresholds are derived
from a measurement anybody can re-run, not chosen to flatter.

---

## Part 2: the rules that produce it

Checkable things. Where a rule exists because something went wrong, the failure
is named, because the reason is what survives a rewrite.

### Names and ids

- Bundle id `com.magmacrunch.<game>`, Game Center ids
  `com.magmacrunch.<game>.<thing>`.
- **Every Game Center id is permanent and a deleted one cannot be reused.**
  Write the table into the game's `ios/AGENTS.md` and check it against the shim
  before creating anything in App Store Connect.
- **Commit `App.entitlements` with the Game Center key from the start**, before
  there is an account to enable the capability on. A device build or an archive
  then fails by name on the entitlement, which is a legible failure and easy to
  act on. The alternative was tried: with no entitlements file the archive
  succeeds and Game Center sign-in fails at runtime instead, naming nothing.
  Loud and early beats quiet and late. CI is indifferent either way, because a
  simulator build signs ad hoc and `ios-build` passes `CODE_SIGNING_ALLOWED=NO`.
  The two games answered this differently until 2026-09-24.
- Achievement points: leave headroom under the 1000 cap. george-boole's eight
  at 100 plus one at 300 would have been refused by the form; makemecookies
  uses 610 of 1000 so a ninth needs no re-pointing.

### How the publisher is spelled

Three forms are in use and each has exactly one job. Nothing visual catches a
wrong one, so it is written down rather than remembered.

| Form | Where |
|---|---|
| `magmacrunch media` | the `## Copyright` field, every `LICENSE` and `NOTICE` in the tree, the title card, the credits |
| `MAGMACRUNCH MEDIA` | the splash/launch image publisher line, and nowhere else |
| `MAGMACRUNCH MEDIA LLC` | the App Store **seller name**, exactly as Pennsylvania has it, `LLC` and its spacing included |

- **The copyright field is `<year> magmacrunch media`** -- lowercase, no `(c)`,
  and not the word "Copyright", which the form supplies. Both games write
  `2026 magmacrunch media`, and `tools/check-metadata.mjs` fails a consumer
  that writes anything else. The year is a per-release fact and stays free; the
  publisher is a house fact, which is the part a shared checker is entitled to
  know.
- **There is no title-case form any more.** The Apache-2.0 `LICENSE` and
  `NOTICE` of the two shared engines read `Magma Crunch Media` until 2026-09-24:
  34 occurrences across adenosine and hypnopompia, matching neither the display
  name nor the registered entity, and shipping inside seven published
  `@magmacrunch/*` npm packages. They were unified to lowercase, so one spelling
  now covers every licence file in the tree. Beware that `Texas Toast Magma
  Crunch` is a song title and not this name.
- **No slash styling.** `CRUNCH//SCOPE` is a wordmark belonging to one ware
  tool. No game uses one and nothing makes it house style.
- The legal entity and the seller name are account-level facts rather than a
  game's. The enrollment record -- the D-U-N-S request, the paused-on-purpose
  decision of 2026-09-19, and the comma D&B inserts before `LLC` that the
  registration does not have -- stays in
  `games/george-boole/ios/store/enrollment.md`.

### The publisher's mark

`web/img/mc-logo.png`, white, at the foot of the title card, with
"magmacrunch media" at 7px. **The mark sits ABOVE the name, not beside it**:
stacked, it reads as a signature block rather than as a line of text with a
bullet in front of it, and the logo gets room to be a shape instead of sharing
32px of height with the words. Both games were changed to this on 2026-09-22;
this file said "beside" until then, which is why it is stated here in the same
words both stylesheets use.

**A link on the web and plain text in the app**: `package.mjs` unlinks it, and
that transform goes BEFORE the one that makes outbound links open Safari. A
player who has not started yet should not be one mis-tap from a browser.

**The two pipelines unlink it differently, so style the container, not the
link.** george-boole UNWRAPS the `<a>` -- the element goes, and the class with
it -- while makemecookies replaces it with a `<span>` that keeps
`.title-publisher-link`. A rule written only on that class changes the website
and leaves george-boole's app alone, silently, because the selector matches
nothing there. george-boole therefore repeats the stacking on
`.title-publisher`, which is not redundant. Both stylesheets say so at the
rule: `games/george-boole/web/css/modal-title.css` and
`games/makemecookies/web/css/title.css`.

Do not also name the publisher in a tagline above it. makemecookies said
"a magmacrunch media cookie factory" eight pixels above the mark that says
magmacrunch media, and the line came out.

### The icon

One subject, two or three high-contrast shapes, on the game's dark ground with
its glow. A dark-appearance twin, paired in `Contents.json` by an `appearances`
entry, or iOS dims the light one and the accent goes nearly black.

- **Judge it at 60px.** george-boole's was fine at 1024 and a murky blob on a
  home screen. Both icon scripts render 180, 120 and 60 against a light and a
  dark wallpaper, masked.
- **Fail the build if the art crosses the corner mask.** The asset catalog
  previews a full square; iOS shows a rounded one.
- **Parse the game's own palette** rather than retyping it, so a recolour in
  the game cannot leave the icon painting the old one.

### The launch image

The wordmark, crisp, with the glow screened under it. Sized as a fraction of
the square and asserted, because `scaleAspectFill` crops: a portrait phone
shows a band 46% of the width, a landscape iPad about the middle 75% of the
height. Art wider than that is cut in half on every device while looking
perfect in the asset catalog.

The same colours read differently at different coverage. An icon's ground stops
came out as hot pink across a whole launch screen; the splash carries its own.

### Orientation

Decide from the playfield's aspect, per device family, and write the reason in
`Info.plist` beside the key.

- makemecookies' board is 2.29:1, so **iPhone is landscape only**: in portrait
  it is a strip across the top third, not a smaller version of the same thing.
- **iPad is not locked.** It was, for an hour, and the capture showed why not:
  under the iOS 26 SDK `UIRequiresFullScreen` is deprecated, and a
  landscape-only app on a portrait iPad is not rotated, it is letterboxed with
  black bands. Locking bought bands instead of the layout it was meant to
  guarantee.

### The seam, and the shims

The game announces moments as CustomEvents named for the game, never for a
platform: `boole:overflow`, `cookies:fire-out`. App-only shims listen. On the
web they are dispatched into a document with no listeners.

- **A shim never re-derives a rule.** If an achievement needs a fact the events
  do not carry, add it to the seam. makemecookies grew `cookies:fire-out` and a
  `bonusLabel` for exactly this, rather than letting a shim compare mess against
  a threshold that tuning moves.
- **The seam goes where the ports are not.** A rules file that is ported
  line-for-line to another platform does not get dispatch calls in it.
- A counter that moves twice in one frame reports once with a count. Two spills
  are one thing going wrong, and a phone that buzzes twice feels broken.

### Store text and site pages

`ios/store/metadata.md` holds every App Store Connect field, checked by
`tools/check-metadata.mjs` before anybody opens a browser. Category honestly
(makemecookies is Arcade, not Puzzle, because nothing in it is solved). Age
rating all None and No, which gives 4+; Simulated Gambling None is the one
score games get wrong. Review notes answer guideline 4.2 before it is raised.

Every app gets `magmacrunch.com/privacy/<game>/` and `/support/<game>/`, listed
on the two indexes, contact `info@magmacrunch.com`. Both are required URLs and
neither is discoverable until the Submit button is greyed out.

### Screenshots

Five frames, in this order, which both games arrived at independently:

1. the title card
2. the game mid-play, at its busiest
3. the moment something is at stake
4. the result screen
5. the board

Staging drives the real UI: it presses the real buttons and puts real values in
the real state. Three things it must do, each learned by losing a set of
screenshots to it:

- **Freeze the render loop for each frame**, or the loop advances what you
  arranged before the shutter.
- **Clear the pause**, because an app started by `simctl launch` is not
  necessarily frontmost and the game pauses on `visibilitychange`.
- **Reach state by its bare name.** `st`, `currentGame` and friends are
  top-level `let` in classic scripts: global lexical bindings, not properties
  of `window`. `window.currentGame` is undefined and stages nothing.

---

## Part 3: what is deliberately not shared

Palette. Genre. Scoring. Round length. Orientation. The shape of the rules
screen. Whether there is a codex, a shift, a ladder or none of them.

Two games that look like one game is not the goal. The goal is that both feel
like they came from the same building.

---

## Part 4: money, and the sentence in Part 1

Both games are free with no In-App Purchase, which is what makes the guarantee
in 1.4 literally true.

A tip jar is a digital purchase, so Apple requires In-App Purchase for it: a
consumable per tier, an "In-App Purchases" badge on the listing, 15% under the
Small Business Program, and the Paid Apps agreement with the company's bank and
tax details in App Store Connect. The 2025 US ruling on external payment links
is real but storefront-specific and still moving; do not build on it.

If tips arrive, two things change and both are in this file's scope:

1. The guarantee rewords to something still true and arguably stronger:
   **nothing you can buy changes the game.** Tips must give no advantage, no
   content and no cosmetic. Thanks, and nothing else.
2. A StoreKit plugin belongs here in `native/`, vendored like the Game Center
   one, with ids `com.magmacrunch.<game>.tip.<tier>` that are as permanent as
   every other id in Part 2.

Until then: tips live on magmacrunch.com, where they cost no commission and
contradict nothing.

### Ads and a paid tier: open, 2026-09-19

Raised and deliberately not decided. Written down because the arguments are
the same every time and the costs are easy to forget while enthusiastic.

**An ad SDK is a network request, and that is the whole problem.** The build
fails on any asset that reaches outside the bundle, which is what makes the
guarantee in 1.4 a checked claim. Ads mean that check stops, "Do you collect
data? No" becomes a disclosure with a tracking label, and the 4+ rating gets
more complicated. That is not an argument against ads. It is the price, and it
is paid in the one asset here that cannot be bought back.

**A paid tier has a shape Apple prefers.** Two listings, one free and one Pro,
is the old pattern and reads as a duplicate; one free app with a non-consumable
that removes ads is the modern one. Either way it is StoreKit, the Paid Apps
agreement, and the bank and tax details in App Store Connect.

**And the website is the asymmetry.** The same game is free in a browser at
magmacrunch.com/arcade/, generated from the same `web/` the app is derived
from. Anyone who would pay to remove ads can play the identical game, free and
ad-free, one search away. That decides which version can carry ads cheaply: the
site already loads fonts from Google and carries a chat widget, so it has no
guarantee to lose, and the app has nothing else.

Three coherent positions:

| | What it costs |
|---|---|
| **Apps clean, ads on the site** | Nothing structural. The guarantee survives and becomes a reason to install rather than an accident. Tips on the website. |
| **Free with ads, paid to remove them** | The guarantee, the privacy label, and the build check. Plus an ad SDK, StoreKit, and a rewrite of both listings and both privacy pages. |
| **Paid app, free on the web** | The cleanest story, and it asks people to pay for what a browser gives away. Works only while the app is meaningfully better: today that is Game Center, haptics and playing with the network off. |

**The order is asymmetric, and that is the only time-sensitive part.** Shipping
clean keeps every option open: ads or a paid tier can be added to a shipped app
whenever. Shipping with ads forecloses the clean positioning, because a privacy
label and a "no ads" line cannot be walked back once people have read them. So
deciding late is free and deciding early is not.
