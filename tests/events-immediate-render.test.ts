import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("event list initial render", () => {
  it("starts with bundled public events while refreshing from the database", () => {
    const source = readFileSync(resolve(process.cwd(), "app/(tabs)/events.tsx"), "utf8");
    expect(source).toContain('getAllEvents(EVENTS).filter((event) => event.eventType !== "club")');
    expect(source).toContain("const [eventsLoaded, setEventsLoaded] = useState(true)");
  });
});
