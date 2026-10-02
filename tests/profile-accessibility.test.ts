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

  it("uses an in-app logout confirmation that works in embedded browsers", () => {
    expect(profileSource).toContain("showLogoutConfirmation");
    expect(profileSource).toContain("本当にログアウトしますか？");
    expect(profileSource).not.toContain("window.confirm");
  });

  it("shows profile save progress and closes without a blocking success alert", () => {
    expect(profileSource).toContain('saving ? "保存中…" : "保存"');
    expect(profileSource).toContain("disabled={saving}");
    expect(profileSource).toContain("accessibilityState={{ disabled: saving, busy: saving }}");
    expect(profileSource).not.toContain('Alert.alert("保存完了", "プロフィールを更新しました")');
    expect(profileSource).toContain("onDetailsChange?.(details);\n      onClose();\n      if (serverBacked) void onServerSaved?.().catch(() => undefined);");
  });
});
