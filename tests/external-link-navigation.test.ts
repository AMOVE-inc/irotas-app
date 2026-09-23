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

  it("does not create an about:blank tab for Tabelog app handoff", () => {
    expect(helper).toContain('hostname === "tabelog.com" || hostname.endsWith(".tabelog.com")');
    expect(helper).toContain("window.location.assign(url)");
    expect(helper.indexOf("window.location.assign(url)")).toBeLessThan(helper.indexOf('window.open(url, "_blank"'));
  });

  it("uses the shared opener for links in posts and event details", () => {
    expect(mentionUi).toContain("openExternalUrl(token.url)");
    expect(eventDetail).toContain("openExternalUrl(/^https?:\\/\\//i.test(event.tabelogUrl!)");
    expect(eventDetail).toContain("Linking.openURL(appUrl)");
    expect(eventDetail).toContain("openExternalUrl(webUrl)");
  });
});
