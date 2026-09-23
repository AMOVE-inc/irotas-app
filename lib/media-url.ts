const ABSOLUTE_URI = /^(?:https?:|data:|blob:|file:|content:)/i;

export function resolveMediaUrl(value: string, apiBaseUrl = ""): string {
  const trimmed = value.trim();
  if (!trimmed || ABSOLUTE_URI.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  const base = apiBaseUrl.replace(/\/$/, "");
  if (!base) return trimmed;
  return `${base}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

export function isAbsoluteMediaUrl(value: string) {
  return ABSOLUTE_URI.test(value.trim());
}
