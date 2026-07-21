import { useThemeContext } from "@/lib/theme-provider";

/**
 * Keep web colors in sync with the app theme provider.
 * The IROTAS default theme is intentionally light with a white base.
 */
export function useColorScheme() {
  return useThemeContext().colorScheme;
}
