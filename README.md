# PC GamePak for Decky

Plug a cartridge into a Steam Deck and its games appear as a row on the home
screen. No launcher window, no desktop.

A cartridge is a removable drive with a `cartridge.conf` at its root — the
format from [PC GamePak](https://github.com/HarryBMa/pc-gamepak). This plugin
reads it; it does not need PC GamePak installed.

> **Status: untested on hardware.** The backend has tests and passes them. The
> frontend has been written but never run on a Deck. See
> [What is verified](#what-is-verified) before trusting any of it.

## What it does

- Watches `/run/media`, `/media` and `/mnt` for a mounted cartridge.
- Reads `cartridge.conf`, both the single-game and `[collection]` forms.
- Finds the artwork, including art the wizard copied into `.gamepak/`.
- Puts a row per cartridge on `/library/home`, and lists the same games in the
  Quick Access menu.
- Starts a game by handing its `steam://` URI to Steam.

## What it does not do

- **Launch anything that is not a URI.** A cartridge can name a path to an
  executable on the drive. Running that needs the host, which a Decky plugin
  should not be reaching for — the PC GamePak launcher does it properly.
- **Eject.** Same reason.
- **Write to Steam.** No shortcuts, no collections, no library registration.
  It reads a drive and draws a row.

## What is verified

| | |
|---|---|
| `cartridges.py` — parsing, art resolution, mount scanning | **15 tests, passing.** `python test/test_cartridges.py` |
| `main.py` — the Decky wrapper | Written, not run. It has no logic worth testing without Decky |
| `src/` — the UI and the home-row patch | **Written, never run.** No Deck was available |

The split is deliberate: everything that could be tested without hardware was
put where it could be.

## The home-row patch is the fragile part

Steam's home page is not a public API. `CartridgeShelf.patch` reaches into its
React tree, and a client update can move what it reaches for.

Two rules in that code, both load-bearing:

1. **It never throws.** A patch that throws takes the home page down, and
   somebody whose library will not render cannot get to the menu to disable the
   plugin. Failure means the row is absent, not that Steam is broken.
2. **It never replaces.** The original children are always returned and the
   shelf is prepended.

If the row does not appear, the Quick Access panel still works, and
`console` in CEF debugging will have a `[pc-gamepak]` line saying why.

## Install

Not in the Decky store. Build it and copy it over:

```bash
pnpm install
pnpm run build
```

Then put the folder in `~/homebrew/plugins/pc-gamepak-decky` on the Deck and
restart Decky.

## Tests

```bash
python test/test_cartridges.py     # 15 tests, no dependencies
pnpm run typecheck                 # needs node_modules
```

## Why a plugin rather than the launcher

The PC GamePak launcher is a window: it opens on insert, shows the cover art,
and waits for Play. That is right on a desktop and wrong on a console, where
anything that is not the Steam UI is a mode you have to escape from.

Same cartridges, same format, same artwork. A row instead of a window.

## Licence

MIT, matching PC GamePak.
