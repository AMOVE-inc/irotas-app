export function normalizedSearchWords(query: string): string[] {
  return query.normalize("NFKC").toLocaleLowerCase("ja").trim().split(/[\s　]+/).filter(Boolean);
}

export function matchesAllSearchWords(query: string, values: (string | null | undefined)[]): boolean {
  const words = normalizedSearchWords(query);
  if (!words.length) return true;
  const searchable = values.filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ja");
  return words.every((word) => searchable.includes(word));
}

export function fuzzySearchScore(query: string, values: (string | null | undefined)[]): number {
  const needle = query.normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s　・\/／_-]+/g, "");
  const haystack = values.filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s　・\/／_-]+/g, "");
  if (!needle) return 0;
  if (haystack.includes(needle)) return 100 + needle.length;
  if (needle.length === 1) return haystack.includes(needle) ? 20 : 0;
  const pairs = Array.from({ length: needle.length - 1 }, (_, index) => needle.slice(index, index + 2));
  const matched = pairs.filter((pair) => haystack.includes(pair)).length;
  return matched / pairs.length >= 0.5 ? matched : 0;
}
