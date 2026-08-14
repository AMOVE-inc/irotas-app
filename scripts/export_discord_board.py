#!/usr/bin/env python3
"""Export selected IRO+ Discord board channels without exposing bot credentials."""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import re
from pathlib import Path
from urllib.parse import urlparse

import aiohttp
import discord
import yaml
from PIL import Image, ImageOps


TARGET_HINTS = (
    "自己紹介",
    "ごちそうさま",
    "ご馳走様",
    "グルメ相談",
    "相談室",
    "なんでも",
    "フリーチャット",
    "部",
)

TEXT_CHANNELS = {
    1217327152643575911: ("introduction", "自己紹介"),
    1468128865552568342: ("meal-report", "今日のごちそうさま報告"),
}

FORUM_CHANNELS = {
    1472183879187042375: ("gourmet-advice", "教えてグルメ相談室"),
    1228614719309352970: ("free-chat", "なんでも掲示板"),
    1485649608620113971: ("club-club-disney", "ディズニー部"),
    1485649683345969182: ("club-club-walk", "散歩部"),
    1485649758918807582: ("club-club-travel", "旅行部"),
    1485649823817400380: ("club-club-sports-watch", "スポーツ観戦部"),
    1485649954918891671: ("club-club-wine", "ワイン部"),
    1485650029086769333: ("club-club-bread", "パン部"),
    1485650106689523802: ("club-club-sweets", "スイーツ部"),
    1485650174666866698: ("club-club-cooking-class", "料理教室部"),
    1485650237807792251: ("club-club-day-drinking", "昼飲み部"),
    1485650300781203596: ("club-club-running", "ランニング部"),
    1487647151063564329: ("club-club-theater", "舞台鑑賞部"),
    1500006780842016879: ("club-club-sports", "スポーツ部"),
}

PREFECTURES = (
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
)


def isoformat(value) -> str:
    return value.isoformat().replace("+00:00", "Z")


def reactions_for(message: discord.Message) -> dict[str, list[str]] | None:
    reactions = {}
    for reaction in message.reactions:
        count = max(0, reaction.count)
        if count:
            reactions[str(reaction.emoji)] = [
                f"discord-reaction-{message.id}-{index + 1}" for index in range(count)
            ]
    return reactions or None


def first_url(content: str, matcher) -> str | None:
    for value in re.findall(r"https?://[^\s<>]+", content):
        cleaned = value.rstrip("。）、,)")
        if matcher(urlparse(cleaned).netloc.lower()):
            return cleaned
    return None


def clean_template_line(line: str) -> str:
    """Remove Discord template decorations without changing the entered value."""
    value = line.strip().strip("*`_")
    value = re.sub(r"^[\s・■●◆#*\-📍📌👥💰💵💬🍴🍽️⭐🌟🥢]+", "", value)
    return value.strip()


def field(content: str, labels: tuple[str, ...]) -> str | None:
    label_pattern = "|".join(re.escape(label) for label in labels)
    for raw_line in content.splitlines():
        line = clean_template_line(raw_line)
        match = re.match(rf"(?:{label_pattern})\s*[：:]\s*(.*)$", line)
        if match and match.group(1).strip():
            return match.group(1).strip().strip("*`_")
    return None


def multiline_field(content: str, labels: tuple[str, ...]) -> str | None:
    label_pattern = "|".join(re.escape(label) for label in labels)
    lines = content.splitlines()
    for index, raw_line in enumerate(lines):
        line = clean_template_line(raw_line)
        match = re.match(rf"(?:{label_pattern})\s*[：:]\s*(.*)$", line)
        if not match:
            continue
        values = [match.group(1).strip().strip("*`_")]
        values.extend(item.rstrip() for item in lines[index + 1:])
        value = "\n".join(values).strip()
        return value or None
    return None


def introduction_fields(content: str) -> dict:
    want_to_try = field(content, ("IRO+でやってみたいこと", "コミュニティでやりたいこと", "やってみたいこと"))
    favorite = field(content, ("お気に入りのお店",))
    desired = field(content, ("行ってみたいお店",))
    return {
        "introduction": content.strip(),
        "wantToTry": want_to_try,
        "favoriteRestaurants": favorite,
        "desiredRestaurants": desired,
    }


def meal_fields(content: str) -> dict:
    restaurant = field(content, ("店名", "お店", "店舗名"))
    if not restaurant:
        restaurant = next((clean_template_line(line) for line in content.splitlines() if clean_template_line(line)), "過去のごちそうさま報告")
    prefecture = next((value for value in PREFECTURES if value in content), "")
    rating_text = field(content, ("評価", "おすすめ度")) or ""
    rating_match = re.search(r"([1-5](?:\.\d)?)", rating_text)
    star_count = max(content.count("⭐"), content.count("★"))
    rating = float(rating_match.group(1)) if rating_match else float(min(5, star_count))
    return {
        "restaurantName": restaurant,
        "prefecture": prefecture,
        "areaDisplay": field(content, ("場所", "エリア", "所在地")),
        "budget": field(content, ("予算", "価格帯")),
        "recommendedMenu": field(content, ("おすすめメニュー", "メニュー", "商品名")),
        "rating": rating,
        "comment": field(content, ("一言", "コメント", "推しポイント")),
        "googleMapUrl": first_url(content, lambda host: "google." in host or "maps.app.goo.gl" in host),
        "tabelogUrl": first_url(content, lambda host: "tabelog.com" in host),
    }


def advice_fields(title: str, content: str) -> dict:
    return {
        "theme": field(content, ("テーマ",)) or title,
        "area": field(content, ("エリア", "場所")) or "未設定",
        "scene": field(content, ("利用シーン", "シーン")) or "未設定",
        "budget": field(content, ("予算",)) or "未設定",
        "comment": multiline_field(content, ("一言メッセージ", "一言", "相談内容")) or "",
    }


def normalize_discord_mentions(message: discord.Message) -> str:
    content = message.content
    for role in message.role_mentions:
        content = content.replace(f"<@&{role.id}>", f"@{role.name}")
    for member in message.mentions:
        display_name = getattr(member, "display_name", member.name)
        content = re.sub(rf"<@!?{member.id}>", f"@{display_name}", content)
    for channel in message.channel_mentions:
        content = content.replace(f"<#{channel.id}>", f"#{channel.name}")
    return content


async def save_attachment(attachment: discord.Attachment, asset_root: Path, relative_root: Path) -> tuple[str, bool] | None:
    content_type = (attachment.content_type or "").lower()
    is_image = content_type.startswith("image/")
    is_video = content_type.startswith("video/")
    # The web deployment keeps every still image. Large Discord videos are
    # intentionally omitted so the community archive remains deployable.
    if is_video or not is_image:
        return None
    existing = next(asset_root.glob(f"{attachment.id}.*"), None) if asset_root.exists() else None
    if existing:
        return f"/{(relative_root / existing.name).as_posix()}", existing.suffix.lower() in {".mp4", ".mov", ".webm"}
    data = await attachment.read(use_cached=True)
    base_name = f"{attachment.id}"
    if is_image and content_type != "image/gif":
        try:
            image = Image.open(io.BytesIO(data))
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((720, 720), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=50, method=6)
            data = output.getvalue()
            suffix = ".webp"
        except Exception:
            suffix = Path(attachment.filename).suffix.lower() or ".jpg"
    else:
        suffix = Path(attachment.filename).suffix.lower() or (".gif" if is_image else ".mp4")
    asset_root.mkdir(parents=True, exist_ok=True)
    destination = asset_root / f"{base_name}{suffix}"
    destination.write_bytes(data)
    return f"/{(relative_root / destination.name).as_posix()}", is_video


async def message_record(message: discord.Message, asset_root: Path, relative_root: Path) -> dict:
    images: list[str] = []
    videos: list[str] = []
    saved_items = await asyncio.gather(*[
        save_attachment(attachment, asset_root, relative_root) for attachment in message.attachments
    ])
    for saved in saved_items:
        if saved:
            (videos if saved[1] else images).append(saved[0])
    return {
        "id": str(message.id),
        "authorId": str(message.author.id),
        "authorName": getattr(message.author, "display_name", message.author.name),
        "content": normalize_discord_mentions(message),
        "createdAt": isoformat(message.created_at),
        "parentMessageId": str(message.reference.message_id) if message.reference and message.reference.message_id else None,
        "images": images,
        "videos": videos,
        "reactions": reactions_for(message),
    }


async def records_for_messages(messages: list[discord.Message], asset_root: Path, relative_root: Path) -> list[dict]:
    records = []
    for start in range(0, len(messages), 16):
        records.extend(await asyncio.gather(*[
            message_record(message, asset_root, relative_root)
            for message in messages[start:start + 16]
        ]))
    return records


def merge_consecutive(records: list[dict]) -> list[dict]:
    merged = []
    for record in records:
        if (
            merged
            and not record["parentMessageId"]
            and not merged[-1]["parentMessageId"]
            and record["authorId"] == merged[-1]["authorId"]
            and (discord.utils.parse_time(record["createdAt"]) - discord.utils.parse_time(merged[-1]["createdAt"])).total_seconds() <= 600
        ):
            if record["content"]:
                merged[-1]["content"] = "\n".join(filter(None, (merged[-1]["content"], record["content"])))
            merged[-1]["images"].extend(record["images"])
            merged[-1]["videos"].extend(record["videos"])
            continue
        merged.append(record)
    return merged


async def export_archive(guild: discord.Guild, output_path: Path, asset_root: Path) -> None:
    archive = {"exportedAt": isoformat(discord.utils.utcnow()), "threads": [], "comments": []}
    relative_root = Path("discord-board")

    for channel_id, (category, label) in TEXT_CHANNELS.items():
        channel = guild.get_channel(channel_id)
        if not isinstance(channel, discord.TextChannel):
            continue
        print(f"[取得中] {label}", flush=True)
        messages = [
            message async for message in channel.history(limit=None, oldest_first=True)
            if not message.author.bot and (message.content or message.attachments)
        ]
        records = await records_for_messages(messages, asset_root / str(channel.id), relative_root / str(channel.id))
        records = merge_consecutive(records)
        root_ids = {record["id"] for record in records if not record["parentMessageId"]}
        for record in records:
            if record["parentMessageId"] in root_ids:
                archive["comments"].append({**record, "threadId": f"discord-board-{record['parentMessageId']}"})
                continue
            content = record["content"].strip()
            if category == "introduction":
                template = {"selfIntroduction": introduction_fields(content)}
                title = "自己紹介"
            else:
                template = {"mealReport": meal_fields(content)}
                title = template["mealReport"]["restaurantName"]
            archive["threads"].append({
                **record,
                "id": f"discord-board-{record['id']}",
                "category": category,
                "title": title,
                "sourceLabel": label,
                **template,
            })

    for channel_id, (category, label) in FORUM_CHANNELS.items():
        channel = guild.get_channel(channel_id)
        if not isinstance(channel, discord.ForumChannel):
            continue
        print(f"[取得中] {label}", flush=True)
        threads = {thread.id: thread for thread in channel.threads}
        async for thread in channel.archived_threads(limit=None):
            threads[thread.id] = thread
        for thread in sorted(threads.values(), key=lambda item: item.created_at):
            messages = [
                message async for message in thread.history(limit=None, oldest_first=True)
                if not message.author.bot and (message.content or message.attachments)
            ]
            records = await records_for_messages(messages, asset_root / str(channel.id), relative_root / str(channel.id))
            if not records:
                continue
            starter, *comments = records
            content = starter["content"].strip()
            template = {"gourmetAdvice": advice_fields(thread.name, content)} if category == "gourmet-advice" else {}
            thread_id = f"discord-board-{thread.id}"
            archive["threads"].append({
                **starter,
                "id": thread_id,
                "category": category,
                "title": thread.name,
                "sourceLabel": label,
                **template,
            })
            archive["comments"].extend({**comment, "threadId": thread_id} for comment in comments)

    archive["threads"].sort(key=lambda item: item["createdAt"], reverse=True)
    archive["comments"].sort(key=lambda item: item["createdAt"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(archive, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[完了] スレ {len(archive['threads'])}件 / コメント {len(archive['comments'])}件 / {output_path}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--output")
    parser.add_argument("--assets")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    config_path = Path(args.config).expanduser().resolve()
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))

    intents = discord.Intents.default()
    intents.message_content = True
    intents.members = True
    client = discord.Client(intents=intents)

    @client.event
    async def on_ready() -> None:
        guild = client.get_guild(int(config["discord"]["guild_id"]))
        if guild is None:
            raise RuntimeError("Configured Discord server was not found")

        rows = []
        for channel in guild.channels:
            name = getattr(channel, "name", "")
            category = getattr(getattr(channel, "category", None), "name", "") or ""
            if any(hint in name or hint in category for hint in TARGET_HINTS):
                rows.append({
                    "id": str(channel.id),
                    "name": name,
                    "type": channel.__class__.__name__,
                    "category": category,
                })

        rows.sort(key=lambda item: (item["category"], item["name"]))
        if args.list:
            print(json.dumps(rows, ensure_ascii=False, indent=2))
        elif args.summary:
            selected_ids = {
                1217327152643575911,
                1468128865552568342,
                1472183879187042375,
                1485649608620113971,
                1485649683345969182,
                1485649758918807582,
                1485649823817400380,
                1485649894814253147,
                1485649954918891671,
                1485650029086769333,
                1485650106689523802,
                1485650174666866698,
                1485650237807792251,
                1485650300781203596,
                1487647151063564329,
                1500006780842016879,
            }
            summary = []
            for channel_id in selected_ids:
                channel = guild.get_channel(channel_id)
                if isinstance(channel, discord.TextChannel):
                    messages = [message async for message in channel.history(limit=None, oldest_first=True)]
                    summary.append({
                        "id": str(channel.id),
                        "name": channel.name,
                        "type": "text",
                        "posts": len(messages),
                        "attachments": sum(len(message.attachments) for message in messages),
                    })
                elif isinstance(channel, discord.ForumChannel):
                    threads = {thread.id: thread for thread in channel.threads}
                    async for thread in channel.archived_threads(limit=None):
                        threads[thread.id] = thread
                    message_count = 0
                    attachment_count = 0
                    for thread in threads.values():
                        messages = [message async for message in thread.history(limit=None, oldest_first=True)]
                        message_count += len(messages)
                        attachment_count += sum(len(message.attachments) for message in messages)
                    summary.append({
                        "id": str(channel.id),
                        "name": channel.name,
                        "type": "forum",
                        "threads": len(threads),
                        "messages": message_count,
                        "attachments": attachment_count,
                    })
            summary.sort(key=lambda item: item["name"])
            print(json.dumps(summary, ensure_ascii=False, indent=2))
        elif args.output:
            if not args.assets:
                raise ValueError("--assets is required with --output")
            await export_archive(guild, Path(args.output), Path(args.assets))
        await client.close()

    await client.start(config["discord"]["token"])


if __name__ == "__main__":
    asyncio.run(main())
