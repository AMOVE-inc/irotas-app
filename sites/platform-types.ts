export type D1Result<T = unknown> = {
  success?: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
};

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
}

export interface R2Bucket {
  list(options?: { limit?: number; cursor?: string }): Promise<{
    objects: { key: string; size: number }[];
    truncated: boolean;
    cursor?: string;
  }>;
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string, options?: { range?: Headers }): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
    size?: number;
    range?: { offset: number; length: number };
  } | null>;
}

export interface SitesEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB?: D1Database;
  UPLOADS?: R2Bucket;
  GOURMET_MAP_FEED_URL?: string;
  GOURMET_MAP_AUTO_PUBLISH_MIN_REPORTERS?: string;
  GOOGLE_MAPS_API_KEY?: string;
  GOOGLE_MAPS_PHOTOS_ENABLED?: string;
  GOOGLE_MAPS_PHOTO_MONTHLY_LIMIT?: string;
  GOOGLE_MAPS_SEARCH_MONTHLY_LIMIT?: string;
  AUTH_SECRET?: string;
  ADMISSION_SYNC_TOKEN?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  EMAIL_DELIVERY_WEBHOOK_URL?: string;
  EMAIL_DELIVERY_WEBHOOK_TOKEN?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  SQUARE_ACCESS_TOKEN?: string;
  SQUARE_LOCATION_ID?: string;
  EVENT_PAYMENTS_ENABLED?: string;
  SQUARE_ALLOWED_PLAN_VARIATION_IDS?: string;
  SQUARE_WEBHOOK_SIGNATURE_KEY?: string;
  SQUARE_WEBHOOK_NOTIFICATION_URL?: string;
}

export interface SitesExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
