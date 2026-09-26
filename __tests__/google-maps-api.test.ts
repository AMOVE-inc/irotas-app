import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Google Maps API key handling", () => {
  it("keeps the Places key on the server and proxies photos through the Worker", () => {
    const worker = readFileSync(resolve(process.cwd(), "sites/worker.ts"), "utf8");
    const runbook = readFileSync(resolve(process.cwd(), "docs/operations/secret-rotation-runbook.md"), "utf8");
    expect(worker).toContain("env.GOOGLE_MAPS_API_KEY");
    expect(worker).toContain('googleMaps: Boolean(env.GOOGLE_MAPS_API_KEY)');
    expect(worker).not.toContain("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY");
    expect(runbook).toContain("`GOOGLE_MAPS_API_KEY`");
    expect(runbook).toContain("`EXPO_PUBLIC_` で始まる値はクライアントへ公開される");
  });
});
