import { Modal, Pressable, Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export function SocialMemberListModal({ visible, kind, onClose }: { visible: boolean; kind: "followers" | "following"; onClose: () => void }) {
  const colors = useColors();
  const title = kind === "followers" ? "フォロワー" : "フォロー";
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><View style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 19, fontWeight: "900", color: colors.foreground }}>{title}</Text><Pressable onPress={onClose} style={{ padding: 5 }}><IconSymbol name="xmark" size={21} color={colors.foreground} /></Pressable></View><View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 30 }}><IconSymbol name="person.2.fill" size={44} color={colors.border} /><Text style={{ marginTop: 12, fontSize: 15, fontWeight: "800", color: colors.foreground }}>{title}はまだいません</Text><Text style={{ marginTop: 5, fontSize: 12, color: colors.muted }}>フォロー機能の開始時点は全員0人です。</Text></View></View></Modal>;
}
