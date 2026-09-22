import { Linking, Platform } from "react-native";

/**
 * Opens a web destination without replacing the running web app. Keeping the
 * app in its original tab means closing the destination returns to the same
 * screen instead of an empty browser surface.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    let hostname = "";
    try {
      hostname = new URL(url, window.location.href).hostname.toLowerCase();
    } catch {
      // Let the platform opener handle non-standard URLs below.
    }
    // Tabelog universal links can hand off to the native app. Opening them in
    // a new tab leaves that tab at about:blank when the native app returns, so
    // keep the handoff in this tab and preserve the IRO+ page in its history.
    if (hostname === "tabelog.com" || hostname.endsWith(".tabelog.com")) {
      window.location.assign(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Linking.openURL(url);
}
