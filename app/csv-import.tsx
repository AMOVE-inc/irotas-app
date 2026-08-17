import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { GOURMET_CONTEST_IMPORT_COLUMNS, parseGourmetContestImport, saveImportedGourmetContests } from "@/lib/gourmet-contest-import";
import {
  buildMemberImportDryRun,
  decodeCsvBuffer,
  exportMemberImportCsv,
  type MemberImportDryRun,
} from "@/lib/member-import-dry-run";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

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

export default function CsvImportScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const [history, setHistory] = useState<ImportRecord[]>(IMPORT_HISTORY);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [memberSources, setMemberSources] = useState<Partial<Record<"subscriptions" | "discord" | "customers", { name: string; csv: string }>>>({});
  const [memberDryRun, setMemberDryRun] = useState<MemberImportDryRun | null>(null);
  const importMutation = trpc.migration.importCsv.useMutation();

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
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
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
      }
    };
    input.click();
  };

  const handleDownloadTemplate = (template: typeof CSV_TEMPLATES[0]) => {
    setSelectedTemplate(selectedTemplate === template.type ? null : template.type);
  };

  const handleMemberSource = (source: "subscriptions" | "discord" | "customers") => {
    if (typeof document === "undefined") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv,text/tab-separated-values";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        Alert.alert("ファイルが大きすぎます", "個人情報保護と端末負荷軽減のため、1ファイル20MB以内にしてください。");
        return;
      }
      const csv = decodeCsvBuffer(await file.arrayBuffer());
      setMemberSources((current) => ({ ...current, [source]: { name: file.name, csv } }));
      setMemberDryRun(null);
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
