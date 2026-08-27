import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { apiCall } from "@/lib/_core/api";
import { useAuthContext } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { GOURMET_CONTEST_IMPORT_COLUMNS, parseGourmetContestImport, saveImportedGourmetContests } from "@/lib/gourmet-contest-import";
import {
  buildMemberImportDryRun,
  decodeCsvBuffer,
  exportMemberImportCsv,
  type MemberImportDryRun,
} from "@/lib/member-import-dry-run";
import {
  parseMemberHistoryImport,
  type MemberHistoryImportPreview,
} from "@/lib/member-history-import";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

type ImportReadiness = {
  authentication: boolean;
  square: boolean;
  ready: boolean;
};

interface ImportRecord {
  id: string;
  filename: string;
  importedAt: string;
  recordCount: number;
  status: "success" | "error" | "processing";
  type: "members" | "events" | "participations" | "organizers" | "gourmet_contests";
  errorMessage?: string;
}

const IMPORT_HISTORY: ImportRecord[] = [];

const TYPE_LABELS = { members: "決済会員・Discord", events: "イベント履歴", participations: "参加履歴", organizers: "幹事履歴", gourmet_contests: "過去のグルメ選手権" };
const TYPE_COLORS = { members: "#E8A0BF", events: "#A7C7E7", participations: "#FF9500", organizers: "#7D6A92", gourmet_contests: "#C97813" };

const CSV_TEMPLATES = [
  {
    type: "members" as const,
    label: "会員データCSVテンプレート",
    columns: ["discord_user_id", "discord_name", "billing_email", "display_name", "discord_roles", "discord_joined_at", "member_term", "member_rank", "square_customer_id", "square_subscription_id", "subscription_status", "paid_until_date"],
    example: "123456789,kazuma,kazuma@example.com,かずま,関東支部|ワイン部,2024-04-01,第1期,ゴールド,,,,",
  },
  {
    type: "events" as const,
    label: "イベントCSVテンプレート",
    columns: ["event_id", "event_name", "event_date", "event_time", "location", "event_type", "capacity"],
    example: "e001,春のランチ会,2026-04-15,12:00,銀座レストラン,gourmet,20",
  },
  {
    type: "participations" as const,
    label: "イベント参加履歴CSVテンプレート",
    columns: ["event_id", "discord_user_id", "status", "occurred_at", "source_reference"],
    example: "e001,123456789,attended,2026-04-15T12:00:00+09:00,Discord投稿URL",
  },
  {
    type: "organizers" as const,
    label: "幹事履歴CSVテンプレート",
    columns: ["event_id", "discord_user_id", "organizer_role"],
    example: "e001,123456789,primary",
  },
  {
    type: "gourmet_contests" as const,
    label: "過去グルメ選手権CSVテンプレート",
    columns: GOURMET_CONTEST_IMPORT_COLUMNS,
    example: "contest,gp2025-01,第1回グルメ選手権,おすすめのお店を教えてください,m001,運営,2025-01-01T10:00:00+09:00,2025-01-31,優勝クーポン,過去大会の賞品,2025-03-31,https://example.com/image.jpg,,,山田太郎",
  },
];

function createCsvFileInput(accept: string) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.setAttribute("aria-hidden", "true");
  document.body.appendChild(input);
  return input;
}

export default function CsvImportScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const [history, setHistory] = useState<ImportRecord[]>(IMPORT_HISTORY);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [memberSources, setMemberSources] = useState<Partial<Record<"subscriptions" | "discord" | "customers", { name: string; csv: string }>>>({});
  const [memberDryRun, setMemberDryRun] = useState<MemberImportDryRun | null>(null);
  const [readiness, setReadiness] = useState<ImportReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [testImportCount, setTestImportCount] = useState(1);
  const [importConfirmation, setImportConfirmation] = useState("");
  const [memberImporting, setMemberImporting] = useState(false);
  const [bulkImportConfirmation, setBulkImportConfirmation] = useState("");
  const [bulkImportProgress, setBulkImportProgress] = useState<string | null>(null);
  const [reviewImportConfirmation, setReviewImportConfirmation] = useState("");
  const [historySource, setHistorySource] = useState<{
    name: string;
    preview: MemberHistoryImportPreview;
  } | null>(null);
  const [historyConfirmation, setHistoryConfirmation] = useState("");
  const [historyImporting, setHistoryImporting] = useState(false);
  const importMutation = trpc.migration.importCsv.useMutation();

  useEffect(() => {
    if (authUser?.role !== "admin") return;
    let active = true;
    setReadinessLoading(true);
    apiCall<{ configuration: ImportReadiness }>("/api/admin/member-import/readiness")
      .then((result) => active && setReadiness(result.configuration))
      .catch(() => active && setReadiness(null))
      .finally(() => active && setReadinessLoading(false));
    return () => {
      active = false;
    };
  }, [authUser?.role]);

  useEffect(() => {
    if (!Object.keys(memberSources).length) return;
    const timeout = setTimeout(() => {
      setMemberSources({});
      setMemberDryRun(null);
    }, 30 * 60_000);
    return () => clearTimeout(timeout);
  }, [memberSources]);

  if (authUser?.role !== "admin") {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 40 }}>
          管理者のみアクセスできます
        </Text>
      </ScreenContainer>
    );
  }

  const handleImport = (type: ImportRecord["type"]) => {
    if (typeof document === "undefined") {
      Alert.alert("PC版で操作してください", "個人情報を含むCSVの一括移行は、管理者用Web画面から行ってください。");
      return;
    }
    const input = createCsvFileInput(".csv,text/csv");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        input.remove();
        return;
      }
      const pending: ImportRecord = { id: `imp_${Date.now()}`, filename: file.name, importedAt: new Date().toLocaleString("ja-JP"), recordCount: 0, status: "processing", type };
      setHistory((current) => [pending, ...current]);
      try {
        const csvText = await file.text();
        const result = type === "gourmet_contests"
          ? await (async () => {
              const contests = parseGourmetContestImport(csvText);
              await saveImportedGourmetContests(contests);
              return { importedCount: contests.length + contests.reduce((sum, item) => sum + item.comments.length, 0), reviewCount: 0 };
            })()
          : await importMutation.mutateAsync({ type, filename: file.name, csvText });
        setHistory((current) => current.map((item) => item.id === pending.id ? { ...item, status: "success", recordCount: result.importedCount, errorMessage: result.reviewCount ? `${result.reviewCount}件は要確認です` : undefined } : item));
        Alert.alert("インポート完了", `${result.importedCount}件を取り込みました。${result.reviewCount ? ` ${result.reviewCount}件は管理者確認が必要です。` : ""}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "CSVを取り込めませんでした";
        setHistory((current) => current.map((item) => item.id === pending.id ? { ...item, status: "error", errorMessage: message } : item));
        Alert.alert("インポートエラー", message);
      } finally {
        input.remove();
      }
    };
    input.click();
  };

  const handleDownloadTemplate = (template: typeof CSV_TEMPLATES[0]) => {
    setSelectedTemplate(selectedTemplate === template.type ? null : template.type);
  };

  const handleMemberHistorySource = () => {
    if (typeof document === "undefined") return;
    const input = createCsvFileInput(".csv,text/csv");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        input.remove();
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        Alert.alert("ファイルが大きすぎます", "2MB以内の集計済みCSVを選択してください。");
        input.remove();
        return;
      }
      try {
        setHistorySource({ name: file.name, preview: parseMemberHistoryImport(await file.text()) });
        setHistoryConfirmation("");
      } catch (error) {
        Alert.alert("CSVを確認できませんでした", error instanceof Error ? error.message : "ファイル形式を確認してください。");
      } finally {
        input.remove();
      }
    };
    input.click();
  };

  const handleMemberHistoryCommit = async () => {
    if (!historySource || historyImporting) return;
    const expected = `IMPORT_HISTORY_${historySource.preview.rows.length}`;
    if (historyConfirmation !== expected) {
      Alert.alert("確認文字が一致しません", `${expected} と入力してください。`);
      return;
    }
    setHistoryImporting(true);
    try {
      const result = await apiCall<{
        success: boolean;
        runId: string;
        matchedCount: number;
        unmatchedCount: number;
        participationTotal: number;
        organizerTotal: number;
      }>("/api/admin/member-history-import/commit", {
        method: "POST",
        body: JSON.stringify({
          confirmation: expected,
          sourceFilename: historySource.name,
          rows: historySource.preview.rows,
        }),
      });
      setHistory((current) => [{
        id: result.runId,
        filename: historySource.name,
        importedAt: new Date().toLocaleString("ja-JP"),
        recordCount: result.matchedCount,
        status: "success",
        type: "participations",
        errorMessage: result.unmatchedCount ? `${result.unmatchedCount}名は会員未照合です` : undefined,
      }, ...current]);
      setHistorySource(null);
      setHistoryConfirmation("");
      Alert.alert(
        "参加・幹事回数を移行しました",
        `${result.matchedCount}名を更新しました。参加${result.participationTotal}回・幹事${result.organizerTotal}回です。${result.unmatchedCount ? ` ${result.unmatchedCount}名は会員未照合のため更新していません。` : ""}`,
      );
    } catch (error) {
      Alert.alert("移行できませんでした", error instanceof Error ? error.message : "データを確認してください。");
    } finally {
      setHistoryImporting(false);
    }
  };

  const handleMemberSource = (source: "subscriptions" | "discord" | "customers") => {
    if (typeof document === "undefined") return;
    const input = createCsvFileInput(".csv,text/csv,text/tab-separated-values");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        input.remove();
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        Alert.alert("ファイルが大きすぎます", "個人情報保護と端末負荷軽減のため、1ファイル20MB以内にしてください。");
        input.remove();
        return;
      }
      try {
        const csv = decodeCsvBuffer(await file.arrayBuffer());
        setMemberSources((current) => ({ ...current, [source]: { name: file.name, csv } }));
        setMemberDryRun(null);
      } finally {
        input.remove();
      }
    };
    input.click();
  };

  const handleMemberDryRun = () => {
    if (!memberSources.subscriptions || !memberSources.discord || !memberSources.customers) {
      Alert.alert("3ファイルを選択してください", "Squareサブスク一覧・Discordメンバー一覧・Square顧客ID一覧が必要です。");
      return;
    }
    try {
      setMemberDryRun(buildMemberImportDryRun(
        memberSources.subscriptions.csv,
        memberSources.discord.csv,
        memberSources.customers.csv,
      ));
    } catch (error) {
      Alert.alert("照合エラー", error instanceof Error ? error.message : "ファイルを照合できませんでした");
    }
  };

  const handleDownloadMemberDryRun = () => {
    if (!memberDryRun || typeof document === "undefined") return;
    const csv = exportMemberImportCsv(memberDryRun.candidates);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `irotas-member-migration-review-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleTestMemberImport = async () => {
    if (!memberDryRun || !readiness?.ready || memberImporting) return;
    const rows = memberDryRun.candidates
      .filter((candidate) => candidate.migration_action === "import")
      .slice(0, testImportCount);
    const expectedConfirmation = `IMPORT_${rows.length}`;
    if (!rows.length) {
      Alert.alert("登録対象がありません", "自動取込可能な会員を確認してください。");
      return;
    }
    if (importConfirmation !== expectedConfirmation) {
      Alert.alert("確認文字が一致しません", `${expectedConfirmation} と入力してください。`);
      return;
    }
    setMemberImporting(true);
    try {
      const result = await apiCall<{ success: boolean; runId: string; importedCount: number; createdCount: number; updatedCount: number }>(
        "/api/admin/member-import/commit",
        {
          method: "POST",
          body: JSON.stringify({
            confirmation: expectedConfirmation,
            sourceFilename: "reviewed-member-migration.csv",
            rows,
          }),
        },
      );
      setHistory((current) => [
        {
          id: result.runId,
          filename: "reviewed-member-migration.csv",
          importedAt: new Date().toLocaleString("ja-JP"),
          recordCount: result.importedCount,
          status: "success",
          type: "members",
        },
        ...current,
      ]);
      setImportConfirmation("");
      Alert.alert(
        "テスト登録が完了しました",
        `${result.importedCount}名を処理しました（新規${result.createdCount}名・既存更新${result.updatedCount}名）。ログイン確認後に次の登録へ進んでください。`,
      );
    } catch (error) {
      Alert.alert(
        "登録できませんでした",
        error instanceof Error ? error.message : "設定とデータを確認してください。",
      );
    } finally {
      setMemberImporting(false);
    }
  };

  const handleBulkMemberImport = async () => {
    if (!memberDryRun || !readiness?.ready || memberImporting) return;
    const rows = memberDryRun.candidates.filter((candidate) => candidate.migration_action === "import");
    const expectedConfirmation = `IMPORT_ALL_${rows.length}`;
    if (bulkImportConfirmation !== expectedConfirmation) {
      Alert.alert("確認文字が一致しません", `${expectedConfirmation} と入力してください。`);
      return;
    }
    setMemberImporting(true);
    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    try {
      for (let offset = 0; offset < rows.length; offset += 25) {
        const batch = rows.slice(offset, offset + 25);
        setBulkImportProgress(`${Math.min(offset + batch.length, rows.length)} / ${rows.length}名を処理中`);
        const result = await apiCall<{ success: boolean; importedCount: number; createdCount: number; updatedCount: number }>(
          "/api/admin/member-import/commit",
          {
            method: "POST",
            body: JSON.stringify({
              confirmation: `IMPORT_${batch.length}`,
              sourceFilename: "reviewed-member-migration.csv",
              rows: batch,
            }),
          },
        );
        processedCount += result.importedCount;
        createdCount += result.createdCount;
        updatedCount += result.updatedCount;
      }
      setHistory((current) => [
        {
          id: `bulk_${Date.now()}`,
          filename: "reviewed-member-migration.csv",
          importedAt: new Date().toLocaleString("ja-JP"),
          recordCount: processedCount,
          status: "success",
          type: "members",
        },
        ...current,
      ]);
      setBulkImportConfirmation("");
      Alert.alert("本登録が完了しました", `${processedCount}名を処理しました（新規${createdCount}名・既存更新${updatedCount}名）。`);
    } catch (error) {
      Alert.alert(
        "本登録を中断しました",
        `${processedCount}名まで完了しています。${error instanceof Error ? error.message : "設定とデータを確認してください。"}`,
      );
    } finally {
      setBulkImportProgress(null);
      setMemberImporting(false);
    }
  };

  const handleReviewedMemberImport = async () => {
    if (!memberDryRun || !readiness?.ready || memberImporting) return;
    const rows = memberDryRun.candidates.filter((candidate) => candidate.migration_action === "review");
    const expectedConfirmation = `IMPORT_REVIEW_${rows.length}`;
    if (!rows.length) {
      Alert.alert("要確認会員はいません", "追加で承認する会員はありません。");
      return;
    }
    if (reviewImportConfirmation !== expectedConfirmation) {
      Alert.alert("確認文字が一致しません", `${expectedConfirmation} と入力してください。`);
      return;
    }
    setMemberImporting(true);
    try {
      const result = await apiCall<{ success: boolean; importedCount: number; createdCount: number; updatedCount: number }>(
        "/api/admin/member-import/commit",
        {
          method: "POST",
          body: JSON.stringify({
            confirmation: expectedConfirmation,
            reviewApproved: true,
            sourceFilename: "approved-member-review.xlsx",
            rows,
          }),
        },
      );
      setReviewImportConfirmation("");
      Alert.alert(
        "承認済み会員を登録しました",
        `${result.importedCount}名を処理しました（新規${result.createdCount}名・既存更新${result.updatedCount}名）。`,
      );
    } catch (error) {
      Alert.alert(
        "承認済み会員を登録できませんでした",
        error instanceof Error ? error.message : "設定とデータを確認してください。",
      );
    } finally {
      setMemberImporting(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ marginLeft: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>
            CSV取り込み
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            決済会員・Discord・イベント履歴のインポート
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>
            既存会員データの3ファイル照合
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 5, marginBottom: 14 }}>
            本番DBへ書き込まずに、メールアドレスでSquare・Discord・顧客IDを照合します。SquareのUTF-16形式にも対応しています。
          </Text>
          <View style={{ backgroundColor: "#EAF6EF", borderRadius: 11, padding: 11, marginBottom: 12 }}>
            <Text style={{ color: "#196B39", fontSize: 11, lineHeight: 17, fontWeight: "700" }}>
              選択したCSVはこの端末内だけで処理され、サーバーへ送信・保存・ログ記録されません。30分後に画面上のデータを自動破棄します。
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            {([
              ["subscriptions", "Square サブスク一覧"],
              ["discord", "Discord メンバー一覧"],
              ["customers", "Square 顧客ID一覧"],
            ] as const).map(([source, label]) => (
              <Pressable
                key={source}
                onPress={() => handleMemberSource(source)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: memberSources[source] ? "#34C759" : colors.border,
                  backgroundColor: memberSources[source] ? "#34C7590D" : colors.background,
                  borderRadius: 12,
                  padding: 12,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <IconSymbol name={memberSources[source] ? "checkmark.circle.fill" : "doc.fill"} size={18} color={memberSources[source] ? "#34C759" : colors.muted} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{label}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                    {memberSources[source]?.name ?? "CSVファイルを選択"}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={handleMemberDryRun}
            style={({ pressed }) => ({
              marginTop: 14,
              backgroundColor: "#17171A",
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: "center",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "800" }}>安全に照合する（DBには未登録）</Text>
          </Pressable>

          {Object.keys(memberSources).length > 0 && (
            <Pressable
              onPress={() => {
                setMemberSources({});
                setMemberDryRun(null);
              }}
              style={({ pressed }) => ({ alignSelf: "center", paddingHorizontal: 12, paddingVertical: 9, marginTop: 4, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>選択した個人情報を今すぐ破棄</Text>
            </Pressable>
          )}

          {memberDryRun && (
            <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, marginBottom: 10 }}>照合結果</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[
                  ["自動取込可能", memberDryRun.summary.importableMembers, "#16803A"],
                  ["要確認", memberDryRun.summary.reviewMembers, "#C97813"],
                  ["移行対象外", memberDryRun.summary.excludedMembers, colors.muted],
                  ["一時停止", memberDryRun.summary.pausedAccess, "#A14C72"],
                ].map(([label, count, color]) => (
                  <View key={String(label)} style={{ width: "48%", backgroundColor: colors.background, borderRadius: 12, padding: 11 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{label}</Text>
                    <Text style={{ fontSize: 22, fontWeight: "900", color: String(color), marginTop: 2 }}>{Number(count).toLocaleString()}件</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 10 }}>
                元データ：サブスク {memberDryRun.summary.subscriptionRows.toLocaleString()}行／Discord {memberDryRun.summary.discordRows.toLocaleString()}行／顧客ID {memberDryRun.summary.customerRows.toLocaleString()}行
              </Text>
              {memberDryRun.summary.reviewMembers > 0 && (
                <View style={{ marginTop: 10, backgroundColor: "#FFF7E8", borderRadius: 11, padding: 11 }}>
                  <Text style={{ color: "#8A5700", fontSize: 12, fontWeight: "800", marginBottom: 5 }}>要確認の内訳（個人情報は非表示）</Text>
                  <Text style={{ color: "#8A5700", fontSize: 11, lineHeight: 18 }}>
                    重複履歴 {memberDryRun.summary.reviewReasons.duplicateSourceRecords}件{"\n"}
                    Square有効・Discord退会 {memberDryRun.summary.reviewReasons.discordWithdrawn}件{"\n"}
                    Discord情報なし {memberDryRun.summary.reviewReasons.missingDiscord}件
                  </Text>
                </View>
              )}
              <Pressable
                onPress={handleDownloadMemberDryRun}
                style={({ pressed }) => ({ marginTop: 12, borderWidth: 1, borderColor: "#D97FA8", borderRadius: 12, paddingVertical: 11, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: "#C46691", fontSize: 13, fontWeight: "800" }}>確認・修正用CSVをダウンロード</Text>
              </Pressable>

              <View style={{ marginTop: 16, backgroundColor: colors.background, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>初回テスト登録</Text>
                <Text style={{ fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 4 }}>
                  自動取込可能な会員から少人数だけ登録します。要確認・退会の会員は対象外です。一時停止中の会員は移行しますが、ログインは許可されません。
                </Text>
                {readinessLoading ? (
                  <ActivityIndicator style={{ marginVertical: 14 }} color="#D97FA8" />
                ) : (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    {[
                      ["メール認証", readiness?.authentication],
                      ["Square連携", readiness?.square],
                    ].map(([label, configured]) => (
                      <View key={String(label)} style={{ flexDirection: "row", alignItems: "center" }}>
                        <IconSymbol name={configured ? "checkmark.circle.fill" : "exclamationmark.circle.fill"} size={16} color={configured ? "#16803A" : "#C97813"} />
                        <Text style={{ marginLeft: 7, fontSize: 12, fontWeight: "700", color: configured ? "#16803A" : "#8A5700" }}>
                          {label}：{configured ? "設定済み" : "未設定"}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginTop: 13, marginBottom: 7 }}>テスト登録人数</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[1, 3, 5].map((count) => (
                    <Pressable
                      key={count}
                      onPress={() => {
                        setTestImportCount(count);
                        setImportConfirmation("");
                      }}
                      style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center", backgroundColor: testImportCount === count ? "#17171A" : colors.surface, borderWidth: 1, borderColor: testImportCount === count ? "#17171A" : colors.border }}
                    >
                      <Text style={{ color: testImportCount === count ? "#FFF" : colors.foreground, fontSize: 12, fontWeight: "800" }}>{count}名</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 12, marginBottom: 6 }}>
                  実行するには IMPORT_{Math.min(testImportCount, memberDryRun.summary.importableMembers)} と入力
                </Text>
                <TextInput
                  value={importConfirmation}
                  onChangeText={setImportConfirmation}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder={`IMPORT_${Math.min(testImportCount, memberDryRun.summary.importableMembers)}`}
                  placeholderTextColor={colors.muted}
                  style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, fontSize: 13 }}
                />
                <Pressable
                  disabled={!readiness?.ready || memberImporting}
                  onPress={handleTestMemberImport}
                  style={{ marginTop: 10, borderRadius: 11, paddingVertical: 12, alignItems: "center", backgroundColor: readiness?.ready ? "#C46691" : colors.border, opacity: memberImporting ? 0.6 : 1 }}
                >
                  {memberImporting ? <ActivityIndicator color="#FFF" /> : (
                    <Text style={{ color: readiness?.ready ? "#FFF" : colors.muted, fontSize: 13, fontWeight: "800" }}>
                      {readiness?.ready ? "少人数でテスト登録する" : "連携設定完了後に利用できます"}
                    </Text>
                  )}
                </Pressable>
              </View>

              <View style={{ marginTop: 12, backgroundColor: "#FFF7E8", borderRadius: 14, padding: 13, borderWidth: 1, borderColor: "#E7C98B" }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#6F4700" }}>確認済み会員を本登録</Text>
                <Text style={{ fontSize: 11, lineHeight: 17, color: "#8A5700", marginTop: 4 }}>
                  自動取込可能な{memberDryRun.summary.importableMembers.toLocaleString()}名のみを25名ずつ安全に登録します。要確認・退会の会員は含みません。一時停止中の会員は移行しますが、ログインは許可されません。途中で失敗した場合は完了済み人数を表示し、再実行しても重複登録されません。
                </Text>
                <Text style={{ fontSize: 11, color: "#8A5700", marginTop: 12, marginBottom: 6 }}>
                  実行するには IMPORT_ALL_{memberDryRun.summary.importableMembers} と入力
                </Text>
                <TextInput
                  value={bulkImportConfirmation}
                  onChangeText={setBulkImportConfirmation}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder={`IMPORT_ALL_${memberDryRun.summary.importableMembers}`}
                  placeholderTextColor={colors.muted}
                  style={{ borderWidth: 1, borderColor: "#E7C98B", backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, fontSize: 13 }}
                />
                <Pressable
                  disabled={!readiness?.ready || memberImporting}
                  onPress={handleBulkMemberImport}
                  style={{ marginTop: 10, borderRadius: 11, paddingVertical: 12, alignItems: "center", backgroundColor: readiness?.ready ? "#8A5700" : colors.border, opacity: memberImporting ? 0.6 : 1 }}
                >
                  {memberImporting ? <ActivityIndicator color="#FFF" /> : (
                    <Text style={{ color: readiness?.ready ? "#FFF" : colors.muted, fontSize: 13, fontWeight: "800" }}>
                      確認済み会員を本登録する
                    </Text>
                  )}
                </Pressable>
                {bulkImportProgress && (
                  <Text style={{ color: "#8A5700", fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 8 }}>{bulkImportProgress}</Text>
                )}
              </View>

              {memberDryRun.summary.reviewMembers > 0 && (
                <View style={{ marginTop: 12, backgroundColor: "#F5EEF9", borderRadius: 14, padding: 13, borderWidth: 1, borderColor: "#D8C4E4" }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: "#5E3974" }}>管理者確認済み会員を追加登録</Text>
                  <Text style={{ fontSize: 11, lineHeight: 17, color: "#6F4A83", marginTop: 4 }}>
                    確認用ファイルで「移行する」と判断した{memberDryRun.summary.reviewMembers}名を登録します。この操作は要確認会員専用で、移行対象外の会員は登録できません。
                  </Text>
                  <Text style={{ fontSize: 11, color: "#6F4A83", marginTop: 12, marginBottom: 6 }}>
                    実行するには IMPORT_REVIEW_{memberDryRun.summary.reviewMembers} と入力
                  </Text>
                  <TextInput
                    value={reviewImportConfirmation}
                    onChangeText={setReviewImportConfirmation}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder={`IMPORT_REVIEW_${memberDryRun.summary.reviewMembers}`}
                    placeholderTextColor={colors.muted}
                    style={{ borderWidth: 1, borderColor: "#D8C4E4", backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, fontSize: 13 }}
                  />
                  <Pressable
                    disabled={!readiness?.ready || memberImporting}
                    onPress={handleReviewedMemberImport}
                    style={{ marginTop: 10, borderRadius: 11, paddingVertical: 12, alignItems: "center", backgroundColor: readiness?.ready ? "#6F4A83" : colors.border, opacity: memberImporting ? 0.6 : 1 }}
                  >
                    {memberImporting ? <ActivityIndicator color="#FFF" /> : (
                      <Text style={{ color: readiness?.ready ? "#FFF" : colors.muted, fontSize: 13, fontWeight: "800" }}>
                        管理者確認済み会員を登録する
                      </Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ backgroundColor: "#F5EEF9", borderRadius: 18, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: "#D8C4E4" }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: "#4D2C61" }}>
            過去の参加回数・幹事回数
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: "#6F4A83", marginTop: 5 }}>
            Discord IDで既存会員と照合し、参加・幹事回数に加えて、ランク、XP、自己紹介、プロフィール画像、ロール、部活動を移行できます。名前の表記揺れには影響されません。
          </Text>
          <View style={{ backgroundColor: "#FFFFFFB8", borderRadius: 11, padding: 11, marginTop: 12 }}>
            <Text style={{ fontSize: 11, lineHeight: 17, color: "#5E3974", fontWeight: "700" }}>
              必須列：discord_user_id, participation_count, organizer_count{"\n"}
              任意列：xp, member_rank, bio, avatar_url, discord_roles, club_ids{"\n"}
              複数のロール・部活IDは | 区切りで入力してください。任意列が空の場合、現在値を保持します。{"\n"}
              幹事情報をまだ用意していない場合は organizer_count を0にしてください。
            </Text>
          </View>
          <Pressable
            onPress={handleMemberHistorySource}
            style={({ pressed }) => ({
              marginTop: 12,
              borderWidth: 1,
              borderColor: historySource ? "#34C759" : "#B997CB",
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <IconSymbol name={historySource ? "checkmark.circle.fill" : "doc.fill"} size={18} color={historySource ? "#34C759" : "#6F4A83"} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>集計済みCSVを選択</Text>
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{historySource?.name ?? "CSVファイルを選択"}</Text>
            </View>
          </Pressable>
          {historySource && (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  ["照合対象", historySource.preview.rows.length, "名"],
                  ["参加履歴", historySource.preview.participationTotal, "回"],
                  ["幹事履歴", historySource.preview.organizerTotal, "回"],
                ].map(([label, value, unit]) => (
                  <View key={String(label)} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 9 }}>
                    <Text style={{ color: colors.muted, fontSize: 10 }}>{label}</Text>
                    <Text style={{ color: "#5E3974", fontSize: 18, fontWeight: "900", marginTop: 2 }}>{Number(value).toLocaleString()}{unit}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 11, color: "#6F4A83", marginTop: 12, marginBottom: 6 }}>
                実行するには IMPORT_HISTORY_{historySource.preview.rows.length} と入力
              </Text>
              <TextInput
                value={historyConfirmation}
                onChangeText={setHistoryConfirmation}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={`IMPORT_HISTORY_${historySource.preview.rows.length}`}
                placeholderTextColor={colors.muted}
                style={{ borderWidth: 1, borderColor: "#D8C4E4", backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, fontSize: 13 }}
              />
              <Pressable
                disabled={historyImporting}
                onPress={handleMemberHistoryCommit}
                style={{ marginTop: 10, borderRadius: 11, paddingVertical: 12, alignItems: "center", backgroundColor: "#6F4A83", opacity: historyImporting ? 0.6 : 1 }}
              >
                {historyImporting ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>Discord会員情報を本番反映する</Text>}
              </Pressable>
            </View>
          )}
        </View>

        {/* インポートボタン */}
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          データをインポート
        </Text>
        <View style={{ gap: 10, marginBottom: 24 }}>
          {(["members", "events", "participations", "organizers", "gourmet_contests"] as const).map((type) => (
            <Pressable
              key={type}
              onPress={() => handleImport(type)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 16,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: TYPE_COLORS[type] + "20",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <IconSymbol
                  name={type === "members" ? "person.2.fill" : type === "events" ? "calendar" : type === "participations" ? "checkmark.circle.fill" : type === "gourmet_contests" ? "trophy.fill" : "person.badge.plus"}
                  size={20}
                  color={TYPE_COLORS[type]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                  {TYPE_LABELS[type]}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  CSVファイルを選択してインポート
                </Text>
              </View>
              <IconSymbol name="arrow.up.doc.fill" size={18} color={TYPE_COLORS[type]} />
            </Pressable>
          ))}
        </View>

        {/* テンプレート */}
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          CSVテンプレート
        </Text>
        <View style={{ gap: 10, marginBottom: 24 }}>
          {CSV_TEMPLATES.map((template) => (
            <View key={template.type}>
              <Pressable
                onPress={() => handleDownloadTemplate(template)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.surface,
                  borderRadius: 14,
                  padding: 14,
                  opacity: pressed ? 0.7 : 1,
                  borderBottomLeftRadius: selectedTemplate === template.type ? 0 : 14,
                  borderBottomRightRadius: selectedTemplate === template.type ? 0 : 14,
                })}
              >
                <IconSymbol name="doc.text.fill" size={18} color={TYPE_COLORS[template.type]} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.foreground, marginLeft: 10 }}>
                  {template.label}
                </Text>
                <IconSymbol
                  name={selectedTemplate === template.type ? "chevron.up" : "chevron.down"}
                  size={14}
                  color={colors.muted}
                />
              </Pressable>
              {selectedTemplate === template.type && (
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderTopWidth: 0.5,
                    borderTopColor: colors.border,
                    borderBottomLeftRadius: 14,
                    borderBottomRightRadius: 14,
                    padding: 14,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>
                    列名
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.foreground,
                      fontFamily: "monospace",
                      backgroundColor: colors.background,
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 10,
                    }}
                  >
                    {template.columns.join(",")}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>
                    サンプル行
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.foreground,
                      fontFamily: "monospace",
                      backgroundColor: colors.background,
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    {template.example}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* 取り込み履歴 */}
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          取り込み履歴
        </Text>
        {history.length === 0 && (
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 20 }}>
            この画面で取り込んだ履歴はまだありません
          </Text>
        )}
        {history.map((record) => (
          <View
            key={record.id}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 14,
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: TYPE_COLORS[record.type] + "20",
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  marginRight: 8,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: TYPE_COLORS[record.type] }}>
                  {TYPE_LABELS[record.type]}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor:
                    record.status === "success" ? "#34C75920" : record.status === "error" ? "#FF3B3020" : "#A7C7E720",
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color:
                      record.status === "success" ? "#34C759" : record.status === "error" ? "#FF3B30" : "#A7C7E7",
                  }}
                >
                  {record.status === "success" ? "成功" : record.status === "error" ? "エラー" : "処理中"}
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 11, color: colors.muted, textAlign: "right" }}>
                {record.importedAt}
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>
              {record.filename}
            </Text>
            {record.status === "success" && (
              <Text style={{ fontSize: 13, color: "#34C759" }}>
                {record.recordCount}件のデータを取り込みました
              </Text>
            )}
            {record.status === "error" && record.errorMessage && (
              <Text style={{ fontSize: 13, color: "#FF3B30" }}>
                エラー: {record.errorMessage}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
