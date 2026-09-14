import { pathToFileURL } from "node:url";

export const DEFAULT_BASE_URL = "https://app.irotas-community.com";

export const DEFAULT_CHECKS = [
  ...["/", "/login", "/events", "/board", "/profile"].map((path) => ({
    kind: "page",
    path,
    expectedStatus: 200,
  })),
  { kind: "health", path: "/api/platform/health", expectedStatus: 200 },
  { kind: "protected", path: "/api/admin/backup-readiness", expectedStatus: 401 },
  { kind: "protected", path: "/api/admin/member-import/reconciliation", expectedStatus: 401 },
  { kind: "protected", path: "/api/chats", expectedStatus: 401 },
  { kind: "protected", path: "/api/board/content?category=free-chat", expectedStatus: 401 },
  { kind: "protected", path: "/api/events", expectedStatus: 401 },
];

function normalizedBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("監視先はHTTPSで指定してください");
  return url.toString().replace(/\/$/, "");
}

function safeHealth(body) {
  return {
    status: body?.status ?? null,
    database: body?.services?.database ?? null,
    uploads: body?.services?.uploads ?? null,
    authConfigured: body?.configuration?.auth === true,
    squareConfigured: body?.configuration?.square === true,
    schemaVersion: body?.schemaVersion ?? null,
  };
}

export function healthIsReady(body) {
  const health = safeHealth(body);
  return health.status === "ok" && health.database === "ok" && health.uploads === "ok" &&
    health.authConfigured && health.squareConfigured && Boolean(health.schemaVersion);
}

export async function runProductionSmoke({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 10_000,
  checks = DEFAULT_CHECKS,
} = {}) {
  const origin = normalizedBaseUrl(baseUrl);
  const results = [];

  for (const check of checks) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${origin}${check.path}`, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { accept: check.kind === "page" ? "text/html" : "application/json" },
      });
      let health;
      if (check.kind === "health") {
        try {
          health = safeHealth(await response.json());
        } catch {
          health = safeHealth(null);
        }
      }
      const ok = response.status === check.expectedStatus &&
        (check.kind !== "health" || healthIsReady({
          status: health.status,
          services: { database: health.database, uploads: health.uploads },
          configuration: { auth: health.authConfigured, square: health.squareConfigured },
          schemaVersion: health.schemaVersion,
        }));
      results.push({
        kind: check.kind,
        path: check.path,
        status: response.status,
        expectedStatus: check.expectedStatus,
        durationMs: Date.now() - startedAt,
        ok,
        ...(health ? { health } : {}),
      });
    } catch (error) {
      results.push({
        kind: check.kind,
        path: check.path,
        status: null,
        expectedStatus: check.expectedStatus,
        durationMs: Date.now() - startedAt,
        ok: false,
        error: error?.name === "AbortError" ? "timeout" : "request_failed",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    baseUrl: origin,
    ok: results.every((result) => result.ok),
    passed: results.filter((result) => result.ok).length,
    total: results.length,
    results,
  };
}

async function main() {
  const report = await runProductionSmoke({ baseUrl: process.env.IROTAS_BASE_URL ?? DEFAULT_BASE_URL });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown_error" }));
    process.exitCode = 1;
  });
}
