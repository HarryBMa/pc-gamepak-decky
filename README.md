# PC GamePak for Decky

Plug a cartridge into a Steam Deck and its games appear as a row on the home
screen. No launcher window, no desktop.

A cartridge is a removable drive with a `cartridge.conf` at its root — the
format from [PC GamePak](https://github.com/HarryBMa/pc-gamepak). This plugin
reads it; it does not need PC GamePak installed.

> **Status: tested on hardware, and the home row does not work.** Run against a
> real cartridge on SteamOS's gamescope session (Steam `steamdeck_stable`, build
> 1788652215, Decky 3.2.8). The Quick Access panel and the Deck Shelves source
> both work. The home-row patch this plugin ships does **not** land on that
> build — see [The home-row patch](#the-home-row-patch-is-the-fragile-part).

## What it does

- Watches `/run/media`, `/media` and `/mnt` for a mounted cartridge.
- Reads `cartridge.conf`, both the single-game and `[collection]` forms.
- Finds the artwork, including art the wizard copied into `.gamepak/`.
- Offers the cartridge's games to [Deck Shelves](https://github.com/santojon/Deck-Shelves)
  as a shelf source, so it can put them on the home screen. This is the route
  that works; add a shelf there and pick **PC GamePak cartridge** as its source.
- Lists the same games in the Quick Access menu.
- Tries to put a row on `/library/home` itself, which currently does nothing —
  see below.
- Starts a game by handing its `steam://` URI to Steam.

## What it does not do

- **Launch anything that is not a URI.** A cartridge can name a path to an
  executable on the drive. Running that needs the host, which a Decky plugin
  should not be reaching for — the PC GamePak launcher does it properly. Such a
  game also has no appid, so it cannot appear in a Deck Shelves shelf; the Quick
  Access panel still lists it.
- **Make a Windows game run from an exFAT cartridge.** Handing Steam the URI is
  all this does, and Steam then fails on its own: Proton builds its prefix out
  of symlinks, exFAT has none, and the launch ends as `AppError_11` — "Disk
  write error". Steam's own `compat_log.txt` names it:
  `os.symlink(...)` → `PermissionError: [Errno 1] Operation not permitted`.
  Native Linux games are unaffected. A btrfs cartridge is unaffected. This is a
  property of the filesystem, not of the plugin.
- **Eject.** Same reason.
- **Write to Steam.** No shortcuts, no collections, no library registration.
  It reads a drive and draws a row.

## What is verified

| | |
|---|---|
| `cartridges.py` — parsing, art resolution, mount scanning | **15 tests, passing.** `python test/test_cartridges.py` |
| `main.py` — the Decky wrapper | **Runs.** Loads, and reports `cartridges changed` as a drive comes and goes |
| Deck Shelves source | **Works.** Resolves 9 appids from a ten-game cartridge, 0 after eject, 9 again on reinsert |
| Quick Access panel | **Works.** |
| The home-row patch in `src/CartridgeShelf.tsx` | **Does not land.** Registered, never applied — see below |

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

**On the Deck client this was measured against, it does not land at all.** Decky
accepts the patch — `/library/home` is in its `_routePatches` — and then leaves
it sitting in `toReplace`, having never found a route to apply it to. No
`[pc-gamepak]` line appears anywhere, because the patch function is never
called. Deck Shelves injects fine on the same build, which is why the shelf
source above is the supported route and this is kept only as a fallback for
builds where it does work.

If the row does not appear, the Quick Access panel still works, and
`console` in CEF debugging will have a `[pc-gamepak]` line if the patch ran and
found nothing to attach to.

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
