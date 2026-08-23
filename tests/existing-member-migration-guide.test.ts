import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guide = readFileSync("docs/operations/existing-member-migration-guide.md", "utf8");

describe("existing member migration guide", () => {
  it("contains the production registration and login paths", () => {
    expect(guide).toContain("chatgpt.site/register");
    expect(guide).toContain("chatgpt.site/login");
    expect(guide).toContain("Square決済時のメールアドレス");
    expect(guide).toContain("6桁の認証コード");
    expect(guide).toContain("有効期限は10分");
  });

  it("protects credentials and personal information", () => {
    expect(guide).toContain("コードやパスワードは誰にも共有しない");
    expect(guide).toContain("公開チャットへメールアドレスを投稿しない");
    expect(guide).toContain("メールアドレス一覧や認証コードをNotion");
  });

  it("uses a staged rollout and defines closure", () => {
    expect(guide).toContain("少人数へ先行");
    expect(guide).toContain("一般会員のテストグループ");
    expect(guide).toContain("3日後・7日後");
    expect(guide).toContain("完了条件");
  });
});
