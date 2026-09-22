import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync("app/account-deletion.tsx", "utf8");

describe("account deletion satisfaction survey", () => {
  it("shows five descriptive satisfaction choices while preserving numeric values", () => {
    expect(screen).toContain('{ value: 1, label: "とても不満" }');
    expect(screen).toContain('{ value: 2, label: "不満" }');
    expect(screen).toContain('{ value: 3, label: "普通" }');
    expect(screen).toContain('{ value: 4, label: "満足" }');
    expect(screen).toContain('{ value: 5, label: "とても満足" }');
    expect(screen).toContain("setSatisfaction(option.value)");
    expect(screen).toContain('accessibilityRole="radio"');
  });

  it("uses the revised withdrawal copy and asks for an optional satisfaction reason", () => {
    expect(screen).toContain("サブスクリプション決済も自動で休止または解約予約します。");
    expect(screen).toContain("Squareのサブスクリプション決済を次回請求周期から休止します。");
    expect(screen).toContain("現在の決済期間が終了するとアプリへアクセスできなくなります。");
    expect(screen).toContain("休会・退会理由（複数選択可）");
    expect(screen).toContain("よろしければ上記の理由をお聞かせください。（任意）");
    expect(screen).toContain("value={satisfactionReason}");
    expect(screen).toContain('>どのような内容があれば継続・再開を検討しますか？（任意）</Text>');
    expect(screen).toContain('value={continuationCondition} onChangeText={setContinuationCondition} multiline placeholder="内容を入力してください"');
    expect(screen).not.toContain("入会前の期待は満たされましたか？");
    expect(screen).not.toContain("Discordへアクセスできません");
  });
});
