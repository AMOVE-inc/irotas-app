import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, allowedEmails, InsertAllowedEmail } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (user.gender !== undefined) {
      values.gender = user.gender;
      updateSet.gender = user.gender;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/** Get user by email address (for email/password login) */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Create a new user with email/password */
export async function createEmailUser(data: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Use email as openId for email/password users (prefixed to avoid collision with OAuth openIds)
  const openId = `email:${data.email}`;
  const now = new Date();

  // オーナーメールアドレスの場合は管理者権限を付与
  const ownerEmail = process.env.OWNER_EMAIL ?? "";
  const isOwner = ownerEmail && data.email.toLowerCase() === ownerEmail.toLowerCase();
  // 既存ユーザーが0人（最初の登録者）の場合も管理者にする
  // LIMIT 1で全件取得を避けパフォーマンス改善
  const firstUserCheck = await db.select({ id: users.id }).from(users).limit(1);
  const isFirstUser = firstUserCheck.length === 0;
  const role = (isOwner || isFirstUser) ? "admin" : "user";

  await db.insert(users).values({
    openId,
    email: data.email,
    name: data.name,
    passwordHash: data.passwordHash,
    loginMethod: "email",
    role,
    lastSignedIn: now,
  });

  return getUserByOpenId(openId);
}

// ===== 審査制メールアドレス管理 =====

/** 承認済みメールアドレスかどうかを確認 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    // DBなしの場合は開発環境とみなし全て許可
    return true;
  }
  const result = await db.select().from(allowedEmails).where(eq(allowedEmails.email, email.toLowerCase())).limit(1);
  return result.length > 0;
}

/** 承認済みメールアドレス一覧を取得 */
export async function getAllowedEmails() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(allowedEmails).orderBy(allowedEmails.createdAt);
}

/** 承認済みメールアドレスを追加 */
export async function addAllowedEmail(data: { email: string; note?: string; addedBy?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const email = data.email.toLowerCase().trim();
  // 重複チェック
  const existing = await db.select().from(allowedEmails).where(eq(allowedEmails.email, email)).limit(1);
  if (existing.length > 0) {
    throw new Error("このメールアドレスは既に登録されています");
  }
  await db.insert(allowedEmails).values({
    email,
    note: data.note ?? null,
    addedBy: data.addedBy ?? null,
    isRegistered: 0,
  });
  const result = await db.select().from(allowedEmails).where(eq(allowedEmails.email, email)).limit(1);
  return result[0];
}

/** 承認済みメールアドレスを削除 */
export async function removeAllowedEmail(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(allowedEmails).where(eq(allowedEmails.id, id));
}

/** 登録完了時にフラグを更新 */
export async function markEmailAsRegistered(email: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(allowedEmails).set({ isRegistered: 1 }).where(eq(allowedEmails.email, email.toLowerCase()));
}

// TODO: add feature queries here as your schema grows.
