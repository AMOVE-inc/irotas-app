#!/usr/bin/env python3
"""Restore expired Discord meal-report image links from the original messages."""

import asyncio
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "data/discord-board-2026-08-29.json"
MEDIA = ROOT / "private-media/discord-board/1468128865552568342"
CONFIG = ROOT / ".migration-private/discord-export.yaml"
URL = re.compile(r"/attachments/(\d+)/(\d+)/")


async def main():
    archive = json.loads(ARCHIVE.read_text())
    token = re.search(r"^bot_token:\s*['\"]?([^'\"\s]+)", CONFIG.read_text(), re.M).group(1)
    records = [row for row in archive["threads"] if row["category"] == "meal-report"]
    ids = {row["id"] for row in records}
    records += [row for row in archive["comments"] if row["threadId"] in ids]
    existing = {path.stem: path for path in MEDIA.glob("*")}
    missing = {}
    omitted = 0
    for row in records:
        for image in row.get("images", []):
            match = URL.search(image)
            if match and match[2] not in existing:
                missing.setdefault(row["id"].split("-")[-1], set()).add(match[2])

    semaphore = asyncio.Semaphore(3)
    def download(message_id, attachment_ids):
        request = urllib.request.Request(
            f"https://discord.com/api/v10/channels/1468128865552568342/messages/{message_id}",
            headers={"Authorization": f"Bot {token}", "User-Agent": "IRO+ migration"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            message = json.load(response)
        for attachment in message.get("attachments", []):
            if attachment["id"] not in attachment_ids:
                continue
            print("restoring", attachment["id"], flush=True)
            request = urllib.request.Request(attachment.get("proxy_url") or attachment["url"], headers={"User-Agent": "IRO+ migration"})
            with urllib.request.urlopen(request, timeout=20) as response:
                data = response.read()
            with Image.open(io.BytesIO(data)) as original:
                image = ImageOps.exif_transpose(original).convert("RGB")
                image.thumbnail((720, 720), Image.Resampling.LANCZOS)
                image.save(MEDIA / f"{attachment['id']}.webp", format="WEBP", quality=50, method=6)
            existing[attachment["id"]] = MEDIA / f"{attachment['id']}.webp"
            print("restored", attachment["id"], flush=True)

    async def restore(message_id, attachment_ids):
        async with semaphore:
            await asyncio.to_thread(download, message_id, attachment_ids)

    results = [] if "--finalize" in sys.argv else await asyncio.gather(*(restore(message_id, attachment_ids) for message_id, attachment_ids in missing.items()), return_exceptions=True)
    failures = [str(result) for result in results if isinstance(result, Exception)]
    if failures:
        print("download errors:", failures[:3], file=sys.stderr)
    for row in records:
        repaired = []
        for image in row.get("images", []):
            match = URL.search(image)
            path = existing.get(match[2]) if match else None
            if path:
                repaired.append(f"/discord-board/{match[1]}/{path.name}")
            elif not match:
                repaired.append(image)
            else:
                omitted += 1
        row["images"] = repaired
    ARCHIVE.write_text(json.dumps(archive, ensure_ascii=False, separators=(",", ":")))
    remaining = sum(URL.search(image) is not None for row in records for image in row.get("images", []))
    print(json.dumps({"restoredMessages": len(missing) - len(failures) if "--finalize" not in sys.argv else 0, "failedMessages": len(failures), "omittedExpiredImages": omitted, "remainingDiscordUrls": remaining}))
    if remaining and "--finalize" not in sys.argv:
        sys.exit(1)


asyncio.run(main())
