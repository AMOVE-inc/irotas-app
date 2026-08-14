import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  CURRENT_USER,
  RANK_COLORS,
  RANK_LABELS,
  POINT_ACTIONS,
  RANK_THRESHOLDS_POINTS,
  getNextRankInfo,
  EVENTS,
  type Event,
  type MemberRank,
} from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { getMyRooms } from "@/lib/chat-store";
import { getAllEvents } from "@/lib/event-store";
import { getEventParticipationStatus } from "@/lib/event-participation";
import { getIrotasPoints, isFeeExempt, RANK_UP_BONUS } from "@/lib/irotas-points-store";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
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
import { BIRTH_YEARS, DAYS, DRINKING_LEVELS, GOOGLE_LOCAL_GUIDE_LEVELS, MONTHS, PREFECTURES, PROFILE_DETAILS_STORAGE_KEY, type ProfileDetails } from "@/constants/profile-options";
import { isOperatorRole } from "@/lib/access-control";
import { getPublishedAgeBand } from "@/lib/member-age";
import { trpc } from "@/lib/trpc";

function ProfileSelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return <><Pressable onPress={() => setVisible(true)} style={{ minHeight: 46, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 13, flexDirection: "row", alignItems: "center" }}><Text style={{ flex: 1, fontSize: 14, color: value ? colors.foreground : colors.muted }}>{value || label}</Text><IconSymbol name="chevron.down" size={16} color={colors.muted} /></Pressable><Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}><View style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>{label}</Text><Pressable onPress={() => setVisible(false)}><Text style={{ color: "#E8A0BF", fontWeight: "800" }}>閉じる</Text></Pressable></View><ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>{options.map((option) => <Pressable key={option} onPress={() => { onChange(option); setVisible(false); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 15, color: colors.foreground }}>{option}</Text>{value === option ? <IconSymbol name="checkmark" size={18} color="#E8A0BF" /> : null}</Pressable>)}</ScrollView></View></Modal></>;
}

function PointsProgressCard({ points, rank }: { points: number; rank: MemberRank }) {
  const colors = useColors();
  const rankColor = RANK_COLORS[rank];
  const nextInfo = getNextRankInfo(points);
  const isMaxRank = !nextInfo;

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
          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }}>XP</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={{ fontSize: 32, fontWeight: "900", color: rankColor }}>
              {points.toLocaleString()}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: rankColor, marginLeft: 4 }}>XP</Text>
          </View>
        </View>
        <View
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
        </View>
      </View>

      {/* Progress bar */}
      {nextInfo ? (
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              次のランク: {RANK_LABELS[nextInfo.nextRank]}
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
              {RANK_LABELS[rank]}
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>
              {RANK_LABELS[nextInfo.nextRank]}
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: rankColor }}>
            最高ランク達成！会費無料特典適用中
          </Text>
        </View>
      )}
    </View>
  );
}

function PointActionsCard() {
  const colors = useColors();
  const actions = Object.values(POINT_ACTIONS);

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

function RankCard({ rank }: { rank: MemberRank }) {
  const colors = useColors();
  const rankColor = RANK_COLORS[rank];
  const rankLabel = RANK_LABELS[rank];

  const rankBenefits: Record<MemberRank, string[]> = {
    regular: ["基本イベント参加", "グルメマップ閲覧"],
    silver: ["レギュラー特典すべて", "掲示板投稿", "部活動参加"],
    gold: ["シルバー特典すべて", "ゴールド限定クーポン", "優先イベント予約", "グルメコンシェルジュ"],
    platinum: ["ゴールド特典すべて", "プラチナ限定特別コース", "VIPイベント招待", "1対1コンシェルジュ", "会費無料"],
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
          現在のランク特典
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

function RankTiersCard() {
  const colors = useColors();

  const tiers = [
    { rank: "regular" as MemberRank, points: "0 XP〜", benefits: "基本機能" },
    { rank: "silver" as MemberRank, points: "100 XP〜", benefits: "掲示板・部活動" },
    { rank: "gold" as MemberRank, points: "500 XP〜", benefits: "限定クーポン・コンシェルジュ" },
    { rank: "platinum" as MemberRank, points: "1,000 XP〜", benefits: "VIP特典・会費無料" },
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
            backgroundColor: tier.rank === CURRENT_USER.rank ? RANK_COLORS[tier.rank] + "08" : "transparent",
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
              {tier.rank === CURRENT_USER.rank && (
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#E8A0BF", marginLeft: 6 }}>
                  ← 現在
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 11, color: colors.muted }}>{tier.benefits}</Text>
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
  onDetailsChange,
}: {
  visible: boolean;
  onClose: () => void;
  onAvatarChange?: (uri: string) => void;
  onBioChange?: (bio: string) => void;
  onInterestsChange?: (interests: string[]) => void;
  onNameChange?: (name: string) => void;
  onDetailsChange?: (details: ProfileDetails) => void;
}) {
  const colors = useColors();
  const [name, setName] = useState("");
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
  const [favoriteRestaurants, setFavoriteRestaurants] = useState("");
  const [desiredRestaurants, setDesiredRestaurants] = useState("");
  const [googleLocalGuideLevel, setGoogleLocalGuideLevel] = useState("");

  // モーダルが開いたときにAsyncStorageから保存済みデータを読み込む
  useEffect(() => {
    if (!visible) return;
    import("@react-native-async-storage/async-storage").then(({ default: AsyncStorage }) => {
      Promise.all([
        AsyncStorage.getItem("profile_name"),
        AsyncStorage.getItem("profile_bio"),
        AsyncStorage.getItem("profile_interests"),
        AsyncStorage.getItem("profile_avatar_uri"),
        AsyncStorage.getItem("profile_gender"),
        AsyncStorage.getItem(PROFILE_DETAILS_STORAGE_KEY),
      ]).then(([savedName, savedBio, savedInterests, savedAvatar, savedGender, savedDetails]) => {
        setName(savedName ?? CURRENT_USER.name ?? "");
        setBio(savedBio ?? CURRENT_USER.bio ?? "");
        const storedInterests = savedInterests?.split(",").map((item) => item.trim()).filter(Boolean);
        setInterests(storedInterests?.length ? storedInterests : (CURRENT_USER.favoriteCuisines ?? CURRENT_USER.interests ?? []));
        if (savedAvatar) setAvatarUri(savedAvatar);
        if (savedGender) setGender(savedGender as "male" | "female" | "other" | "unset");
        const details = savedDetails ? JSON.parse(savedDetails) as Partial<ProfileDetails> : {};
        const birthDate = details.birthDate ?? CURRENT_USER.birthDate ?? "";
        const [year = "", month = "", day = ""] = birthDate.split("-");
        setBirthYear(year); setBirthMonth(month); setBirthDay(day);
        setShowAge(details.showAge ?? CURRENT_USER.showAge ?? false);
        setHometown(details.hometown ?? CURRENT_USER.hometown ?? "");
        setResidence(details.residence ?? CURRENT_USER.residence ?? "");
        setOccupation(details.occupation ?? CURRENT_USER.occupation ?? "");
        setHobbies(details.hobbies ?? CURRENT_USER.hobbies ?? "");
        setFavoriteAlcohol(details.favoriteAlcohol ?? CURRENT_USER.favoriteAlcohol ?? "");
        setDislikedFoods(details.dislikedFoods ?? CURRENT_USER.dislikedFoods ?? "");
        setAllergies(details.allergies ?? CURRENT_USER.allergies ?? "");
        setDrinkingLevel(details.drinkingLevel ?? CURRENT_USER.drinkingLevel ?? "");
        setInstagramUrl(details.instagramUrl ?? CURRENT_USER.instagramUrl ?? "");
        setFavoriteRestaurants(details.favoriteRestaurants ?? CURRENT_USER.favoriteRestaurants ?? "");
        setDesiredRestaurants(details.desiredRestaurants ?? CURRENT_USER.desiredRestaurants ?? "");
        setGoogleLocalGuideLevel(details.googleLocalGuideLevel ?? CURRENT_USER.googleLocalGuideLevel ?? "");
      });
    });
  }, [visible]);

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
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    // nameシbio・interests・avatar・genderをAsyncStorageに保存
    await AsyncStorage.setItem("profile_name", name.trim());
    await AsyncStorage.setItem("profile_bio", bio);
    const interestList = interests;
    await AsyncStorage.setItem("profile_interests", interests.join(","));
    await AsyncStorage.setItem("profile_gender", gender);
    const details: ProfileDetails = {
      birthDate: birthYear && birthMonth && birthDay ? `${birthYear}-${birthMonth}-${birthDay}` : "",
      showAge, hometown, residence, occupation: occupation.trim(), hobbies: hobbies.trim(), favoriteCuisines: interests,
      favoriteAlcohol: favoriteAlcohol.trim(), dislikedFoods: dislikedFoods.trim(), allergies: allergies.trim(), drinkingLevel,
      instagramUrl: instagramUrl.trim(),
      favoriteRestaurants: favoriteRestaurants.trim(), desiredRestaurants: desiredRestaurants.trim(),
      googleLocalGuideLevel: googleLocalGuideLevel === "未設定" ? "" : googleLocalGuideLevel,
    };
    await AsyncStorage.setItem(PROFILE_DETAILS_STORAGE_KEY, JSON.stringify(details));
    if (avatarUri) {
      await AsyncStorage.setItem("profile_avatar_uri", avatarUri);
      onAvatarChange?.(avatarUri);
    }
    onNameChange?.(name.trim());
    onBioChange?.(bio);
    onInterestsChange?.(interestList);
    onDetailsChange?.(details);
    Alert.alert("保存完了", "プロフィールを更新しました");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          <Pressable onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            プロフィール編集
          </Text>
          <Pressable onPress={handleSave}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#E8A0BF" }}>保存</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
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

          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>生年月日</Text>
          <View style={{ flexDirection: "row", gap: 7, marginBottom: 10 }}><View style={{ flex: 1.35 }}><ProfileSelectField label="年" value={birthYear} options={BIRTH_YEARS} onChange={setBirthYear} /></View><View style={{ flex: 1 }}><ProfileSelectField label="月" value={birthMonth} options={MONTHS} onChange={setBirthMonth} /></View><View style={{ flex: 1 }}><ProfileSelectField label="日" value={birthDay} options={DAYS} onChange={setBirthDay} /></View></View>
          <Pressable onPress={() => setShowAge((value) => !value)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: showAge ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: showAge ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{showAge ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><View style={{ marginLeft: 8 }}><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>年齢を公開する</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>生年月日は表示せず「20代後半」など年代のみ公開されます</Text></View></Pressable>

          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>出身地</Text><View style={{ marginBottom: 16 }}><ProfileSelectField label="出身地を選択" value={hometown} options={PREFECTURES} onChange={setHometown} /></View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>居住地</Text><View style={{ marginBottom: 16 }}><ProfileSelectField label="居住地を選択" value={residence} options={PREFECTURES} onChange={setResidence} /></View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>Googleローカルガイドレベル</Text><View style={{ marginBottom: 16 }}><ProfileSelectField label="レベルを選択" value={googleLocalGuideLevel} options={GOOGLE_LOCAL_GUIDE_LEVELS} onChange={setGoogleLocalGuideLevel} /></View>

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
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>お気に入りのお店</Text><TextInput value={favoriteRestaurants} onChangeText={setFavoriteRestaurants} placeholder="店名やURLを自由に入力" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 76, fontSize: 15, color: colors.foreground, marginBottom: 16 }} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>行ってみたいお店</Text><TextInput value={desiredRestaurants} onChangeText={setDesiredRestaurants} placeholder="店名やURLを自由に入力" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 76, fontSize: 15, color: colors.foreground, marginBottom: 18 }} />

          {/* Gender */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
            性別（分析用）
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
            {([
              { value: "male", label: "男性" },
              { value: "female", label: "女性" },
              { value: "other", label: "その他" },
              { value: "unset", label: "未設定" },
            ] as const).map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setGender(opt.value)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  backgroundColor: gender === opt.value ? "#E8A0BF" : colors.surface,
                  borderWidth: 1,
                  borderColor: gender === opt.value ? "#E8A0BF" : colors.border,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: gender === opt.value ? "#fff" : colors.foreground }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
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
  const router = useRouter();
  const { logout, user: authUser } = useAuthContext();
  const user = CURRENT_USER;
  const { data: achievementBadges = [] } = trpc.memberData.achievementBadges.useQuery(undefined, { enabled: Boolean(authUser) });
  const { data: memberIdentity } = trpc.memberData.identity.useQuery(undefined, { enabled: Boolean(authUser) });
  const selectedBranches = authUser?.branches?.length
    ? authUser.branches
    : [authUser?.branch ?? user.branch];
  const branchLabel = selectedBranches
    .map((branch) => (branch === "kanto" ? "関東支部" : "関西支部"))
    .join("・");
  const [showEditProfile, setShowEditProfile] = useState(false);
  // DBから取得したroleで管理者判定（モックデータのCURRENT_USERではなく実際のログインユーザーを使用）
  const userIsAdmin = authUser?.role === "admin";
  const userIsOperator = isOperatorRole(authUser?.role);
  const [myRooms, setMyRooms] = useState(() => getMyRooms(user.id));
  const [participatingEvents, setParticipatingEvents] = useState<Event[]>([]);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>(CURRENT_USER.name ?? "");
  const [profileBio, setProfileBio] = useState<string>(CURRENT_USER.bio ?? "");
  const [profileInterests, setProfileInterests] = useState<string[]>(CURRENT_USER.favoriteCuisines ?? CURRENT_USER.interests ?? []);
  const [profileDetails, setProfileDetails] = useState<ProfileDetails>({
    birthDate: CURRENT_USER.birthDate ?? "", showAge: CURRENT_USER.showAge ?? false,
    hometown: CURRENT_USER.hometown ?? "", residence: CURRENT_USER.residence ?? "", occupation: CURRENT_USER.occupation ?? "",
    hobbies: CURRENT_USER.hobbies ?? "", favoriteCuisines: CURRENT_USER.favoriteCuisines ?? CURRENT_USER.interests ?? [],
    favoriteAlcohol: CURRENT_USER.favoriteAlcohol ?? "", dislikedFoods: CURRENT_USER.dislikedFoods ?? "", allergies: CURRENT_USER.allergies ?? "",
    drinkingLevel: CURRENT_USER.drinkingLevel ?? "", instagramUrl: CURRENT_USER.instagramUrl ?? "",
    favoriteRestaurants: CURRENT_USER.favoriteRestaurants ?? "", desiredRestaurants: CURRENT_USER.desiredRestaurants ?? "",
    googleLocalGuideLevel: CURRENT_USER.googleLocalGuideLevel ?? "",
  });
  const [memberId, setMemberId] = useState<string>("");
  useEffect(() => {
    if (memberIdentity?.memberId) setMemberId(memberIdentity.memberId);
    if (memberIdentity?.displayName) setProfileName((current) => current || memberIdentity.displayName || "");
  }, [memberIdentity]);
  // イロタスポイント
  const [irotasPoints, setIrotasPoints] = useState(0);
  const [feeExempt, setFeeExempt] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setMyRooms(getMyRooms(user.id));
      setParticipatingEvents(getAllEvents(EVENTS)
        .filter((event) => getEventParticipationStatus(event, user.id) !== null)
        .sort((a, b) => Date.parse(`${a.date}T${a.time}:00`) - Date.parse(`${b.date}T${b.time}:00`)));
      // AsyncStorageから保存済みデータを読み込む
      import("@react-native-async-storage/async-storage").then(({ default: AsyncStorage }) => {
        Promise.all([
          AsyncStorage.getItem("profile_avatar_uri"),
          AsyncStorage.getItem("profile_name"),
          AsyncStorage.getItem("profile_bio"),
          AsyncStorage.getItem("profile_interests"),
          AsyncStorage.getItem("member_id"),
          AsyncStorage.getItem(PROFILE_DETAILS_STORAGE_KEY),
        ]).then(([uri, savedName, savedBio, savedInterests, savedMemberId, savedDetails]) => {
          if (uri) setAvatarUri(uri);
          if (savedName !== null) setProfileName(savedName);
          if (savedBio !== null) setProfileBio(savedBio);
          if (savedInterests !== null) {
            const list = savedInterests.split(",").map((s) => s.trim()).filter(Boolean);
            setProfileInterests(list);
          }
          if (memberIdentity?.memberId) {
            setMemberId(memberIdentity.memberId);
          } else if (savedMemberId) {
            setMemberId(savedMemberId);
          } else {
            // プレビュー用。実会員はサブスク登録日時順のDB採番を表示する。
            const newId = "IRO-000001";
            AsyncStorage.setItem("member_id", newId);
            setMemberId(newId);
          }
          if (savedDetails) setProfileDetails(JSON.parse(savedDetails) as ProfileDetails);
        });
      });
      // イロタスポイント・会費免除を読み込む
      getIrotasPoints(user.id).then(setIrotasPoints);
      isFeeExempt(user.id).then(setFeeExempt);
    }, [memberIdentity?.memberId, user.id])
  );

  const publishedAge = getPublishedAgeBand(profileDetails.birthDate, profileDetails.showAge);

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <View style={{ position: "relative" }}>
            <Image
              source={avatarUri ? { uri: avatarUri } : user.avatar}
              style={{ width: 80, height: 80, borderRadius: 40 }}
              contentFit="cover"
            />
            <View
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                backgroundColor: RANK_COLORS[user.rank],
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
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{profileName}</Text>
            <NewMemberMark member={user} size={17} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
            <View
              style={{
                backgroundColor: RANK_COLORS[user.rank] + "20",
                borderColor: RANK_COLORS[user.rank],
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: RANK_COLORS[user.rank],
                }}
              >
                {RANK_LABELS[user.rank]}会員
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.muted, marginLeft: 8 }}>
              {branchLabel}
            </Text>
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
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <IconSymbol name="person.fill" size={14} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 4 }}>
                {user.generation}期生
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <IconSymbol name="calendar" size={14} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 4 }}>
                {user.joinedAt ? `${new Date(user.joinedAt).getFullYear()}年${new Date(user.joinedAt).getMonth() + 1}月入会` : ""}
              </Text>
            </View>
          </View>

          {/* Member ID */}
          {memberId ? (
            <Pressable
              onPress={() => {
                Clipboard.setStringAsync(memberId);
                Alert.alert("コピー完了", `会員IDをコピーしました`);
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
              <Text style={{ fontSize: 12, color: colors.muted, marginRight: 6 }}>会員ID</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, letterSpacing: 1 }}>{memberId}</Text>
              <IconSymbol name="doc.on.doc" size={13} color={colors.muted} style={{ marginLeft: 6 }} />
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
            { label: "フォロワー", value: user.followerCount ?? 0 },
            { label: "フォロー", value: user.followingCount ?? 0 },
          ].map((stat, index) => <View key={stat.label} style={{ flex: 1, alignItems: "center", borderLeftWidth: index ? 0.5 : 0, borderLeftColor: colors.border }}><Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground }}>{stat.value}</Text><Text style={{ fontSize: 10, color: colors.muted, marginTop: 3 }}>{stat.label}</Text></View>)}
        </View>

        <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginBottom: 9 }}>参加申込中／参加確定済みのイベント</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden" }}>
            {participatingEvents.length ? participatingEvents.map((event, index) => {
              const status = getEventParticipationStatus(event, user.id);
              const confirmed = status === "confirmed";
              return <Pressable key={event.id} onPress={() => router.push({ pathname: "/event-detail", params: { id: event.id } })} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderTopWidth: index ? 0.5 : 0, borderTopColor: colors.border }}>
                <Image source={event.image} style={{ width: 52, height: 52, borderRadius: 10 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }} numberOfLines={2}>{event.title}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>{event.date} {event.time}</Text></View>
                <View style={{ borderRadius: 8, backgroundColor: confirmed ? "#E6F6EA" : "#E8F2FA", paddingHorizontal: 7, paddingVertical: 4 }}><Text style={{ fontSize: 10, fontWeight: "800", color: confirmed ? "#237A3B" : "#3E78A1" }}>{confirmed ? "参加確定済み" : "参加申込中"}</Text></View>
              </Pressable>;
            }) : <Text style={{ padding: 16, fontSize: 13, color: colors.muted }}>参加申込中・参加確定済みのイベントはありません。</Text>}
          </View>
        </View>

        <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginBottom: 12 }}>プロフィール情報</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 12 }}>
            {[
              ...(publishedAge !== null ? [{ label: "年代", value: publishedAge }] : []),
              { label: "出身地", value: profileDetails.hometown }, { label: "居住地", value: profileDetails.residence },
              { label: "職業", value: profileDetails.occupation }, { label: "趣味", value: profileDetails.hobbies },
              { label: "飲酒量", value: profileDetails.drinkingLevel }, { label: "好きなお酒", value: profileDetails.favoriteAlcohol },
              { label: "苦手な食材", value: profileDetails.dislikedFoods }, { label: "アレルギー", value: profileDetails.allergies },
              { label: "お気に入りのお店", value: profileDetails.favoriteRestaurants }, { label: "行ってみたいお店", value: profileDetails.desiredRestaurants },
              { label: "Googleローカルガイド", value: profileDetails.googleLocalGuideLevel },
            ].filter((item) => item.value).map((item) => <View key={item.label} style={{ width: "50%", paddingRight: 8 }}><Text style={{ fontSize: 10, color: colors.muted }}>{item.label}</Text><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 2 }}>{item.value}</Text></View>)}
          </View>
          {profileDetails.instagramUrl ? <Pressable onPress={() => Linking.openURL(profileDetails.instagramUrl)} style={{ flexDirection: "row", alignItems: "center", marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border }}><IconSymbol name="camera.fill" size={17} color="#C13584" /><Text style={{ flex: 1, marginLeft: 7, fontSize: 13, fontWeight: "700", color: "#C13584" }}>Instagramを見る</Text><IconSymbol name="chevron.right" size={15} color="#C13584" /></Pressable> : null}
        </View>

        {/* Chat Shortcut Card */}
        <Pressable
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
        </Pressable>

        {/* Points Progress */}
        <PointsProgressCard points={user.points} rank={user.rank} />

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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 2 }}>イロタスポイント</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ fontSize: 32, fontWeight: "900", color: "#FF9500" }}>
                  {irotasPoints.toLocaleString()}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#FF9500", marginLeft: 4 }}>pt</Text>
              </View>
            </View>
            <View
              style={{
                backgroundColor: "#FF950015",
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 20 }}>★</Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#FF9500", marginTop: 2 }}>イロタスPT</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            イベント参加費の割引に使えます（1pt = 1円）。ランクアップ時または管理者から付与されます。
          </Text>

        </View>

        {/* Rank Card */}
        <RankCard rank={user.rank} />

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
              { icon: "ticket.fill", label: "クーポン管理", color: "#FF9500", onPress: () => router.push({ pathname: "/admin-dashboard", params: { tab: "coupons" } }) },
              {
                icon: "megaphone.fill",
                label: "キャンペーン管理",
                color: "#FF9500",
                onPress: () => router.push("/campaign-manager" as any),
              },
              {
                icon: "gift.fill",
                label: "プレゼント企画管理",
                color: "#FF9500",
                onPress: () => router.push("/gift-campaign-manager" as any),
              },
              {
                icon: "square.and.arrow.down",
                label: "CSV取り込み",
                color: "#FF9500",
                onPress: () => router.push("/csv-import" as any),
              },
            ]}
          />
        )}

        {userIsOperator && !userIsAdmin && (
          <MenuSection
            title="運営メニュー"
            items={[{ icon: "megaphone.fill", label: "キャンペーン管理", color: "#FF9500", onPress: () => router.push("/campaign-manager" as any) }, { icon: "gift.fill", label: "プレゼント企画管理", color: "#FF9500", onPress: () => router.push("/gift-campaign-manager" as any) }]}
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
                  await Linking.openURL(OFFICIAL_INSTAGRAM_URL);
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
            onPress={() => {
              Alert.alert(
                "ログアウト",
                "本当にログアウトしますか？",
                [
                  { text: "キャンセル", style: "cancel" },
                  {
                    text: "ログアウト",
                    style: "destructive",
                    onPress: async () => {
                      await logout();
                    },
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

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        onAvatarChange={(uri) => setAvatarUri(uri)}
        onNameChange={(n) => setProfileName(n)}
        onBioChange={(bio) => setProfileBio(bio)}
        onInterestsChange={(list) => setProfileInterests(list)}
        onDetailsChange={(details) => setProfileDetails(details)}
      />
    </ScreenContainer>
  );
}
