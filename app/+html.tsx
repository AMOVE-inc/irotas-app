import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#E8A0BF" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="base-uri 'self'; object-src 'none'; form-action 'self'"
        />
        <meta name="application-name" content="IRO+" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="IRO+" />
        <meta property="og:title" content="IRO+" />
        <meta property="og:site_name" content="IRO+" />
        <meta property="og:description" content="IRO+ 食のコミュニティアプリ" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://irotas-app-20260721.k1998915n.chatgpt.site/pwa/icon-1024.png?v=198" />
        <meta property="og:image:width" content="1080" />
        <meta property="og:image:height" content="1080" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://irotas-app-20260721.k1998915n.chatgpt.site/pwa/icon-1024.png?v=198" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/pwa/icon-1024.png" />
        <title>IRO+</title>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if (window.top !== window.self) document.documentElement.style.display = 'none';" +
              "if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js'); });",
          }}
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
