import { describe, expect, it } from "vitest";
import { buildMemberImportDryRun, decodeCsvBuffer, exportMemberImportCsv, parseSourceCsv } from "../lib/member-import-dry-run";

const subscriptionHeader = [
  "サブスクリプションID",
  "作成日",
  "顧客名",
  "お客さまメールアドレス",
  "ステータス",
  "プランID",
  "プラン名",
  "最終請求日",
  "請求ステータス",
  "次の請求日",
  "キャンセル日",
].join("\t");

const subscriptionCsv = [
  subscriptionHeader,
  "sub-old\t2024-01-01\t旧会員\tmember@example.com\tキャンセル済み\tplan-1\tIRO+ 第1期会員\t2024-02-01\t支払済み\t\t2024-02-02",
  "sub-live\t2024-03-01\t現会員\tMEMBER@example.com\t有効\tplan-2\tIRO+ 第2期メンバー\t2026-08-01\t支払済み\t2026-09-01\t",
  "sub-pause\t2024-02-01\t休止会員\tpaused@example.com\t一時停止中\tplan-3\tIRO+ 第3期メンバー\t2026-08-01\t支払済み\t2026-09-01\t",
].join("\r\n");

const discordCsv = [
  "ユーザーID,ユーザー名,ニックネーム,メールアドレス,全ロールID,全ロール名,サーバー参加日,状態",
  '123456789012345678,user1,アプリ表示名,member@example.com,"r1|r2","第2期メンバー|ゴールド|イベント大賞",2024-03-02,有効',
  "123456789012345679,user2,,paused@example.com,r3,第3期メンバー,2024-02-02,有効",
].join("\r\n");

const customerCsv = [
  "メールアドレス,Square の顧客 ID",
  "member@example.com,CUSTOMER-1",
  "paused@example.com,CUSTOMER-2",
].join("\r\n");

describe("member migration dry run", () => {
  it("parses tab-separated Square exports and quoted Discord rows", () => {
    expect(parseSourceCsv(subscriptionCsv)).toHaveLength(3);
    expect(parseSourceCsv(discordCsv)[0]["ニックネーム"]).toBe("アプリ表示名");
  });

  it("decodes UTF-16LE exports with a BOM", () => {
    const encoded = new Uint8Array([0xff, 0xfe, ...new Uint8Array(Buffer.from("A\tB\r\n1\t2", "utf16le"))]);
    expect(decodeCsvBuffer(encoded.buffer)).toContain("A\tB");
  });

  it("prefers an active subscription, assigns oldest-first member IDs, and keeps badges", () => {
    const result = buildMemberImportDryRun(subscriptionCsv, discordCsv, customerCsv);
    const current = result.candidates.find((candidate) => candidate.billing_email === "member@example.com");
    const paused = result.candidates.find((candidate) => candidate.billing_email === "paused@example.com");

    expect(result.summary.uniqueSubscriptionEmails).toBe(2);
    expect(current).toMatchObject({
      square_subscription_id: "sub-live",
      display_name: "アプリ表示名",
      member_term: "第2期",
      member_rank: "gold",
      achievement_badges: "イベント大賞",
      access_status: "active",
      member_id: "IRO0002",
    });
    expect(paused).toMatchObject({ access_status: "paused", member_id: "IRO0001" });
  });

  it("exports a reviewable CSV without losing commas or quotes", () => {
    const result = buildMemberImportDryRun(subscriptionCsv, discordCsv, customerCsv);
    const csv = exportMemberImportCsv(result.candidates);
    expect(csv).toContain("member_id,subscription_created_at");
    expect(csv).toContain("CUSTOMER-1");
  });
});
