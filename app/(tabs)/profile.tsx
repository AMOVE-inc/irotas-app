import { openExternalUrl } from "@/lib/open-external-url";
import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { MemberRankBadge, MemberRoleBadge, clubLeaderBadgeForClub, stripRankFromName } from "@/components/member-rank-badge";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  CURRENT_USER,
  RANK_COLORS,
  RANK_LABELS,
  POINT_ACTIONS,
  EVENTS,
  type Event,
  type MemberRank,
} from "@/constants/mock-data";
import { getNextLevelInfo, levelFromXp, totalXpForLevel } from "@/lib/xp-levels";
import { useColors } from "@/hooks/use-colors";
import { refreshClubs, useClubs } from "@/lib/club-store";
import { getMyRooms } from "@/lib/chat-store";
import { getAllEvents } from "@/lib/event-store";
import { getEventParticipationStatus, isEventOrganizer, isPastEventDate } from "@/lib/event-participation";
import { getIrotasPoints } from "@/lib/irotas-points-store";
import { AuthenticatedImage as Image } from "@/components/authenticated-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuthContext } from "@/lib/auth-context";
import { useCoupons } from "@/lib/coupon-store";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { OFFICIAL_INSTAGRAM_URL } from "@/constants/external-links";
import { GOURMET_GENRES } from "@/constants/event-options";
import { BIRTH_YEARS, DAYS, DRINKING_LEVELS, GOOGLE_LOCAL_GUIDE_LEVELS, MONTHS, PREFECTURES, type ProfileDetails } from "@/constants/profile-options";
import { isAdminRole, isOperatorRole } from "@/lib/access-control";
import { getPublishedAgeBand } from "@/lib/member-age";
import { trpc } from "@/lib/trpc";
import { SocialMemberListModal } from "@/components/social-member-list-modal";
import * as Api from "@/lib/_core/api";
import { clubBoardRoute } from "@/lib/community-navigation";
import { getDiscordAuthorById } from "@/lib/discord-author-directory";

const GENDER_OPTIONS = ["男性", "女性", "その他"] as const;
const genderLabel = (gender: "male" | "female" | "other" | "unset") => ({ male: "男性", female: "女性", other: "その他", unset: "" })[gender];
const genderValue = (label: string): "male" | "female" | "other" | "unset" => ({ 男性: "male", 女性: "female", その他: "other" } as const)[label as "男性" | "女性" | "その他"] ?? "unset";

const profileString = (profile: Record<string, unknown>, key: string) =>
  typeof profile[key] === "string" ? profile[key] as string : "";
const profileBoolean = (profile: Record<string, unknown>, key: string) =>
  typeof profile[key] === "boolean" ? profile[key] as boolean : false;
const profileStrings = (profile: Record<string, unknown>, key: string) =>
  Array.isArray(profile[key]) ? (profile[key] as unknown[]).filter((item): item is string => typeof item === "string") : [];

function profileDetailsFromRecord(profile: Record<string, unknown>): ProfileDetails {
  return {
    birthDate: profileString(profile, "birthDate"),
    showAge: profileBoolean(profile, "showAge"),
    hometown: profileString(profile, "hometown"),
    residence: profileString(profile, "residence"),
    occupation: profileString(profile, "occupation"),
    hobbies: profileString(profile, "hobbies"),
    favoriteCuisines: profileStrings(profile, "favoriteCuisines"),
    favoriteAlcohol: profileString(profile, "favoriteAlcohol"),
    dislikedFoods: profileString(profile, "dislikedFoods"),
    allergies: profileString(profile, "allergies"),
    drinkingLevel: profileString(profile, "drinkingLevel"),
    instagramUrl: profileString(profile, "instagramUrl"),
    tabelogUrl: profileString(profile, "tabelogUrl"),
    favoriteRestaurants: profileString(profile, "favoriteRestaurants"),
    desiredRestaurants: profileString(profile, "desiredRestaurants"),
    googleLocalGuideLevel: profileString(profile, "googleLocalGuideLevel"),
  };
}

function ProfileSelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return <><Pressable onPress={() => setVisible(true)} style={{ minHeight: 46, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 13, flexDirection: "row", alignItems: "center" }}><Text style={{ flex: 1, fontSize: 14, color: value ? colors.foreground : colors.muted }}>{value || label}</Text><IconSymbol name="chevron.down" size={16} color={colors.muted} /></Pressable><Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}><View style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>{label}</Text><Pressable onPress={() => setVisible(false)}><Text style={{ color: "#E8A0BF", fontWeight: "800" }}>閉じる</Text></Pressable></View><ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>{value ? <Pressable onPress={() => { onChange(""); setVisible(false); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 15, color: colors.muted }}>未設定にする</Text></Pressable> : null}{options.map((option) => <Pressable key={option} onPress={() => { onChange(option); setVisible(false); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 15, color: colors.foreground }}>{option}</Text>{value === option ? <IconSymbol name="checkmark" size={18} color="#E8A0BF" /> : null}</Pressable>)}</ScrollView></View></Modal></>;
}

function PointsProgressCard({ points, rank, showRank = true, onExplain }: { points: number; rank: MemberRank; showRank?: boolean; onExplain?: () => void }) {
  const colors = useColors();
  const rankColor = RANK_COLORS[rank];
  const nextInfo = getNextLevelInfo(points);
  const level = levelFromXp(points);

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: colors.surface,
        padding: 16,
      }}
    >
      {/* Points display */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <View>
          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }}>Lv.{level}・XP</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={{ fontSize: 32, fontWeight: "900", color: rankColor }}>
              {points.toLocaleString()}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: rankColor, marginLeft: 4 }}>XP</Text>
          </View>
        </View>
        {showRank ? <View
          style={{
            backgroundColor: rankColor + "15",
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 8,
            alignItems: "center",
          }}
        >
          <IconSymbol name="crown.fill" size={20} color={rankColor} />
          <Text style={{ fontSize: 11, fontWeight: "700", color: rankColor, marginTop: 2 }}>
            {RANK_LABELS[rank]}
          </Text>
        </View> : null}
      </View>

      {/* Progress bar */}
      {showRank ? (
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              次のレベル: Lv.{nextInfo.nextLevel}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: rankColor }}>
              あと {nextInfo.pointsNeeded.toLocaleString()} XP
            </Text>
          </View>
          <View
            style={{
              height: 8,
              backgroundColor: colors.border,
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${nextInfo.progress * 100}%`,
                backgroundColor: rankColor,
                borderRadius: 4,
              }}
            />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={{ fontSize: 10, color: colors.muted }}>
              Lv.{nextInfo.currentLevel}
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>
              Lv.{nextInfo.nextLevel}
            </Text>
          </View>
        </View>
      ) : null}
      {showRank && onExplain ? <Pressable onPress={onExplain} style={{ marginTop: 14, alignSelf: "flex-start", borderRadius: 14, paddingHorizontal: 15, paddingVertical: 10, backgroundColor: "#EFEFF1", borderWidth: 1, borderColor: "#B7B7BC" }}><Text style={{ fontSize: 13, fontWeight: "900", color: "#66666B" }}>会員ランクについてはこちら</Text></Pressable> : null}
    </View>
  );
}

function PointActionsCard() {
  const colors = useColors();
  const actions = Object.values(POINT_ACTIONS).sort((left, right) => left.points - right.points || left.label.localeCompare(right.label, "ja"));

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
          XP獲得方法
        </Text>
      </View>
      {actions.map((action, index) => (
        <View
          key={action.label}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 14, color: colors.foreground }}>{action.label}</Text>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#E8A0BF" }}>
            +{action.points} XP
          </Text>
        </View>
      ))}
    </View>
  );
}

function ProfileValue({ value }: { value: string }) {
  const colors = useColors();
  const parts = value.split(/(https?:\/\/[^\s]+)/g);
  return <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 2 }}>{parts.map((part, index) => /^https?:\/\//i.test(part)
    ? <Text key={`${part}-${index}`} accessibilityRole="link" onPress={() => void openExternalUrl(part)} style={{ color: "#3478C7", textDecorationLine: "underline" }}>{part}</Text>
    : part)}</Text>;
}

void PointActionsCard;

function RankCard({ rank }: { rank: MemberRank }) {
  const colors = useColors();
  const rankColor = RANK_COLORS[rank];
  const rankLabel = RANK_LABELS[rank];

  const rankBenefits: Record<MemberRank, string[]> = {
    regular: ["ランク特典はありません"],
    silver: ["非公開チャットへのご招待", "イベント割引特典"],
    gold: ["非公開チャットへのご招待", "イベント割引特典", "シークレットイベントへの参加権"],
    platinum: ["非公開チャットへのご招待", "イベント割引特典", "シークレットイベントへの参加権", "VIPイベントへのご招待"],
  };

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: rankColor,
      }}
    >
      <View
        style={{
          backgroundColor: rankColor + "15",
          padding: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <IconSymbol name="crown.fill" size={22} color={rankColor} />
          <Text style={{ fontSize: 18, fontWeight: "800", color: rankColor, marginLeft: 8 }}>
            {rankLabel}会員
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 12 }}>
          ランク特典
        </Text>
        {rankBenefits[rank].map((benefit, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: rankColor,
                marginRight: 10,
              }}
            />
            <Text style={{ fontSize: 14, color: colors.foreground }}>{benefit}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RankTiersCard({ currentRank }: { currentRank: MemberRank }) {
  const colors = useColors();

  const tiers = [
    { rank: "regular" as MemberRank, points: "Lv.0〜（0 XP〜）" },
    { rank: "silver" as MemberRank, points: `Lv.5〜（${totalXpForLevel(5).toLocaleString()} XP〜）` },
    { rank: "gold" as MemberRank, points: `Lv.10〜（${totalXpForLevel(10).toLocaleString()} XP〜）` },
    { rank: "platinum" as MemberRank, points: `Lv.15〜（${totalXpForLevel(15).toLocaleString()} XP〜）` },
  ];

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
          ランク一覧
        </Text>
      </View>
      {tiers.map((tier, index) => (
        <View
          key={tier.rank}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            backgroundColor: tier.rank === currentRank ? RANK_COLORS[tier.rank] + "12" : "transparent",
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: RANK_COLORS[tier.rank],
              marginRight: 10,
            }}
          />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: RANK_COLORS[tier.rank] }}>
                {RANK_LABELS[tier.rank]}
              </Text>
              {tier.rank === currentRank && (
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#E8A0BF", marginLeft: 6 }}>
                  ← 現在
                </Text>
              )}
            </View>
          </View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted }}>
            {tier.points}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EditProfileModal({
  visible,
  onClose,
  onAvatarChange,
  onBioChange,
  onInterestsChange,
  onNameChange,
  onPublicUserIdChange,
  onDetailsChange,
  storageNamespace,
  initialName,
  initialPublicUserId,
  initialBio,
  initialInterests,
  initialDetails,
  initialAvatar,
  initialGender,
  serverBacked = false,
  onServerSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onAvatarChange?: (uri: string) => void;
  onBioChange?: (bio: string) => void;
  onInterestsChange?: (interests: string[]) => void;
  onNameChange?: (name: string) => void;
  onPublicUserIdChange?: (value: string) => void;
  onDetailsChange?: (details: ProfileDetails) => void;
  storageNamespace: string;
  initialName: string;
  initialPublicUserId: string;
  initialBio: string;
  initialInterests: string[];
  initialDetails: ProfileDetails;
  initialAvatar?: string;
  initialGender?: "male" | "female" | "other" | "unset";
  serverBacked?: boolean;
  onServerSaved?: () => Promise<void>;
}) {
  const colors = useColors();
  const formScrollRef = useRef<ScrollView>(null);
  const [name, setName] = useState("");
  const [publicUserId, setPublicUserId] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [gender, setGender] = useState<"male" | "female" | "other" | "unset">("unset");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [showAge, setShowAge] = useState(false);
  const [hometown, setHometown] = useState("");
  const [residence, setResidence] = useState("");
  const [occupation, setOccupation] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [favoriteAlcohol, setFavoriteAlcohol] = useState("");
  const [dislikedFoods, setDislikedFoods] = useState("");
  const [allergies, setAllergies] = useState("");
  const [drinkingLevel, setDrinkingLevel] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [tabelogUrl, setTabelogUrl] = useState("");
  const [favoriteRestaurants, setFavoriteRestaurants] = useState("");
  const [desiredRestaurants, setDesiredRestaurants] = useState("");
  const [googleLocalGuideLevel, setGoogleLocalGuideLevel] = useState("");

  // モーダルが開いたときにAsyncStorageから保存済みデータを読み込む
  useEffect(() => {
    if (!visible) return;
    import("@react-native-async-storage/async-storage").then(({ default: AsyncStorage }) => {
      Promise.all([
        AsyncStorage.getItem(`${storageNamespace}:name`),
        AsyncStorage.getItem(`${storageNamespace}:bio`),
        AsyncStorage.getItem(`${storageNamespace}:interests`),
        AsyncStorage.getItem(`${storageNamespace}:avatar`),
        AsyncStorage.getItem(`${storageNamespace}:gender`),
        AsyncStorage.getItem(`${storageNamespace}:details`),
      ]).then(([savedName, savedBio, savedInterests, savedAvatar, savedGender, savedDetails]) => {
        setName(serverBacked ? initialName : (savedName ?? initialName));
        setPublicUserId(initialPublicUserId);
        setBio(serverBacked ? initialBio : (savedBio ?? initialBio));
        const storedInterests = savedInterests?.split(",").map((item) => item.trim()).filter(Boolean);
        setInterests(serverBacked ? initialInterests : (storedInterests?.length ? storedInterests : initialInterests));
        setAvatarUri(serverBacked ? (initialAvatar ?? null) : savedAvatar);
        setGender(serverBacked ? (initialGender ?? "unset") : (savedGender as "male" | "female" | "other" | "unset" || "unset"));
        const details = !serverBacked && savedDetails ? JSON.parse(savedDetails) as Partial<ProfileDetails> : {};
        const birthDate = details.birthDate ?? initialDetails.birthDate ?? "";
        const [year = "", month = "", day = ""] = birthDate.split("-");
        setBirthYear(year); setBirthMonth(month); setBirthDay(day);
        setShowAge(details.showAge ?? initialDetails.showAge ?? false);
        setHometown(details.hometown ?? initialDetails.hometown ?? "");
        setResidence(details.residence ?? initialDetails.residence ?? "");
        setOccupation(details.occupation ?? initialDetails.occupation ?? "");
        setHobbies(details.hobbies ?? initialDetails.hobbies ?? "");
        setFavoriteAlcohol(details.favoriteAlcohol ?? initialDetails.favoriteAlcohol ?? "");
        setDislikedFoods(details.dislikedFoods ?? initialDetails.dislikedFoods ?? "");
        setAllergies(details.allergies ?? initialDetails.allergies ?? "");
        setDrinkingLevel(details.drinkingLevel ?? initialDetails.drinkingLevel ?? "");
        setInstagramUrl(details.instagramUrl ?? initialDetails.instagramUrl ?? "");
        setTabelogUrl(details.tabelogUrl ?? initialDetails.tabelogUrl ?? "");
        setFavoriteRestaurants(details.favoriteRestaurants ?? initialDetails.favoriteRestaurants ?? "");
        setDesiredRestaurants(details.desiredRestaurants ?? initialDetails.desiredRestaurants ?? "");
        setGoogleLocalGuideLevel(details.googleLocalGuideLevel ?? initialDetails.googleLocalGuideLevel ?? "");
      });
    });
  }, [visible, storageNamespace, initialName, initialPublicUserId, initialBio, initialInterests, initialDetails, initialAvatar, initialGender, serverBacked]);

  const handlePickPhoto = async () => {
    // 権限を事前にリクエスト（初回のみ許可ダイアログが表示される）
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("権限が必要です", "写真ライブラリへのアクセスを許可してください。");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("エラー", "名前を入力してください。");
      return;
    }
    const normalizedPublicUserId = publicUserId.trim().replace(/^@+/, "").toLowerCase();
    if (serverBacked && (!normalizedPublicUserId || !/^[a-z0-9][a-z0-9._]{2,23}$/.test(normalizedPublicUserId) || normalizedPublicUserId.endsWith("."))) {
      Alert.alert("ユーザーIDを確認してください", "3〜24文字の半角英小文字・数字・ピリオド・アンダーバーで入力してください。");
      return;
    }
    if (showAge && (!birthYear || !birthMonth || !birthDay)) {
      Alert.alert("生年月日を確認してください", "年齢を公開する場合は、生年月日をすべて選択してください。");
      return;
    }
    if (birthYear && birthMonth && birthDay) {
      const birthDate = new Date(`${birthYear}-${birthMonth}-${birthDay}T00:00:00`);
      if (Number.isNaN(birthDate.getTime()) || birthDate.getFullYear() !== Number(birthYear) || birthDate.getMonth() + 1 !== Number(birthMonth) || birthDate.getDate() !== Number(birthDay)) {
        Alert.alert("生年月日を確認してください", "存在する日付を選択してください。");
        return;
      }
    }
    if (instagramUrl.trim() && !/^https?:\/\//i.test(instagramUrl.trim())) {
      Alert.alert("Instagram URLを確認してください", "URLは http:// または https:// から入力してください。");
      return;
    }
    if (tabelogUrl.trim() && !/^https?:\/\/(?:www\.|s\.)?tabelog\.com\//i.test(tabelogUrl.trim())) {
      Alert.alert("食べログURLを確認してください", "食べログの店舗またはプロフィールURLを入力してください。");
      return;
    }
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    // nameシbio・interests・avatar・genderをAsyncStorageに保存
    await AsyncStorage.setItem(`${storageNamespace}:name`, name.trim());
    await AsyncStorage.setItem(`${storageNamespace}:bio`, bio);
    const interestList = interests;
    await AsyncStorage.setItem(`${storageNamespace}:interests`, interests.join(","));
    await AsyncStorage.setItem(`${storageNamespace}:gender`, gender);
    const details: ProfileDetails = {
      birthDate: birthYear && birthMonth && birthDay ? `${birthYear}-${birthMonth}-${birthDay}` : "",
      showAge, hometown, residence, occupation: occupation.trim(), hobbies: hobbies.trim(), favoriteCuisines: interests,
      favoriteAlcohol: favoriteAlcohol.trim(), dislikedFoods: dislikedFoods.trim(), allergies: allergies.trim(), drinkingLevel,
      instagramUrl: instagramUrl.trim(),
      tabelogUrl: tabelogUrl.trim(),
      favoriteRestaurants: favoriteRestaurants.trim(), desiredRestaurants: desiredRestaurants.trim(),
      googleLocalGuideLevel: googleLocalGuideLevel === "未設定" ? "" : googleLocalGuideLevel,
    };
    let savedAvatarUri = avatarUri ?? "";
    try {
      if (serverBacked && savedAvatarUri && !/^https?:\/\//i.test(savedAvatarUri) && !savedAvatarUri.startsWith("/api/event-images/")) {
        savedAvatarUri = (await Api.uploadEventImage(savedAvatarUri)).imageUrl;
      }
      if (serverBacked) {
        await Api.updateMyProfile({
          displayName: name.trim(),
          publicUserId: normalizedPublicUserId,
          profile: { ...details, bio, gender, favoriteCuisines: interestList, avatarUrl: savedAvatarUri },
        });
        await onServerSaved?.();
      }
    } catch (error) {
      Alert.alert("保存できませんでした", error instanceof Error ? error.message : "通信状況を確認してもう一度お試しください。");
      return;
    }
    await AsyncStorage.setItem(`${storageNamespace}:details`, JSON.stringify(details));
    if (savedAvatarUri) {
      await AsyncStorage.setItem(`${storageNamespace}:avatar`, savedAvatarUri);
      onAvatarChange?.(savedAvatarUri);
    }
    onNameChange?.(name.trim());
    onPublicUserIdChange?.(normalizedPublicUserId);
    onBioChange?.(bio);
    onInterestsChange?.(interestList);
    onDetailsChange?.(details);
    Alert.alert("保存完了", "プロフィールを更新しました");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border,
          }}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="プロフィール編集をキャンセル"
          >
            <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            プロフィール編集
          </Text>
          <Pressable
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="プロフィールを保存"
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#E8A0BF" }}>保存</Text>
          </Pressable>
        </View>

        <ScrollView ref={formScrollRef} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} contentContainerStyle={{ padding: 16, paddingBottom: 160 }}>
          {/* Avatar */}
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <Image
              source={avatarUri ? { uri: avatarUri } : CURRENT_USER.avatar}
              style={{ width: 80, height: 80, borderRadius: 40 }}
              contentFit="cover"
            />
            <Pressable
              onPress={handlePickPhoto}
              style={{ marginTop: 8 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#E8A0BF" }}>
                写真を変更
              </Text>
            </Pressable>
          </View>

          {/* Name */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
            名前
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="名前を入力..."
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: colors.foreground,
              marginBottom: 16,
            }}
          />

          {serverBacked ? <><Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>ユーザーID</Text><View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, marginBottom: 5 }}><Text style={{ fontSize: 15, color: colors.muted }}>@</Text><TextInput value={publicUserId} onChangeText={(value) => setPublicUserId(value.replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 24))} placeholder="your.name" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View><Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted, marginBottom: 16 }}>プロフィールや検索で表示されます。3〜24文字、半角英小文字・数字・.・_ が使用できます。</Text></> : null}

          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>生年月日</Text>
          <View style={{ flexDirection: "row", gap: 7, marginBottom: 10 }}><View style={{ flex: 1.35 }}><ProfileSelectField label="年" value={birthYear} options={BIRTH_YEARS} onChange={setBirthYear} /></View><View style={{ flex: 1 }}><ProfileSelectField label="月" value={birthMonth} options={MONTHS} onChange={setBirthMonth} /></View><View style={{ flex: 1 }}><ProfileSelectField label="日" value={birthDay} options={DAYS} onChange={setBirthDay} /></View></View>
          <Pressable onPress={() => setShowAge((value) => !value)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: showAge ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: showAge ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{showAge ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><View style={{ marginLeft: 8 }}><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>年齢を公開する</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>生年月日は表示せず「27歳」のように年齢のみ公開されます</Text></View></Pressable>

          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>性別</Text><View style={{ marginBottom: 16 }}><ProfileSelectField label="性別を選択" value={genderLabel(gender)} options={GENDER_OPTIONS} onChange={(value) => setGender(genderValue(value))} /></View>

          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>出身地</Text><View style={{ marginBottom: 16 }}><ProfileSelectField label="出身地を選択" value={hometown} options={PREFECTURES} onChange={setHometown} /></View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>居住地</Text><View style={{ marginBottom: 16 }}><ProfileSelectField label="居住地を選択" value={residence} options={PREFECTURES} onChange={setResidence} /></View>
          {[
            { label: "職業", value: occupation, setter: setOccupation, placeholder: "職業を入力" },
            { label: "趣味", value: hobbies, setter: setHobbies, placeholder: "趣味を入力" },
          ].map((field) => <View key={field.label}><Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>{field.label}</Text><TextInput value={field.value} onChangeText={field.setter} placeholder={field.placeholder} placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, marginBottom: 16 }} /></View>)}

          {/* Bio */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
            自己紹介
          </Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="自己紹介を入力..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: colors.foreground,
              minHeight: 100,
              marginBottom: 16,
            }}
          />

          {/* Interests */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
            好きな料理ジャンル（複数選択）
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>{GOURMET_GENRES.map((genre) => { const selected = interests.includes(genre); return <Pressable key={genre} onPress={() => setInterests((current) => selected ? current.filter((item) => item !== genre) : [...current, genre])} style={{ borderRadius: 17, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: selected ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selected ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#FFF" : colors.foreground }}>{genre}</Text></Pressable>; })}</View>

          {[
            { label: "好きなお酒", value: favoriteAlcohol, setter: setFavoriteAlcohol, placeholder: "例：ワイン、日本酒" },
            { label: "苦手な食材", value: dislikedFoods, setter: setDislikedFoods, placeholder: "苦手な食材を入力" },
            { label: "アレルギー", value: allergies, setter: setAllergies, placeholder: "アレルギーを入力" },
          ].map((field) => <View key={field.label}><Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>{field.label}</Text><TextInput value={field.value} onChangeText={field.setter} placeholder={field.placeholder} placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, marginBottom: 16 }} /></View>)}

          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>飲酒量</Text><View style={{ marginBottom: 16 }}><ProfileSelectField label="飲酒量を選択" value={drinkingLevel} options={DRINKING_LEVELS} onChange={setDrinkingLevel} /></View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>Instagram URL</Text><TextInput value={instagramUrl} onChangeText={setInstagramUrl} placeholder="https://www.instagram.com/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, marginBottom: 18 }} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>食べログ URL</Text><TextInput value={tabelogUrl} onChangeText={setTabelogUrl} placeholder="https://tabelog.com/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, marginBottom: 18 }} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>Googleローカルガイドレベル</Text><View style={{ marginBottom: 16 }}><ProfileSelectField label="レベルを選択" value={googleLocalGuideLevel} options={GOOGLE_LOCAL_GUIDE_LEVELS} onChange={setGoogleLocalGuideLevel} /></View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>お気に入りのお店</Text><TextInput value={favoriteRestaurants} onChangeText={setFavoriteRestaurants} onFocus={() => setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 120)} placeholder="店名やURLを自由に入力" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 76, fontSize: 15, color: colors.foreground, marginBottom: 16 }} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>行ってみたいお店</Text><TextInput value={desiredRestaurants} onChangeText={setDesiredRestaurants} placeholder="店名やURLを自由に入力" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 76, fontSize: 15, color: colors.foreground, marginBottom: 18 }} />

        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type MenuItem = {
  icon: string;
  label: string;
  badge?: string;
  color?: string;
  onPress?: () => void;
};

function MenuSection({ title, items }: { title: string; items: MenuItem[] }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: colors.muted,
          paddingHorizontal: 16,
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          marginHorizontal: 16,
          backgroundColor: colors.surface,
          borderRadius: 20,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: "#80606F",
          shadowOffset: { width: 0, height: 7 },
          shadowOpacity: 0.07,
          shadowRadius: 16,
          elevation: 2,
        }}
      >
        {items.map((item, index) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.badge ? `${item.label}、${item.badge}` : item.label}
            accessibilityHint={`${item.label}を開きます`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: index < items.length - 1 ? 0.5 : 0,
              borderBottomColor: colors.border,
            }}
          >
            <IconSymbol
              name={item.icon as any}
              size={22}
              color={item.color || "#E8A0BF"}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 16,
                color: colors.foreground,
                marginLeft: 12,
              }}
            >
              {item.label}
            </Text>
            {item.badge && (
              <View
                style={{
                  backgroundColor: "#E8A0BF",
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  marginRight: 8,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFF" }}>
                  {item.badge}
                </Text>
              </View>
            )}
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const coupons = useCoupons();
  const colors = useColors();
  const clubs = useClubs();
  const router = useRouter();
  const { logout, refresh: refreshAuthUser, user: authUser, loading: authLoading } = useAuthContext();
  const performLogout = useCallback(async () => {
    if (Api.submitBrowserLogout()) return;
    await logout();
    router.replace("/login");
  }, [logout, router]);
  const isRealMember = authUser?.loginMethod === "email";
  const serverProfile = useMemo(() => authUser?.profile ?? {}, [authUser?.profile]);
  const serverDetails = useMemo(() => profileDetailsFromRecord(serverProfile), [serverProfile]);
  const authenticatedRank: MemberRank = ["regular", "silver", "gold", "platinum"].includes(authUser?.memberRank ?? "")
    ? authUser!.memberRank as MemberRank
    : "regular";
  const authenticatedGeneration = Number(authUser?.memberTerm?.match(/\d+/)?.[0] ?? 0);
  const user = useMemo(() => isRealMember ? {
    ...CURRENT_USER,
    id: String(authUser.id),
    name: authUser.name || authUser.email?.split("@")[0] || "会員",
    rank: authenticatedRank,
    points: authUser.xp ?? 0,
    level: 1,
    branch: authUser.branch ?? "kanto",
    generation: authenticatedGeneration,
    bio: profileString(serverProfile, "bio"),
    interests: profileStrings(serverProfile, "favoriteCuisines"),
    favoriteCuisines: profileStrings(serverProfile, "favoriteCuisines"),
    role: authUser.accessRole === "admin" || authUser.role === "admin" ? "admin" as const : authUser.accessRole === "operator" || authUser.role === "operator" ? "operator" as const : "member" as const,
    joinedAt: authUser.joinedAt ?? "",
    participationCount: authUser.participationCount ?? 0,
    organizerCount: authUser.organizerCount ?? 0,
    followerCount: 0,
    followingCount: 0,
  } : CURRENT_USER, [authUser, authenticatedGeneration, authenticatedRank, isRealMember, serverProfile]);
  const storageNamespace = `profile:${authUser?.id ?? user.id}`;
  const { data: queriedAchievementBadges = [] } = trpc.memberData.achievementBadges.useQuery(undefined, { enabled: Boolean(authUser) });
  const achievementBadges = authUser?.achievementBadges?.length ? authUser.achievementBadges : queriedAchievementBadges;
  const { data: memberIdentity } = trpc.memberData.identity.useQuery(undefined, { enabled: Boolean(authUser) });
  const selectedBranches = authUser?.branches?.length
    ? authUser.branches
    : [authUser?.branch ?? user.branch];
  const branchLabel = selectedBranches
    .map((branch) => (branch === "kanto" ? "関東支部" : "関西支部"))
    .join("・");
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showRankExplanation, setShowRankExplanation] = useState(false);
  const [socialList, setSocialList] = useState<"followers" | "following" | null>(null);
  // DBから取得したroleで管理者判定（モックデータのCURRENT_USERではなく実際のログインユーザーを使用）
  const userIsAdmin = isAdminRole(authUser?.role, authUser?.accessRole);
  const userIsOperator = isOperatorRole(authUser?.role, authUser?.accessRole);
  const [myRooms, setMyRooms] = useState(() => getMyRooms(user.id));
  const [participatingEvents, setParticipatingEvents] = useState<Event[]>([]);
  const [participatingEventsLoading, setParticipatingEventsLoading] = useState(true);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>("");
  const [publicUserId, setPublicUserId] = useState(authUser?.publicUserId ?? "");
  const [profileBio, setProfileBio] = useState<string>("");
  const [profileInterests, setProfileInterests] = useState<string[]>([]);
  const [profileDetails, setProfileDetails] = useState<ProfileDetails>(profileDetailsFromRecord({}));
  const [memberId, setMemberId] = useState<string>("");
  const [socialStats, setSocialStats] = useState({ followers: 0, following: 0 });
  useEffect(() => {
    if (authUser?.memberId) setMemberId(authUser.memberId);
    else if (memberIdentity?.memberId) setMemberId(memberIdentity.memberId);
    if (memberIdentity?.displayName) setProfileName((current) => current || memberIdentity.displayName || "");
    setPublicUserId(authUser?.publicUserId ?? "");
  }, [authUser?.memberId, authUser?.publicUserId, memberIdentity]);
  useFocusEffect(useCallback(() => {
    if (!isRealMember || !authUser) return;
    let active = true;
    const refresh = () => {
      void Api.getMySocialSummary().then((summary) => {
        if (active) setSocialStats(summary);
      }).catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [authUser?.id, authUser?.memberId, isRealMember, memberIdentity?.memberId]));
  // イロタスポイント
  const [irotasPoints, setIrotasPoints] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (authLoading) {
        setParticipatingEventsLoading(true);
        return;
      }
      // Covers direct navigation and restores. Login preloads this too, so the
      // club-leader badge is available on the first profile render.
      void refreshClubs();
      setMyRooms(getMyRooms(user.id));
      let eventsActive = true;
      const viewerMemberId = isRealMember ? (authUser?.memberId ?? memberIdentity?.memberId ?? user.id) : user.id;
      const sortParticipating = (items: Event[]) => items
        .filter((event) => !isPastEventDate(event) && (isEventOrganizer(event, viewerMemberId) || getEventParticipationStatus(event, viewerMemberId) !== null))
        .sort((a, b) => Date.parse(`${a.date}T${a.time}:00`) - Date.parse(`${b.date}T${b.time}:00`));
      if (isRealMember) {
        setParticipatingEventsLoading(true);
        void Api.getEvents()
          .then((items) => { if (eventsActive) setParticipatingEvents(sortParticipating(items)); })
          .catch(() => { if (eventsActive) setParticipatingEvents([]); })
          .finally(() => { if (eventsActive) setParticipatingEventsLoading(false); });
      } else {
        setParticipatingEvents(sortParticipating(getAllEvents(EVENTS).filter((event) => !event.id.startsWith("discord-event-"))));
        setParticipatingEventsLoading(false);
      }
      // AsyncStorageから保存済みデータを読み込む
      import("@react-native-async-storage/async-storage").then(({ default: AsyncStorage }) => {
        Promise.all([
          AsyncStorage.getItem(`${storageNamespace}:avatar`),
          AsyncStorage.getItem(`${storageNamespace}:name`),
          AsyncStorage.getItem(`${storageNamespace}:bio`),
          AsyncStorage.getItem(`${storageNamespace}:interests`),
          AsyncStorage.getItem(`${storageNamespace}:details`),
        ]).then(([uri, savedName, savedBio, savedInterests, savedDetails]) => {
          const serverAvatar = profileString(serverProfile, "avatarUrl");
          setAvatarUri(isRealMember ? (serverAvatar || null) : uri);
          setProfileName(isRealMember ? user.name : (savedName ?? user.name));
          setProfileBio(isRealMember ? user.bio : (savedBio ?? user.bio));
          if (!isRealMember && savedInterests !== null) {
            const list = savedInterests.split(",").map((s) => s.trim()).filter(Boolean);
            setProfileInterests(list);
          } else setProfileInterests(user.favoriteCuisines ?? user.interests ?? []);
          if (authUser?.memberId) {
            setMemberId(authUser.memberId);
          } else if (memberIdentity?.memberId) {
            setMemberId(memberIdentity.memberId);
          } else {
            setMemberId(isRealMember ? "" : "IRO-000001");
          }
          setProfileDetails(!isRealMember && savedDetails ? JSON.parse(savedDetails) as ProfileDetails : (isRealMember ? serverDetails : {
            ...profileDetailsFromRecord({}),
            birthDate: user.birthDate ?? "", showAge: user.showAge ?? false,
            hometown: user.hometown ?? "", residence: user.residence ?? "", occupation: user.occupation ?? "",
            hobbies: user.hobbies ?? "", favoriteCuisines: user.favoriteCuisines ?? user.interests ?? [],
            favoriteAlcohol: user.favoriteAlcohol ?? "", dislikedFoods: user.dislikedFoods ?? "", allergies: user.allergies ?? "",
            drinkingLevel: user.drinkingLevel ?? "", instagramUrl: user.instagramUrl ?? "", tabelogUrl: "",
            favoriteRestaurants: user.favoriteRestaurants ?? "", desiredRestaurants: user.desiredRestaurants ?? "",
            googleLocalGuideLevel: user.googleLocalGuideLevel ?? "",
          }));
        });
      });
      // イロタスポイント・会費免除を読み込む
      getIrotasPoints(user.id).then(setIrotasPoints);
      return () => { eventsActive = false; };
    }, [authLoading, authUser?.memberId, isRealMember, memberIdentity?.memberId, serverDetails, serverProfile, storageNamespace, user])
  );

  const publishedAge = getPublishedAgeBand(profileDetails.birthDate, profileDetails.showAge);
  const joinedClubs = clubs.filter((club) => club.viewerIsLeader || club.viewerMembershipStatus === "approved" || (club.viewerMemberId ? club.memberIds.includes(club.viewerMemberId) : club.memberIds.includes(user.id)));
  const leaderClub = joinedClubs.find((club) => club.viewerIsLeader);
  const leaderLabel = leaderClub ? clubLeaderBadgeForClub(leaderClub.name) : null;
  // Server-backed values are rendered directly rather than waiting for the
  // AsyncStorage hydration effect that also supports preview profiles.
  const discordAvatar = getDiscordAuthorById(authUser?.memberId ?? undefined);
  const displayedAvatarUri = isRealMember
    ? profileString(serverProfile, "avatarUrl") || avatarUri || discordAvatar?.avatarUrl
    : avatarUri;
  const displayedProfileName = isRealMember ? user.name : profileName || user.name;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 128 }}>
        {/* Profile Header */}
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <View style={{ position: "relative" }}>
            <Image
              source={displayedAvatarUri ? { uri: displayedAvatarUri } : user.avatar}
              style={{ width: 80, height: 80, borderRadius: 40 }}
              contentFit="cover"
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{stripRankFromName(displayedProfileName)}</Text>
            <NewMemberMark member={{ ...user, role: authUser?.accessRole ?? user.role, name: displayedProfileName }} size={17} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginTop: 4 }}>
            <MemberRankBadge rank={user.rank} name={user.name} role={user.role} />
            <MemberRoleBadge name={displayedProfileName} role={authUser?.accessRole} leaderLabel={leaderLabel} />
          </View>

          {achievementBadges.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 9, paddingHorizontal: 24 }}>
              {achievementBadges.map((badge) => (
                <View key={badge} style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#FFF4D6", borderWidth: 1, borderColor: "#D8A928", paddingHorizontal: 9, paddingVertical: 4 }}>
                  <IconSymbol name="trophy.fill" size={12} color="#A56F00" />
                  <Text style={{ marginLeft: 4, fontSize: 11, fontWeight: "800", color: "#765000" }}>{badge}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Generation and join info */}
          {!userIsAdmin ? <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 12 }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>{branchLabel}</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <IconSymbol name="person.fill" size={14} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 4 }}>
                {user.generation > 0 ? `${user.generation}期生` : "期設定なし"}
              </Text>
            </View>
          </View> : null}
          {!userIsAdmin && user.joinedAt ? <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <IconSymbol name="calendar" size={14} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 4 }}>
                {`${new Date(user.joinedAt).getFullYear()}年${new Date(user.joinedAt).getMonth() + 1}月入会`}
              </Text>
            </View>
          </View> : null}

          {/* Public user ID. The stable IRO member ID stays internal. */}
          {!userIsAdmin ? (
            <Pressable
              onPress={async () => {
                if (!publicUserId) { setShowEditProfile(true); return; }
                await Clipboard.setStringAsync(`@${publicUserId}`);
                if (Platform.OS === "web") window.alert("ユーザーIDをコピーしました");
                else Alert.alert("コピー完了", "ユーザーIDをコピーしました");
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
                paddingHorizontal: 12,
                paddingVertical: 5,
                backgroundColor: colors.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 12, color: colors.muted, marginRight: 6 }}>{publicUserId ? "ユーザーID" : "ユーザーIDを設定"}</Text>
              {publicUserId ? <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>@{publicUserId}</Text> : null}
              <IconSymbol name={publicUserId ? "doc.on.doc" : "chevron.right"} size={13} color={colors.muted} style={{ marginLeft: 6 }} />
            </Pressable>
          ) : null}

          {/* Bio */}
          {profileBio ? (
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: colors.foreground,
                marginTop: 12,
                paddingHorizontal: 32,
                textAlign: "center",
              }}
            >
              {profileBio}
            </Text>
          ) : null}

          {/* Interests */}
          {profileInterests.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 10, gap: 6, paddingHorizontal: 32 }}>
              {profileInterests.map((interest, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: "#E8A0BF15",
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#E8A0BF", fontWeight: "600" }}>
                    {interest}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Edit profile button */}
          <Pressable
            onPress={() => setShowEditProfile(true)}
            accessibilityRole="button"
            accessibilityLabel="プロフィール編集"
            accessibilityHint="プロフィールの設定画面を開きます"
            style={{
              marginTop: 14,
              backgroundColor: colors.surface,
              borderRadius: 20,
              paddingHorizontal: 20,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <IconSymbol name="pencil" size={14} color={colors.foreground} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginLeft: 6 }}>
              プロフィール編集
            </Text>
          </Pressable>
        </View>

        <View style={{ marginHorizontal: 16, marginBottom: 16, flexDirection: "row", backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 14 }}>
          {[
            { label: "参加回数", value: user.participationCount ?? 0 },
            { label: "幹事回数", value: user.organizerCount ?? 0 },
            { label: "フォロワー", value: socialStats.followers, social: "followers" as const },
            { label: "フォロー", value: socialStats.following, social: "following" as const },
          ].map((stat, index) => <Pressable disabled={!('social' in stat)} onPress={() => 'social' in stat && stat.social ? setSocialList(stat.social) : undefined} key={stat.label} style={{ flex: 1, alignItems: "center", borderLeftWidth: index ? 0.5 : 0, borderLeftColor: colors.border }}><Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground }}>{stat.value}</Text><Text style={{ fontSize: 10, color: 'social' in stat ? "#C05B88" : colors.muted, marginTop: 3 }}>{stat.label}</Text></Pressable>)}
        </View>

        <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginBottom: 9 }}>イベント予定</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden" }}>
            {participatingEventsLoading ? <View style={{ minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 16 }}><ActivityIndicator size="small" color="#E8A0BF" /><Text style={{ marginLeft: 9, fontSize: 13, color: colors.muted }}>イベント予定を読み込んでいます…</Text></View> : participatingEvents.length ? participatingEvents.map((event, index) => {
              const eventViewerId = isRealMember ? (authUser?.memberId ?? memberIdentity?.memberId ?? user.id) : user.id;
              const status = getEventParticipationStatus(event, eventViewerId);
              const organizer = isEventOrganizer(event, eventViewerId);
              const confirmed = status === "confirmed";
              return <Pressable key={event.id} onPress={() => router.push({ pathname: "/event-detail", params: { id: event.id } })} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderTopWidth: index ? 0.5 : 0, borderTopColor: colors.border }}>
                <Image source={event.image} style={{ width: 52, height: 52, borderRadius: 10 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }} numberOfLines={2}>{event.title}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>{event.date} {event.time}</Text></View>
                <View style={{ borderRadius: 8, backgroundColor: organizer ? "#FFF0E4" : confirmed ? "#E6F6EA" : "#E8F2FA", paddingHorizontal: 7, paddingVertical: 4 }}><Text style={{ fontSize: 10, fontWeight: "800", color: organizer ? "#C66B16" : confirmed ? "#237A3B" : "#3E78A1" }}>{organizer ? "幹事" : confirmed ? "参加確定" : "参加申込中"}</Text></View>
              </Pressable>;
            }) : <Text style={{ padding: 16, fontSize: 13, color: colors.muted }}>イベント予定はありません。</Text>}
          </View>
          <Pressable
            onPress={() => router.push("/my-events" as any)}
            style={{ marginTop: 10, alignSelf: "center", paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: "#C05B88" }}
          >
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#C05B88" }}>全てのイベントを見る</Text>
          </Pressable>
        </View>

        <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginBottom: 12 }}>プロフィール情報</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 12 }}>
            {[
              ...(publishedAge !== null ? [{ label: "年齢", value: publishedAge }] : []),
              { label: "出身地", value: profileDetails.hometown }, { label: "居住地", value: profileDetails.residence },
              { label: "職業", value: profileDetails.occupation }, { label: "趣味", value: profileDetails.hobbies },
              { label: "飲酒量", value: profileDetails.drinkingLevel }, { label: "好きなお酒", value: profileDetails.favoriteAlcohol },
              { label: "お気に入りのお店", value: profileDetails.favoriteRestaurants }, { label: "行ってみたいお店", value: profileDetails.desiredRestaurants },
            ].filter((item) => item.value).map((item) => <View key={item.label} style={{ width: "50%", paddingRight: 8 }}><Text style={{ fontSize: 10, color: colors.muted }}>{item.label}</Text><ProfileValue value={String(item.value)} /></View>)}
          </View>
          {profileDetails.instagramUrl ? <Pressable onPress={() => openExternalUrl(profileDetails.instagramUrl)} style={{ flexDirection: "row", alignItems: "center", marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border }}><IconSymbol name="camera.fill" size={17} color="#C13584" /><Text style={{ flex: 1, marginLeft: 7, fontSize: 13, fontWeight: "700", color: "#C13584" }}>Instagramを見る</Text><IconSymbol name="chevron.right" size={15} color="#C13584" /></Pressable> : null}
          {profileDetails.tabelogUrl ? <Pressable onPress={() => openExternalUrl(profileDetails.tabelogUrl)} style={{ flexDirection: "row", alignItems: "center", marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border }}><IconSymbol name="fork.knife" size={17} color="#E06B24" /><Text style={{ flex: 1, marginLeft: 7, fontSize: 13, fontWeight: "700", color: "#E06B24" }}>食べログを見る</Text><IconSymbol name="chevron.right" size={15} color="#E06B24" /></Pressable> : null}
          {profileDetails.googleLocalGuideLevel ? <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border }}><Text style={{ fontSize: 10, color: colors.muted }}>Googleローカルガイドレベル</Text><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 2 }}>{profileDetails.googleLocalGuideLevel}</Text></View> : null}
        </View>

        {joinedClubs.length > 0 ? <View style={{ marginHorizontal: 16, marginBottom: 16 }}><Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>参加している部活動</Text><View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden" }}>{joinedClubs.map((club, index) => <Pressable key={club.id} onPress={() => router.push(clubBoardRoute(club.id, true) as any)} style={{ flexDirection: "row", alignItems: "center", padding: 14, borderTopWidth: index ? 0.5 : 0, borderTopColor: colors.border }}><Text style={{ fontSize: 24, marginRight: 12 }}>{club.icon}</Text><View style={{ flex: 1 }}><Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{club.name}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{club.memberIds.length}人が参加</Text></View><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#3478C7", marginRight: 9 }} /><IconSymbol name="chevron.right" size={16} color={colors.muted} /></Pressable>)}</View></View> : null}

        {/* Chat Shortcut Card */}
        {false ? <Pressable
          onPress={() => router.push("/chat-list" as any)}
          style={({ pressed }) => ({
            marginHorizontal: 16,
            marginBottom: 16,
            borderRadius: 16,
            backgroundColor: "#E8A0BF",
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: pressed ? 0.85 : 1,
            shadowColor: "#E8A0BF",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 4,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "rgba(255,255,255,0.25)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSymbol name="message.fill" size={22} color="#FFF" />
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                参加中のチャット
              </Text>
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>
                {myRooms.length > 0
                  ? `${myRooms.length}件のチャットルームに参加中`
                  : "まだチャットがありません"}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {myRooms.length > 0 && (
              <View
                style={{
                  backgroundColor: "#FFF",
                  borderRadius: 12,
                  minWidth: 24,
                  height: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 6,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#E8A0BF" }}>
                  {myRooms.length}
                </Text>
              </View>
            )}
            <IconSymbol name="chevron.right" size={18} color="rgba(255,255,255,0.8)" />
          </View>
        </Pressable> : null}

        {/* Points Progress */}
        {!userIsOperator ? <PointsProgressCard points={user.points} rank={user.rank} onExplain={() => setShowRankExplanation(true)} /> : null}

        {/* イロタスポイントカード */}
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 16,
            borderRadius: 16,
            backgroundColor: colors.surface,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <View>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }}>イロタスポイント</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ fontSize: 32, fontWeight: "900", color: "#FF9500" }}>
                  {irotasPoints.toLocaleString()}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#FF9500", marginLeft: 4 }}>pt</Text>
              </View>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            イベント参加費の割引に使えます（1pt = 1円）。ランクアップ時または管理者から付与されます。
          </Text>

        </View>

        {/* Rank Card */}

        {/* Rank Tiers - hidden per user request */}
        {/* <RankTiersCard /> */}

        {/* Point Actions - hidden per user request */}
        {/* <PointActionsCard /> */}

        {/* Admin section */}
        {userIsAdmin && (
          <MenuSection
            title="管理者メニュー"
            items={[
              {
                icon: "shield.fill",
                label: "管理者ダッシュボード",
                color: "#FF9500",
                onPress: () => router.push("/admin-dashboard" as any),
              },
            ]}
          />
        )}

        {userIsOperator && (
          <MenuSection
            title="運営メニュー"
            items={[
              { icon: "ticket.fill", label: "クーポン管理", color: "#FF9500", onPress: () => router.push("/coupon-manager" as any) },
              { icon: "megaphone.fill", label: "キャンペーン管理", color: "#FF9500", onPress: () => router.push("/campaign-manager" as any) },
              { icon: "gift.fill", label: "プレゼント企画管理", color: "#FF9500", onPress: () => router.push("/gift-campaign-manager" as any) },
              { icon: "square.and.arrow.down", label: "CSV取り込み", color: "#FF9500", onPress: () => router.push("/csv-import" as any) },
            ]}
          />
        )}

        {/* Menu Sections */}
        <MenuSection
          title="会員限定特典"
          items={[
            { icon: "ticket.fill", label: "会員限定クーポン", badge: `${coupons.filter((coupon) => !coupon.recipientIds || coupon.recipientIds.includes(user.id)).length}枚`, onPress: () => router.push("/coupons") },
            {
              icon: "gift.fill",
              label: "プレゼント企画",
              onPress: () => router.push("/gift-campaign" as any),
            },
            {
              icon: "megaphone.fill",
              label: "キャンペーン",
              onPress: () => router.push("/campaigns" as any),
            },
          ]}
        />

        <MenuSection
          title="コミュニティ"
          items={[
            {
              icon: "sparkles",
              label: "AI・おすすめ設定",
              color: "#D65E8D",
              onPress: () => router.push("/ai-settings" as any),
            },
            {
              icon: "person.2.fill",
              label: "メンバー検索",
              onPress: () => router.push("/members"),
            },
            { icon: "bookmark.fill", label: "部活動", onPress: () => router.push("/clubs") },
            {
              icon: "map.fill",
              label: "グルメマップ",
              color: "#E8A0BF",
              onPress: () => router.push("/gourmet-map" as any),
            },
            { icon: "sparkles", label: "グルメコンシェルジュ", color: "#A7C7E7", onPress: () => router.push("/concierge") },
          ]}
        />

        <MenuSection
          title="設定"
          items={[
            {
              icon: "person.2.fill",
              label: "所属支部の変更",
              color: colors.primary,
              onPress: () => router.push("/select-branch" as any),
            },
            {
              icon: "bell.fill",
              label: "通知設定",
              color: colors.muted,
              onPress: () => router.push("/notification-settings" as any),
            },
            {
              icon: "gearshape.fill",
              label: "アプリ設定",
              color: colors.muted,
              onPress: () => router.push("/app-settings" as any),
            },
          ]}
        />

        <MenuSection
          title="サポート"
          items={[
            {
              icon: "info.circle.fill",
              label: "FAQ",
              onPress: () => router.push("/faq" as any),
            },
            {
              icon: "doc.text.fill",
              label: "マニュアル",
              onPress: () => router.push("/manual" as any),
            },
            {
              icon: "message.fill",
              label: "お問い合わせ",
              color: "#5B5A73",
              onPress: () => router.push("/contact" as any),
            },
            {
              icon: "camera.fill",
              label: "公式Instagram",
              color: "#E1306C",
              onPress: async () => {
                try {
                  await openExternalUrl(OFFICIAL_INSTAGRAM_URL);
                } catch {
                  Alert.alert("リンクを開けませんでした", OFFICIAL_INSTAGRAM_URL);
                }
              },
            },
            {
              icon: "shield.fill",
              label: "規約",
              onPress: () => router.push("/community-rules" as any),
            },
          ]}
        />

        {/* Logout Button */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ログアウト"
            accessibilityHint="現在のアカウントからログアウトします"
            onPress={() => {
              if (Platform.OS === "web" && typeof window !== "undefined") {
                if (window.confirm("本当にログアウトしますか？"))
                  void performLogout();
                return;
              }
              Alert.alert(
                "ログアウト",
                "本当にログアウトしますか？",
                [
                  { text: "キャンセル", style: "cancel" },
                  {
                    text: "ログアウト",
                    style: "destructive",
                    onPress: performLogout,
                  },
                ],
              );
            }}
            style={({ pressed }) => ({
              backgroundColor: colors.error + "15",
              borderRadius: 12,
              padding: 14,
              alignItems: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.error }}>
              ログアウト
            </Text>
          </Pressable>
        </View>

        {/* Version */}
        <View style={{ alignItems: "center", paddingVertical: 20 }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>IRO＋ v1.0.0</Text>
        </View>
      </ScrollView>

      <Modal visible={showRankExplanation} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRankExplanation(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 19, fontWeight: "900", color: colors.foreground }}>会員ランクについて</Text><Pressable onPress={() => setShowRankExplanation(false)}><IconSymbol name="xmark" size={22} color={colors.foreground} /></Pressable></View>
          <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}><Text style={{ marginHorizontal: 16, marginBottom: 14, fontSize: 14, lineHeight: 21, color: colors.foreground }}>IRO＋での活動に応じてXPが貯まり、会員ランクが上がります。ランクごとに利用できる特典が増えます。</Text><RankTiersCard currentRank={user.rank} /><PointActionsCard />{(["regular", "silver", "gold", "platinum"] as MemberRank[]).map((rank) => <RankCard key={rank} rank={rank} />)}</ScrollView>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        onAvatarChange={(uri) => setAvatarUri(uri)}
        onNameChange={(n) => setProfileName(n)}
        onPublicUserIdChange={setPublicUserId}
        onBioChange={(bio) => setProfileBio(bio)}
        onInterestsChange={(list) => setProfileInterests(list)}
        onDetailsChange={(details) => setProfileDetails(details)}
        storageNamespace={storageNamespace}
        initialName={profileName || user.name}
        initialPublicUserId={publicUserId}
        initialBio={profileBio}
        initialInterests={profileInterests}
        initialDetails={profileDetails}
        initialAvatar={avatarUri ?? undefined}
        initialGender={(profileString(serverProfile, "gender") as "male" | "female" | "other" | "unset") || "unset"}
        serverBacked={isRealMember}
        onServerSaved={refreshAuthUser}
      />
      <SocialMemberListModal visible={socialList !== null} kind={socialList ?? "followers"} memberId={memberId || undefined} onClose={() => setSocialList(null)} />
    </ScreenContainer>
  );
}
