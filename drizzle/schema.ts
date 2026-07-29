import { date, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** Hashed password for email/password authentication (null for OAuth-only users) */
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "operator", "admin"]).default("user").notNull(),
  /** 所属支部。初回ログイン時に選択する */
  branch: mysqlEnum("branch", ["kanto", "kansai"]),
  /** 複数所属に対応した支部一覧。branchは後方互換用に維持する */
  branches: json("branches").$type<("kanto" | "kansai")[]>(),
  /** 性別（分析用） */
  gender: mysqlEnum("gender", ["male", "female", "other", "unset"]).default("unset").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 審査制ログイン用：運営が事前に承認したメールアドレス一覧
 * このテーブルに登録されたメールアドレスのみ新規登録が可能
 */
export const allowedEmails = mysqlTable("allowed_emails", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** メモ（誰を招待したかの備考） */
  note: text("note"),
  /** 登録した管理者のユーザーID */
  addedBy: int("addedBy"),
  /** 実際に登録済みかどうか（登録完了後にtrueになる） */
  isRegistered: int("isRegistered").default(0).notNull(),
  /** memberはSquare必須。operator/club_leaderは役職中のみサブスク免除。 */
  accessRole: mysqlEnum("accessRole", ["member", "operator", "club_leader"]).default("member").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 決済会員資格。メールは初回照合、Square IDは継続同期の主キーとして使う。 */
export const memberSubscriptions = mysqlTable("member_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  billingEmail: varchar("billingEmail", { length: 320 }).notNull(),
  discordUserId: varchar("discordUserId", { length: 32 }),
  discordName: varchar("discordName", { length: 255 }),
  discordRoles: json("discordRoles").$type<string[]>(),
  discordJoinedAt: date("discordJoinedAt"),
  displayName: varchar("displayName", { length: 255 }),
  memberTerm: varchar("memberTerm", { length: 64 }),
  memberRank: varchar("memberRank", { length: 64 }),
  squareCustomerId: varchar("squareCustomerId", { length: 255 }),
  squareSubscriptionId: varchar("squareSubscriptionId", { length: 255 }),
  squarePlanVariationId: varchar("squarePlanVariationId", { length: 255 }),
  squareStatus: mysqlEnum("squareStatus", ["PENDING", "ACTIVE", "CANCELED", "DEACTIVATED", "PAUSED", "COMPLETED", "UNKNOWN"]).default("UNKNOWN").notNull(),
  accessStatus: mysqlEnum("accessStatus", ["pending", "active", "grace", "suspended"]).default("pending").notNull(),
  paidUntilDate: date("paidUntilDate"),
  graceUntilDate: date("graceUntilDate"),
  lastSquareSyncedAt: timestamp("lastSquareSyncedAt"),
  suspendedAt: timestamp("suspendedAt"),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("member_subscriptions_billing_email_unique").on(table.billingEmail),
  uniqueIndex("member_subscriptions_discord_user_id_unique").on(table.discordUserId),
  uniqueIndex("member_subscriptions_square_subscription_id_unique").on(table.squareSubscriptionId),
]);

export type MemberSubscription = typeof memberSubscriptions.$inferSelect;
export type InsertMemberSubscription = typeof memberSubscriptions.$inferInsert;

/** アプリ内で利用する正規化済みロール。 */
export const appRoles = mysqlTable("app_roles", {
  id: int("id").autoincrement().primaryKey(),
  roleKey: varchar("roleKey", { length: 128 }).notNull().unique(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  category: mysqlEnum("category", ["operator", "branch", "generation", "club", "rank", "other"]).notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** DiscordロールID・SquareプランIDとアプリ内ロールの対応。 */
export const externalRoleMappings = mysqlTable("external_role_mappings", {
  id: int("id").autoincrement().primaryKey(),
  source: mysqlEnum("source", ["discord_role", "square_plan"]).notNull(),
  externalId: varchar("externalId", { length: 255 }).notNull(),
  appRoleId: int("appRoleId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("external_role_mappings_source_external_unique").on(table.source, table.externalId)]);

/** 会員に付与されたロール。外部同期分と手動付与分を区別して保持する。 */
export const memberRoleAssignments = mysqlTable("member_role_assignments", {
  id: int("id").autoincrement().primaryKey(),
  memberSubscriptionId: int("memberSubscriptionId").notNull(),
  userId: int("userId"),
  appRoleId: int("appRoleId").notNull(),
  source: mysqlEnum("source", ["discord", "square", "manual"]).notNull(),
  externalId: varchar("externalId", { length: 255 }),
  isActive: int("isActive").default(1).notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("member_role_assignments_member_role_source_unique").on(table.memberSubscriptionId, table.appRoleId, table.source)]);

export type AllowedEmail = typeof allowedEmails.$inferSelect;
export type InsertAllowedEmail = typeof allowedEmails.$inferInsert;

/**
 * タイムライン投稿テーブル
 */
export const timelinePosts = mysqlTable("timeline_posts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }),
  likes: int("likes").default(0).notNull(),
  comments: int("comments").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TimelinePost = typeof timelinePosts.$inferSelect;
export type InsertTimelinePost = typeof timelinePosts.$inferInsert;

/**
 * イベントテーブル
 */
export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  location: varchar("location", { length: 255 }),
  capacity: int("capacity").notNull(),
  attendees: int("attendees").default(0).notNull(),
  status: mysqlEnum("status", ["open", "full", "closed"]).default("open").notNull(),
  createdBy: int("createdBy").notNull(),
  externalEventId: varchar("externalEventId", { length: 255 }),
  source: mysqlEnum("source", ["app", "discord", "csv"]).default("app").notNull(),
  eventType: mysqlEnum("eventType", ["official", "gourmet"]).default("gourmet").notNull(),
  applicationDeadline: timestamp("applicationDeadline"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("events_external_event_id_unique").on(table.externalEventId)]);

/** イベント申込・確定・出席・キャンセルを明細で保存する。 */
export const eventParticipations = mysqlTable("event_participations", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  userId: int("userId"),
  discordUserId: varchar("discordUserId", { length: 32 }),
  status: mysqlEnum("status", ["applied", "confirmed", "attended", "canceled", "no_show"]).notNull(),
  source: mysqlEnum("source", ["app", "discord", "csv", "manual"]).default("csv").notNull(),
  sourceReference: varchar("sourceReference", { length: 512 }),
  needsReview: int("needsReview").default(0).notNull(),
  occurredAt: timestamp("occurredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("event_participations_event_discord_unique").on(table.eventId, table.discordUserId)]);

/** 主幹事・副幹事の履歴。 */
export const eventOrganizers = mysqlTable("event_organizers", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  userId: int("userId"),
  discordUserId: varchar("discordUserId", { length: 32 }),
  organizerRole: mysqlEnum("organizerRole", ["primary", "assistant"]).default("primary").notNull(),
  source: mysqlEnum("source", ["app", "discord", "csv", "manual"]).default("csv").notNull(),
  needsReview: int("needsReview").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("event_organizers_event_discord_unique").on(table.eventId, table.discordUserId)]);

export const migrationImports = mysqlTable("migration_imports", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  importType: mysqlEnum("importType", ["members", "events", "participations", "organizers", "role_mappings"]).notNull(),
  status: mysqlEnum("status", ["success", "partial", "failed"]).notNull(),
  importedCount: int("importedCount").default(0).notNull(),
  reviewCount: int("reviewCount").default(0).notNull(),
  errorSummary: text("errorSummary"),
  importedBy: int("importedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** ユーザーごとのイベントお気に入り。 */
export const eventFavorites = mysqlTable("event_favorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  eventId: int("eventId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("event_favorites_user_event_unique").on(table.userId, table.eventId)]);

/** 他会員について本人だけが閲覧できるメモ。 */
export const privateMemberNotes = mysqlTable("private_member_notes", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  targetUserId: int("targetUserId").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("private_member_notes_owner_target_unique").on(table.ownerUserId, table.targetUserId)]);

export const squareWebhookEvents = mysqlTable("square_webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 255 }).notNull().unique(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
});

export const emailVerificationCodes = mysqlTable("email_verification_codes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  codeHash: varchar("codeHash", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

/**
 * チャットルームテーブル
 */
export const chatRooms = mysqlTable("chat_rooms", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["direct", "group", "rank", "event", "board"]).notNull(),
  sourceId: varchar("sourceId", { length: 255 }),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chatRoomMembers = mysqlTable("chat_room_members", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  leftAt: timestamp("leftAt"),
}, (table) => [uniqueIndex("chat_room_members_room_user_unique").on(table.roomId, table.userId)]);

/** 募集期限・開催前リマインドをワーカーが重複なく配信するためのキュー。 */
export const scheduledEventActions = mysqlTable("scheduled_event_actions", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  targetUserId: int("targetUserId"),
  chatRoomId: int("chatRoomId"),
  action: mysqlEnum("action", ["organizer_deadline", "chat_seven_days", "chat_two_days"]).notNull(),
  scheduledFor: timestamp("scheduledFor").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "canceled", "failed"]).default("pending").notNull(),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("scheduled_event_actions_dedupe_unique").on(table.eventId, table.targetUserId, table.action)]);

export const appNotifications = mysqlTable("app_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  eventId: int("eventId"),
  chatRoomId: int("chatRoomId"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatRoom = typeof chatRooms.$inferSelect;
export type InsertChatRoom = typeof chatRooms.$inferInsert;

/**
 * チャットメッセージテーブル
 */
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * ユーザーポイントテーブル
 */
export const userPoints = mysqlTable("user_points", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  points: int("points").default(0).notNull(),
  rank: varchar("rank", { length: 64 }).default("regular").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPoints = typeof userPoints.$inferSelect;
export type InsertUserPoints = typeof userPoints.$inferInsert;

/**
 * ポイント変更履歴テーブル
 */
export const pointsHistory = mysqlTable("points_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  fromPoints: int("fromPoints").notNull(),
  toPoints: int("toPoints").notNull(),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PointsHistory = typeof pointsHistory.$inferSelect;
export type InsertPointsHistory = typeof pointsHistory.$inferInsert;
