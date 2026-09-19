# Hypnopompia

The iOS shell for magmacrunch arcade games. The Capacitor and Xcode half of an
App Store build, the native Game Center plugin, and the store tooling.

Named after "Hypnopompia" by Texas Hold'Em Lava Dome, from *Pompous Fanfare for
All Occasions* (2019), published by magmacrunch music. Adenosine is the molecule
that builds sleep pressure; hypnopompia is surfacing out of it.

**It runs no game logic.** A game's rules live in that game's repo, once per
platform. This repo holds what every App Store build needs and no game should
have to reinvent: a plugin, a project, a pipeline and a checklist that fails
loudly.

`HOUSE.md` is the other half of that: what the games have in common on purpose,
so the fourth one feels like the first two. It is product rather than plumbing,
and it is written from what two shipped games already do rather than from a
wish list.

## What is here

| | |
|---|---|
| `native/` | `GameCenterPlugin.swift` and `GameViewController.swift`, vendored byte-identical into each game's App target |
| `tools/sync.mjs` | vendors `native/` into a game; `--check` is a hash compare |
| `tools/check-metadata.mjs` | a game's `store/metadata.md` against App Store Connect's field limits |
| `consumers.json` | every game repo that vendors from here |

## What is not here yet

The bundle pipeline, the four JavaScript shims, the safe-area CSS and the
screenshot harness all still live in `games/george-boole/ios/`. They are the
pieces whose game-specific line cannot be drawn from one example, so they move
when a second game needs them. See AGENTS.md, "What has landed and what has not".

## Using it

```bash
node tools/sync.mjs ../../games/george-boole          # vendor native/ in
node tools/sync.mjs --check                           # every consumer, hash compare
node tools/check-metadata.mjs ../../games/george-boole/ios
```

Apache-2.0.
