export const INSTAGRAM_PROFILE_PREFIX = "https://www.instagram.com/";
export const TABELOG_PROFILE_PREFIX = "https://tabelog.com/rvwr/";

function cleanFragment(value: string) {
  const withoutQuery = value.trim().split(/[?#]/, 1)[0] ?? "";
  return withoutQuery.replace(/^@+/, "").replace(/^\/+|\/+$/g, "");
}

export function instagramHandleFromUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return cleanFragment(trimmed.replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, ""));
}

export function tabelogUserIdFromUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return cleanFragment(trimmed.replace(/^https?:\/\/(?:www\.)?tabelog\.com\/rvwr\//i, "")).split("/")[0] ?? "";
}

export function instagramUrlFromHandle(value: string) {
  const handle = cleanFragment(value);
  return handle ? `${INSTAGRAM_PROFILE_PREFIX}${handle}/` : "";
}

export function tabelogUrlFromUserId(value: string) {
  const userId = cleanFragment(value).split("/")[0] ?? "";
  return userId ? `${TABELOG_PROFILE_PREFIX}${userId}/` : "";
}

export function validSocialUserId(value: string) {
  return !value || /^[A-Za-z0-9._-]{1,64}$/.test(value);
}
