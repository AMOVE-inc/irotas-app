import type { Event } from "@/constants/mock-data";

export function eventRecruitmentChannel(event: Pick<Event, "id" | "recruitmentChannel">): "discord" | "app" {
  return event.recruitmentChannel ?? (event.id.startsWith("discord-event-") ? "discord" : "app");
}

export function isDiscordRecruitmentOpen(event: Pick<Event, "id" | "recruitmentChannel" | "status" | "recruitmentStatus" | "isCancelled">): boolean {
  return eventRecruitmentChannel(event) === "discord"
    && event.status === "open"
    && event.recruitmentStatus !== "draft"
    && !event.isCancelled;
}
