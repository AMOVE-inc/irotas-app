import { Image as ExpoImage, type ImageProps, type ImageSource } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { getSessionToken } from "@/lib/_core/auth";
import { isAbsoluteMediaUrl, resolveMediaUrl as resolveMediaUrlWithBase } from "@/lib/media-url";

export function resolveMediaUrl(value: string) {
  return resolveMediaUrlWithBase(value, getApiBaseUrl());
}

function isApiMediaUrl(value: string): boolean {
  if (Platform.OS === "web") return false;
  const base = getApiBaseUrl();
  if (!base) return !isAbsoluteMediaUrl(value);
  try {
    return new URL(resolveMediaUrl(value)).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

export function mediaSourceWithToken(source: ImageProps["source"], token: string | null): ImageProps["source"] {
  const decorate = (item: ImageSource | string | number): ImageSource | string | number => {
    if (typeof item === "number") return item;
    if (typeof item === "string") {
      const uri = resolveMediaUrl(item);
      return token && isApiMediaUrl(item) ? { uri, headers: { Authorization: `Bearer ${token}` } } : uri;
    }
    if (!item || typeof item !== "object" || !("uri" in item) || typeof item.uri !== "string") return item;
    const uri = resolveMediaUrl(item.uri);
    return token && isApiMediaUrl(item.uri)
      ? { ...item, uri, headers: { ...(item.headers ?? {}), Authorization: `Bearer ${token}` } }
      : { ...item, uri };
  };
  return Array.isArray(source) ? source.map((item) => decorate(item as ImageSource)) as ImageSource[] : decorate(source as ImageSource | string | number) as ImageProps["source"];
}

/** Displays both public images and login-protected IRO+ media on Web, iOS, and Android. */
export function AuthenticatedImage({ source, ...props }: ImageProps) {
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(Platform.OS === "web");
  const sourceKey = useMemo(() => {
    try { return JSON.stringify(source); } catch { return String(source); }
  }, [source]);

  useEffect(() => {
    let active = true;
    if (Platform.OS === "web") { setAuthReady(true); return; }
    setAuthReady(false);
    void getSessionToken().then((value) => {
      if (!active) return;
      setToken(value);
      setAuthReady(true);
    });
    return () => { active = false; };
  }, [sourceKey]);

  const resolved = useMemo(() => mediaSourceWithToken(source, token), [source, sourceKey, token]);
  const requiresAuth = typeof source === "string"
    ? isApiMediaUrl(source)
    : Boolean(source && typeof source === "object" && !Array.isArray(source) && "uri" in source && typeof source.uri === "string" && isApiMediaUrl(source.uri));
  return <ExpoImage {...props} source={requiresAuth && !authReady ? undefined : resolved} />;
}
