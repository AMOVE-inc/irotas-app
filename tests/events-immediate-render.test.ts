import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("event list initial render", () => {
  it("never flashes bundled test fixtures before the database responds", () => {
    const source = readFileSync(resolve(process.cwd(), "app/(tabs)/events.tsx"), "utf8");
    expect(source).toContain("const [allEvents, setAllEvents] = useState<Event[]>([])");
    expect(source).toContain("const [eventsLoaded, setEventsLoaded] = useState(false)");
    expect(source).not.toContain('useState<Event[]>(() => getAllEvents(EVENTS)');
  });
});
