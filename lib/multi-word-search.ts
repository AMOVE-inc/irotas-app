export function normalizedSearchWords(query: string): string[] {
  return query.normalize("NFKC").toLocaleLowerCase("ja").trim().split(/[\s　]+/).filter(Boolean);
}

export function matchesAllSearchWords(query: string, values: (string | null | undefined)[]): boolean {
  const words = normalizedSearchWords(query);
  if (!words.length) return true;
  const searchable = values.filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ja");
  return words.every((word) => searchable.includes(word));
}
