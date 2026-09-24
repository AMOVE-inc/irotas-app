import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { MemberClubLeaderBadges, MemberRankBadge, MemberRoleBadge, stripRankFromName } from "@/components/member-rank-badge";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { DEFAULT_AVATAR, type MemberRank } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { AuthenticatedImage as Image } from "@/components/authenticated-image";
import { useRouter } from "expo-router";
import { useEffect, useState, useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
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
  const viewerKey = String(authUser?.id ?? "");
  const [directory, setDirectory] = useState<Api.PublicMember[] | null>(() => viewerKey ? Api.peekMemberDirectory(viewerKey) ?? null : null);
  const [directoryError, setDirectoryError] = useState(false);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    if (!authUser) { setDirectory(null); setDirectoryError(false); return; }
    let active = true;
    setDirectoryError(false);
    setDirectory(Api.peekMemberDirectory(viewerKey) ?? null);
    void Api.getMemberDirectory(viewerKey)
      .then((members) => { if (active) setDirectory(members); })
      .catch(() => { if (active) { setDirectory([]); setDirectoryError(true); } });
    return () => { active = false; };
  }, [viewerKey]);

  // サーバーの会員一覧が届くまでモック会員を描画しない。
  const searchableMembers = useMemo(() => directory !== null ? directory.map((member) => ({
    id: member.id,
    name: stripRankFromName(member.displayName),
    rawName: member.displayName,
    publicUserId: member.publicUserId,
    rank: normalizeRank(member.memberRank),
    accessRole: member.accessRole,
    discordRoles: member.discordRoles,
    generation: Number(member.memberTerm?.match(/\d+/)?.[0] ?? 0),
    avatar: typeof member.profile.avatarUrl === "string" ? { uri: member.profile.avatarUrl } : DEFAULT_AVATAR,
    bio: typeof member.profile.bio === "string" ? member.profile.bio : "",
    joinedAt: member.joinedAt,
    xp: member.xp,
    participationCount: member.participationCount,
    isFollowing: member.isFollowing,
    isCurrentUser: member.userId === authUser?.id,
    isDatabaseMember: true,
  })) : [], [authUser?.id, directory]);

  const filteredMembers = useMemo(() => {
    return searchableMembers.filter((member) => matchesAllSearchWords(searchText, [member.name, member.publicUserId ?? ""]));
  }, [searchText, searchableMembers]);
  const listRows = useMemo(() => {
    if (searchText.trim()) return filteredMembers;
    const rankScore: Record<MemberRank, number> = { regular: 0, silver: 1, gold: 2, platinum: 3 };
    const featured = [...searchableMembers]
      .filter((member) => !member.isCurrentUser)
      .sort((left, right) => rankScore[right.rank] - rankScore[left.rank] || right.xp - left.xp || right.participationCount - left.participationCount)
      .slice(0, 10);
    const newest = [...searchableMembers]
      .filter((member) => !member.isCurrentUser)
      .sort((left, right) => Date.parse(right.joinedAt) - Date.parse(left.joinedAt))
      .slice(0, 10);
    return [
      { id: "section-featured", sectionTitle: "注目メンバー", sectionDescription: "会員ランクが上位の10名" },
      ...featured,
      { id: "section-new", sectionTitle: "新規メンバー", sectionDescription: "入会日が新しい10名" },
      ...newest,
    ];
  }, [filteredMembers, searchText, searchableMembers]);

  const toggleFollow = async (memberId: string, following: boolean) => {
    setDirectory((current) => current?.map((member) => member.id === memberId ? { ...member, isFollowing: following, followerCount: Math.max(0, member.followerCount + (following ? 1 : -1)) } : member) ?? current);
    try {
      const updated = await Api.setMemberFollow(memberId, following);
      setDirectory((current) => current?.map((member) => member.id === memberId ? updated : member) ?? current);
    } catch {
      setDirectory((current) => current?.map((member) => member.id === memberId ? { ...member, isFollowing: !following, followerCount: Math.max(0, member.followerCount + (following ? -1 : 1)) } : member) ?? current);
    }
  };

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
            placeholder="名前または公開ユーザーIDで検索"
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
        data={listRows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          if ("sectionTitle" in item) return <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, backgroundColor: colors.background }}><Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>{item.sectionTitle}</Text><Text style={{ marginTop: 2, fontSize: 12, color: colors.muted }}>{item.sectionDescription}</Text></View>;
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
                  {item.publicUserId ? `@${item.publicUserId}` : "公開ユーザーID未設定"}{item.generation > 0 ? ` · ${item.generation}期生` : ""}
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
              {!isMe ? <Pressable onPress={(event) => { event.stopPropagation(); void toggleFollow(item.id, !item.isFollowing); }} style={{ borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: item.isFollowing ? colors.surface : "#E8A0BF" }}><Text style={{ fontSize: 12, fontWeight: "800", color: item.isFollowing ? colors.muted : "#FFF" }}>{item.isFollowing ? "フォロー中" : "＋フォロー"}</Text></Pressable> : null}
            </Pressable>
          );
        }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            {directory === null ? <><ActivityIndicator size="large" color="#E8A0BF" /><Text style={{ fontSize: 15, color: colors.muted, marginTop: 12 }}>メンバーを読み込んでいます…</Text></> : <><IconSymbol name="person.2.fill" size={40} color={colors.border} /><Text style={{ fontSize: 15, color: colors.muted, marginTop: 12 }}>メンバーが見つかりません</Text></>}
          </View>
        }
      />
    </ScreenContainer>
  );
}
