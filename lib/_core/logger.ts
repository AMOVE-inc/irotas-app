/**
 * 本番環境でのログ制御ユーティリティ
 * 開発環境ではログを出力、本番環境ではログを抑制
 */

const isDevelopment = process.env.NODE_ENV === "development";

export const logger = {
  /**
   * デバッグログ（本番環境では出力しない）
   */
  debug: (message: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[DEBUG] ${message}`, data);
    }
  },

  /**
   * 情報ログ（本番環境では出力しない）
   */
  info: (message: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[INFO] ${message}`, data);
    }
  },

  /**
   * 警告ログ（本番環境でも出力）
   */
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data);
  },

  /**
   * エラーログ（本番環境でも出力）
   */
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error);
  },

  /**
   * ユーザーに表示するエラーメッセージを生成
   * 本番環境では詳細情報を隠す
   */
  getUserMessage: (error: any): string => {
    if (isDevelopment) {
      return error?.message || "エラーが発生しました";
    }

    // 本番環境では一般的なメッセージを返す
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      return "認証に失敗しました。もう一度ログインしてください。";
    }

    if (error?.statusCode === 404) {
      return "リクエストされたデータが見つかりません。";
    }

    if (error?.statusCode === 500) {
      return "サーバーエラーが発生しました。しばらく後に試してください。";
    }

    return "エラーが発生しました。しばらく後に試してください。";
  },
};
