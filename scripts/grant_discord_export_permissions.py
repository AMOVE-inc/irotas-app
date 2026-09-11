#!/usr/bin/env python3
"""Grant the migration bot read-only access to the selected Discord forums."""

import argparse
import asyncio
from pathlib import Path

import aiohttp
import yaml

API = "https://discord.com/api/v10"
READ_BITS = (1 << 10) | (1 << 16)  # VIEW_CHANNEL | READ_MESSAGE_HISTORY
ACCESS_ROLE_NAME = "IRO+ Migration Channel Access"


async def request(session, method, path, **kwargs):
    async with session.request(method, f"{API}{path}", **kwargs) as response:
        if response.status == 204:
            return None
        response.raise_for_status()
        return await response.json()


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    config = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    discord_config = config.get("discord", config)
    token = discord_config.get("token") or discord_config.get("bot_token")
    guild_id = str(discord_config["guild_id"])
    async with aiohttp.ClientSession(headers={"Authorization": f"Bot {token}"}) as session:
        bot = await request(session, "GET", "/users/@me")
        member = await request(session, "GET", f"/guilds/{guild_id}/members/{bot['id']}")
        roles = await request(session, "GET", f"/guilds/{guild_id}/roles")
        role_by_id = {str(role["id"]): role for role in roles}
        migration_role_id = next((str(role_id) for role_id in member.get("roles", []) if "migration export" in role_by_id.get(str(role_id), {}).get("name", "").lower()), None)
        if not migration_role_id:
            raise RuntimeError("IRO+ Migration Export role was not found")
        migration_role = role_by_id[migration_role_id]
        print(f"role={migration_role['name']} permissions={migration_role['permissions']}", flush=True)
        access_role = next(
            (role for role in roles if role["name"] == ACCESS_ROLE_NAME),
            None,
        )
        if not access_role:
            if not args.apply:
                raise RuntimeError(
                    f"{ACCESS_ROLE_NAME} is absent; rerun with --apply to create it"
                )
            access_role = await request(
                session,
                "POST",
                f"/guilds/{guild_id}/roles",
                json={"name": ACCESS_ROLE_NAME, "permissions": str(READ_BITS)},
            )
            await request(
                session,
                "PUT",
                f"/guilds/{guild_id}/members/{bot['id']}/roles/{access_role['id']}",
            )
            print(f"created access role={access_role['id']}", flush=True)
        access_role_id = str(access_role["id"])
        channels = await request(session, "GET", f"/guilds/{guild_id}/channels")
        for channel in channels:
            channel_id = str(channel["id"])
            relevant = [{"id": str(row["id"]), "name": role_by_id.get(str(row["id"]), {}).get("name", "member"), "allow": row.get("allow"), "deny": row.get("deny")} for row in channel.get("permission_overwrites", []) if str(row["id"]) in {guild_id, migration_role_id, access_role_id, *map(str, member.get("roles", []))}]
            print(f"  overwrites={relevant}", flush=True)
            overwrite = next((row for row in channel.get("permission_overwrites", []) if str(row["id"]) == access_role_id and int(row["type"]) == 0), None)
            allow = int(overwrite.get("allow", "0")) if overwrite else 0
            deny = int(overwrite.get("deny", "0")) if overwrite else 0
            updated_allow = allow | READ_BITS
            updated_deny = deny & ~READ_BITS
            print(f"{channel['name']} ({channel_id}): allow {allow}->{updated_allow}, deny {deny}->{updated_deny}", flush=True)
            if args.apply:
                await request(session, "PUT", f"/channels/{channel_id}/permissions/{access_role_id}", json={"type": 0, "allow": str(updated_allow), "deny": str(updated_deny)})
        print("適用完了" if args.apply else "dry-run", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
