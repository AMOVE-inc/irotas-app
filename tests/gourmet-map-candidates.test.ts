import { afterEach, describe, expect, it, vi } from "vitest";
import { inferGourmetMapCategory, mealReportCandidateFromData, reconcileMealReportCandidate } from "../sites/gourmet-map-community";
import type { D1Database, D1PreparedStatement, SitesEnv } from "../sites/platform-types";

type Candidate = Record<string, unknown> & { id: string; source_thread_id: string; place_id: string | null; status: string; member_comment: string };

function candidateDatabase(initial: Candidate[]) {
  const candidates = initial.map((row) => ({ ...row }));
  const prepare = (sql: string): D1PreparedStatement => {
    let values: unknown[] = [];
    return {
      bind(...next) { values = next; return this; },
      async first<T>() {
        if (sql.includes("google_maps_api_usage")) return { request_count: 1 } as T;
        if (sql.includes("WHERE source_thread_id = ?")) {
          const row = candidates.find((candidate) => candidate.source_thread_id === values[0]);
          return (row ? { ...row } : null) as T | null;
        }
        if (sql.includes("WHERE place_id = ? AND status = 'published'")) {
          const row = candidates.find((candidate) => candidate.place_id === values[0] && candidate.status === "published");
          return (row ? { ...row } : null) as T | null;
        }
        return null;
      },
      async all<T>() {
        if (sql.includes("SELECT member_comment FROM gourmet_map_candidates")) {
          return { success: true, results: candidates.filter((row) => row.place_id === values[0] && row.status === "published" && row.id !== values[1]).map((row) => ({ member_comment: row.member_comment })) as T[] };
        }
        return { success: true, results: [] as T[] };
      },
      async run() {
        if (sql.includes("SET status = 'ineligible'")) {
          const row = candidates.find((candidate) => candidate.id === values[1]);
          if (row) row.status = "ineligible";
        } else if (sql.includes("SET place_id = ?, status = 'published'")) {
          const row = candidates.find((candidate) => candidate.id === values[4]);
          if (row) { row.place_id = String(values[0]); row.status = "published"; }
        }
        return { success: true };
      },
    };
  };
  const db: D1Database = { prepare, async batch<T>(statements: D1PreparedStatement[]) { return Promise.all(statements.map((statement) => statement.run<T>())); } };
  return db;
}

afterEach(() => vi.restoreAllMocks());

describe("gourmet map candidate policy", () => {
  it("extracts an eligible four-star meal report and its member comment", () => {
    const candidate = mealReportCandidateFromData(JSON.stringify({
      images: ["/api/board-media/photo.webp"],
      mealReport: {
        restaurantName: "テスト店",
        areaDisplay: "渋谷",
        rating: 4,
        comment: "また行きたいです",
        googleMapUrl: "https://maps.app.goo.gl/example",
      },
    }));
    expect(candidate).toMatchObject({ restaurantName: "テスト店", area: "渋谷", rating: 4, comment: "また行きたいです" });
  });

  it("keeps a lower rating available for recalculation instead of treating it as eligible", () => {
    const candidate = mealReportCandidateFromData(JSON.stringify({ mealReport: {
      restaurantName: "テスト店", prefecture: "東京都", rating: 3, googleMapUrl: "https://maps.app.goo.gl/example",
    } }));
    expect(candidate?.rating).toBe(3);
  });

  it("rejects malformed report data", () => {
    expect(mealReportCandidateFromData("{}")) .toBeNull();
    expect(mealReportCandidateFromData("not-json")).toBeNull();
  });

  it("maps Google place types to the matching saved-list category", () => {
    expect(inferGourmetMapCategory({ primaryType: "italian_restaurant" }, "テスト店")).toBe("イタリアン");
    expect(inferGourmetMapCategory({ types: ["bar", "restaurant"] }, "テスト店")).toBe("バー");
    expect(inferGourmetMapCategory({ primaryTypeDisplayName: { text: "スペイン料理店" } }, "テスト店")).toBe("スペイン料理");
  });

  it("uses the restaurant name as a fallback and keeps unknown stores reviewable", () => {
    expect(inferGourmetMapCategory({}, "銀座 鮨いろは")).toBe("寿司");
    expect(inferGourmetMapCategory({}, "名前だけの店舗")).toBe("創作料理・イノベーティブ");
  });

  it("rebuilds a shared place without a deleted report's stale member comment", async () => {
    const base = {
      report_title: "ごちそうさま報告", restaurant_name: "テスト店", area: "渋谷", member_rating: 5,
      google_maps_url: "https://maps.app.goo.gl/example", image_url: null, created_at: "2026-01-01", updated_at: "2026-01-01",
    };
    const db = candidateDatabase([
      { ...base, id: "candidate-1", source_thread_id: "thread-1", place_id: "place-1", status: "published", member_comment: "削除する感想" },
      { ...base, id: "candidate-2", source_thread_id: "thread-2", place_id: "place-1", status: "published", member_comment: "残す感想" },
    ]);
    const feedPayloads: Array<Record<string, any>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("places.googleapis.com")) return Response.json({ places: [{ id: "place-1", displayName: { text: "テスト店" }, primaryType: "japanese_restaurant" }] });
      feedPayloads.push(JSON.parse(String(init?.body)));
      return Response.json({ success: true });
    }));
    const env = {
      DB: db, GOOGLE_MAPS_API_KEY: "test-key", GOURMET_MAP_FEED_URL: "https://feed.example.test",
      ASSETS: { fetch: async () => new Response("not used") },
    } satisfies SitesEnv;

    await reconcileMealReportCandidate(db, env, {
      threadId: "thread-1", title: "削除済み", content: "", dataJson: "{}", deleted: true, actorMemberId: 7,
    });

    expect(feedPayloads).toHaveLength(1);
    expect(feedPayloads[0].action).toBe("upsertMealReport");
    expect(feedPayloads[0].payload.memberComment).toBe("残す感想");
    expect(feedPayloads[0].payload.memberComment).not.toContain("削除する感想");
  });
});
