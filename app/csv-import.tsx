import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState } from "react";
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
  type: "members" | "events" | "participations" | "organizers";
  errorMessage?: string;
}

const IMPORT_HISTORY: ImportRecord[] = [];

const TYPE_LABELS = { members: "決済会員・Discord", events: "イベント履歴", participations: "参加履歴", organizers: "幹事履歴" };
const TYPE_COLORS = { members: "#E8A0BF", events: "#A7C7E7", participations: "#FF9500", organizers: "#7D6A92" };

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
];

export default function CsvImportScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const [history, setHistory] = useState<ImportRecord[]>(IMPORT_HISTORY);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const importMutation = trpc.migration.importCsv.useMutation();

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
        const result = await importMutation.mutateAsync({ type, filename: file.name, csvText: await file.text() });
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
        {/* インポートボタン */}
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          データをインポート
        </Text>
        <View style={{ gap: 10, marginBottom: 24 }}>
          {(["members", "events", "participations", "organizers"] as const).map((type) => (
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
                  name={type === "members" ? "person.2.fill" : type === "events" ? "calendar" : type === "participations" ? "checkmark.circle.fill" : "person.badge.plus"}
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
