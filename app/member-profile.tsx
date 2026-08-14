import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PROFILE_DETAILS_STORAGE_KEY, type ProfileDetails } from "@/constants/profile-options";
import { getPrivateMemberNote, savePrivateMemberNote } from "@/lib/profile-notes-store";
import { getPublishedAgeBand } from "@/lib/member-age";
import { SocialMemberListModal } from "@/components/social-member-list-modal";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

export default function MemberProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const clubs = useClubs();

  const member = getMemberById(id || "");
  const [selfDetails, setSelfDetails] = useState<Partial<ProfileDetails> | null>(null);
  const [selfBio, setSelfBio] = useState<string | null>(null);
  const [selfName, setSelfName] = useState<string | null>(null);
  const [selfAvatar, setSelfAvatar] = useState<string | null>(null);
  const [privateNote, setPrivateNote] = useState("");
  const [socialList, setSocialList] = useState<"followers" | "following" | null>(null);

  useEffect(() => {
    if (member?.id !== CURRENT_USER.id) { setSelfDetails(null); setSelfBio(null); setSelfName(null); setSelfAvatar(null); return; }
    void Promise.all([AsyncStorage.getItem(PROFILE_DETAILS_STORAGE_KEY), AsyncStorage.getItem("profile_bio"), AsyncStorage.getItem("profile_name"), AsyncStorage.getItem("profile_avatar_uri")]).then(([raw, bio, name, avatar]) => {
      setSelfDetails(raw ? JSON.parse(raw) as ProfileDetails : null); setSelfBio(bio); setSelfName(name); setSelfAvatar(avatar);
    });
  }, [member?.id]);

  useEffect(() => {
    if (!id || id === CURRENT_USER.id) return;
    void getPrivateMemberNote(CURRENT_USER.id, id).then(setPrivateNote);
  }, [id]);

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
  const details: Partial<ProfileDetails> = selfDetails ?? {
    birthDate: member.birthDate, showAge: member.showAge, hometown: member.hometown, residence: member.residence,
    occupation: member.occupation, hobbies: member.hobbies, favoriteCuisines: member.favoriteCuisines ?? member.interests,
    favoriteAlcohol: member.favoriteAlcohol, dislikedFoods: member.dislikedFoods, allergies: member.allergies,
    drinkingLevel: member.drinkingLevel, instagramUrl: member.instagramUrl,
    favoriteRestaurants: member.favoriteRestaurants, desiredRestaurants: member.desiredRestaurants,
    googleLocalGuideLevel: member.googleLocalGuideLevel,
  };
  const publishedAge = getPublishedAgeBand(details.birthDate, details.showAge);

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
              source={selfAvatar ? { uri: selfAvatar } : member.avatar}
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

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
            <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground }}>{selfName ?? member.name}</Text>
            <NewMemberMark member={member} size={18} />
          </View>

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
                {new Date(member.joinedAt).getFullYear()}年{new Date(member.joinedAt).getMonth() + 1}月入会
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

        <View style={{ marginHorizontal: 16, marginBottom: 18, flexDirection: "row", backgroundColor: colors.surface, borderRadius: 15, paddingVertical: 14 }}>
          {[
            { label: "参加回数", value: member.participationCount ?? Math.round(member.points / 35) },
            { label: "幹事回数", value: member.organizerCount ?? (member.role === "admin" ? 4 : 1) },
            { label: "フォロワー", value: 0, social: "followers" as const },
            { label: "フォロー", value: 0, social: "following" as const },
          ].map((stat, index) => <Pressable disabled={!('social' in stat)} onPress={() => 'social' in stat && stat.social ? setSocialList(stat.social) : undefined} key={stat.label} style={{ flex: 1, alignItems: "center", borderLeftWidth: index ? 0.5 : 0, borderLeftColor: colors.border }}><Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>{stat.value}</Text><Text style={{ fontSize: 10, color: 'social' in stat ? "#C05B88" : colors.muted, marginTop: 3 }}>{stat.label}</Text></Pressable>)}
        </View>

        {!isSelf ? (
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>自分だけのメモ</Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>この内容は相手や他のメンバーには表示されません。</Text>
              <TextInput value={privateNote} onChangeText={setPrivateNote} multiline placeholder="会話した内容や次回話したいことなど" placeholderTextColor={colors.muted} style={{ minHeight: 88, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 11, color: colors.foreground, textAlignVertical: "top" }} />
              <Pressable onPress={async () => { await savePrivateMemberNote(CURRENT_USER.id, member.id, privateNote); Alert.alert("保存しました", "このメモは自分だけが確認できます。"); }} style={{ alignSelf: "flex-end", marginTop: 9, borderRadius: 10, backgroundColor: "#5D5C74", paddingHorizontal: 18, paddingVertical: 9 }}><Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>メモを保存</Text></Pressable>
            </View>
          </View>
        ) : null}

        {/* Bio */}
        {(selfBio ?? member.bio) && (
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
              自己紹介
            </Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16 }}>
              <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground }}>
                {selfBio ?? member.bio}
              </Text>
            </View>
          </View>
        )}

        {/* Interests */}
        {details.favoriteCuisines && details.favoriteCuisines.length > 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
              好きなグルメ
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {details.favoriteCuisines.map((interest: string, i: number) => (
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

        <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>プロフィール情報</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 13 }}>
              {[
                ...(publishedAge !== null ? [{ label: "年代", value: publishedAge }] : []),
                { label: "出身地", value: details.hometown }, { label: "居住地", value: details.residence },
                { label: "職業", value: details.occupation }, { label: "趣味", value: details.hobbies },
                { label: "飲酒量", value: details.drinkingLevel }, { label: "好きなお酒", value: details.favoriteAlcohol },
                { label: "苦手な食材", value: details.dislikedFoods }, { label: "アレルギー", value: details.allergies },
                { label: "お気に入りのお店", value: details.favoriteRestaurants }, { label: "行ってみたいお店", value: details.desiredRestaurants },
                { label: "Googleローカルガイド", value: details.googleLocalGuideLevel },
              ].filter((item) => item.value).map((item) => <View key={item.label} style={{ width: "50%", paddingRight: 8 }}><Text style={{ fontSize: 10, color: colors.muted }}>{item.label}</Text><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 2 }}>{item.value}</Text></View>)}
            </View>
            {details.instagramUrl ? <Pressable onPress={() => Linking.openURL(details.instagramUrl!)} style={{ flexDirection: "row", alignItems: "center", marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border }}><IconSymbol name="camera.fill" size={17} color="#C13584" /><Text style={{ flex: 1, marginLeft: 7, fontSize: 13, fontWeight: "700", color: "#C13584" }}>Instagramを見る</Text><IconSymbol name="chevron.right" size={15} color="#C13584" /></Pressable> : null}
          </View>
        </View>

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
      <SocialMemberListModal visible={socialList !== null} kind={socialList ?? "followers"} onClose={() => setSocialList(null)} />
    </ScreenContainer>
  );
}
