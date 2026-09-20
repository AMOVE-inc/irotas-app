export interface ImportedLinkPreview {
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
  provider: string;
}

// These three archived Discord embeds have confirmed public OG thumbnails. The
// source export kept their text but discarded Discord's original image fields.
export const archivedTabelogImages: Record<string, string> = {
  "https://tabelog.com/tokyo/A1313/A131303/13003007/": "https://tblg.k-img.com/resize/640x640c/restaurant/images/Rvw/70016/70016263.jpg?token=77e8c5d&api=v2",
  "https://tabelog.com/tokyo/A1313/A131303/13194455/": "https://tblg.k-img.com/resize/640x640c/restaurant/images/Rvw/365479/addc380ea6d3f6df73a213fe10ede31d.jpg?token=c8d2d8d&api=v2",
  "https://tabelog.com/tokyo/A1313/A131303/13265598/": "https://tblg.k-img.com/resize/640x640c/restaurant/images/Rvw/268498/b8e7104115a1f496aa6a514a9076a892.jpg?token=dbb8198&api=v2",
  "https://tabelog.com/tokyo/A1302/A130204/13297159/": "https://tblg.k-img.com/resize/640x640c/restaurant/images/Rvw/254433/3e5906bc72e2e57a36b7aa4abf13e993.jpg?token=4898f5f&api=v2",
  "https://tabelog.com/tokyo/A1302/A130204/13160351/": "https://tblg.k-img.com/resize/640x640c/restaurant/images/Rvw/221916/9e22b8521ca1d0eba258af29f73a384b.jpg?token=107ebee&api=v2",
  "https://tabelog.com/tokyo/A1302/A130202/13310410/": "https://tblg.k-img.com/resize/640x640c/restaurant/images/Rvw/326821/7a9be3e3be9c8019cba090d3b81f9055.jpg?token=21cf704&api=v2",
  "https://tabelog.com/tokyo/A1302/A130202/13284333/": "https://tblg.k-img.com/resize/640x640c/restaurant/images/Rvw/204066/0bffccb43a3f0e766a130eba90f60cf7.jpg?token=202f7c4&api=v2",
  "https://tabelog.com/tokyo/A1302/A130203/13279853/": "https://tblg.k-img.com/resize/640x640c/restaurant/images/Rvw/284442/8494a3496700b65a5dc30941a3184717.jpg?token=9460dfa&api=v2",
  "https://tabelog.com/tokyo/A1302/A130203/13246794/": "https://tblg.k-img.com/resize/640x640c/restaurant/images/Rvw/246118/96c591e20032b99ce9f5cf3b286bea6c.jpg?token=f2197a9&api=v2",
};

const LINK = /https:\/\/(?:maps\.app\.goo\.gl|(?:www\.)?google\.[^\s/]+\/maps|(?:www\.)?tabelog\.com)\/[^\s<>]+/gi;
const TABELOG_DETAIL = /^★[★☆]+\d(?:\.\d+)?\s+■/;
const MAPS_DETAIL = /^(.+?)\s+·\s+[\d.]+★(?:\([\d,]+\))?\s+·\s+(.+)$/;

/** Discord's embed text was appended to some archived messages. Keep the authored text and links intact. */
export function extractDiscordLinkPreviews(content: string): { content: string; previews: ImportedLinkPreview[] } {
  if (!/maps\.app\.goo\.gl|google\.[^\s/]+\/maps|tabelog\.com/i.test(content)) return { content, previews: [] };
  const lines = content.split(/\r?\n/);
  const links = [...content.matchAll(LINK)].map((match) => match[0].replace(/[),.、。]+$/, ""));
  const tabelogLinks = links.filter((link) => /tabelog\.com/i.test(link));
  const mapsLinks = links.filter((link) => /maps\.app\.goo\.gl|google\.[^/]+\/maps/i.test(link));
  const previews: ImportedLinkPreview[] = [];
  let tabelogCount = 0;
  let mapsCount = 0;
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end--;

  // A Tabelog embed consists of a title and the rating/budget line.
  while (end >= 2 && TABELOG_DETAIL.test(lines[end - 1].trim()) && lines[end - 2].trim() && !/^https?:\/\//.test(lines[end - 2].trim())) {
    const url = tabelogLinks[tabelogLinks.length - ++tabelogCount];
    if (!url) break;
    previews.unshift({ url, title: lines[end - 2].trim(), description: lines[end - 1].trim(), imageUrl: archivedTabelogImages[url], provider: "食べログ" });
    end -= 2;
  }

  // A Google Maps embed consists of a place/rating line and an address.
  while (end >= 2 && MAPS_DETAIL.test(lines[end - 2].trim()) && lines[end - 1].trim() && !/^https?:\/\//.test(lines[end - 1].trim())) {
    const url = mapsLinks[mapsLinks.length - ++mapsCount];
    if (!url) break;
    const detail = lines[end - 2].trim().match(MAPS_DETAIL)!;
    previews.unshift({ url, title: detail[1], description: `${detail[2]} · ${lines[end - 1].trim()}`, provider: "Google マップ" });
    end -= 2;
  }

  // Discord also appended lightweight Maps embeds as "place · location" lines.
  const simpleMaps: string[] = [];
  while (end > 0 && /^.{2,100}\s+·\s+.{3,100}$/.test(lines[end - 1].trim()) && !/^https?:\/\//.test(lines[end - 1].trim()) && simpleMaps.length < mapsLinks.length) {
    simpleMaps.unshift(lines[end - 1].trim());
    end--;
  }
  if (simpleMaps.length) {
    const simplePreviews = simpleMaps.map((line, index) => {
      const [title, ...place] = line.split(/\s+·\s+/);
      return { url: mapsLinks[index], title, description: place.join(" · "), provider: "Google マップ" as const };
    });
    previews.unshift(...simplePreviews);
  }

  return previews.length ? { content: lines.slice(0, end).join("\n").trimEnd(), previews } : { content, previews: [] };
}
