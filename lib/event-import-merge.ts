export type ImportEventShape = {
  title: string;
  eventDate: string;
  eventType: "official" | "gourmet" | "club";
  clubId?: string | null;
  status: "open" | "full" | "ended" | "cancelled";
  publicData: Record<string, unknown>;
};

export type ImportMergeResult = {
  merged: ImportEventShape;
  changedFields: string[];
  conflicts: { field: string; current: unknown; incoming: unknown }[];
};

const APPEND_ONLY_FIELDS = new Set(["comments", "discordComments", "images", "attachments", "applicantIds", "participants"]);

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function appendUnique(current: unknown, incoming: unknown) {
  const left = Array.isArray(current) ? current : [];
  const right = Array.isArray(incoming) ? incoming : [];
  const seen = new Set(left.map((item) => typeof item === "object" && item !== null && "id" in item ? `id:${String((item as { id?: unknown }).id)}` : `value:${JSON.stringify(item)}`));
  const merged = [...left];
  for (const item of right) {
    const key = typeof item === "object" && item !== null && "id" in item ? `id:${String((item as { id?: unknown }).id)}` : `value:${JSON.stringify(item)}`;
    if (!seen.has(key)) { seen.add(key); merged.push(item); }
  }
  return merged;
}

export function mergeImportedEvent(current: ImportEventShape, incoming: ImportEventShape, protectedFields: Set<string>): ImportMergeResult {
  const merged: ImportEventShape = { ...current, publicData: { ...current.publicData } };
  const changedFields: string[] = [];
  const conflicts: ImportMergeResult["conflicts"] = [];
  const scalar: (keyof Omit<ImportEventShape, "publicData">)[] = ["title", "eventDate", "eventType", "clubId", "status"];
  for (const field of scalar) {
    if (equal(current[field], incoming[field])) continue;
    if (protectedFields.has(field)) conflicts.push({ field, current: current[field], incoming: incoming[field] });
    else { (merged as unknown as Record<string, unknown>)[field] = incoming[field]; changedFields.push(field); }
  }
  for (const [field, value] of Object.entries(incoming.publicData)) {
    const currentValue = current.publicData[field];
    if (APPEND_ONLY_FIELDS.has(field)) {
      const next = appendUnique(currentValue, value);
      if (!equal(next, currentValue)) { merged.publicData[field] = next; changedFields.push(field); }
      continue;
    }
    if (equal(currentValue, value)) continue;
    if (protectedFields.has(field)) conflicts.push({ field, current: currentValue, incoming: value });
    else { merged.publicData[field] = value; changedFields.push(field); }
  }
  return { merged, changedFields, conflicts };
}
