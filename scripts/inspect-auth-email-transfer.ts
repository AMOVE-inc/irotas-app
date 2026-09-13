import "./load-env.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  allowedEmails,
  memberSubscriptions,
  users,
} from "../server/mysql-drizzle/schema";

const email = "kanon1998915@icloud.com";
const discordUserId = "1119606639763390545";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required");

const summarizeUser = (row: typeof users.$inferSelect | undefined) =>
  row
    ? {
        id: row.id,
        name: row.name ?? null,
        role: row.role,
        openIdKind: row.openId.startsWith("email:") ? "email" : "other",
        emailMatchesRequested: row.email === email,
        hasPassword: Boolean(row.passwordHash),
        loginMethod: row.loginMethod ?? null,
      }
    : null;

async function main() {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const db = drizzle(databaseUrl);
  const sources = await db.select().from(users).where(eq(users.email, email));
  const subscriptions = await db
    .select()
    .from(memberSubscriptions)
    .where(eq(memberSubscriptions.discordUserId, discordUserId));
  const targetUserId = subscriptions[0]?.userId;
  const targets = targetUserId
    ? await db.select().from(users).where(eq(users.id, targetUserId))
    : [];
  const allowed = await db
    .select()
    .from(allowedEmails)
    .where(eq(allowedEmails.email, email));

  console.log(
  JSON.stringify(
    {
      sourceCount: sources.length,
      source: summarizeUser(sources[0]),
      targetSubscriptionCount: subscriptions.length,
      targetSubscription: subscriptions.map((subscription) => ({
        id: subscription.id,
        memberId: subscription.memberId,
        discordName: subscription.discordName ?? null,
        hasUserId: subscription.userId !== null,
      })),
      targetCount: targets.length,
      target: summarizeUser(targets[0]),
      targetHasDifferentEmail:
        targets[0]?.email !== null && targets[0]?.email !== email,
      allowedEmail: allowed.map((row) => ({
        accessRole: row.accessRole,
        isRegistered: row.isRegistered,
      })),
      sourceAndTargetSame: sources[0]?.id === targets[0]?.id,
    },
    null,
    2,
  ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
