/** Removes migration-era labels that duplicate the event state shown by the UI. */
export function displayEventTitle(value: string | undefined) {
  return String(value ?? "")
    .replace(/^\s*【\s*(?:募集終了|募集開始|募集中|開催終了|開催中)\s*】\s*/u, "")
    .replace(/^\s*(?:(?:20\d{2}[./年]\s*)?\d{1,2}(?:[./月]\s*\d{1,2}(?:日)?|月\d{1,2}日)\s*(?:\([^)]*\))?\s*)/u, "")
    .trim() || String(value ?? "");
}
