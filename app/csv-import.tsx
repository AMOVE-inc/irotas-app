import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, isAdmin } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
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
  type: "members" | "events" | "points";
  errorMessage?: string;
}

const IMPORT_HISTORY: ImportRecord[] = [
  {
    id: "imp1",
    filename: "members_2026_03.csv",
    importedAt: "2026-03-28 14:30",
    recordCount: 45,
    status: "success",
    type: "members",
  },
  {
    id: "imp2",
    filename: "points_march.csv",
    importedAt: "2026-03-25 10:15",
    recordCount: 120,
    status: "success",
    type: "points",
  },
  {
    id: "imp3",
    filename: "events_q1.csv",
    importedAt: "2026-03-20 16:45",
    recordCount: 0,
    status: "error",
    type: "events",
    errorMessage: "列名が一致しません: 'event_date' が見つかりません",
  },
];

const TYPE_LABELS = { members: "会員データ", events: "イベント", points: "ポイント" };
const TYPE_COLORS = { members: "#E8A0BF", events: "#A7C7E7", points: "#FF9500" };

const CSV_TEMPLATES = [
  {
    type: "members" as const,
    label: "会員データCSVテンプレート",
    columns: ["id", "name", "email", "branch", "generation", "rank", "points", "joined_at"],
    example: "m001,山田花子,hanako@example.com,東京,5,silver,1200,2024-01-15",
  },
  {
    type: "events" as const,
    label: "イベントCSVテンプレート",
    columns: ["id", "title", "date", "time", "location", "capacity", "price", "status"],
    example: "e001,春のランチ会,2026-04-15,12:00,銀座レストラン,20,5000,open",
  },
  {
    type: "points" as const,
    label: "ポイントCSVテンプレート",
    columns: ["member_id", "points", "reason", "date"],
    example: "m001,500,イベント参加,2026-03-28",
  },
];

export default function CsvImportScreen() {
  const colors = useColors();
  const router = useRouter();
  const [history, setHistory] = useState<ImportRecord[]>(IMPORT_HISTORY);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  if (!isAdmin(CURRENT_USER)) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 40 }}>
          管理者のみアクセスできます
        </Text>
      </ScreenContainer>
    );
  }

  const handleImport = (type: ImportRecord["type"]) => {
    Alert.alert(
      "CSVファイルを選択",
      `${TYPE_LABELS[type]}のCSVファイルをインポートします。\n\n（実機ではファイルピッカーが開きます）`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "インポート",
          onPress: () => {
            // シミュレート: 処理中 → 成功
            const newRecord: ImportRecord = {
              id: `imp_${Date.now()}`,
              filename: `${type}_${new Date().toISOString().split("T")[0]}.csv`,
              importedAt: new Date().toLocaleString("ja-JP"),
              recordCount: Math.floor(Math.random() * 50) + 10,
              status: "success",
              type,
            };
            setHistory([newRecord, ...history]);
            Alert.alert("インポート完了", `${newRecord.recordCount}件のデータを取り込みました。`);
          },
        },
      ],
    );
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
            会員・イベント・ポイントデータのインポート
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* インポートボタン */}
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          データをインポート
        </Text>
        <View style={{ gap: 10, marginBottom: 24 }}>
          {(["members", "events", "points"] as const).map((type) => (
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
                  name={type === "members" ? "person.2.fill" : type === "events" ? "calendar" : "star.fill"}
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
