import paths from "../data/discord-media-paths.json";

const localPaths = paths as Record<string, string>;

/** Archived Discord attachment URLs expire; prefer the copy shipped with the site. */
export function importedMediaPath(value: string): string | undefined {
  if (value.startsWith("/discord-board/")) return value;
  if (!/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i.test(value)) return value;
  const attachmentId = value.split("?")[0].split("/").at(-2);
  return attachmentId ? localPaths[attachmentId] : undefined;
}

export function importedMediaPaths(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((value) => importedMediaPath(value) ?? []);
}

export function firstImportedMediaPaths(...groups: (string[] | undefined)[]): string[] {
  for (const group of groups) {
    const paths = importedMediaPaths(group);
    if (paths.length) return paths;
  }
  return [];
}
