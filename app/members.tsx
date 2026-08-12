import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { MEMBERS, CURRENT_USER, DEFAULT_AVATAR, RANK_COLORS, RANK_LABELS, type MemberRank } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { useAuthContext } from "@/lib/auth-context";
import { matchesAllSearchWords } from "@/lib/multi-word-search";

function normalizeRank(value?: string | null): MemberRank {
  if (/プラチナ|platinum/i.test(value ?? "")) return "platinum";
  if (/ゴールド|gold/i.test(value ?? "")) return "gold";
  if (/シルバー|silver/i.test(value ?? "")) return "silver";
  return "regular";
}

export default function MembersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const { data: directory } = trpc.memberData.directory.useQuery(undefined, { enabled: Boolean(authUser) });
  const [searchText, setSearchText] = useState("");

  const searchableMembers = useMemo(() => directory?.length ? directory.map((member) => ({
    id: member.memberId ?? `member-${member.userId ?? "unknown"}`,
    name: member.displayName ?? "IRO+メンバー",
    rank: normalizeRank(member.memberRank),
    generation: Number(member.memberTerm?.match(/\d+/)?.[0] ?? 0),
    avatar: DEFAULT_AVATAR,
    bio: "",
    joinedAt: "",
    isCurrentUser: member.userId === authUser?.id,
    isDatabaseMember: true,
  })) : MEMBERS.map((member) => ({ ...member, isCurrentUser: member.id === CURRENT_USER.id, isDatabaseMember: false })), [authUser?.id, directory]);

  const filteredMembers = useMemo(() => {
    return searchableMembers.filter((member) => matchesAllSearchWords(searchText, [member.name, member.id]));
  }, [searchText, searchableMembers]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.foreground }}>
          メンバー検索
        </Text>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="名前または会員IDで検索"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, marginLeft: 8, fontSize: 14, color: colors.foreground }}
          />
        </View>
      </View>

      {/* Member list */}
      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const rankColor = RANK_COLORS[item.rank];
          const isMe = item.isCurrentUser;
          return (
            <Pressable
              onPress={() => { if (!item.isDatabaseMember) router.push({ pathname: "/member-profile", params: { id: item.id } }); }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border,
                backgroundColor: pressed ? colors.surface : "transparent",
              })}
            >
              <View style={{ position: "relative" }}>
                <Image
                  source={item.avatar}
                  style={{ width: 48, height: 48, borderRadius: 24 }}
                  contentFit="cover"
                />
                <View
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    backgroundColor: rankColor,
                    borderRadius: 8,
                    width: 16,
                    height: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1.5,
                    borderColor: colors.background,
                  }}
                >
                  <IconSymbol name="crown.fill" size={8} color="#FFF" />
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                    {item.name}
                  </Text>
                  <NewMemberMark member={item} />
                  {isMe && (
                    <View
                      style={{
                        backgroundColor: "#E8A0BF20",
                        borderRadius: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#E8A0BF" }}>自分</Text>
                    </View>
                  )}
                  <View
                    style={{
                      backgroundColor: rankColor + "20",
                      borderRadius: 8,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "700", color: rankColor }}>
                      {RANK_LABELS[item.rank]}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  ID: {item.id} · {item.generation}期生
                </Text>
                {item.bio && (
                  <Text
                    style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {item.bio}
                  </Text>
                )}
              </View>
              {!item.isDatabaseMember ? <IconSymbol name="chevron.right" size={16} color={colors.muted} /> : null}
            </Pressable>
          );
        }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <IconSymbol name="person.2.fill" size={40} color={colors.border} />
            <Text style={{ fontSize: 15, color: colors.muted, marginTop: 12 }}>
              メンバーが見つかりません
            </Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}
