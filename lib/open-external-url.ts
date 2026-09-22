import { Linking, Platform } from "react-native";

/**
 * Opens a web destination without replacing the running web app. Keeping the
 * app in its original tab means closing the destination returns to the same
 * screen instead of an empty browser surface.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Linking.openURL(url);
}
