export type RichTextToken =
  | { type: "text"; value: string }
  | { type: "link"; label: string; url: string; suffix: string };

export function parseDiscordHeading(line: string): { level: 0 | 1 | 2 | 3; content: string } {
  const match = /^(#{1,3})\s+(.+)$/.exec(line);
  if (!match) return { level: 0, content: line };
  return { level: match[1].length as 1 | 2 | 3, content: match[2] };
}

export type DiscordTextFormat = "boldItalic" | "boldHeading" | "bold" | "underline" | "strikethrough" | "small" | "large" | "italic";
export type DiscordTextSegment = { text: string; formats: DiscordTextFormat[] };

/** Parse inline formatting first so multiline spans remain intact, then classify each line's heading. */
export function parseDiscordRichLines(content: string) {
  // Some imported headings end with a lone **. Treat it as an orphan marker so
  // it cannot consume the opening ** of a later, valid bold phrase.
  const normalizedContent = content.split(/\r?\n/).map((line) => {
    if (parseDiscordHeading(line).level === 0) return line;
    const markers = [...line.matchAll(/(?<!\*)\*\*(?!\*)/g)];
    return markers.length === 1 && markers[0].index === line.length - 2 ? line.slice(0, -2) : line;
  }).join("\n");
  const parseSegments = (value: string, formats: DiscordTextFormat[] = []): DiscordTextSegment[] => {
    const pattern = /(\*\*\*([\s\S]+?)\*\*\*|\*\*# ([\s\S]+?)\*\*|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\[small\]([\s\S]+?)\[\/small\]|\[large\]([\s\S]+?)\[\/large\]|(?<!\*)\*([^*\n]+)\*(?!\*))/;
    const match = pattern.exec(value);
    if (!match || match.index === undefined) return [{ text: value, formats }];
    const format: DiscordTextFormat = match[2] !== undefined ? "boldItalic"
      : match[3] !== undefined ? "boldHeading"
      : match[4] !== undefined ? "bold"
      : match[5] !== undefined ? "underline"
      : match[6] !== undefined ? "strikethrough"
      : match[7] !== undefined ? "small"
      : match[8] !== undefined ? "large" : "italic";
    const inner = (match.slice(2).find((part) => part !== undefined) ?? "") as string;
    return [
      ...parseSegments(value.slice(0, match.index), formats),
      ...parseSegments(inner, [...formats, format]),
      ...parseSegments(value.slice(match.index + match[0].length), formats),
    ];
  };

  const lines: DiscordTextSegment[][] = [[]];
  for (const segment of parseSegments(normalizedContent)) {
    const parts = segment.text.split(/\r?\n/);
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, formats: segment.formats });
    });
  }
  return lines.map((segments) => {
    const plain = segments.map((segment) => segment.text).join("");
    const heading = parseDiscordHeading(plain);
    let prefixLength = plain.length - heading.content.length;
    const contentSegments = segments.flatMap((segment) => {
      const trimmed = segment.text.slice(prefixLength);
      prefixLength = Math.max(0, prefixLength - segment.text.length);
      return trimmed ? [{ ...segment, text: trimmed }] : [];
    });
    return { level: heading.level, segments: contentSegments };
  });
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
