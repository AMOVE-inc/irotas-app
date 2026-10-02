export function expandingInputMetrics(
  contentHeight: number,
  minLines = 1,
  maxLines = 6,
  lineHeight = 20,
  verticalPadding = 10,
) {
  const minHeight = minLines * lineHeight + verticalPadding * 2;
  const maxHeight = maxLines * lineHeight + verticalPadding * 2;
  const height = Math.max(minHeight, Math.min(maxHeight, Math.ceil(contentHeight)));
  return { minHeight, maxHeight, height, scrollEnabled: contentHeight >= maxHeight };
}

/** Keeps explicit newline rows visible when native content-size events lag or omit padding. */
export function expandingInputHeightForValue(
  value: string | undefined,
  minLines = 1,
  maxLines = 6,
  lineHeight = 20,
  verticalPadding = 10,
) {
  const explicitLines = value ? value.split(/\r\n|\r|\n/).length : minLines;
  const visibleLines = Math.max(minLines, Math.min(maxLines, explicitLines));
  return visibleLines * lineHeight + verticalPadding * 2;
}
