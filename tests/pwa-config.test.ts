import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("app/+html.tsx", "utf8");
const manifest = JSON.parse(
  readFileSync("public/manifest.webmanifest", "utf8"),
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const staticHeaders = readFileSync("public/_headers", "utf8");

describe("mobile web and home screen configuration", () => {
  it("uses Japanese metadata and iPhone standalone settings", () => {
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="IRO＋"');
    expect(html).toContain('rel="apple-touch-icon" href="/pwa/icon-1024.png"');
    expect(html).toContain("viewport-fit=cover");
  });

  it("provides an installable standalone manifest", () => {
    expect(manifest).toMatchObject({
      short_name: "IRO＋",
      lang: "ja",
      start_url: "/",
      display: "standalone",
      orientation: "portrait",
    });
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({
        src: "/pwa/icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
      }),
    );
  });

  it("copies the production app icon into the published output", () => {
    expect(packageJson.scripts["build:sites"]).toContain(
      "cp assets/images/icon.png dist/client/pwa/icon-1024.png",
    );
  });

  it("protects cached HTML and static assets with security headers", () => {
    expect(staticHeaders).toContain("X-Content-Type-Options: nosniff");
    expect(staticHeaders).toContain("X-Frame-Options: DENY");
    expect(staticHeaders).toContain("Content-Security-Policy:");
    expect(staticHeaders).toContain("Strict-Transport-Security:");
  });

  it("keeps essential browser protections when HTML is served from a CDN cache", () => {
    expect(html).toContain(
      'name="referrer" content="strict-origin-when-cross-origin"',
    );
    expect(html).toContain('httpEquiv="Content-Security-Policy"');
    expect(html).toContain(
      "base-uri 'self'; object-src 'none'; form-action 'self'",
    );
    expect(html).toContain("window.top !== window.self");
    expect(html).toContain("document.documentElement.style.display = 'none'");
  });
});
