/**
 * 指定したメールアドレスのユーザーをadminに設定するスクリプト
 * Usage: npx tsx scripts/set-admin.ts
 */
import "./load-env.js";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users } from "../server/mysql-drizzle/schema";

const TARGET_EMAIL = "irotas.community@gmail.com";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = drizzle(dbUrl);

  // まず対象ユーザーを確認
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, TARGET_EMAIL))
    .limit(1);
  if (existing.length === 0) {
    console.log(`ユーザーが見つかりません: ${TARGET_EMAIL}`);
    console.log(
      "このメールアドレスでまず登録してからもう一度実行してください。",
    );
    process.exit(1);
  }

  const user = existing[0];
  console.log(
    `対象ユーザー: id=${user.id}, email=${user.email}, 現在のrole=${user.role}`,
  );

  // roleをadminに更新
  await db
    .update(users)
    .set({ role: "admin" })
    .where(eq(users.email, TARGET_EMAIL));

  // 確認
  const updated = await db
    .select()
    .from(users)
    .where(eq(users.email, TARGET_EMAIL))
    .limit(1);
  console.log(`更新後のrole: ${updated[0]?.role}`);
  console.log("✅ 管理者設定が完了しました");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
