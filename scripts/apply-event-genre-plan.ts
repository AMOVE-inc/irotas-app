import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { GOURMET_GENRES } from "../constants/event-options";

type PlanCandidate = { id: string; genres: string[] };
type Plan = { version: number; generatedAt: string; expectedEventCount: number; expectedGenreValueCount: number; candidates: PlanCandidate[]; sha256: string };
type CurrentRow = { id: string; public_data_json: string | null };
type CurrentState = { id: string; genres: string[] | null; error?: string };
type Outcome = { update: PlanCandidate[]; skip: string[]; missing: string[]; mismatch: Array<{ id: string; current: string[] }>; errors: Array<{ id: string; error: string }> };

const PLAN_PATH = "data/event-genre-apply-plan-2026-09-05.json";
const OUTPUT_PATH = "outputs/event-genre-apply-dry-run-2026-09-05.json";
const BACKUP_PATH = "outputs/event-genre-preapply-backup-2026-09-05.json";
const allowedGenres = new Set<string>(GOURMET_GENRES);

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function has(name: string) { return process.argv.includes(name); }
function same(left: string[], right: string[]) { return left.length === right.length && left.every((value, index) => value === right[index]); }

function validatePlan(plan: Plan) {
  const { sha256, ...payload } = plan;
  const expectedHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  if (sha256 !== expectedHash) throw new Error("適用計画のSHA-256が一致しません。監査済みの固定入力を確認してください。");
  if (plan.expectedEventCount !== 152 || plan.expectedGenreValueCount !== 166 || plan.candidates.length !== 152) throw new Error("適用計画の監査済み件数（152イベント・166値）が一致しません。");
  if (new Set(plan.candidates.map((item) => item.id)).size !== plan.candidates.length) throw new Error("適用計画にイベントIDの重複があります。");
  const valueCount = plan.candidates.reduce((total, item) => total + item.genres.length, 0);
  if (valueCount !== 166 || plan.candidates.some((item) => !item.id || item.genres.length === 0 || item.genres.some((genre) => !allowedGenres.has(genre)))) throw new Error("適用計画に不正なIDまたは正式選択肢以外のジャンルがあります。");
}

function parseGenres(row: CurrentRow): CurrentState {
  try {
    const data = JSON.parse(row.public_data_json ?? "{}") as { genres?: unknown };
    if (data.genres === undefined || data.genres === null) return { id: row.id, genres: [] };
    if (!Array.isArray(data.genres) || data.genres.some((genre) => typeof genre !== "string")) return { id: row.id, genres: null, error: "genresが文字列配列ではありません" };
    return { id: row.id, genres: data.genres };
  } catch { return { id: row.id, genres: null, error: "public_data_jsonを解析できません" }; }
}

function analyze(plan: Plan, states: CurrentState[]): Outcome {
  const byId = new Map(states.map((state) => [state.id, state]));
  const result: Outcome = { update: [], skip: [], missing: [], mismatch: [], errors: [] };
  for (const candidate of plan.candidates) {
    const state = byId.get(candidate.id);
    if (!state) result.missing.push(candidate.id);
    else if (state.error || state.genres === null) result.errors.push({ id: candidate.id, error: state.error ?? "不明な現在値" });
    else if (state.genres.length === 0) result.update.push(candidate);
    else if (same(state.genres, candidate.genres)) result.skip.push(candidate.id);
    else result.mismatch.push({ id: candidate.id, current: state.genres });
  }
  return result;
}

async function d1Query(sql: string, params: string[] = []) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const database = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !database || !token) throw new Error("本番D1には接続していません。CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_D1_DATABASE_ID、CLOUDFLARE_API_TOKENを環境変数で渡してください。");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ sql, params }) });
  const body = await response.json() as { success?: boolean; errors?: Array<{ message?: string }>; result?: Array<{ success?: boolean; results?: unknown[] }> };
  if (!response.ok || body.success === false || body.result?.some((item) => item.success === false)) throw new Error(body.errors?.map((item) => item.message).filter(Boolean).join("; ") || "D1クエリに失敗しました");
  return (body.result?.[0]?.results ?? []) as Record<string, unknown>[];
}

async function readRemote(plan: Plan) {
  const placeholders = plan.candidates.map(() => "?").join(",");
  const rows = await d1Query(`SELECT id, public_data_json FROM events WHERE id IN (${placeholders})`, plan.candidates.map((item) => item.id));
  return rows.map((row) => parseGenres({ id: String(row.id), public_data_json: typeof row.public_data_json === "string" ? row.public_data_json : null }));
}

async function saveJson(path: string, value: unknown) { await mkdir(resolve(process.cwd(), "outputs"), { recursive: true }); await writeFile(resolve(process.cwd(), path), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

async function applyRemote(plan: Plan, updates: PlanCandidate[]) {
  for (const candidate of updates) {
    const rows = await d1Query("SELECT public_data_json FROM events WHERE id = ?", [candidate.id]);
    const row = rows[0];
    if (!row || typeof row.public_data_json !== "string") throw new Error(`適用前再確認に失敗: ${candidate.id}`);
    const parsed = parseGenres({ id: candidate.id, public_data_json: row.public_data_json });
    if (parsed.error || !parsed.genres || parsed.genres.length !== 0) throw new Error(`適用前現在値が想定と異なります: ${candidate.id}`);
    const data = JSON.parse(row.public_data_json) as Record<string, unknown>;
    data.genres = candidate.genres;
    await d1Query("UPDATE events SET public_data_json = ?, updated_at = ? WHERE id = ?", [JSON.stringify(data), new Date().toISOString(), candidate.id]);
  }
}

async function main() {
  const plan = JSON.parse(await readFile(resolve(process.cwd(), option("--plan") ?? PLAN_PATH), "utf8")) as Plan;
  validatePlan(plan);
  const remote = has("--remote");
  const apply = has("--apply");
  if (apply && (!remote || process.env.IROTAS_EVENT_GENRE_APPLY_CONFIRM !== "152")) throw new Error("適用には --remote --apply と IROTAS_EVENT_GENRE_APPLY_CONFIRM=152 が必要です。");
  const states = remote ? await readRemote(plan) : plan.candidates.map((item) => ({ id: item.id, genres: [] as string[] }));
  const outcome = analyze(plan, states);
  const snapshot = { createdAt: new Date().toISOString(), source: remote ? "remote-read-only" : "offline-plan-baseline", planSha256: plan.sha256, records: plan.candidates.map((candidate) => ({ id: candidate.id, genres: states.find((state) => state.id === candidate.id)?.genres ?? null })) };
  await saveJson(BACKUP_PATH, snapshot);
  const report = { mode: apply ? "apply" : remote ? "remote-dry-run" : "offline-dry-run", plan: { events: plan.expectedEventCount, genreValues: plan.expectedGenreValueCount, sha256: plan.sha256 }, backup: BACKUP_PATH, counts: { update: outcome.update.length, skip: outcome.skip.length, missing: outcome.missing.length, mismatch: outcome.mismatch.length, errors: outcome.errors.length }, ...outcome };
  if (!apply) { await saveJson(OUTPUT_PATH, report); console.log(JSON.stringify(report)); return; }
  if (outcome.skip.length || outcome.missing.length || outcome.mismatch.length || outcome.errors.length || outcome.update.length !== 152) throw new Error(`適用を中止しました。${JSON.stringify(report.counts)}`);
  await applyRemote(plan, outcome.update);
  const verification = analyze(plan, await readRemote(plan));
  if (verification.update.length || verification.missing.length || verification.mismatch.length || verification.errors.length || verification.skip.length !== 152) throw new Error(`適用後検証に失敗しました。復元用JSON: ${BACKUP_PATH}`);
  await saveJson(OUTPUT_PATH, { ...report, verification: { savedEvents: verification.skip.length, savedGenreValues: plan.expectedGenreValueCount } });
  console.log(JSON.stringify({ ...report, verification: { savedEvents: verification.skip.length, savedGenreValues: plan.expectedGenreValueCount } }));
}

void main().catch((error) => { console.error(JSON.stringify({ error: error instanceof Error ? error.message : "unknown_error" })); process.exitCode = 1; });
