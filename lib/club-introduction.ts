import type { Club } from "../constants/mock-data";
import { loadDiscordBoardArchive } from "./discord-board-import";

const clubIntroductionThreads = loadDiscordBoardArchive().threads.filter(
  (thread) => thread.category === "club-introduction",
);

export function getClubIntroductionContent(club: Pick<Club, "name" | "description">) {
  const introduction = clubIntroductionThreads.find((thread) => thread.title.includes(club.name));
  return introduction?.preview.trim() || club.description;
}

export function getLatestClubActivityReports(limit = 3) {
  return loadDiscordBoardArchive().threads
    .filter((thread) => thread.category === "club-all")
    .sort((a, b) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated))
    .slice(0, limit);
}
