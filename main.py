"""Decky backend: what is plugged in, and what is on it.

Thin on purpose. Everything that can be tested without a Deck lives in
`cartridges.py`; this file is the part that only exists inside Decky, so it
does as little as possible.
"""

import asyncio
import base64
import mimetypes
import os
from pathlib import Path
from typing import Any

import decky  # provided by Decky Loader at runtime

import cartridges

# How often to re-scan. A mount appearing is not an event we get told about
# here, and inotify on three directories for a plugin that is usually idle is
# more machinery than it earns. Two seconds is under the time it takes someone
# to look up from plugging a drive in.
POLL_SECONDS = 2

# Art is handed to the UI as a data URI, because the browser Steam runs cannot
# read /run/media. Anything bigger than this is refused rather than inlined.
MAX_INLINE_BYTES = 4 * 1024 * 1024


def _data_uri(path: str) -> str | None:
    try:
        size = os.path.getsize(path)
        if size > MAX_INLINE_BYTES:
            return None
        raw = Path(path).read_bytes()
    except OSError:
        return None
    kind, _ = mimetypes.guess_type(path)
    return f"data:{kind or 'image/png'};base64," + base64.b64encode(raw).decode()


def _inline(cartridge: dict[str, Any]) -> dict[str, Any]:
    """Replace every art path with a data URI the UI can actually show."""

    def convert(art: dict[str, str]) -> dict[str, str]:
        out = {}
        for key, path in art.items():
            uri = _data_uri(path)
            if uri:
                out[key] = uri
        return out

    return {
        **cartridge,
        "art": convert(cartridge["art"]),
        "games": [{**g, "art": convert(g["art"])} for g in cartridge["games"]],
    }


class Plugin:
    _cartridges: list[dict[str, Any]] = []
    _serial: int = 0
    _task: asyncio.Task | None = None

    # ---------------------------------------------------------------- called by the UI

    async def get_cartridges(self) -> list[dict[str, Any]]:
        """Everything plugged in, with artwork inlined."""
        return [_inline(c) for c in self._cartridges]

    async def get_serial(self) -> int:
        """Bumped whenever the set of cartridges changes.

        The UI polls this rather than the whole list: it is one integer against
        a payload carrying every cover on the drive.
        """
        return self._serial

    async def rescan(self) -> list[dict[str, Any]]:
        """Scan now rather than waiting for the next tick."""
        await self._refresh()
        return await self.get_cartridges()

    # ---------------------------------------------------------------- lifecycle

    async def _refresh(self) -> None:
        found = await asyncio.to_thread(cartridges.scan)

        # Compare on identity and contents, not on the inlined art — otherwise
        # every tick re-encodes megabytes of PNG to decide nothing changed.
        def shape(cs):
            return [
                (c["id"], c["mount"], tuple(g["executable"] for g in c["games"]))
                for c in cs
            ]

        if shape(found) != shape(self._cartridges):
            self._cartridges = found
            self._serial += 1
            decky.logger.info(
                "cartridges changed: %s",
                ", ".join(f"{c['title']} ({len(c['games'])})" for c in found) or "none",
            )

    async def _loop(self) -> None:
        while True:
            try:
                await self._refresh()
            except Exception:
                decky.logger.exception("scan failed")
            await asyncio.sleep(POLL_SECONDS)

    async def _main(self) -> None:
        decky.logger.info("pc-gamepak: watching %s", ", ".join(cartridges.MOUNT_ROOTS))
        self._task = asyncio.create_task(self._loop())
        await self._task

    async def _unload(self) -> None:
        if self._task:
            self._task.cancel()
        decky.logger.info("pc-gamepak: stopped")
