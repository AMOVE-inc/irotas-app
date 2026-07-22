import { describe, expect, it } from "vitest";
import { OFFICIAL_LINE_URL, REPORT_FORM_URL } from "../constants/external-links";

describe("contact destinations", () => {
  it("keeps the report form and official LINE as separate destinations", () => {
    expect(REPORT_FORM_URL).toContain("docs.google.com/forms/");
    expect(OFFICIAL_LINE_URL).toBe("https://lin.ee/Rr00sCb");
    expect(REPORT_FORM_URL).not.toBe(OFFICIAL_LINE_URL);
  });
});
