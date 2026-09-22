import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const helper = readFileSync("lib/open-external-url.ts", "utf8");
const mentionUi = readFileSync("components/mention-ui.tsx", "utf8");
const eventDetail = readFileSync("app/event-detail.tsx", "utf8");

describe("external link navigation", () => {
  it("keeps the running web app open when an external destination is opened", () => {
    expect(helper).toContain('window.open(url, "_blank", "noopener,noreferrer")');
    expect(helper.indexOf("window.open")).toBeLessThan(helper.indexOf("await Linking.openURL"));
    expect(helper.slice(helper.indexOf("window.open"), helper.indexOf("await Linking.openURL"))).toContain("return;");
  });

  it("uses the shared opener for links in posts and event details", () => {
    expect(mentionUi).toContain("openExternalUrl(token.url)");
    expect(eventDetail).toContain("openExternalUrl(/^https?:\\/\\//i.test(event.tabelogUrl!)");
    expect(eventDetail).not.toContain("Linking.openURL");
  });
});
