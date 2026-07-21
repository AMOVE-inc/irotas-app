import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  RANK_COLORS,
  RANK_LABELS,
  CURRENT_USER,
  getMemberById,
  getNextRankInfo,
} from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { getOrCreateDMChat } from "@/lib/chat-store";
import { useClubs } from "@/lib/club-store";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

export default function MemberProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const clubs = useClubs();

  const member = getMemberById(id || "");

  if (!member) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16, color: colors.muted }}>メンバーが見つかりません</Text>
        </View>
      </ScreenContainer>
    );
  }

  const memberClubs = clubs.filter((club) => club.memberIds.includes(member.id));
  const rankColor = RANK_COLORS[member.rank];
  const isSelf = member.id === CURRENT_USER.id;

  const handleStartDM = () => {
    const roomId = getOrCreateDMChat(CURRENT_USER.id, member.id, member.name);
    router.push({ pathname: "/chat", params: { id: roomId } });
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginLeft: 12 }}>
          プロフィール
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile Header */}
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <View style={{ position: "relative" }}>
            <Image
              source={member.avatar}
              style={{ width: 90, height: 90, borderRadius: 45 }}
              contentFit="cover"
            />
            <View
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                backgroundColor: rankColor,
                borderRadius: 12,
                width: 24,
                height: 24,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: colors.background,
              }}
            >
              <IconSymbol name="crown.fill" size={12} color="#FFF" />
            </View>
          </View>

          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground, marginTop: 12 }}>
            {member.name}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8 }}>
            <View
              style={{
                backgroundColor: rankColor + "20",
                borderColor: rankColor,
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: rankColor }}>
                {RANK_LABELS[member.rank]}会員
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.muted }}>
              {member.branch === "kanto" ? "関東支部" : "関西支部"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <IconSymbol name="person.fill" size={14} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 4 }}>
                {member.generation}期生
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <IconSymbol name="calendar" size={14} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 4 }}>
                {new Date(member.joinedAt).getFullYear()}年入会
              </Text>
            </View>
          </View>

          {/* DM Button */}
          {!isSelf && (
            <Pressable
              onPress={handleStartDM}
              style={{
                marginTop: 16,
                backgroundColor: "#E8A0BF",
                borderRadius: 22,
                paddingHorizontal: 28,
                paddingVertical: 11,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <IconSymbol name="message.fill" size={16} color="#FFF" />
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>
                メッセージを送る
              </Text>
            </Pressable>
          )}
        </View>

        {/* Bio */}
        {member.bio && (
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
              自己紹介
            </Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16 }}>
              <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground }}>
                {member.bio}
              </Text>
            </View>
          </View>
        )}

        {/* Interests */}
        {member.interests && member.interests.length > 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
              好きなグルメ
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {member.interests.map((interest: string, i: number) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: "#E8A0BF15",
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontSize: 13, color: "#E8A0BF", fontWeight: "600" }}>
                    {interest}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Clubs */}
        {memberClubs.length > 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
              参加中の部活動
            </Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: "hidden" }}>
              {memberClubs.map((club, index) => (
                <Pressable
                  key={club.id}
                  onPress={() => router.push({ pathname: "/clubs" })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 14,
                    borderBottomWidth: index < memberClubs.length - 1 ? 0.5 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 24, marginRight: 12 }}>{club.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                      {club.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {club.memberIds.length}人
                    </Text>
                  </View>
                  {club.leaderId === member.id && (
                    <View
                      style={{
                        backgroundColor: "#FFD70020",
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#FFD700" }}>部長</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={{ marginHorizontal: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
            活動状況
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: "800", color: rankColor }}>
                {member.points.toLocaleString()}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>ポイント</Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: "800", color: "#A7C7E7" }}>
                {memberClubs.length}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>部活動</Text>
            </View>
          </View>
          {/* Points progress mini bar */}
          {(() => {
            const nextInfo = getNextRankInfo(member.points);
            if (!nextInfo) return (
              <View style={{ marginTop: 8, alignItems: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: rankColor }}>最高ランク達成</Text>
              </View>
            );
            return (
              <View style={{ marginTop: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.muted }}>次: {RANK_LABELS[nextInfo.nextRank]}</Text>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: rankColor }}>あと{nextInfo.pointsNeeded}pt</Text>
                </View>
                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ height: "100%", width: `${nextInfo.progress * 100}%`, backgroundColor: rankColor, borderRadius: 3 }} />
                </View>
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
