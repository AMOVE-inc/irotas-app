import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { invokeLLM } from "./_core/llm";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { canAccessMemberApp } from "../lib/membership-access";
import { findMembershipByBillingEmail } from "./square-client";

// Gourmet concierge AI router
const conciergeRouter = router({
  chat: publicProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          }),
        ),
        restaurantContext: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const systemPrompt = `あなたはIRO＋（イロプラス）というグルメコミュニティのAIグルメコンシェルジュです。
メンバーが美味しいお店を見つけるお手伝いをします。

以下のガイドラインに従ってください：
- 日本語で丁寧に、かつ親しみやすいトーンで回答する
- 具体的なお店の提案をする際は、料理の特徴・雰囲気・おすすめポイントを含める
- エリア・ジャンル・シチュエーション（デート、接待、友人との食事など）を考慮する
- 予算感についても言及する
- IRO＋メンバーの口コミや評判も参考にした提案をする
- 回答は簡潔にまとめ、長すぎないようにする（300文字以内を目安）

${input.restaurantContext ? `参考データ：\n${input.restaurantContext}` : ""}`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          ...input.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ],
        maxTokens: 1024,
      });

      const content = result.choices[0]?.message?.content;
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .map((c) =>
                  typeof c === "string" ? c : (c as { text?: string }).text ?? "",
                )
                .join("")
            : "";

      return { reply: text };
    }),
});

// 承認メールアドレス管理ルーター（管理者専用）
const allowedEmailsRouter = router({
  /** 承認済みメールアドレス一覧を取得 */
  list: adminProcedure.query(async () => {
    return db.getAllowedEmails();
  }),

  /** 承認済みメールアドレスを追加 */
  add: adminProcedure
    .input(
      z.object({
        email: z.string().email("有効なメールアドレスを入力してください"),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return db.addAllowedEmail({
        email: input.email,
        note: input.note,
        addedBy: ctx.user.id,
      });
    }),

  /** 承認済みメールアドレスを削除 */
  remove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.removeAllowedEmail(input.id);
      return { success: true };
    }),

  /** メールアドレスが承認済みかチェック（登録前確認用） */
  check: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ input }) => {
      const allowed = await db.isEmailAllowed(input.email);
      return { allowed };
    }),
});

const migrationRouter = router({
  importCsv: adminProcedure
    .input(z.object({
      type: z.enum(["members", "events", "participations", "organizers", "role_mappings"]),
      filename: z.string().min(1).max(255),
      csvText: z.string().min(1).max(10_000_000),
    }))
    .mutation(async ({ ctx, input }) => db.importMigrationCsv(input.type, input.csvText, input.filename, ctx.user.id)),
});

async function deliverVerificationCode(email: string, code: string) {
  const endpoint = process.env.EMAIL_DELIVERY_WEBHOOK_URL;
  if (!endpoint) throw new Error("メール送信設定が完了していません。運営へお問い合わせください。");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...(process.env.EMAIL_DELIVERY_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.EMAIL_DELIVERY_WEBHOOK_TOKEN}` } : {}) },
    body: JSON.stringify({ to: email, subject: "IRO+ 初回認証コード", text: `認証コードは ${code} です。有効期限は10分です。` }),
  });
  if (!response.ok) throw new Error("認証メールを送信できませんでした。しばらくしてから再度お試しください。");
}

async function refreshMembershipFromSquare(email: string) {
  const match = await findMembershipByBillingEmail(email);
  if (!match) return db.suspendUnverifiedMembership(email);
  return db.updateMembershipFromSquare({
    billingEmail: email,
    customerId: match.customerId,
    subscriptionId: match.subscriptionId,
    planVariationId: match.planVariationId,
    status: match.status,
    paidUntilDate: match.paidUntilDate,
  });
}

export const appRouter = router({
  system: systemRouter,
  concierge: conciergeRouter,
  allowedEmails: allowedEmailsRouter,
  migration: migrationRouter,
  memberData: router({
    favoriteEventIds: protectedProcedure.query(({ ctx }) => db.listEventFavoriteIds(ctx.user.id)),
    setEventFavorite: protectedProcedure.input(z.object({ eventId: z.number().int().positive(), favorite: z.boolean() })).mutation(async ({ ctx, input }) => { await db.setEventFavorite(ctx.user.id, input.eventId, input.favorite); return { success: true }; }),
    privateNote: protectedProcedure.input(z.object({ targetUserId: z.number().int().positive() })).query(({ ctx, input }) => db.getPrivateMemberNote(ctx.user.id, input.targetUserId)),
    setPrivateNote: protectedProcedure.input(z.object({ targetUserId: z.number().int().positive(), note: z.string().max(5000) })).mutation(async ({ ctx, input }) => { await db.setPrivateMemberNote(ctx.user.id, input.targetUserId, input.note); return { success: true }; }),
  }),
  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (!opts.ctx.user || opts.ctx.user.role === "admin") return opts.ctx.user;
      return (await db.memberHasAppAccess(opts.ctx.user.id)) ? opts.ctx.user : null;
    }),
    selectBranches: protectedProcedure
      .input(
        z.object({
          branches: z
            .array(z.enum(["kanto", "kansai"]))
            .min(1, "所属支部を1つ以上選択してください")
            .max(2)
            .refine((branches) => new Set(branches).size === branches.length),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await db.updateUserBranches(ctx.user.id, input.branches);
        if (!user) throw new Error("所属支部の保存に失敗しました");
        return { success: true, branch: user.branch, branches: user.branches };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    requestSetupCode: publicProcedure
      .input(z.object({ email: z.string().email("有効なメールアドレスを入力してください") }))
      .mutation(async ({ input }) => {
        const email = input.email.toLowerCase().trim();
        let membership = await db.getMembershipByBillingEmail(email);
        if (membership) membership = await refreshMembershipFromSquare(email);
        if (!canAccessMemberApp(membership)) return { success: true };
        const latestCode = await db.getLatestEmailVerificationCode(email);
        if (latestCode && Date.now() - latestCode.createdAt.getTime() < 60_000) return { success: true };
        const code = String(randomInt(100000, 1000000));
        await db.createEmailVerificationCode(email, await bcrypt.hash(code, 10), new Date(Date.now() + 10 * 60 * 1000));
        await deliverVerificationCode(email, code);
        return { success: true };
      }),

    /** Register a new user with email and password */
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email("有効なメールアドレスを入力してください"),
          password: z
            .string()
            .min(8, "パスワードは8文字以上で入力してください"),
          name: z.string().min(1, "名前を入力してください"),
          verificationCode: z.string().regex(/^\d{6}$/, "6桁の認証コードを入力してください"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // 審査制チェック：事前承認メールアドレスかどうか確認
        const allowed = await db.isEmailAllowed(input.email);
        if (!allowed) {
          throw new Error("このメールアドレスは登録が許可されていません。運営にお問い合わせください。");
        }
        let membership = await db.getMembershipByBillingEmail(input.email);
        if (membership) membership = await refreshMembershipFromSquare(input.email);
        if (!canAccessMemberApp(membership)) {
          throw new Error("有効なSquare会員資格を確認できません。決済状況をご確認ください。");
        }
        const verification = await db.getLatestEmailVerificationCode(input.email);
        if (!verification || verification.consumedAt || verification.expiresAt.getTime() < Date.now() || !(await bcrypt.compare(input.verificationCode, verification.codeHash))) {
          throw new Error("認証コードが正しくないか、有効期限が切れています。");
        }

        // Check if email already exists
        const existing = await db.getUserByEmail(input.email);
        if (existing) {
          throw new Error("このメールアドレスは既に登録されています");
        }

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, 12);

        // Create user
        const user = await db.createEmailUser({
          email: input.email,
          name: input.name,
          passwordHash,
        });

        if (!user) {
          throw new Error("ユーザーの作成に失敗しました");
        }

        // Create session token
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || "",
          expiresInMs: ONE_YEAR_MS,
        });

        // Set cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });

        // 登録完了後に承認メールテーブルのフラグを更新
        await db.markEmailAsRegistered(input.email);
        await db.consumeEmailVerificationCode(verification.id);

        return {
          success: true,
          sessionToken,
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            email: user.email,
            loginMethod: user.loginMethod,
            lastSignedIn: (user.lastSignedIn ?? new Date()).toISOString(),
            role: user.role ?? "user",
            branch: user.branch ?? null,
            branches: user.branches ?? null,
          },
        };
      }),

    /** Login with email and password */
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email("有効なメールアドレスを入力してください"),
          password: z.string().min(1, "パスワードを入力してください"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Find user by email
        const user = await db.getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new Error("メールアドレスまたはパスワードが正しくありません");
        }

        // Verify password
        const isValid = await bcrypt.compare(input.password, user.passwordHash);
        if (!isValid) {
          throw new Error("メールアドレスまたはパスワードが正しくありません");
        }
        if (user.role !== "admin") {
          const membership = await refreshMembershipFromSquare(input.email);
          if (!canAccessMemberApp(membership)) {
            throw new Error("会員資格を確認できないためログインできません。決済状況をご確認ください。");
          }
        }

        // Update last signed in
        await db.upsertUser({
          openId: user.openId,
          lastSignedIn: new Date(),
        });

        // Create session token
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || "",
          expiresInMs: ONE_YEAR_MS,
        });

        // Set cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });

        return {
          success: true,
          sessionToken,
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            email: user.email,
            loginMethod: user.loginMethod,
            lastSignedIn: (user.lastSignedIn ?? new Date()).toISOString(),
            role: user.role ?? "user",
            branch: user.branch ?? null,
            branches: user.branches ?? null,
          },
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
