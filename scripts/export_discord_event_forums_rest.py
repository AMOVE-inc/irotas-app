#!/usr/bin/env python3
"""Export all active and public archived threads from the three event forums."""

import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
import yaml

FORUMS = {
    "1228983536988586044": ("official-event", "全体イベント"),
    "1332944923166507038": ("branch-event-kanto", "関東支部イベント"),
    "1332959273394638911": ("branch-event-kansai", "関西支部イベント"),
}
API = "https://discord.com/api/v10"


async def discord_get(session, path, params=None):
    while True:
        async with session.get(f"{API}{path}", params=params) as response:
            if response.status == 429:
                retry = float((await response.json()).get("retry_after", 1))
                await asyncio.sleep(retry)
                continue
            response.raise_for_status()
            return await response.json()


async def archived_threads(session, channel_id):
    rows, before = [], None
    while True:
        params = {"limit": 100}
        if before:
            params["before"] = before
        page = await discord_get(session, f"/channels/{channel_id}/threads/archived/public", params)
        rows.extend(page.get("threads", []))
        if not page.get("has_more") or not page.get("threads"):
            return rows
        before = page["threads"][-1]["thread_metadata"]["archive_timestamp"]


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    config = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    discord_config = config.get("discord", config)
    token = discord_config.get("token") or discord_config.get("bot_token")
    guild_id = str(discord_config.get("guild_id"))
    headers = {"Authorization": f"Bot {token}"}
    archive = {"exportedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "threads": [], "comments": []}
    async with aiohttp.ClientSession(headers=headers) as session:
        active = await discord_get(session, f"/guilds/{guild_id}/threads/active")
        active_by_parent = {}
        for thread in active.get("threads", []):
            active_by_parent.setdefault(str(thread.get("parent_id")), []).append(thread)
        for channel_id, (category, label) in FORUMS.items():
            threads = {str(thread["id"]): thread for thread in active_by_parent.get(channel_id, [])}
            for thread in await archived_threads(session, channel_id):
                threads[str(thread["id"])] = thread
            print(f"[取得] {label}: {len(threads)}スレ", flush=True)
            for thread in sorted(threads.values(), key=lambda row: int(row["id"])):
                messages = await discord_get(session, f"/channels/{thread['id']}/messages", {"limit": 100, "after": "0"})
                messages.sort(key=lambda row: int(row["id"]))
                if not messages:
                    continue
                starter, *comments = messages
                author = starter.get("author", {})
                base = {
                    "id": f"discord-board-{thread['id']}",
                    "authorId": str(author.get("id", "")),
                    "authorName": starter.get("member", {}).get("nick") or author.get("global_name") or author.get("username") or "IRO+運営",
                    "content": starter.get("content", "").strip() or thread.get("name", ""),
                    "createdAt": starter.get("timestamp") or thread.get("thread_metadata", {}).get("archive_timestamp"),
                    "images": [item["url"] for item in starter.get("attachments", []) if item.get("content_type", "").startswith("image/")],
                    "videos": [item["url"] for item in starter.get("attachments", []) if item.get("content_type", "").startswith("video/")],
                    "reactions": {},
                    "category": category,
                    "title": thread.get("name", "イベント"),
                    "sourceLabel": label,
                }
                archive["threads"].append(base)
                for message in comments:
                    message_author = message.get("author", {})
                    archive["comments"].append({
                        "id": str(message["id"]), "threadId": base["id"],
                        "authorId": str(message_author.get("id", "")),
                        "authorName": message.get("member", {}).get("nick") or message_author.get("global_name") or message_author.get("username") or "メンバー",
                        "content": message.get("content", ""), "createdAt": message.get("timestamp"),
                        "images": [item["url"] for item in message.get("attachments", []) if item.get("content_type", "").startswith("image/")],
                        "videos": [item["url"] for item in message.get("attachments", []) if item.get("content_type", "").startswith("video/")],
                        "reactions": {},
                    })
    Path(args.output).write_text(json.dumps(archive, ensure_ascii=False), encoding="utf-8")
    print(f"[完了] {len(archive['threads'])}スレ / {len(archive['comments'])}コメント", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
