import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { MemberClubLeaderBadges, MemberRankBadge, MemberRoleBadge, stripRankFromName } from "@/components/member-rank-badge";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { MEMBERS, CURRENT_USER, DEFAULT_AVATAR, type MemberRank } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState, useMemo } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useAuthContext } from "@/lib/auth-context";
import { matchesAllSearchWords } from "@/lib/multi-word-search";
import * as Api from "@/lib/_core/api";

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
  const [directory, setDirectory] = useState<Api.PublicMember[] | null>(null);
  const [directoryError, setDirectoryError] = useState(false);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    if (!authUser) { setDirectory(null); setDirectoryError(false); return; }
    let active = true;
    setDirectoryError(false);
    void Api.getMemberDirectory()
      .then((members) => { if (active) setDirectory(members); })
      .catch(() => { if (active) { setDirectory([]); setDirectoryError(true); } });
    return () => { active = false; };
  }, [authUser]);

  // サーバーの会員一覧が届くまでモック会員を描画しない。
  const searchableMembers = useMemo(() => directory !== null ? directory.map((member) => ({
    id: member.id,
    name: stripRankFromName(member.displayName),
    rawName: member.displayName,
    rank: normalizeRank(member.memberRank),
    accessRole: member.accessRole,
    discordRoles: member.discordRoles,
    generation: Number(member.memberTerm?.match(/\d+/)?.[0] ?? 0),
    avatar: typeof member.profile.avatarUrl === "string" ? { uri: member.profile.avatarUrl } : DEFAULT_AVATAR,
    bio: typeof member.profile.bio === "string" ? member.profile.bio : "",
    joinedAt: member.joinedAt,
    isCurrentUser: member.userId === authUser?.id,
    isDatabaseMember: true,
  })) : [], [authUser?.id, directory]);

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
        {directoryError ? (
          <Text style={{ marginTop: 8, fontSize: 12, color: "#D94C55" }}>
            メンバー情報を読み込めませんでした。時間をおいて再度お試しください。
          </Text>
        ) : null}
      </View>

      {/* Member list */}
      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMe = item.isCurrentUser;
          return (
            <Pressable
              onPress={() => router.push({ pathname: "/member-profile", params: { id: item.id } })}
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
                  <MemberRankBadge rank={item.rank} name={item.name} role={item.accessRole} compact />
                  <MemberRoleBadge name={item.accessRole === "club_leader" ? "" : item.rawName} role={item.accessRole} compact />
                  <MemberClubLeaderBadges roles={item.discordRoles} compact />
                </View>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  ID: {item.id}{item.generation > 0 ? ` · ${item.generation}期生` : ""}
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
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
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
