import type { BoardThread, Club } from "../constants/mock-data";

export function getClubIntroductionContent(
  club: Pick<Club, "name" | "description">,
  threads: BoardThread[] = [],
) {
  const introduction = threads.find(
    (thread) => thread.category === "club-introduction" && thread.title.includes(club.name),
  );
  return introduction?.preview.trim() || club.description;
}

export function getLatestClubActivityReports(threads: BoardThread[], limit = 3) {
  return threads
    .filter((thread) => thread.category === "club-all")
    .sort((a, b) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated))
    .slice(0, limit);
}
