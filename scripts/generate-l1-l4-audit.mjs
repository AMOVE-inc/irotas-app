import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const vitestPath = resolve(root, "artifacts/quality/raw/vitest-l1-l4.json");
const jestPath = resolve(root, "artifacts/quality/raw/jest-l2.json");
const outputPath = resolve(root, "artifacts/quality/2026-10-02-l1-l4-test-case-audit.md");
const vitest = JSON.parse(readFileSync(vitestPath, "utf8"));
const jest = JSON.parse(readFileSync(jestPath, "utf8"));

const changedTests = new Map([
  ["tests/auth.logout.test.ts", "既存skip解除・localhostモック追加"],
  ["tests/campaign-manager-permissions.component.test.tsx", "L2新規追加"],
  ["tests/login.component.test.tsx", "L2新規追加"],
  ["tests/member-directory.component.test.tsx", "L2新規追加"],
  ["tests/select-branch.component.test.tsx", "L2新規追加"],
  ["tests/sites-campaign-permissions.test.ts", "L3新規追加"],
  ["tests/sqlite-migration-integration.test.ts", "L4新規追加・継続拡張"],
  ["tests/state-and-permission-matrix.test.ts", "L1新規追加"],
  ["tests/submission-lock.test.ts", "L1新規追加"],
]);

function repoPath(absolute) {
  return relative(root, absolute).replaceAll("\\", "/");
}

function sourceFor(file) {
  try { return readFileSync(resolve(root, file), "utf8"); } catch { return ""; }
}

function layer(file, runner) {
  if (runner === "Jest") return "L2";
  if (file === "tests/sqlite-migration-integration.test.ts") return "L4";
  const source = sourceFor(file);
  if (/readFileSync\(|toContain\(|toMatch\(/.test(source) && /\.tsx?|\.sql|package\.json|app\.config/.test(source)) return "静的補助";
  if (/from ["'](?:\.\.\/)?sites\/|from ["']@\/sites\//.test(source) || file.startsWith("tests/sites-")) return "L3";
  return "L1";
}

function conditionFor(testLayer) {
  if (testLayer === "L4") return "SQLite互換範囲で合格。Cloudflare D1 HTTP実行・同時更新は別途必要";
  if (testLayer === "L3") return "ハンドラ／疑似DB・外部通信モック範囲で合格。実D1・外部Sandboxは別途必要";
  if (testLayer === "L2") return "Jest上の実描画・操作範囲で合格。Native実機固有挙動は別途必要";
  if (testLayer === "静的補助") return "実行動作ではなくソース構造確認としてのみ合格根拠に採用";
  return "単体ロジック範囲で合格。上位層の配線・環境差は別途必要";
}

function rows(report, runner) {
  return report.testResults.flatMap((suite) => {
    const file = repoPath(suite.name);
    const testLayer = layer(file, runner);
    return suite.assertionResults.map((assertion) => ({
      runner,
      layer: testLayer,
      file,
      name: assertion.fullName,
      status: assertion.status === "passed" ? "PASS" : assertion.status.toUpperCase(),
      duration: Math.round(assertion.duration ?? 0),
      change: changedTests.get(file) ?? "なし",
      condition: conditionFor(testLayer),
    }));
  });
}

const cases = [...rows(vitest, "Vitest"), ...rows(jest, "Jest")]
  .sort((a, b) => a.layer.localeCompare(b.layer) || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
const layers = ["L1", "L2", "L3", "L4", "静的補助"];
const counts = Object.fromEntries(layers.map((item) => [item, cases.filter((test) => test.layer === item).length]));
const escape = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");

const lines = [
  "# IRO+ L1〜L4 全テストケース監査台帳",
  "",
  "- 作成日: 2026-10-02 JST",
  `- 総ケース数: ${cases.length}`,
  `- 結果: PASS ${cases.filter((item) => item.status === "PASS").length} / FAIL ${cases.filter((item) => item.status === "FAIL").length} / その他 ${cases.filter((item) => !["PASS", "FAIL"].includes(item.status)).length}`,
  "- 生証跡: `artifacts/quality/raw/vitest-l1-l4.json`、`artifacts/quality/raw/jest-l2.json`",
  "- 全品質ゲート証跡: `artifacts/quality/2026-10-02T03-45-48-533Z-quality-evidence.md`",
  "- 層分類: Runner、対象ファイル、import先、ソース読取り有無から保守的に自動分類。複数層を含むケースは、実際に到達した最も強い層ではなく、過大評価を避ける区分を採用",
  "",
  "## 層別集計",
  "",
  "| 区分 | ケース数 | 判定上の注意 |",
  "| --- | ---: | --- |",
  `| L1 | ${counts.L1} | 純粋ロジック・変換・バリデーション中心 |`,
  `| L2 | ${counts.L2} | React Native Testing Libraryによる実描画・操作 |`,
  `| L3 | ${counts.L3} | APIハンドラ中心。疑似D1・外部モックを含む |`,
  `| L4 | ${counts.L4} | 全Migrationを実SQLiteへ適用。Cloudflare D1そのものではない |`,
  `| 静的補助 | ${counts["静的補助"]} | ソース文字列・構造確認。動作試験の代替にしない |`,
  "",
  "## 全ケース",
  "",
  "| No. | 層 | Runner | テストファイル | テストケース | 結果 | ms | 今回改修 | 条件付き合格の条件 | 証跡 |",
  "| ---: | :---: | --- | --- | --- | :---: | ---: | --- | --- | --- |",
  ...cases.map((item, index) => `| ${index + 1} | ${item.layer} | ${item.runner} | \`${escape(item.file)}\` | ${escape(item.name)} | ${item.status} | ${item.duration} | ${escape(item.change)} | ${escape(item.condition)} | \`${item.runner === "Jest" ? "jest-l2.json" : "vitest-l1-l4.json"}\` |`),
  "",
  "## 判定上の制約",
  "",
  "1. L3の成功は本物のCloudflare D1、Square、Google Places、Resend、R2、APNs/FCMとの疎通成功を意味しない。",
  "2. L4はSQLiteエンジンでMigration・CHECK・UNIQUE・FK・削除連鎖を確認したもの。WorkerからD1へのHTTP配線、D1固有制限、競合更新は未評価。",
  "3. 静的補助は要求されたコードや文言の存在を確認するだけで、ユーザー操作の成功を証明しない。",
  "4. 全ケースPASSでも、L5・Native L6・実端末間同期が未実施のため総合リリース判定はNo-Go。",
  "",
];

writeFileSync(outputPath, lines.join("\n"));
console.log(outputPath);
