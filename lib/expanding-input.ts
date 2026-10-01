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
