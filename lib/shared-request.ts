export function isReactNativeRuntime() {
  return typeof navigator !== "undefined" && navigator.product === "ReactNative";
}

export async function sharedJsonRequest<T>(path: string, init: RequestInit = {}, fallbackMessage = "サーバー処理に失敗しました") {
  const native = isReactNativeRuntime();
  const base = native ? process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "" : "";
  const url = native ? `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}` : path;
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers as Record<string, string> ?? {}) };
  if (native) {
    const token = await import("./_core/auth").then((module) => module.getSessionToken());
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { ...init, credentials: "include", headers });
  if (!response.ok) {
    const value = await response.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(value.error ?? value.message ?? fallbackMessage);
  }
  return response.json() as Promise<T>;
}
