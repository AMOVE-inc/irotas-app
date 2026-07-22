export type TextFormat = "small" | "large" | "bold" | "underline" | "strike";
export type TextSelection = { start: number; end: number };

const MARKERS: Record<TextFormat, readonly [string, string]> = {
  small: ["[small]", "[/small]"],
  large: ["[large]", "[/large]"],
  bold: ["**", "**"],
  underline: ["__", "__"],
  strike: ["~~", "~~"],
};

export function applyTextFormat(text: string, selection: TextSelection, format: TextFormat): { text: string; selection: TextSelection } {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const [open, close] = MARKERS[format];
  const selected = text.slice(start, end);
  const nextText = `${text.slice(0, start)}${open}${selected}${close}${text.slice(end)}`;
  if (selected) return { text: nextText, selection: { start, end: end + open.length + close.length } };
  const cursor = start + open.length;
  return { text: nextText, selection: { start: cursor, end: cursor } };
}
