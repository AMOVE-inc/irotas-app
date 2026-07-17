import { z } from "zod";
import bcrypt from "bcryptjs";
import { invokeLLM } from "./_core/llm";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import * as db from "./db";

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
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new Error("管理者権限が必要です");
    }
    return db.getAllowedEmails();
  }),

  /** 承認済みメールアドレスを追加 */
  add: protectedProcedure
    .input(
      z.object({
        email: z.string().email("有効なメールアドレスを入力してください"),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("管理者権限が必要です");
      }
      return db.addAllowedEmail({
        email: input.email,
        note: input.note,
        addedBy: ctx.user.id,
      });
    }),

  /** 承認済みメールアドレスを削除 */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("管理者権限が必要です");
      }
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

export const appRouter = router({
  system: systemRouter,
  concierge: conciergeRouter,
  allowedEmails: allowedEmailsRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    /** Register a new user with email and password */
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email("有効なメールアドレスを入力してください"),
          password: z
            .string()
            .min(6, "パスワードは6文字以上で入力してください"),
          name: z.string().min(1, "名前を入力してください"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // 審査制チェック：事前承認メールアドレスかどうか確認
        const allowed = await db.isEmailAllowed(input.email);
        if (!allowed) {
          throw new Error("このメールアドレスは登録が許可されていません。運営にお問い合わせください。");
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
          },
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
