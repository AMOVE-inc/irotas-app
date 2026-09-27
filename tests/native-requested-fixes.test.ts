import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gourmetMap = readFileSync("app/gourmet-map.tsx", "utf8");
const eventDetail = readFileSync("app/event-detail.tsx", "utf8");
const events = readFileSync("sites/events.ts", "utf8");
const chatServer = readFileSync("sites/chat-content.ts", "utf8");
const chatScreen = readFileSync("app/chat/index.tsx", "utf8");
const notifications = readFileSync("app/notifications.tsx", "utf8");
const clubs = readFileSync("sites/clubs.ts", "utf8");
const home = readFileSync("app/(tabs)/index.tsx", "utf8");

describe("requested native fixes", () => {
  it("uses the protected Places Photo endpoint immediately for legacy Google images on native", () => {
    expect(gourmetMap).toContain('Platform.OS !== "web"');
    expect(gourmetMap).toContain("/api/gourmet-map/photo?placeId=");
  });

  it("creates and exposes a participant chat after Discord recruitment closes", () => {
    expect(events).toContain("data.discordRecruitmentClosedAt = now");
    expect(events).toContain("await ensureEventRoom(env.DB, data.chatId as string)");
    expect(chatServer).toContain("discordEvent && !origin.discordRecruitmentClosedAt");
    expect(chatServer).toContain("origin.manualParticipantIds");
    expect(eventDetail).toContain("event.participants.includes(viewerId)");
  });

  it("accepts only poll reactions matching a poll choice", () => {
    expect(chatServer).toContain('const isPollVote = emoji.startsWith("🗳️")');
    expect(chatServer).toContain("isValidPollVote(row.content, emoji)");
  });

  it("opens applicant profiles from the application count sheet", () => {
    expect(eventDetail).toContain("参加申込者一覧を表示");
    expect(eventDetail).toContain("参加申込者（{applicantCount}人）");
    expect(eventDetail).toContain("<MemberRankBadge rank={rank}");
  });

  it("provides a multi-line message composer", () => {
    expect(chatScreen).toContain("minHeight: 72");
    expect(chatScreen).toContain("maxHeight: 180");
  });

  it("deep links club applications to the club management review", () => {
    expect(clubs).toContain("reviewApplications=1");
    expect(notifications).toContain('notification.targetPath?.startsWith("/clubs?")');
  });

  it("keeps the club event locked while exposing the organizer profile button", () => {
    expect(home).toContain("event.lockedClubEvent && event.organizerProfileId");
    expect(home).toContain('pathname: "/member-profile"');
  });
});
