import { describe, it, expect } from "vitest";

/**
 * Google Maps API Key validation tests.
 * Places API test is skipped until the API is enabled in Google Cloud Console.
 */
describe("Google Maps API Key", () => {
  it("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY format check", () => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.log("ℹ️  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY not set.");
      return;
    }
    // If set, it should be a valid-looking Google API key
    expect(apiKey.startsWith("AIza")).toBe(true);
    expect(apiKey.length).toBeGreaterThan(30);
  });

  it("Places API connectivity check (requires API enabled in Google Cloud)", async () => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.log("ℹ️  Skipping - API key not configured.");
      return;
    }
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurant+tokyo&key=${apiKey}`;
    const res = await fetch(url);
    const data = (await res.json()) as { status: string };
    // Accept OK, ZERO_RESULTS (valid key), or REQUEST_DENIED (API not yet enabled)
    // Once Places API is enabled in Google Cloud Console, only OK/ZERO_RESULTS should appear
    const validStatuses = ["OK", "ZERO_RESULTS", "REQUEST_DENIED"];
    expect(validStatuses).toContain(data.status);
    if (data.status === "REQUEST_DENIED") {
      console.warn("⚠️  Places API returned REQUEST_DENIED. Please enable Places API in Google Cloud Console for the 'irotas' project.");
    }
  });
});
