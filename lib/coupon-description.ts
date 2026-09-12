export interface CouponDescriptionPart {
  text: string;
  bold: boolean;
  url?: string;
}

export function parseLinkedText(content: string): Pick<CouponDescriptionPart, "text" | "url">[] {
  const parts: Pick<CouponDescriptionPart, "text" | "url">[] = [];
  const urlPattern = /https?:\/\/[^\s<>"'「」]+/g;
  let cursor = 0;
  for (const match of content.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: content.slice(cursor, index) });
    const url = match[0].replace(/[.,!?。，、！？）)]+$/, "");
    if (url) parts.push({ text: url, url });
    const suffix = match[0].slice(url.length);
    if (suffix) parts.push({ text: suffix });
    cursor = index + match[0].length;
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor) });
  return parts;
}

/** Format only the inline syntax supported in coupon descriptions: **bold** and web URLs. */
export function parseCouponDescription(description: string): CouponDescriptionPart[] {
  const parts: CouponDescriptionPart[] = [];
  for (const segment of description.split(/(\*\*[\s\S]+?\*\*)/g)) {
    if (!segment) continue;
    const bold = segment.startsWith("**") && segment.endsWith("**");
    const content = bold ? segment.slice(2, -2) : segment;
    parts.push(...parseLinkedText(content).map((part) => ({ ...part, bold })));
  }
  return parts;
}
