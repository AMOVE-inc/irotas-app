import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { IMPORTED_DISCORD_EVENTS } from "../constants/imported-discord-events";
import { GOURMET_GENRES } from "../constants/event-options";

type Confidence = "高" | "中" | "低";
type Candidate = {
  id: string;
  title: string;
  current: string[];
  suggested: string[];
  reason: string;
  confidence: Confidence | "除外";
  needsReview: boolean;
  exclusionReason?: string;
};
type ImportedEvent = (typeof IMPORTED_DISCORD_EVENTS)[number] & { genres?: string[]; restaurantName?: string };

const rules: Array<{ genre: (typeof GOURMET_GENRES)[number]; words: string[] }> = [
  { genre: "寿司", words: ["寿司", "鮨", "すし"] }, { genre: "海鮮", words: ["魚介", "海鮮", "牡蠣", "カキ", "ホタテ", "蟹", "カニ", "マグロ", "鮪"] },
  { genre: "焼肉", words: ["焼肉", "焼き肉"] }, { genre: "ホルモン", words: ["ホルモン"] }, { genre: "焼き鳥・串焼き", words: ["焼き鳥", "焼鳥", "串焼", "串カツ"] },
  { genre: "フレンチ", words: ["フレンチ", "フランス料理"] }, { genre: "イタリアン", words: ["イタリアン", "イタリア料理", "パスタ", "ピザ"] }, { genre: "スペイン料理", words: ["スペイン料理"] },
  { genre: "中華料理", words: ["中華", "四川", "点心", "餃子"] }, { genre: "韓国料理", words: ["韓国料理", "サムギョプサル"] }, { genre: "タイ料理", words: ["タイ料理"] },
  { genre: "インド料理", words: ["インド料理", "インドカレー"] }, { genre: "日本料理", words: ["日本料理", "割烹", "懐石", "会席"] }, { genre: "天ぷら", words: ["天ぷら", "天婦羅"] },
  { genre: "うなぎ・穴子", words: ["うなぎ", "鰻", "穴子"] }, { genre: "そば・うどん", words: ["そば", "蕎麦", "うどん"] }, { genre: "ラーメン", words: ["ラーメン", "らーめん"] },
  { genre: "カレー", words: ["カレー"] }, { genre: "ステーキ・鉄板焼き", words: ["ステーキ", "鉄板焼"] }, { genre: "居酒屋", words: ["居酒屋", "酒場", "大衆酒場"] },
  { genre: "カフェ・喫茶店", words: ["カフェ", "喫茶", "コーヒー"] }, { genre: "スイーツ", words: ["スイーツ", "パフェ", "ケーキ", "デザート"] }, { genre: "バー", words: ["ワイン会", "ワインバー", "バー", "テイスティング"] },
  { genre: "お好み焼き・たこ焼き", words: ["お好み焼き", "たこ焼き"] }, { genre: "とんかつ・揚げ物", words: ["とんかつ", "トンカツ", "揚げ物"] }, { genre: "すき焼き・しゃぶしゃぶ", words: ["すき焼き", "しゃぶしゃぶ"] },
  { genre: "洋食", words: ["洋食", "ハンバーグ", "オムライス"] },
];

const AMBIGUOUS_BAR_CONTEXTS = ["シルバー", "メンバー", "バーガー", "リバー", "バーベキュー", "BBQ"];

function wordMatches(word: string, text: string) {
  if (!text.includes(word)) return false;
  return word !== "バー" || !AMBIGUOUS_BAR_CONTEXTS.some((context) => text.includes(context));
}
function hasAmbiguousBarContext(text: string) { return text.includes("バー") && AMBIGUOUS_BAR_CONTEXTS.some((context) => text.includes(context)); }
function matchedRules(text: string) { return rules.filter((rule) => rule.words.some((word) => wordMatches(word, text))); }
function matchedWords(matches: ReturnType<typeof matchedRules>, text: string) { return [...new Set(matches.flatMap((rule) => rule.words.filter((word) => wordMatches(word, text))))]; }

function candidateFor(event: ImportedEvent): Candidate {
  const current = Array.isArray(event.genres) ? event.genres : [];
  if (current.length > 0) return { id: event.id, title: event.title, current, suggested: [], reason: "既にグルメジャンルが保存されているため、今回の補完・自動適用候補から除外。", confidence: "除外", needsReview: false, exclusionReason: "既設定ジャンル" };

  // URL文字列は使わない。食べログURLの存在だけは料理ジャンルを裏付けないため。
  const primaryText = [event.title, event.restaurantName].filter(Boolean).join("\n");
  const supportingText = [event.description, event.location].filter(Boolean).join("\n");
  const primaryMatches = matchedRules(primaryText);
  const supportingMatches = matchedRules(supportingText);
  const matches = primaryMatches.length > 0 ? primaryMatches : supportingMatches;
  const suggested = [...new Set(matches.map((rule) => rule.genre))];
  const words = matchedWords(matches, primaryMatches.length > 0 ? primaryText : supportingText);
  if (primaryMatches.length > 0) return { id: event.id, title: event.title, current, suggested, reason: `タイトルまたは店舗名の具体的な料理根拠: ${words.join("、")}。外部URLは判定に不使用。`, confidence: "高", needsReview: false };
  if (supportingMatches.length > 0) return { id: event.id, title: event.title, current, suggested, reason: `本文または場所の具体的な料理根拠: ${words.join("、")}。タイトル・店舗名に直接根拠がないため手動確認。`, confidence: "中", needsReview: true };
  if (hasAmbiguousBarContext(primaryText)) return { id: event.id, title: event.title, current, suggested: [], reason: "タイトル中の「バー」は、シルバー・メンバー・バーガー・リバー・BBQ等の部分一致で誤判定しうるため、ジャンルを提案せず手動確認。", confidence: "中", needsReview: true, exclusionReason: "バーの部分一致" };
  return { id: event.id, title: event.title, current, suggested: [], reason: event.tabelogUrl ? "食べログ等の外部URLはあるが、タイトル・本文・場所・店舗名に具体的な料理根拠がないため推定しない。" : "タイトル・本文・場所・店舗名に、既定ジャンルを特定できる具体的な料理根拠がない。", confidence: "低", needsReview: true, exclusionReason: event.tabelogUrl ? "URLのみ（料理根拠なし）" : "料理根拠なし" };
}

function markdown(value: string) { return value.replaceAll("|", "\\|").replaceAll("\n", "<br>"); }

const candidates = IMPORTED_DISCORD_EVENTS.map(candidateFor);
const included = candidates.filter((item) => item.confidence !== "除外");
const automatic = candidates.filter((item) => item.confidence === "高");
const counts = Object.fromEntries((["高", "中", "低"] as Confidence[]).map((confidence) => [confidence, candidates.filter((item) => item.confidence === confidence).length]));
const excludedExisting = candidates.filter((item) => item.exclusionReason === "既設定ジャンル").length;
const urlOnly = candidates.filter((item) => item.exclusionReason === "URLのみ（料理根拠なし）").length;
const ambiguousBar = candidates.filter((item) => item.exclusionReason === "バーの部分一致").length;
const ambiguousBarHighExcluded = IMPORTED_DISCORD_EVENTS.filter((event) => {
  const current: string[] = Array.isArray((event as ImportedEvent).genres) ? [...((event as ImportedEvent).genres ?? [])] : [];
  const primaryText = [event.title, (event as ImportedEvent).restaurantName].filter(Boolean).join("\n");
  const candidate = candidates.find((item) => item.id === event.id);
  return current.length === 0 && hasAmbiguousBarContext(primaryText) && candidate?.confidence !== "高";
}).length;
const duplicateIds = candidates.length - new Set(candidates.map((item) => item.id)).size;
const invalidSuggestedValues = [...new Set(automatic.flatMap((item) => item.suggested).filter((genre) => !GOURMET_GENRES.includes(genre as (typeof GOURMET_GENRES)[number])))];
const assignmentCount = automatic.reduce((total, item) => total + item.suggested.length, 0);
const multiValueEvents = automatic.filter((item) => item.suggested.length > 1);
const genreCounts = GOURMET_GENRES.reduce<Partial<Record<(typeof GOURMET_GENRES)[number], number>>>((result, genre) => {
  const count = automatic.filter((item) => item.suggested.includes(genre)).length;
  if (count > 0) result[genre] = count;
  return result;
}, {});
const sampleRows = Object.keys(genreCounts).slice(0, 28).map((genre) => { const item = automatic.find((candidate) => candidate.suggested.includes(genre))!; return `| ${genre} | ${item.id} | ${markdown(item.title)} | ${item.suggested.join("、")} | ${markdown(item.reason)} |`; }).join("\n");
function auditSample(items: Candidate[], size: number) {
  return [...items].sort((left, right) => {
    const hash = (value: string) => [...value].reduce((result, character) => (result * 31 + character.codePointAt(0)!) >>> 0, 2166136261);
    return hash(left.id) - hash(right.id);
  }).slice(0, size);
}
const auditSampleRows = auditSample(automatic, 20).map((item) => `| ${item.id} | ${markdown(item.title)} | ${markdown(item.reason)} | [${item.suggested.map((genre) => `"${genre}"`).join(", ")}] |`).join("\n");
const genreRows = Object.entries(genreCounts).map(([genre, count]) => `| ${genre} | ${count} |`).join("\n");
const rows = candidates.map((item) => `| ${item.id} | ${markdown(item.title)} | ${item.current.join("、") || "未設定"} | ${item.suggested.join("、") || "—"} | ${markdown(item.reason)} | ${item.confidence} | ${item.needsReview ? "要" : "不要"} |`).join("\n");
const report = `# 既存イベント：グルメジャンル補完・確認用一覧

- 作成日: 2026-09-05
- データソース: \`constants/imported-discord-events.ts\`（ローカルのDiscord移行済みイベント定義）
- 実行内容: 読み取りと確認用Markdownの生成のみ。DB接続・更新は行わない。
- 再実行: 入力データを読むだけで、同一の確認用ファイルを上書き生成する。イベントデータへの更新・重複追加は発生しない。

## 判定方針

- 既にジャンルが設定済みのイベントは、変更対象・自動適用候補から除外する。
- 高確信度（自動適用候補）は、タイトルまたは店舗名に具体的な料理ジャンルの根拠語がある未設定イベントだけ。
- 中確信度は、本文または場所には根拠があるが、タイトル・店舗名では裏付けられないため手動確認。
- 食べログ等の外部URLの有無・URL文字列は推定に使わない。URLだけが存在するイベントは低確信度として自動適用から除外する。

## 集計

| 区分 | 件数 |
| --- | ---: |
| 対象総数 | ${candidates.length} |
| 既設定ジャンルのため除外 | ${excludedExisting} |
| 未設定・判定対象 | ${included.length} |
| 高（自動適用候補） | ${counts["高"]} |
| 中（手動確認） | ${counts["中"]} |
| 低（手動確認） | ${counts["低"]} |
| うちURLのみで料理根拠なし | ${urlOnly} |
| うち「バー」の部分一致のため中へ移動 | ${ambiguousBar} |

## 高確信度：ジャンル別件数

ジャンル別件数は、複数ジャンル候補のイベントを各ジャンルに1件ずつ計上する。

| ジャンル | 件数 |
| --- | ---: |
${genreRows}

## 高確信度：代表サンプル（${Object.keys(genreCounts).length}件）

各ジャンルから1件ずつ、確認しやすい代表例を抽出。すべて未設定イベントで、外部URLの存在だけには依存しない。

| 主ジャンル | イベントID | イベント名 | 推定ジャンル | 判断根拠 |
| --- | --- | --- | --- |
${sampleRows}

## DB更新前の最終監査

| 監査項目 | 結果 |
| --- | --- |
| 保存形式 | \`genres: string[]\`。フォームは複数選択、APIは最大20個の文字列配列を受理。 |
| 高確信度イベント数 | ${automatic.length}イベント |
| 設定値数 | ${assignmentCount}値。複数候補イベントが${multiValueEvents.length}件あり、同一イベントへ複数の正式ジャンルを保存するためイベント数とは一致しない。 |
| イベントID重複 | ${duplicateIds}件 |
| 正式選択肢との不一致 | ${invalidSuggestedValues.length}件${invalidSuggestedValues.length ? `（${invalidSuggestedValues.join("、")}）` : ""} |
| 既設定ジャンルを変更対象から除外 | ${excludedExisting}件（今回の入力データには既設定イベントなし） |
| URLだけを根拠にした自動適用 | 0件 |
| 誤判定しやすい「バー」の部分一致 | ${ambiguousBarHighExcluded}件を高確信度から中確信度へ移動。シルバー、メンバー、バーガー、リバー、BBQを除外。 |

複数候補の保存値は、表示用の連結文字列ではなく、例として「フレンチ・中華料理」は \`["フレンチ", "中華料理"]\` の配列で保存する。

### 無作為抽出：高確信度20件

再現可能な監査にするため、イベントIDの固定ハッシュ順で20件を抽出。全件が未設定で、保存予定値は正式選択肢に一致する。

| イベントID | イベント名 | 根拠 | 適用予定値 |
| --- | --- | --- | --- |
${auditSampleRows}

## 全件確認一覧

| イベントID | イベント名 | 現在のジャンル | 推定ジャンル | 判断根拠 | 確信度 | 手動確認 |
| --- | --- | --- | --- | --- | --- |
${rows}
`;
const planCandidates = automatic.map((item) => ({ id: item.id, genres: item.suggested }));
const planPayload = {
  version: 1,
  generatedAt: "2026-09-05",
  sourceReport: "outputs/event-genre-candidates-2026-09-05.md",
  expectedEventCount: automatic.length,
  expectedGenreValueCount: assignmentCount,
  candidates: planCandidates,
};
const plan = {
  ...planPayload,
  sha256: createHash("sha256").update(JSON.stringify(planPayload)).digest("hex"),
};

async function main() {
  const output = resolve(process.cwd(), "outputs/event-genre-candidates-2026-09-05.md");
  const planOutput = resolve(process.cwd(), "data/event-genre-apply-plan-2026-09-05.json");
  await mkdir(resolve(process.cwd(), "outputs"), { recursive: true });
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(output, report, "utf8");
  await writeFile(planOutput, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output, planOutput, total: candidates.length, excludedExisting, counts, genreCounts, samples: Object.keys(genreCounts).length }, null, 2));
}

void main();
