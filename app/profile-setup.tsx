import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { markNativeProfileSetupComplete } from "@/lib/native-profile-setup";
import * as Api from "@/lib/_core/api";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

const profileValue = (profile: Record<string, unknown> | undefined, key: string) =>
  typeof profile?.[key] === "string" ? String(profile[key]) : "";

export default function ProfileSetupScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, refresh } = useAuthContext();
  const [name, setName] = useState(user?.name?.trim() ?? "");
  const [publicUserId, setPublicUserId] = useState(user?.publicUserId ?? "");
  const [birthDate, setBirthDate] = useState(profileValue(user?.profile, "birthDate"));
  const [showAge, setShowAge] = useState(user?.profile?.showAge === true);
  const [gender, setGender] = useState(profileValue(user?.profile, "gender"));
  const [hometown, setHometown] = useState(profileValue(user?.profile, "hometown"));
  const [residence, setResidence] = useState(profileValue(user?.profile, "residence"));
  const [occupation, setOccupation] = useState(profileValue(user?.profile, "occupation"));
  const [hobbies, setHobbies] = useState(profileValue(user?.profile, "hobbies"));
  const [favoriteCuisines, setFavoriteCuisines] = useState(Array.isArray(user?.profile?.favoriteCuisines) ? user.profile.favoriteCuisines.join("、") : "");
  const [favoriteAlcohol, setFavoriteAlcohol] = useState(profileValue(user?.profile, "favoriteAlcohol"));
  const [dislikedFoods, setDislikedFoods] = useState(profileValue(user?.profile, "dislikedFoods"));
  const [allergies, setAllergies] = useState(profileValue(user?.profile, "allergies"));
  const [drinkingLevel, setDrinkingLevel] = useState(profileValue(user?.profile, "drinkingLevel"));
  const [instagramUrl, setInstagramUrl] = useState(profileValue(user?.profile, "instagramUrl"));
  const [favoriteRestaurants, setFavoriteRestaurants] = useState(profileValue(user?.profile, "favoriteRestaurants"));
  const [desiredRestaurants, setDesiredRestaurants] = useState(profileValue(user?.profile, "desiredRestaurants"));
  const [bio, setBio] = useState(profileValue(user?.profile, "bio"));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const normalizedName = name.trim();
    const normalizedId = publicUserId.trim().replace(/^@+/, "").toLowerCase();
    if (!normalizedName) return Alert.alert("名前を入力してください");
    if (!/^[a-z0-9][a-z0-9._]{2,23}$/.test(normalizedId) || normalizedId.endsWith(".")) {
      return Alert.alert("ユーザーIDを確認してください", "3〜24文字の半角英小文字・数字・ピリオド・アンダーバーで入力してください。");
    }
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return Alert.alert("生年月日を確認してください", "YYYY-MM-DD形式で入力してください。");
    if (showAge && !birthDate) return Alert.alert("生年月日を入力してください", "年齢を公開するには、生年月日の入力が必要です。");
    if (instagramUrl.trim() && !/^https?:\/\//i.test(instagramUrl.trim())) return Alert.alert("Instagram URLを確認してください", "https:// から始まるURLを入力してください。");
    if (!user) return;
    setSaving(true);
    try {
      await Api.updateMyProfile({
        displayName: normalizedName,
        publicUserId: normalizedId,
        profile: {
          ...user.profile,
          birthDate,
          showAge,
          gender,
          hometown,
          residence,
          occupation: occupation.trim(),
          hobbies: hobbies.trim(),
          favoriteCuisines: favoriteCuisines.split(/[、,]/).map((value) => value.trim()).filter(Boolean),
          favoriteAlcohol: favoriteAlcohol.trim(),
          dislikedFoods: dislikedFoods.trim(),
          allergies: allergies.trim(),
          drinkingLevel: drinkingLevel.trim(),
          instagramUrl: instagramUrl.trim(),
          favoriteRestaurants: favoriteRestaurants.trim(),
          desiredRestaurants: desiredRestaurants.trim(),
          bio: bio.trim(),
        },
      });
      await markNativeProfileSetupComplete(user.id);
      await refresh();
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("保存できませんでした", error instanceof Error ? error.message : "通信状況を確認してもう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.foreground } as const;
  const labelStyle = { marginTop: 20, marginBottom: 7, fontSize: 13, fontWeight: "800" as const, color: colors.foreground };
  return <ScreenContainer>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 32, paddingBottom: 48 }}>
      <Text style={{ fontSize: 27, fontWeight: "900", color: colors.foreground }}>プロフィールを設定</Text>
      <Text style={{ marginTop: 10, fontSize: 14, lineHeight: 21, color: colors.muted }}>スマホアプリを使い始める前に、マイページに表示するプロフィールを設定してください。名前とユーザーIDは必須です。</Text>
      <Text style={{ ...labelStyle, marginTop: 30 }}>名前（必須）</Text>
      <TextInput value={name} onChangeText={setName} placeholder="表示する名前" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>ユーザーID（必須）</Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 13, paddingHorizontal: 14 }}><Text style={{ fontSize: 16, color: colors.muted }}>@</Text><TextInput value={publicUserId} onChangeText={(value) => setPublicUserId(value.replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 24))} placeholder="your.name" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, paddingVertical: 13, fontSize: 16, color: colors.foreground }} /></View>
      <Text style={{ marginTop: 7, fontSize: 11, lineHeight: 17, color: colors.muted }}>プロフィール、検索、メンション候補に表示されます。内部識別子は表示されません。</Text>
      <Text style={labelStyle}>生年月日</Text>
      <TextInput value={birthDate} onChangeText={(value) => setBirthDate(value.replace(/[^0-9-]/g, "").slice(0, 10))} placeholder="1997-01-01" keyboardType="numbers-and-punctuation" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: showAge }}
        accessibilityLabel="年齢を公開する"
        onPress={() => setShowAge((value) => !value)}
        style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: showAge ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: showAge ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>
          {showAge ? <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "900" }}>✓</Text> : null}
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>年齢を公開する</Text>
          <Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 2 }}>生年月日は表示せず、年齢のみ公開されます</Text>
        </View>
      </Pressable>
      <Text style={labelStyle}>性別</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>{[["male", "男性"], ["female", "女性"], ["other", "その他"]].map(([value, label]) => <Pressable key={value} onPress={() => setGender(gender === value ? "" : value)} style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: gender === value ? "#D56591" : colors.surface, borderWidth: 1, borderColor: gender === value ? "#D56591" : colors.border }}><Text style={{ fontWeight: "800", color: gender === value ? "#FFF" : colors.foreground }}>{label}</Text></Pressable>)}</View>
      <Text style={labelStyle}>出身地</Text><TextInput value={hometown} onChangeText={setHometown} placeholder="例：東京都" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>居住地</Text><TextInput value={residence} onChangeText={setResidence} placeholder="例：東京都" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>職業</Text><TextInput value={occupation} onChangeText={setOccupation} placeholder="職業を入力" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>趣味</Text><TextInput value={hobbies} onChangeText={setHobbies} placeholder="趣味を入力" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>好きな料理</Text><TextInput value={favoriteCuisines} onChangeText={setFavoriteCuisines} placeholder="例：寿司、イタリアン" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>好きなお酒</Text><TextInput value={favoriteAlcohol} onChangeText={setFavoriteAlcohol} placeholder="例：ワイン、日本酒" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>苦手な食べ物</Text><TextInput value={dislikedFoods} onChangeText={setDislikedFoods} placeholder="苦手な食べ物を入力" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>アレルギー</Text><TextInput value={allergies} onChangeText={setAllergies} placeholder="アレルギーを入力" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>飲酒量</Text><TextInput value={drinkingLevel} onChangeText={setDrinkingLevel} placeholder="例：週1〜2回" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>Instagram URL</Text><TextInput value={instagramUrl} onChangeText={setInstagramUrl} placeholder="https://www.instagram.com/..." autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={fieldStyle} />
      <Text style={labelStyle}>お気に入りのお店</Text><TextInput value={favoriteRestaurants} onChangeText={setFavoriteRestaurants} placeholder="店名やURLを入力" placeholderTextColor={colors.muted} multiline style={[fieldStyle, { minHeight: 76 }]} />
      <Text style={labelStyle}>行ってみたいお店</Text><TextInput value={desiredRestaurants} onChangeText={setDesiredRestaurants} placeholder="店名やURLを入力" placeholderTextColor={colors.muted} multiline style={[fieldStyle, { minHeight: 76 }]} />
      <Text style={labelStyle}>自己紹介</Text><TextInput value={bio} onChangeText={setBio} placeholder="自己紹介を入力" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[fieldStyle, { minHeight: 100 }]} />
      <Pressable disabled={saving || !name.trim() || !publicUserId.trim()} onPress={() => void save()} style={{ marginTop: 30, minHeight: 54, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: !saving && name.trim() && publicUserId.trim() ? "#D56591" : colors.border }}><Text style={{ fontSize: 16, fontWeight: "900", color: "#FFF" }}>{saving ? "保存中…" : "保存してはじめる"}</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}
