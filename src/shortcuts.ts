import { callable } from "@decky/api";

/**
 * Give cartridge-carried games a Steam appid, so they can appear like the rest.
 *
 * Off by default, and that default is the point. Everything else this plugin
 * does is read-only: it reads a drive and draws a row, which is what makes it
 * safe to plug in a cartridge somebody handed you. This writes to the user's
 * Steam library, so it waits to be asked.
 *
 * Why it is needed at all: a game the cartridge *carries* names a path, not a
 * `steam://` URI. Steam has never heard of it, so it has no appid — and a Deck
 * Shelves shelf source can only return appids. Without a shortcut there is no
 * number to return.
 *
 * A shortcut alone is not enough for a Windows game. It also needs Proton, and
 * a prefix somewhere Proton can actually build one: exFAT has no symlinks, and
 * Proton's prefix is made of them, so the prefix is pointed at the internal
 * drive. See the README.
 */

export interface Candidate {
  title: string;
  exe: string;
  startDir: string;
  cartridge: string;
}

const getCandidates = callable<[], Candidate[]>("get_shortcut_candidates");
const getSettings = callable<[], Record<string, unknown>>("get_settings");
const setSettings = callable<[Record<string, unknown>], boolean>("set_settings");

export const SETTING = "addCartridgeShortcuts";

/** exe path -> appid, for the shortcuts this plugin made and must clean up. */
type Owned = Record<string, number>;

async function readOwned(): Promise<Owned> {
  const s = await getSettings();
  const owned = s.ownedShortcuts;
  return owned && typeof owned === "object" ? (owned as Owned) : {};
}

async function writeOwned(owned: Owned): Promise<void> {
  const s = await getSettings();
  await setSettings({ ...s, ownedShortcuts: owned });
}

/** Appids of the shortcuts this plugin owns, for the shelf source to include. */
export async function ownedAppIds(): Promise<number[]> {
  try {
    return Object.values(await readOwned()).filter((id) => typeof id === "number");
  } catch {
    return [];
  }
}

export async function isEnabled(): Promise<boolean> {
  const s = await getSettings();
  return s[SETTING] === true;
}

export async function setEnabled(on: boolean): Promise<void> {
  const s = await getSettings();
  await setSettings({ ...s, [SETTING]: on });
  // Turning it off is a promise to clean up, not just to stop adding.
  await (on ? sync() : removeAll());
}

/**
 * Make Steam's shortcuts match what is plugged in.
 *
 * Adds one per carried game that has none, and removes the ones whose cartridge
 * has gone. Only ever touches shortcuts recorded in our own settings, so a
 * shortcut the user made by hand is never removed.
 */
export async function sync(): Promise<void> {
  if (!(await isEnabled())) return;

  const candidates = await getCandidates();
  const owned = await readOwned();
  const wanted = new Set(candidates.map((c) => c.exe));

  for (const candidate of candidates) {
    if (owned[candidate.exe] != null) continue;
    try {
      const appId: number = await (SteamClient as any).Apps.AddShortcut(
        candidate.title,
        candidate.exe,
        candidate.startDir,
        "",
      );
      if (typeof appId !== "number" || !appId) continue;

      // A .exe on a cartridge needs Proton, and a prefix off the cartridge —
      // exFAT cannot hold the symlinks a prefix is made of.
      try {
        (SteamClient as any).Apps.SpecifyCompatTool(appId, "proton_experimental");
        (SteamClient as any).Apps.SetAppLaunchOptions(
          appId,
          `STEAM_COMPAT_DATA_PATH="$HOME/.local/share/Steam/steamapps/compatdata/${appId}" %command%`,
        );
      } catch (error) {
        console.warn("[pc-gamepak] shortcut added but Proton not configured", error);
      }

      owned[candidate.exe] = appId;
      console.debug("[pc-gamepak] added shortcut", candidate.title, appId);
    } catch (error) {
      console.error("[pc-gamepak] could not add a shortcut for", candidate.title, error);
    }
  }

  for (const [exe, appId] of Object.entries(owned)) {
    if (wanted.has(exe)) continue;
    try {
      (SteamClient as any).Apps.RemoveShortcut(appId);
      delete owned[exe];
      console.debug("[pc-gamepak] removed shortcut for an ejected cartridge", exe);
    } catch (error) {
      console.error("[pc-gamepak] could not remove shortcut", appId, error);
    }
  }

  await writeOwned(owned);
}

/** Drop every shortcut this plugin made. Used when the setting is turned off. */
export async function removeAll(): Promise<void> {
  const owned = await readOwned();
  for (const appId of Object.values(owned)) {
    try {
      (SteamClient as any).Apps.RemoveShortcut(appId);
    } catch (error) {
      console.error("[pc-gamepak] could not remove shortcut", appId, error);
    }
  }
  await writeOwned({});
}
