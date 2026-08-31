import type { Campaign } from "./campaign-store";

async function request<T>(path: string, init: RequestInit = {}) {
  let url = path;
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers as Record<string, string> ?? {}) };
  if (typeof window === "undefined" && typeof navigator !== "undefined") {
    const base = process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "";
    url = `${base.replace(/\/$/, "")}${path}`;
    const token = await import("./_core/auth").then((module) => module.getSessionToken());
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { ...init, credentials: "include", headers });
  if (!response.ok) {
    const value = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(value.error ?? "キャンペーンを更新できませんでした");
  }
  return response.json() as Promise<T>;
}

export const getSharedCampaigns = () => request<{ campaigns: Campaign[] }>("/api/campaigns");
export const saveSharedCampaign = (campaign: Campaign) => request<{ success: true }>(`/api/campaigns/${encodeURIComponent(campaign.id)}`, { method: "PUT", body: JSON.stringify(campaign) });
export const deleteSharedCampaign = (id: string) => request<{ success: true }>(`/api/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" });
