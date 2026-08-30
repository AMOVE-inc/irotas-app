import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";

const items = [["ホーム", "house.fill", "/"], ["イベント", "calendar", "/events"], ["掲示板", "doc.text.fill", "/board"], ["チャット", "bubble.left.and.bubble.right.fill", "/chats"], ["マイページ", "person.fill", "/profile"]] as const;
export function PersistentBottomNav({ active }: { active?: string }) {
  const colors = useColors(); const router = useRouter();
  return <View style={[{ position: "absolute", left: 12, right: 12, bottom: Platform.OS === "web" ? 0 : 6, height: 72, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", zIndex: 50, shadowColor: "#6E5260", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 18, elevation: 10 }, Platform.OS === "web" ? ({ position: "fixed" } as any) : null]}>{items.map(([label, icon, path]) => <Pressable key={path} onPress={() => router.replace(path as any)} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><IconSymbol name={icon} size={24} color={active === path ? colors.primary : colors.muted} /><Text style={{ marginTop: 4, fontSize: 9, fontWeight: "800", color: active === path ? colors.primary : colors.muted }}>{label}</Text></Pressable>)}</View>;
}
