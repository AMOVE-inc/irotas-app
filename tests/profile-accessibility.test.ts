import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileSource = readFileSync("app/(tabs)/profile.tsx", "utf8");

describe("profile accessibility", () => {
  it("exposes profile menu rows as named buttons", () => {
    expect(profileSource).toContain('accessibilityRole="button"');
    expect(profileSource).toContain(
      'accessibilityLabel={item.badge ? `${item.label}、${item.badge}` : item.label}',
    );
    expect(profileSource).toContain('accessibilityHint={`${item.label}を開きます`}');
  });

  it("names the main profile actions for assistive technology", () => {
    expect(profileSource).toContain('accessibilityLabel="プロフィール編集"');
    expect(profileSource).toContain('accessibilityLabel="プロフィールを保存"');
    expect(profileSource).toContain('accessibilityLabel="プロフィール編集をキャンセル"');
    expect(profileSource).toContain('accessibilityLabel="ログアウト"');
  });
});
