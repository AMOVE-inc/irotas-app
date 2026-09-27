import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchPendingPushNotifications } from "../sites/push-notifications";

class PushDb {
  updates: unknown[][] = [];
  prepare(sql: string) {
    const db = this;
    return {
      values: [] as unknown[],
      bind(...values: unknown[]) { this.values = values; return this; },
      async all() {
        if (sql.includes("FROM in_app_notifications")) return { results: [{ notification_id: "n1", token: "ExponentPushToken[test]", type: "chat", title: "新着", body: "本文", target_path: "/chat?id=r1", chat_room_id: "r1", event_id: null, preferences_json: '{"chat_message":true}' }] };
        return { results: [] };
      },
      async run() { db.updates.push([sql, ...this.values]); return { success: true }; },
      async first() { return null; },
    };
  }
  async batch(statements: { run(): Promise<unknown> }[]) { for (const statement of statements) await statement.run(); return []; }
}

describe("push notification delivery", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends the server notification with its deep link and records delivery", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = new PushDb();
    await expect(dispatchPendingPushNotifications(db as never)).resolves.toBe(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(payload[0]).toMatchObject({ to: "ExponentPushToken[test]", data: { targetPath: "/chat?id=r1" } });
    expect(db.updates.some((entry) => String(entry[0]).includes("status=?"))).toBe(true);
  });
});

