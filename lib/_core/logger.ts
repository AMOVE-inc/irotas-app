/**
 * 本番環境でのログ制御ユーティリティ
 * 開発環境ではログを出力、本番環境ではログを抑制
 */

const isDevelopment = process.env.NODE_ENV !== "production";

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    data?: { httpStatus?: unknown };
  };
  const value = candidate.statusCode ?? candidate.status ?? candidate.data?.httpStatus;
  return typeof value === "number" ? value : undefined;
}

/**
 * Membership admission/payment errors are safe, intentional messages returned
 * by our own auth API. Keep other 403 responses generic in production.
 */
export function getMembershipAccessMessage(error: unknown): string | null {
  if (getStatusCode(error) !== 403 || !(error instanceof Error)) return null;
  return error.message.startsWith("入会審査") || error.message.startsWith("会費")
    ? error.message
    : null;
}

export const logger = {
  /**
   * デバッグログ（本番環境では出力しない）
   */
  debug: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`[DEBUG] ${message}`, data);
    }
  },

  /**
   * 情報ログ（本番環境では出力しない）
   */
  info: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`[INFO] ${message}`, data);
    }
  },

  /**
   * 警告ログ（本番環境でも出力）
   */
  warn: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.warn(`[WARN] ${message}`, data);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },

  /**
   * エラーログ（本番環境でも出力）
   */
  error: (message: string, error?: unknown) => {
    if (isDevelopment) {
      console.error(`[ERROR] ${message}`, error);
    } else {
      // Error details can contain tokens, request bodies, or personal data.
      console.error(`[ERROR] ${message}`);
    }
  },

  /**
   * ユーザーに表示するエラーメッセージを生成
   * 本番環境では詳細情報を隠す
   */
  getUserMessage: (error: unknown): string => {
    if (isDevelopment) {
      return error instanceof Error ? error.message : "エラーが発生しました";
    }

    // 本番環境では一般的なメッセージを返す
    const statusCode = getStatusCode(error);
    if (statusCode === 401 || statusCode === 403) {
      return "認証に失敗しました。もう一度ログインしてください。";
    }

    if (statusCode === 404) {
      return "リクエストされたデータが見つかりません。";
    }

    if (statusCode !== undefined && statusCode >= 500) {
      return "サーバーエラーが発生しました。しばらく後に試してください。";
    }

    return "エラーが発生しました。しばらく後に試してください。";
  },
};
