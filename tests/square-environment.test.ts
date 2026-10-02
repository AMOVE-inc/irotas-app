import { describe, expect, it } from "vitest";
import { squareApiBaseUrl, squareApiUrl } from "../sites/square-environment";

describe("Square environment isolation", () => {
  it("uses the sandbox host when configured", () => {
    expect(squareApiUrl({ APP_ENVIRONMENT: "staging", SQUARE_ENVIRONMENT: "sandbox" }, "/v2/locations"))
      .toBe("https://connect.squareupsandbox.com/v2/locations");
  });

  it("keeps backward-compatible production outside staging", () => {
    expect(squareApiBaseUrl({ APP_ENVIRONMENT: "production" })).toBe("https://connect.squareup.com");
  });

  it.each([undefined, "production"])("rejects %s Square mode in staging", (mode) => {
    expect(() => squareApiBaseUrl({ APP_ENVIRONMENT: "staging", SQUARE_ENVIRONMENT: mode }))
      .toThrow("staging must use Square sandbox");
  });

  it("rejects unknown modes", () => {
    expect(() => squareApiBaseUrl({ SQUARE_ENVIRONMENT: "test" })).toThrow("SQUARE_ENVIRONMENT");
  });
});
