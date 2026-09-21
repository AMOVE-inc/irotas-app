import { describe, expect, it } from "vitest";
import { importedEventParticipantIdentifiers } from "../sites/event-participants";

describe("imported event participants", () => {
  it("combines migrated participants and companions without duplicates", () => {
    expect(importedEventParticipantIdentifiers({
      id: "discord-event-1",
      organizer_member_id: 1,
      public_data_json: JSON.stringify({
        manualParticipantIds: ["IRO0002", "IRO0003"],
        companionIds: ["IRO0003", "discord-123456789012345678"],
      }),
    })).toEqual(["IRO0002", "IRO0003", "discord-123456789012345678"]);
  });
});
