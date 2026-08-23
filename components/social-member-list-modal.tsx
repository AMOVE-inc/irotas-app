import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View, FlatList } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { DEFAULT_AVATAR } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import * as Api from "@/lib/_core/api";

export function SocialMemberListModal({ visible, kind, memberId, onClose }: { visible: boolean; kind: "followers" | "following"; memberId?: string; onClose: () => void }) {
  const colors = useColors();
  const router = useRouter();
  const title = kind === "followers" ? "フォロワー" : "フォロー";
  const [members, setMembers] = useState<Api.PublicMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !memberId) { setMembers([]); return; }
    let active = true;
    setLoading(true);
    void Api.getMemberSocialList(memberId, kind)
      .then((value) => { if (active) setMembers(value); })
      .catch(() => { if (active) setMembers([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, memberId, visible]);

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ flex: 1, fontSize: 19, fontWeight: "900", color: colors.foreground }}>{title}</Text>
        <Pressable onPress={onClose} style={{ padding: 5 }}><IconSymbol name="xmark" size={21} color={colors.foreground} /></Pressable>
      </View>
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Pressable onPress={() => { onClose(); router.push({ pathname: "/member-profile", params: { id: item.id } }); }} style={{ flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Image source={typeof item.profile.avatarUrl === "string" ? { uri: item.profile.avatarUrl } : DEFAULT_AVATAR} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" />
          <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{item.displayName}</Text><Text style={{ fontSize: 12, color: colors.muted }}>{item.id}{item.isFriend ? " · 友達" : ""}</Text></View>
          <IconSymbol name="chevron.right" size={16} color={colors.muted} />
        </Pressable>}
        ListEmptyComponent={<View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 60 }}><IconSymbol name="person.2.fill" size={44} color={colors.border} /><Text style={{ marginTop: 12, fontSize: 15, fontWeight: "800", color: colors.foreground }}>{loading ? "読み込み中です" : `${title}はまだいません`}</Text></View>}
      />
    </View>
  </Modal>;
}
