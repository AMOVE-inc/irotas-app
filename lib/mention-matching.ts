/** Match a viewer's exact mention labels, not similarly named people or clubs. */
export function mentionsViewer(content: string, labels: readonly string[]): boolean {
  if (!content.includes("@")) return false;
  return labels.some((label) => {
    if (!label.trim()) return false;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`@${escaped}(?=$|[\\s、。！？!?.,，．:：;；)）\\]｝}])`, "u").test(content);
  });
}
