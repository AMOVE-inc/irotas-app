#!/usr/bin/env python3
"""Copy packaged Discord media into the private R2 bucket before removing static copies."""

import concurrent.futures
import json
import os
import pathlib
import sys
import time
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[1]
TOKEN = os.environ["MEDIA_MIGRATION_TOKEN"]
ENDPOINT = "https://app.irotas-community.com/api/admin/discord-media-migration"
DIRS = ("discord-board", "discord-benefits", "discord-gourmet-contests")
paths = ["/" + path.relative_to(ROOT / "public").as_posix()
         for directory in DIRS for path in (ROOT / "public" / directory).rglob("*") if path.is_file()]
paths.sort()
if "--probe" in sys.argv:
    paths = paths[:2]
batches = [paths[index:index + 20] for index in range(0, len(paths), 20)]


def upload(batch):
    for attempt in range(1 if "--probe" in sys.argv else 4):
        try:
            request = urllib.request.Request(ENDPOINT,
                data=json.dumps({"paths": batch}).encode(),
                headers={"Content-Type": "application/json", "x-migration-token": TOKEN, "User-Agent": "curl/8.0", "Accept": "*/*"},
                method="POST")
            with urllib.request.urlopen(request, timeout=90) as response:
                result = json.load(response)
            if set(result.get("uploaded", [])) == set(batch) and not result.get("failed"):
                return []
            batch = result.get("failed", batch)
        except Exception as error:
            if "--probe" in sys.argv:
                print(type(error).__name__, getattr(error, "code", ""), flush=True)
        time.sleep(2 ** attempt)
    return batch


failed = []
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for index, result in enumerate(pool.map(upload, batches), 1):
        failed.extend(result)
        if index % 20 == 0 or index == len(batches):
            print(json.dumps({"batches": index, "totalBatches": len(batches), "failed": len(failed)}), flush=True)
print(json.dumps({"files": len(paths), "failed": len(failed)}))
if failed:
    raise SystemExit(1)
