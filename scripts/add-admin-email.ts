/**
 * 指定メールアドレスを承認済みリストに追加し、登録済みならadminに昇格するスクリプト
 * Usage: npx tsx scripts/add-admin-email.ts
 */
import "./load-env.js";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users, allowedEmails } from "../server/mysql-drizzle/schema";

const TARGET_EMAIL = "irotas.community@gmail.com";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = drizzle(dbUrl);

  // 1. allowedEmailsに追加（既存なら無視）
  const existing = await db
    .select()
    .from(allowedEmails)
    .where(eq(allowedEmails.email, TARGET_EMAIL))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(allowedEmails).values({
      email: TARGET_EMAIL,
      addedBy: 1, // システム追加
      isRegistered: 0,
    });
    console.log(`✅ 承認済みリストに追加: ${TARGET_EMAIL}`);
  } else {
    console.log(`既に承認済みリストに存在: ${TARGET_EMAIL}`);
  }

  // 2. usersテーブルに既にいればadminに昇格
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, TARGET_EMAIL))
    .limit(1);
  if (user.length > 0) {
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.email, TARGET_EMAIL));
    console.log(`✅ adminに昇格: ${TARGET_EMAIL} (id=${user[0].id})`);
  } else {
    console.log(
      `ユーザーはまだ未登録です。登録後に自動でadminになります（最初のユーザーは自動admin）。`,
    );
    console.log(`登録後に再度このスクリプトを実行してください。`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
