import { describe, expect, it } from "vitest";
import { instagramHandleFromUrl, instagramUrlFromHandle, tabelogUserIdFromUrl, tabelogUrlFromUserId, validSocialUserId } from "../lib/profile-social-links";

describe("profile social link fields", () => {
  it("round trips an Instagram handle without exposing an editable prefix", () => {
    expect(instagramHandleFromUrl("https://www.instagram.com/irotas.community/?hl=ja")).toBe("irotas.community");
    expect(instagramUrlFromHandle("@irotas.community")).toBe("https://www.instagram.com/irotas.community/");
  });

  it("round trips a Tabelog reviewer id", () => {
    expect(tabelogUserIdFromUrl("https://tabelog.com/rvwr/irotas_01/")).toBe("irotas_01");
    expect(tabelogUrlFromUserId("irotas_01")).toBe("https://tabelog.com/rvwr/irotas_01/");
  });

  it("rejects URL and path injection in the user id field", () => {
    expect(validSocialUserId("member.name_01")).toBe(true);
    expect(validSocialUserId("https://example.com/x")).toBe(false);
    expect(validSocialUserId("member/name")).toBe(false);
  });
});

