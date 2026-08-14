export type RichTextToken =
  | { type: "text"; value: string }
  | { type: "link"; label: string; url: string; suffix: string };

export function parseDiscordHeading(line: string): { level: 0 | 1 | 2 | 3; content: string } {
  const match = /^(#{1,3})\s+(.+)$/.exec(line);
  if (!match) return { level: 0, content: line };
  return { level: match[1].length as 1 | 2 | 3, content: match[2] };
}

export function tokenizeRichTextLinks(value: string): RichTextToken[] {
  const tokens: RichTextToken[] = [];
  const pattern = /\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+/gi;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ type: "text", value: value.slice(cursor, index) });
    const raw = match[0];
    const markdown = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/i.exec(raw);
    if (markdown) {
      tokens.push({ type: "link", label: markdown[1], url: markdown[2], suffix: "" });
    } else {
      const trailing = raw.match(/[、。,.!！?？)）\]]+$/)?.[0] ?? "";
      const url = trailing ? raw.slice(0, -trailing.length) : raw;
      tokens.push({ type: "link", label: url, url, suffix: trailing });
    }
    cursor = index + raw.length;
  }
  if (cursor < value.length) tokens.push({ type: "text", value: value.slice(cursor) });
  return tokens.length ? tokens : [{ type: "text", value }];
}
