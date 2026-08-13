import { and, desc, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, allowedEmails, InsertAllowedEmail, memberSubscriptions, squareWebhookEvents, emailVerificationCodes, events, eventParticipations, eventOrganizers, migrationImports, eventFavorites, privateMemberNotes, appRoles, externalRoleMappings, memberRoleAssignments, chatRooms, chatMessages, type InsertMemberSubscription } from "../drizzle/schema";
import { accessStateForBilling, accessStatusForSquareStatus, canAccessMemberApp, canBypassSubscription, type SquareSubscriptionStatus, type SubscriptionExemptRole } from "../lib/membership-access";
import { validateMigrationCsv, type MigrationImportType } from "../lib/migration-csv";
import { classifyRoleName, isAchievementRole, parseDiscordRoles, roleKey, type AppRoleCategory } from "../lib/role-migration";
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
    if (user.branch !== undefined) {
      values.branch = user.branch;
      updateSet.branch = user.branch;
    }
    if (user.branches !== undefined) {
      values.branches = user.branches;
      updateSet.branches = user.branches;
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

  const result = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
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
  const normalizedEmail = data.email.toLowerCase().trim();
  const openId = `email:${normalizedEmail}`;
  const now = new Date();

  // 管理者権限はオーナー、または既存管理者が明示的に管理者として承認したメールだけに付与する。
  const ownerEmail = process.env.OWNER_EMAIL ?? "";
  const isOwner = ownerEmail && data.email.toLowerCase() === ownerEmail.toLowerCase();
  const invitation = await getAllowedEmailByEmail(normalizedEmail);
  const role = isOwner || invitation?.accessRole === "admin"
    ? "admin"
    : invitation?.accessRole === "operator"
      ? "operator"
      : "user";

  await db.insert(users).values({
    openId,
    email: normalizedEmail,
    name: data.name,
    passwordHash: data.passwordHash,
    loginMethod: "email",
    role,
    lastSignedIn: now,
  });

  const user = await getUserByOpenId(openId);
  if (user) {
    const importedMembership = await getMembershipByBillingEmail(normalizedEmail);
    await db.update(memberSubscriptions).set({ userId: user.id }).where(eq(memberSubscriptions.billingEmail, normalizedEmail));
    if (importedMembership?.discordUserId) {
      await db.update(eventParticipations).set({ userId: user.id, needsReview: 0 }).where(eq(eventParticipations.discordUserId, importedMembership.discordUserId));
      await db.update(eventOrganizers).set({ userId: user.id, needsReview: 0 }).where(eq(eventOrganizers.discordUserId, importedMembership.discordUserId));
    }
  }
  return user;
}

export async function getMembershipByBillingEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = email.toLowerCase().trim();
  const result = await db.select().from(memberSubscriptions).where(eq(memberSubscriptions.billingEmail, normalized)).limit(1);
  return result[0];
}

export async function getMembershipByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(memberSubscriptions).where(eq(memberSubscriptions.userId, userId)).limit(1);
  return result[0];
}

export async function listAchievementBadges(userId: number): Promise<string[]> {
  const membership = await getMembershipByUserId(userId);
  return membership?.achievementBadges ?? [];
}

export async function getMemberIdentity(userId: number) {
  const membership = await getMembershipByUserId(userId);
  if (!membership) return null;
  return { memberId: membership.memberId, displayName: membership.displayName, achievementBadges: membership.achievementBadges ?? [] };
}

/** 退会・停止済みを除いた会員ディレクトリ。メール等の決済情報は返さない。 */
export async function listActiveMemberDirectory() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    userId: memberSubscriptions.userId,
    memberId: memberSubscriptions.memberId,
    displayName: memberSubscriptions.displayName,
    memberRank: memberSubscriptions.memberRank,
    memberTerm: memberSubscriptions.memberTerm,
    achievementBadges: memberSubscriptions.achievementBadges,
    accessStatus: memberSubscriptions.accessStatus,
    graceUntilDate: memberSubscriptions.graceUntilDate,
    userRole: users.role,
    accessRole: allowedEmails.accessRole,
  }).from(memberSubscriptions)
    .leftJoin(users, eq(users.id, memberSubscriptions.userId))
    .leftJoin(allowedEmails, eq(allowedEmails.email, memberSubscriptions.billingEmail))
    .where(or(
      eq(memberSubscriptions.accessStatus, "active"),
      eq(memberSubscriptions.accessStatus, "grace"),
      eq(users.role, "admin"),
      eq(users.role, "operator"),
      eq(allowedEmails.accessRole, "admin"),
      eq(allowedEmails.accessRole, "operator"),
      eq(allowedEmails.accessRole, "club_leader"),
    ));
  const now = new Date();
  return rows.filter((row) => canBypassSubscription(row.userRole, row.accessRole as SubscriptionExemptRole) || row.accessStatus === "active" || Boolean(row.graceUntilDate && row.graceUntilDate.getTime() >= now.getTime())).map(({ accessStatus: _accessStatus, graceUntilDate: _graceUntilDate, userRole: _userRole, accessRole: _accessRole, ...row }) => row);
}

export async function memberHasAppAccess(userId: number): Promise<boolean> {
  if (await userHasSubscriptionExemption(userId)) return true;
  const membership = await getMembershipByUserId(userId);
  return canAccessMemberApp(membership);
}

export async function userHasSubscriptionExemption(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ role: users.role, accessRole: allowedEmails.accessRole })
    .from(users)
    .leftJoin(allowedEmails, eq(allowedEmails.email, users.email))
    .where(eq(users.id, userId))
    .limit(1);
  return canBypassSubscription(result[0]?.role, result[0]?.accessRole as SubscriptionExemptRole);
}

export async function upsertImportedMembership(data: InsertMemberSubscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const billingEmail = data.billingEmail.toLowerCase().trim();
  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, billingEmail)).limit(1);
  const userId = data.userId ?? existingUser[0]?.id ?? null;
  await db.insert(memberSubscriptions).values({ ...data, billingEmail, userId }).onDuplicateKeyUpdate({ set: {
    userId,
    memberId: data.memberId,
    discordUserId: data.discordUserId,
    discordName: data.discordName,
    discordRoles: data.discordRoles,
    achievementBadges: data.achievementBadges,
    discordJoinedAt: data.discordJoinedAt,
    displayName: data.displayName,
    memberTerm: data.memberTerm,
    memberRank: data.memberRank,
    squareCustomerId: data.squareCustomerId,
    squareSubscriptionId: data.squareSubscriptionId,
    subscriptionRegisteredAt: data.subscriptionRegisteredAt,
    squareStatus: data.squareStatus,
    billingStatus: data.billingStatus,
    overdueSince: data.overdueSince,
    accessStatus: data.accessStatus,
    paidUntilDate: data.paidUntilDate,
    graceUntilDate: data.graceUntilDate,
    lastSquareSyncedAt: data.lastSquareSyncedAt,
  } });
  if (userId && data.discordUserId) {
    await db.update(eventParticipations).set({ userId, needsReview: 0 }).where(eq(eventParticipations.discordUserId, data.discordUserId));
    await db.update(eventOrganizers).set({ userId, needsReview: 0 }).where(eq(eventOrganizers.discordUserId, data.discordUserId));
  }
  const allowed = await db.select().from(allowedEmails).where(eq(allowedEmails.email, billingEmail)).limit(1);
  if (allowed.length === 0) await db.insert(allowedEmails).values({ email: billingEmail, note: "決済会員CSVから登録", isRegistered: 0 });
}

export async function syncSquareSubscription(subscriptionId: string, status: SquareSubscriptionStatus, paidUntilDate?: string | null, customerId?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const where = customerId
    ? or(eq(memberSubscriptions.squareSubscriptionId, subscriptionId), eq(memberSubscriptions.squareCustomerId, customerId))
    : eq(memberSubscriptions.squareSubscriptionId, subscriptionId);
  const existing = (await db.select().from(memberSubscriptions).where(where).limit(1))[0];
  const state = accessStateForBilling(status, existing?.billingStatus, existing?.overdueSince);
  await db.update(memberSubscriptions).set({
    squareStatus: status,
    accessStatus: state.accessStatus,
    graceUntilDate: state.graceUntilDate,
    paidUntilDate: paidUntilDate ? new Date(`${paidUntilDate.slice(0, 10)}T00:00:00+09:00`) : undefined,
    suspendedAt: status === "ACTIVE" ? null : new Date(),
    lastSquareSyncedAt: new Date(),
  }).where(where);
}

export async function updateMembershipFromSquare(data: {
  billingEmail: string;
  customerId: string;
  subscriptionId: string;
  planVariationId?: string | null;
  status: SquareSubscriptionStatus;
  paidUntilDate?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getMembershipByBillingEmail(data.billingEmail);
  const state = accessStateForBilling(data.status, existing?.billingStatus, existing?.overdueSince);
  await db.update(memberSubscriptions).set({
    squareCustomerId: data.customerId,
    squareSubscriptionId: data.subscriptionId,
    squarePlanVariationId: data.planVariationId ?? null,
    squareStatus: data.status,
    accessStatus: state.accessStatus,
    graceUntilDate: state.graceUntilDate,
    paidUntilDate: data.paidUntilDate ? new Date(`${data.paidUntilDate.slice(0, 10)}T00:00:00+09:00`) : null,
    suspendedAt: data.status === "ACTIVE" ? null : new Date(),
    lastSquareSyncedAt: new Date(),
  }).where(eq(memberSubscriptions.billingEmail, data.billingEmail.toLowerCase().trim()));
  return getMembershipByBillingEmail(data.billingEmail);
}

/** 支払失敗日から7日間だけログインを許可し、その後は自動的に失効する。 */
export async function markMembershipInvoiceOverdue(customerId: string, failedAt = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const state = accessStateForBilling("ACTIVE", "OVERDUE", failedAt);
  await db.update(memberSubscriptions).set({
    billingStatus: "OVERDUE",
    overdueSince: failedAt,
    accessStatus: state.accessStatus,
    graceUntilDate: state.graceUntilDate,
    lastSquareSyncedAt: new Date(),
  }).where(eq(memberSubscriptions.squareCustomerId, customerId));
}

/** 入金確認後は期限超過状態を解除する。停止中契約は解除しない。 */
export async function markMembershipInvoicePaid(customerId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const membership = (await db.select().from(memberSubscriptions).where(eq(memberSubscriptions.squareCustomerId, customerId)).limit(1))[0];
  if (!membership) return;
  const state = accessStateForBilling(membership.squareStatus, "PAID", null);
  await db.update(memberSubscriptions).set({
    billingStatus: "PAID",
    overdueSince: null,
    accessStatus: state.accessStatus,
    graceUntilDate: null,
    suspendedAt: state.accessStatus === "suspended" ? new Date() : null,
    lastSquareSyncedAt: new Date(),
  }).where(eq(memberSubscriptions.id, membership.id));
}

export async function suspendUnverifiedMembership(billingEmail: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(memberSubscriptions).set({
    squareStatus: "UNKNOWN",
    accessStatus: "suspended",
    suspendedAt: new Date(),
    lastSquareSyncedAt: new Date(),
  }).where(eq(memberSubscriptions.billingEmail, billingEmail.toLowerCase().trim()));
  return getMembershipByBillingEmail(billingEmail);
}

export async function claimSquareWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(squareWebhookEvents).where(eq(squareWebhookEvents.eventId, eventId)).limit(1);
  if (existing.length > 0) return false;
  await db.insert(squareWebhookEvents).values({ eventId, eventType });
  return true;
}

export async function releaseSquareWebhookEvent(eventId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(squareWebhookEvents).where(eq(squareWebhookEvents.eventId, eventId));
}

export async function createEmailVerificationCode(email: string, codeHash: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(emailVerificationCodes).values({ email: email.toLowerCase().trim(), codeHash, expiresAt });
}

export async function getLatestEmailVerificationCode(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.email, email.toLowerCase().trim())).orderBy(desc(emailVerificationCodes.createdAt)).limit(1);
  return result[0];
}

export async function consumeEmailVerificationCode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(emailVerificationCodes).set({ consumedAt: new Date() }).where(eq(emailVerificationCodes.id, id));
}

function asDateTime(dateValue: string, timeValue = "00:00") {
  const parsed = new Date(`${dateValue}T${timeValue || "00:00"}:00+09:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`日付を解析できません: ${dateValue} ${timeValue}`);
  return parsed;
}

export async function importMigrationCsv(type: MigrationImportType, csvText: string, filename: string, importedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { rows, missing } = validateMigrationCsv(type, csvText);
  if (missing.length > 0) throw new Error(`必須列がありません: ${missing.join(", ")}`);
  let importedCount = 0;
  let reviewCount = 0;
  for (const row of rows) {
    if (type === "role_mappings") {
      const source = row.source === "square_plan" ? "square_plan" : "discord_role";
      const allowedCategories: AppRoleCategory[] = ["operator", "branch", "generation", "club", "rank", "other"];
      const category = allowedCategories.includes(row.category as AppRoleCategory) ? row.category as AppRoleCategory : "other";
      const normalizedKey = row.role_key || roleKey(category, row.external_id, row.role_name);
      await db.insert(appRoles).values({ roleKey: normalizedKey, displayName: row.role_name, category }).onDuplicateKeyUpdate({ set: { displayName: row.role_name, category } });
      const appRole = await db.select().from(appRoles).where(eq(appRoles.roleKey, normalizedKey)).limit(1);
      await db.insert(externalRoleMappings).values({ source, externalId: row.external_id, appRoleId: appRole[0].id }).onDuplicateKeyUpdate({ set: { appRoleId: appRole[0].id } });
    } else if (type === "members") {
      const status = (["PENDING", "ACTIVE", "CANCELED", "DEACTIVATED", "PAUSED", "COMPLETED"] as const).includes(row.subscription_status as any) ? row.subscription_status as SquareSubscriptionStatus : "UNKNOWN";
      const parsedRoles = parseDiscordRoles(row.discord_roles || "");
      const achievementBadges = row.achievement_badges
        ? row.achievement_badges.split(/[|;]/).map((badge) => badge.trim()).filter(Boolean)
        : parsedRoles.filter((role) => isAchievementRole(role.name)).map((role) => role.name);
      const state = accessStateForBilling(status, row.billing_status, row.overdue_since || null);
      await upsertImportedMembership({
        memberId: row.member_id || null,
        billingEmail: row.billing_email,
        discordUserId: row.discord_user_id,
        discordName: row.discord_name || null,
        discordRoles: parsedRoles.map((role) => `${role.externalId}:${role.name}`),
        achievementBadges,
        discordJoinedAt: row.discord_joined_at ? new Date(`${row.discord_joined_at.slice(0, 10)}T00:00:00+09:00`) : null,
        displayName: row.display_name || row.discord_name,
        memberTerm: row.member_term || null,
        memberRank: row.member_rank || null,
        squareCustomerId: row.square_customer_id || null,
        squareSubscriptionId: row.square_subscription_id || null,
        subscriptionRegisteredAt: row.subscription_created_at ? new Date(row.subscription_created_at) : null,
        squareStatus: status,
        billingStatus: row.billing_status || null,
        overdueSince: row.overdue_since ? new Date(`${row.overdue_since.slice(0, 10)}T00:00:00+09:00`) : null,
        accessStatus: state.accessStatus,
        graceUntilDate: row.grace_until_date ? new Date(`${row.grace_until_date.slice(0, 10)}T00:00:00+09:00`) : state.graceUntilDate,
        paidUntilDate: row.paid_until_date ? new Date(`${row.paid_until_date.slice(0, 10)}T00:00:00+09:00`) : null,
        lastSquareSyncedAt: status === "UNKNOWN" ? null : new Date(),
      });
      const membership = (await db.select().from(memberSubscriptions).where(eq(memberSubscriptions.billingEmail, row.billing_email.toLowerCase().trim())).limit(1))[0];
      for (const role of parsedRoles) {
        const category = classifyRoleName(role.name);
        const normalizedKey = roleKey(category, role.externalId, role.name);
        await db.insert(appRoles).values({ roleKey: normalizedKey, displayName: role.name, category, metadata: { badge: isAchievementRole(role.name) } }).onDuplicateKeyUpdate({ set: { displayName: role.name, category, metadata: { badge: isAchievementRole(role.name) } } });
        const appRole = (await db.select().from(appRoles).where(eq(appRoles.roleKey, normalizedKey)).limit(1))[0];
        await db.insert(externalRoleMappings).values({ source: "discord_role", externalId: role.externalId, appRoleId: appRole.id }).onDuplicateKeyUpdate({ set: { appRoleId: appRole.id } });
        await db.insert(memberRoleAssignments).values({ memberSubscriptionId: membership.id, userId: membership.userId, appRoleId: appRole.id, source: "discord", externalId: role.externalId }).onDuplicateKeyUpdate({ set: { userId: membership.userId, externalId: role.externalId, isActive: 1, endedAt: null } });
      }
    } else if (type === "announcements") {
      let room = (await db.select().from(chatRooms).where(eq(chatRooms.sourceId, "announcement")).limit(1))[0];
      if (!room) {
        await db.insert(chatRooms).values({ name: "運営アナウンス", type: "board", sourceId: "announcement", createdBy: importedBy });
        room = (await db.select().from(chatRooms).where(eq(chatRooms.sourceId, "announcement")).limit(1))[0];
      }
      const membership = row.discord_user_id
        ? (await db.select().from(memberSubscriptions).where(eq(memberSubscriptions.discordUserId, row.discord_user_id)).limit(1))[0]
        : undefined;
      const attachmentUrls = (row.attachment_urls || "").split(/[|;]/).map((url) => url.trim()).filter(Boolean);
      await db.insert(chatMessages).values({
        roomId: room.id,
        userId: membership?.userId ?? importedBy,
        content: row.content,
        externalMessageId: row.message_id,
        externalChannelId: row.channel_id,
        externalAuthorId: row.discord_user_id || null,
        externalAuthorName: row.author_name,
        attachmentUrls,
        source: "discord",
        createdAt: new Date(row.created_at),
      }).onDuplicateKeyUpdate({ set: {
        content: row.content,
        externalAuthorName: row.author_name,
        attachmentUrls,
      } });
    } else if (type === "events") {
      const startDate = asDateTime(row.event_date, row.event_time || "00:00");
      await db.insert(events).values({
        title: row.event_name,
        description: row.description || null,
        startDate,
        endDate: startDate,
        location: row.location || null,
        capacity: Number.parseInt(row.capacity || "0", 10) || 0,
        createdBy: importedBy,
        externalEventId: row.event_id,
        source: "discord",
        eventType: row.event_type === "official" ? "official" : "gourmet",
      }).onDuplicateKeyUpdate({ set: { title: row.event_name, startDate, location: row.location || null } });
    } else {
      const event = await db.select().from(events).where(eq(events.externalEventId, row.event_id)).limit(1);
      if (!event[0]) { reviewCount += 1; continue; }
      const membership = await db.select().from(memberSubscriptions).where(eq(memberSubscriptions.discordUserId, row.discord_user_id)).limit(1);
      const needsReview = membership[0] ? 0 : 1;
      reviewCount += needsReview;
      if (type === "participations") {
        const allowedStatuses = ["applied", "confirmed", "attended", "canceled", "no_show"] as const;
        const status = allowedStatuses.includes(row.status as any) ? row.status as typeof allowedStatuses[number] : "applied";
        await db.insert(eventParticipations).values({ eventId: event[0].id, userId: membership[0]?.userId, discordUserId: row.discord_user_id, status, source: "discord", sourceReference: row.source_reference || null, needsReview, occurredAt: row.occurred_at ? new Date(row.occurred_at) : null }).onDuplicateKeyUpdate({ set: { status, userId: membership[0]?.userId, needsReview } });
      } else {
        const organizerRole = row.organizer_role === "assistant" ? "assistant" : "primary";
        await db.insert(eventOrganizers).values({ eventId: event[0].id, userId: membership[0]?.userId, discordUserId: row.discord_user_id, organizerRole, source: "discord", needsReview }).onDuplicateKeyUpdate({ set: { organizerRole, userId: membership[0]?.userId, needsReview } });
      }
    }
    importedCount += 1;
  }
  await db.insert(migrationImports).values({ filename, importType: type, status: reviewCount > 0 ? "partial" : "success", importedCount, reviewCount, importedBy });
  return { importedCount, reviewCount };
}

export async function listEventFavoriteIds(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.select({ eventId: eventFavorites.eventId }).from(eventFavorites).where(eq(eventFavorites.userId, userId))).map((row) => row.eventId);
}

export async function setEventFavorite(userId: number, eventId: number, favorite: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (favorite) await db.insert(eventFavorites).values({ userId, eventId }).onDuplicateKeyUpdate({ set: { eventId } });
  else await db.delete(eventFavorites).where(and(eq(eventFavorites.userId, userId), eq(eventFavorites.eventId, eventId)));
}

export async function getPrivateMemberNote(ownerUserId: number, targetUserId: number): Promise<string> {
  const db = await getDb();
  if (!db) return "";
  const result = await db.select({ note: privateMemberNotes.note }).from(privateMemberNotes).where(and(eq(privateMemberNotes.ownerUserId, ownerUserId), eq(privateMemberNotes.targetUserId, targetUserId))).limit(1);
  return result[0]?.note ?? "";
}

export async function setPrivateMemberNote(ownerUserId: number, targetUserId: number, note: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(privateMemberNotes).values({ ownerUserId, targetUserId, note }).onDuplicateKeyUpdate({ set: { note } });
}

export async function updateUserBranches(userId: number, branches: ("kanto" | "kansai")[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ branches, branch: branches[0] }).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
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

export async function getAllowedEmailByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(allowedEmails).where(eq(allowedEmails.email, email.toLowerCase().trim())).limit(1);
  return result[0];
}

export async function emailHasSubscriptionExemption(email: string): Promise<boolean> {
  const invitation = await getAllowedEmailByEmail(email);
  return canBypassSubscription(undefined, invitation?.accessRole as SubscriptionExemptRole);
}

/** 承認済みメールアドレス一覧を取得 */
export async function getAllowedEmails() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(allowedEmails).orderBy(allowedEmails.createdAt);
}

/** 承認済みメールアドレスを追加 */
export async function addAllowedEmail(data: { email: string; note?: string; addedBy?: number; accessRole?: "member" | "club_leader" | "operator" | "admin" }) {
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
    accessRole: data.accessRole ?? "member",
  });
  const result = await db.select().from(allowedEmails).where(eq(allowedEmails.email, email)).limit(1);
  return result[0];
}

export async function updateAllowedEmailAccessRole(id: number, accessRole: "member" | "club_leader" | "operator" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const invitation = await db.select().from(allowedEmails).where(eq(allowedEmails.id, id)).limit(1);
  if (!invitation[0]) throw new Error("対象のメールアドレスが見つかりません");
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim();
  if (ownerEmail && invitation[0].email === ownerEmail && accessRole !== "admin") {
    throw new Error("オーナーの管理者権限は変更できません");
  }
  await db.update(allowedEmails).set({ accessRole }).where(eq(allowedEmails.id, id));
  const existingUser = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, invitation[0].email)).limit(1);
  if (existingUser[0]) {
    const role = accessRole === "admin" ? "admin" : accessRole === "operator" ? "operator" : "user";
    await db.update(users).set({ role }).where(eq(users.id, existingUser[0].id));
  }
  return getAllowedEmailByEmail(invitation[0].email);
}

/** 承認済みメールアドレスを削除 */
export async function removeAllowedEmail(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const invitation = await db.select().from(allowedEmails).where(eq(allowedEmails.id, id)).limit(1);
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim();
  if (ownerEmail && invitation[0]?.email === ownerEmail) throw new Error("オーナーの承認メールは削除できません");
  await db.delete(allowedEmails).where(eq(allowedEmails.id, id));
  if (invitation[0]?.accessRole === "operator" || invitation[0]?.accessRole === "admin") {
    const existingUser = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, invitation[0].email)).limit(1);
    if (existingUser[0]?.role === "operator" || existingUser[0]?.role === "admin") await db.update(users).set({ role: "user" }).where(eq(users.id, existingUser[0].id));
  }
}

/** 登録完了時にフラグを更新 */
export async function markEmailAsRegistered(email: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(allowedEmails).set({ isRegistered: 1 }).where(eq(allowedEmails.email, email.toLowerCase()));
}

// TODO: add feature queries here as your schema grows.
