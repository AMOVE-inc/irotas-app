import { describe, expect, it } from "vitest";
import {
  allowedPrivateClubCategories,
  filterBoardArchive,
} from "../sites/board-archive";
import type { RawDiscordBoardArchive } from "../lib/discord-board-import";
import type { D1Database, D1PreparedStatement } from "../sites/platform-types";

const fixture: RawDiscordBoardArchive = {
  threads: [
    { id: "public", authorId: "1", authorName: "公開", content: "公開本文", createdAt: "2026-01-01", images: [], videos: [], category: "club-all", title: "活動報告" },
    { id: "bread", authorId: "2", authorName: "パン", content: "パン部限定", createdAt: "2026-01-02", images: [], videos: [], category: "club-club-bread", title: "パン部" },
    { id: "wine", authorId: "3", authorName: "ワイン", content: "ワイン部限定", createdAt: "2026-01-03", images: [], videos: [], category: "club-club-wine", title: "ワイン部" },
    { id: "gourmet-event", authorId: "4", authorName: "幹事", content: "イベント募集", createdAt: "2026-01-04", images: [], videos: [], category: "gourmet-board-kanto", title: "グルメ会" },
  ],
  comments: [
    { id: "c1", threadId: "public", authorId: "1", authorName: "公開", content: "公開コメント", createdAt: "2026-01-01", images: [], videos: [] },
    { id: "c2", threadId: "bread", authorId: "2", authorName: "パン", content: "パン部コメント", createdAt: "2026-01-02", images: [], videos: [] },
    { id: "c3", threadId: "wine", authorId: "3", authorName: "ワイン", content: "ワイン部コメント", createdAt: "2026-01-03", images: [], videos: [] },
    { id: "c4", threadId: "gourmet-event", authorId: "4", authorName: "幹事", content: "参加希望", createdAt: "2026-01-04", images: [], videos: [] },
  ],
};

function membershipDatabase(options: {
  clubId?: string;
  membershipStatus?: "pending" | "approved" | "rejected";
  isLeader?: boolean;
}) {
  let preparedSql = "";
  const db: D1Database = {
    prepare(sql) {
      preparedSql = sql;
      const statement: D1PreparedStatement = {
        bind() { return statement; },
        async first<T>() { return null as T | null; },
        async run() { return { success: true }; },
        async all<T>() {
          const visible = options.isLeader || options.membershipStatus === "approved";
          return {
            success: true,
            results: visible && options.clubId ? [{ id: options.clubId } as T] : [],
          };
        },
      };
      return statement;
    },
    async batch() { return []; },
  };
  return { db, sql: () => preparedSql };
}

describe("authenticated board archive filtering", () => {
  it("未入部ユーザーには部員専用スレとコメントを返さない", () => {
    const result = filterBoardArchive(fixture, new Set());
    expect(result.threads.map((thread) => thread.id)).toEqual(["public"]);
    expect(result.comments.map((comment) => comment.id)).toEqual(["c1"]);
  });

  it("入部済みの部活動だけを返す", () => {
    const result = filterBoardArchive(fixture, new Set(["club-club-bread"]));
    expect(result.threads.map((thread) => thread.id)).toEqual(["public", "bread"]);
    expect(result.comments.map((comment) => comment.id)).toEqual(["c1", "c2"]);
    expect(JSON.stringify(result)).not.toContain("ワイン部限定");
  });
});

describe("club archive permission states", () => {
  it("未入部ユーザーには部員専用カテゴリを許可しない", async () => {
    const scenario = membershipDatabase({});
    await expect(allowedPrivateClubCategories(scenario.db, 10)).resolves.toEqual(new Set());
  });

  it("申請中ユーザーには承認前の部員専用カテゴリを許可しない", async () => {
    const scenario = membershipDatabase({ clubId: "club-bread", membershipStatus: "pending" });
    await expect(allowedPrivateClubCategories(scenario.db, 11)).resolves.toEqual(new Set());
    expect(scenario.sql()).toContain("cm.status = 'approved'");
  });

  it("入部済みユーザーには承認された部活動だけを許可する", async () => {
    const scenario = membershipDatabase({ clubId: "club-bread", membershipStatus: "approved" });
    await expect(allowedPrivateClubCategories(scenario.db, 12)).resolves.toEqual(
      new Set(["club-club-bread"]),
    );
  });

  it("部長には担当する部活動だけを許可する", async () => {
    const scenario = membershipDatabase({ clubId: "club-bread", isLeader: true });
    const allowed = await allowedPrivateClubCategories(scenario.db, 13);
    expect(allowed).toEqual(new Set(["club-club-bread"]));
    expect(allowed.has("club-club-wine")).toBe(false);
  });
});
