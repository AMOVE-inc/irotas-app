import { describe, expect, it } from "vitest";
import { eventRecruitmentChannel, isDiscordRecruitmentOpen } from "../lib/event-recruitment-channel";

describe("event recruitment channel", () => {
  it("treats imported Discord events as Discord intake until explicitly switched", () => {
    expect(eventRecruitmentChannel({ id: "discord-event-123" })).toBe("discord");
    expect(eventRecruitmentChannel({ id: "discord-event-123", recruitmentChannel: "app" })).toBe("app");
    expect(eventRecruitmentChannel({ id: "event-123" })).toBe("app");
  });

  it("shows Discord intake only while applications are open", () => {
    expect(isDiscordRecruitmentOpen({ id: "discord-event-123", status: "open" })).toBe(true);
    expect(isDiscordRecruitmentOpen({ id: "discord-event-123", status: "open", recruitmentStatus: "draft" })).toBe(false);
    expect(isDiscordRecruitmentOpen({ id: "discord-event-123", status: "full" })).toBe(false);
    expect(isDiscordRecruitmentOpen({ id: "discord-event-123", status: "open", recruitmentChannel: "app" })).toBe(false);
  });
});
