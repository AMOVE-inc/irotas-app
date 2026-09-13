import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BASE_URL, DEFAULT_CHECKS, healthIsReady, runProductionSmoke } from "../scripts/production-smoke.mjs";

function responseFor(path: string) {
  if (path === "/api/platform/health")
    return Response.json({
      status: "ok",
      services: { database: "ok", uploads: "ok" },
      configuration: { auth: true, square: true },
      schemaVersion: "21",
    });
  if (path.startsWith("/api/")) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  return new Response("<!doctype html>", { status: 200 });
}

describe("production smoke monitor", () => {
  it("targets the public app domain by default", () => {
    expect(DEFAULT_BASE_URL).toBe("https://app.irotas-community.com");
  });
  it("accepts healthy pages, platform services and protected APIs", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => responseFor(new URL(String(input)).pathname));
    const report = await runProductionSmoke({ baseUrl: "https://example.test", fetchImpl });
    expect(report.ok).toBe(true);
    expect(report.passed).toBe(DEFAULT_CHECKS.length);
    expect(report.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/api/admin/backup-readiness", status: 401, ok: true }),
    ]));
    expect(report.results.every((result: { ok: boolean }) => result.ok)).toBe(true);
  });

  it("fails when a protected API is exposed or a dependency is degraded", async () => {
    const checks = [
      { kind: "health", path: "/api/platform/health", expectedStatus: 200 },
      { kind: "protected", path: "/api/events", expectedStatus: 401 },
    ];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/platform/health")
        return Response.json({ status: "degraded", services: { database: "unavailable", uploads: "ok" }, configuration: { auth: true, square: true }, schemaVersion: null });
      return Response.json({ events: [] });
    });
    const report = await runProductionSmoke({ baseUrl: "https://example.test", fetchImpl, checks });
    expect(report.ok).toBe(false);
    expect(report.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/api/platform/health", ok: false }),
      expect.objectContaining({ path: "/api/events", status: 200, ok: false }),
    ]));
  });

  it("reports timeouts without exposing response bodies", async () => {
    const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("secret body"), { name: "AbortError" })));
    }));
    const report = await runProductionSmoke({
      baseUrl: "http://localhost:8081",
      fetchImpl,
      timeoutMs: 1,
      checks: [{ kind: "page", path: "/", expectedStatus: 200 }],
    });
    expect(report.ok).toBe(false);
    expect(report.results[0]).toMatchObject({ error: "timeout", status: null });
    expect(JSON.stringify(report)).not.toContain("secret body");
  });

  it("requires every production health signal", () => {
    expect(healthIsReady({ status: "ok", services: { database: "ok", uploads: "ok" }, configuration: { auth: true, square: true }, schemaVersion: "21" })).toBe(true);
    expect(healthIsReady({ status: "ok", services: { database: "ok", uploads: "ok" }, configuration: { auth: true, square: false }, schemaVersion: "21" })).toBe(false);
  });
});
