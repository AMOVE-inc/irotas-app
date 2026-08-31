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
    "1227876549139890226": ("gourmet-board-kanto", "関東グルメ掲示板"),
    "1333062225514201129": ("gourmet-board-kansai", "関西グルメ掲示板"),
    "1228614719309352970": ("free-chat", "なんでも掲示板"),
    "1472183879187042375": ("gourmet-advice", "教えてグルメ相談室"),
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


async def all_messages(session, thread_id):
    rows, after = [], "0"
    while True:
        page = await discord_get(session, f"/channels/{thread_id}/messages", {"limit": 100, "after": after})
        if not page:
            return sorted(rows, key=lambda row: int(row["id"]))
        rows.extend(page)
        if len(page) < 100:
            return sorted(rows, key=lambda row: int(row["id"]))
        after = max(page, key=lambda row: int(row["id"]))["id"]


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


def normalized_content(message, role_names):
    content = message.get("content", "")
    for member in message.get("mentions", []):
        label = member.get("global_name") or member.get("username") or "メンバー"
        content = content.replace(f"<@{member['id']}>", f"@{label}").replace(f"<@!{member['id']}>", f"@{label}")
    for role_id in message.get("mention_roles", []):
        content = content.replace(f"<@&{role_id}>", f"@{role_names.get(str(role_id), 'グループ')}")
    return content


def avatar_url(author):
    user_id = str(author.get("id", ""))
    avatar = author.get("avatar")
    if not user_id or not avatar:
        return None
    extension = "gif" if str(avatar).startswith("a_") else "png"
    return f"https://cdn.discordapp.com/avatars/{user_id}/{avatar}.{extension}?size=512"


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--input")
    parser.add_argument("--thread-id")
    args = parser.parse_args()
    config = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    discord_config = config.get("discord", config)
    token = discord_config.get("token") or discord_config.get("bot_token")
    guild_id = str(discord_config.get("guild_id"))
    headers = {"Authorization": f"Bot {token}"}
    archive = {"exportedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "threads": [], "comments": []}
    async with aiohttp.ClientSession(headers=headers) as session:
        roles = await discord_get(session, f"/guilds/{guild_id}/roles")
        role_names = {str(role["id"]): role["name"] for role in roles}
        if args.input:
            source = json.loads(Path(args.input).read_text(encoding="utf-8"))
            selected = [row for row in source["threads"] if not args.thread_id or row["id"].removeprefix("discord-board-") == args.thread_id]
            for row in selected:
                thread_id = row["id"].removeprefix("discord-board-")
                try:
                    messages = await all_messages(session, thread_id)
                except aiohttp.ClientResponseError as error:
                    if error.status in (403, 404):
                        continue
                    raise
                if not messages:
                    continue
                starter, *comments = messages
                starter_author = starter.get("author", {})
                row["authorAvatarUrl"] = avatar_url(starter_author)
                if starter.get("content", "").strip():
                    row["content"] = normalized_content(starter, role_names).strip()
                existing_comments = {str(item["id"]): item for item in source["comments"] if item["threadId"] == row["id"]}
                for message in comments:
                    message_author = message.get("author", {})
                    normalized = {
                        "id": str(message["id"]), "threadId": row["id"],
                        "authorId": str(message_author.get("id", "")),
                        "authorName": message.get("member", {}).get("nick") or message_author.get("global_name") or message_author.get("username") or "メンバー",
                        "authorAvatarUrl": avatar_url(message_author),
                        "content": normalized_content(message, role_names), "createdAt": message.get("timestamp"),
                        "mentions": [{"id": str(item.get("id", "")), "name": item.get("global_name") or item.get("username") or "メンバー"} for item in message.get("mentions", [])],
                        "images": [item["url"] for item in message.get("attachments", []) if item.get("content_type", "").startswith("image/")],
                        "videos": [item["url"] for item in message.get("attachments", []) if item.get("content_type", "").startswith("video/")],
                        "reactions": {},
                    }
                    if str(message["id"]) in existing_comments:
                        existing_comments[str(message["id"])].update(normalized)
                    else:
                        source["comments"].append(normalized)
                print(f"[更新] {row['title']}: 本文1 / コメント{len(comments)}", flush=True)
            source["exportedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            Path(args.output).write_text(json.dumps(source, ensure_ascii=False), encoding="utf-8")
            print(f"[完了] {len(source['threads'])}スレ / {len(source['comments'])}コメント", flush=True)
            return
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
                messages = await all_messages(session, thread["id"])
                if not messages:
                    continue
                starter, *comments = messages
                author = starter.get("author", {})
                base = {
                    "id": f"discord-board-{thread['id']}",
                    "authorId": str(author.get("id", "")),
                    "authorName": starter.get("member", {}).get("nick") or author.get("global_name") or author.get("username") or "IRO+運営",
                    "authorAvatarUrl": avatar_url(author),
                    "content": normalized_content(starter, role_names).strip() or thread.get("name", ""),
                    "mentions": [{"id": str(item.get("id", "")), "name": item.get("global_name") or item.get("username") or "メンバー"} for item in starter.get("mentions", [])],
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
                        "content": normalized_content(message, role_names), "createdAt": message.get("timestamp"),
                        "mentions": [{"id": str(item.get("id", "")), "name": item.get("global_name") or item.get("username") or "メンバー"} for item in message.get("mentions", [])],
                        "images": [item["url"] for item in message.get("attachments", []) if item.get("content_type", "").startswith("image/")],
                        "videos": [item["url"] for item in message.get("attachments", []) if item.get("content_type", "").startswith("video/")],
                        "reactions": {},
                    })
    Path(args.output).write_text(json.dumps(archive, ensure_ascii=False), encoding="utf-8")
    print(f"[完了] {len(archive['threads'])}スレ / {len(archive['comments'])}コメント", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
