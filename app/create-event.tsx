import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, MEMBERS, type Event } from "@/constants/mock-data";
import { GOURMET_GENRES } from "@/constants/event-options";
import { useAuthContext } from "@/lib/auth-context";
import { canCreateClubEvent, isOperatorRole } from "@/lib/access-control";
import { useClubs } from "@/lib/club-store";
import { pendingEvents } from "@/lib/event-store";
import { scheduleOrganizerDeadlineNotification } from "@/lib/notifications";
import { eventCategoryFromPrefecture, extractEventLocation, formatEventArea } from "@/lib/event-location";
import { useColors } from "@/hooks/use-colors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { recordHomeActivity } from "@/lib/home-activity-store";
import { XpRewardPopup } from "@/components/xp-reward-popup";
import { awardXp, type XpReward } from "@/lib/xp-store";
import { POINT_ACTIONS } from "@/constants/mock-data";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`);
const CAPACITY_OPTIONS = Array.from({ length: 100 }, (_, index) => String(index + 1));
const AMOUNT_OPTIONS = Array.from({ length: 300 }, (_, index) => `${((index + 1) * 1000).toLocaleString()}円`);
const DEFAULT_CANCELLATION_POLICY = "1週間前より100%のキャンセル料が発生します。代理が見つかった場合はキャンセル料はかかりません";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function CalendarField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const days = useMemo(() => {
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const offset = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - offset + 1;
      return day >= 1 && day <= count ? new Date(year, month, day) : null;
    });
  }, [displayMonth]);

  return (
    <>
      <Pressable onPress={() => setVisible(true)} style={{ height: 48, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 15, color: value ? colors.foreground : colors.muted }}>{value || "カレンダーから選択"}</Text>
        <IconSymbol name="calendar" size={19} color={colors.muted} />
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable onPress={() => setVisible(false)} style={{ flex: 1, backgroundColor: "#0007", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <Pressable onPress={(event) => event.stopPropagation?.()} style={{ width: "100%", maxWidth: 370, backgroundColor: colors.surface, borderRadius: 22, padding: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Pressable onPress={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><IconSymbol name="chevron.left" size={19} color={colors.foreground} /></Pressable>
              <View style={{ alignItems: "center" }}><Text style={{ fontSize: 11, color: colors.muted }}>{label}</Text><Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>{displayMonth.getFullYear()}年 {displayMonth.getMonth() + 1}月</Text></View>
              <Pressable onPress={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><IconSymbol name="chevron.right" size={19} color={colors.foreground} /></Pressable>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 5 }}>{WEEKDAYS.map((day, index) => <Text key={day} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: "700", color: index === 0 ? "#D97FA8" : index === 6 ? "#6E9EC0" : colors.muted }}>{day}</Text>)}</View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {days.map((date, index) => {
                const key = date ? dateKey(date) : "";
                const selected = key === value;
                return <View key={`${key}-${index}`} style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" }}>{date ? <Pressable onPress={() => { onChange(key); setVisible(false); }} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: selected ? "#5D5C74" : "transparent" }}><Text style={{ fontSize: 14, fontWeight: selected ? "800" : "500", color: selected ? "#FFF" : colors.foreground }}>{date.getDate()}</Text></Pressable> : null}</View>;
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable onPress={() => setVisible(true)} style={{ height: 48, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 15, color: value ? colors.foreground : colors.muted }}>{value || "選択してください"}</Text>
        <IconSymbol name="chevron.down" size={17} color={colors.muted} />
      </Pressable>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>{label}</Text><Pressable onPress={() => setVisible(false)}><IconSymbol name="xmark" size={22} color={colors.muted} /></Pressable></View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>{options.map((option) => <Pressable key={option} onPress={() => { onChange(option); setVisible(false); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 15, color: colors.foreground }}>{option}</Text>{value === option ? <IconSymbol name="checkmark" size={18} color="#E8A0BF" /> : null}</Pressable>)}</ScrollView>
        </View>
      </Modal>
    </>
  );
}

function FieldLabel({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 7, marginTop: 16 }}>{children}</Text>;
}

function MemberPicker({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const candidates = MEMBERS.filter((member) => member.id !== CURRENT_USER.id && (`${member.name} ${member.id}`).toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Pressable onPress={() => setVisible(true)} style={{ minHeight: 48, borderRadius: 12, backgroundColor: colors.surface, padding: 12, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 14, color: selectedIds.length ? colors.foreground : colors.muted }}>{selectedIds.length ? `${selectedIds.length}人を選択中` : "名前・会員IDから選択"}</Text>
      </Pressable>
      {selectedIds.length > 0 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 }}>{selectedIds.map((id) => { const member = MEMBERS.find((item) => item.id === id); return member ? <View key={id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#E8A0BF18", borderRadius: 16, paddingHorizontal: 9, paddingVertical: 5 }}><Text style={{ fontSize: 12, color: colors.foreground }}>{member.name}</Text><Pressable onPress={() => onChange(selectedIds.filter((value) => value !== id))} style={{ marginLeft: 5 }}><IconSymbol name="xmark" size={12} color={colors.muted} /></Pressable></View> : null; })}</View> : null}
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>同席者を選択</Text><Pressable onPress={() => setVisible(false)}><Text style={{ color: "#E8A0BF", fontWeight: "800" }}>完了</Text></Pressable></View>
          <TextInput value={query} onChangeText={setQuery} placeholder="名前または会員IDで検索" placeholderTextColor={colors.muted} style={{ margin: 16, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} />
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>{candidates.map((member) => { const selected = selectedIds.includes(member.id); return <Pressable key={member.id} onPress={() => onChange(selected ? selectedIds.filter((id) => id !== member.id) : [...selectedIds, member.id])} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Image source={member.avatar} style={{ width: 40, height: 40, borderRadius: 20 }} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{member.name}</Text><Text style={{ fontSize: 12, color: colors.muted }}>ID: {member.id}・{member.generation}期生</Text></View><View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: selected ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: selected ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{selected ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View></Pressable>; })}</ScrollView>
        </View>
      </Modal>
    </>
  );
}

export default function CreateEventScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ sourceThreadId?: string; sourceTitle?: string; sourceDescription?: string; sourceCategory?: string }>();
  const { user: authUser } = useAuthContext();
  const userIsOperator = isOperatorRole(authUser?.role);
  const clubs = useClubs();
  const joinedClubs = clubs.filter((club) => canCreateClubEvent(CURRENT_USER.id, club.memberIds, club.leaderId));
  const sourceClubId = params.sourceCategory?.startsWith("club-") ? params.sourceCategory.slice("club-".length) : "";
  const sourceIsJoinedClub = Boolean(sourceClubId && joinedClubs.some((club) => club.id === sourceClubId));
  const [eventType, setEventType] = useState<Event["eventType"]>(params.sourceThreadId ? (sourceIsJoinedClub ? "club" : "gourmet") : userIsOperator ? "official" : "gourmet");
  const [selectedClubId, setSelectedClubId] = useState(sourceIsJoinedClub ? sourceClubId : "");
  const [restaurantName, setRestaurantName] = useState("");
  const [eventName, setEventName] = useState(params.sourceTitle ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [reservationCapacity, setReservationCapacity] = useState("");
  const [recruitCapacity, setRecruitCapacity] = useState("");
  const [fixedAmount, setFixedAmount] = useState(false);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [tabelogUrl, setTabelogUrl] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [companionIds, setCompanionIds] = useState<string[]>([]);
  const [imageUri, setImageUri] = useState("");
  const [decisionDate, setDecisionDate] = useState("");
  const [publicNotes, setPublicNotes] = useState(params.sourceDescription ?? "");
  const [privateMemo, setPrivateMemo] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState(DEFAULT_CANCELLATION_POLICY);
  const [selectionMethod, setSelectionMethod] = useState<"first_come" | "lottery">("first_come");
  const [useRankPrices, setUseRankPrices] = useState(false);
  const [rankPrices, setRankPrices] = useState<Record<"regular" | "silver" | "gold" | "platinum", string>>({ regular: "", silver: "", gold: "", platinum: "" });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [genres, setGenres] = useState<string[]>([]);
  const [xpReward, setXpReward] = useState<XpReward | null>(null);
  const extractedLocation = useMemo(() => extractEventLocation(address), [address]);

  if (!authUser) return <ScreenContainer edges={["top", "left", "right"]}><View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><IconSymbol name="lock.fill" size={44} color={colors.border} /><Text style={{ marginTop: 12, color: colors.muted }}>メンバーのみ作成できます</Text></View></ScreenContainer>;

  const chooseEventType = (type: Event["eventType"]) => {
    if (type === "official" && !userIsOperator) return;
    if (type === "club" && joinedClubs.length === 0) return;
    setEventType(type);
    if (type !== "official") { setUseRankPrices(false); setSelectionMethod("first_come"); }
    if (type === "club" && !selectedClubId) setSelectedClubId(joinedClubs[0]?.id ?? "");
  };
  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("権限が必要です", "写真を選ぶには写真ライブラリへのアクセスを許可してください"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };
  const numericAmount = (value: string) => Number(value.replace(/[^0-9]/g, ""));
  const handleCreate = () => {
    const clubEvent = eventType === "club";
    if ((!clubEvent && !restaurantName.trim()) || (clubEvent && (!eventName.trim() || !selectedClubId)) || !date || !time || !reservationCapacity || !recruitCapacity || !budgetMin || (!fixedAmount && !budgetMax) || !decisionDate || !imageUri || !termsAccepted || (!clubEvent && genres.length === 0)) {
      Alert.alert("入力エラー", "必須項目・写真・規約同意を確認してください"); return;
    }
    if (clubEvent && !joinedClubs.some((club) => club.id === selectedClubId)) {
      Alert.alert("部活を確認してください", "所属している部活のみイベントを作成できます。"); return;
    }
    if (address.trim() && !extractedLocation.prefecture) { Alert.alert("住所を確認してください", "住所を入力する場合は都道府県名を含めてください"); return; }
    if (decisionDate > date) { Alert.alert("期日を確認してください", "参加者決定予定日は開催日以前を選択してください"); return; }
    if (!fixedAmount && numericAmount(budgetMin) > numericAmount(budgetMax)) { Alert.alert("金額を確認してください", "下限金額は上限金額以下にしてください"); return; }
    if (1 + companionIds.length + Number(recruitCapacity) > Number(reservationCapacity)) { Alert.alert("人数を確認してください", "予約人数には、自分・同席者・募集人数の全員が収まるよう設定してください"); return; }
    if ([tabelogUrl, googleMapsUrl].some((url) => url && !/^https?:\/\//i.test(url))) { Alert.alert("URLを確認してください", "URLは http:// または https:// から入力してください"); return; }
    const finalType: Event["eventType"] = eventType === "official" && !userIsOperator ? "gourmet" : eventType;
    if (finalType === "official" && useRankPrices && Object.values(rankPrices).some((value) => !value)) {
      Alert.alert("ランク別料金を確認してください", "設定する場合は、すべてのランクの料金を選択してください"); return;
    }
    const title = eventName.trim() || restaurantName.trim();
    const price = fixedAmount ? `${numericAmount(budgetMin).toLocaleString()}円` : `${budgetMin}〜${budgetMax}`;
    const configuredRankPrices = finalType === "official" && useRankPrices
      ? Object.fromEntries(Object.entries(rankPrices).filter(([, value]) => value)) as Event["rankPrices"]
      : undefined;
    const newEvent: Event = {
      id: `event_${Date.now()}`, createdAt: new Date().toISOString(), title, restaurantName: restaurantName.trim() || undefined, description: publicNotes.trim() || (finalType === "official" ? "IRO＋公式イベントです。" : finalType === "club" ? `${joinedClubs.find((club) => club.id === selectedClubId)?.name ?? "部活"}の部員限定イベントです。` : "メンバー主催のグルメ会です。"), date, time,
      location: address.trim() || "住所未設定", prefecture: extractedLocation.prefecture, tokyoArea: extractedLocation.tokyoArea, image: imageUri, capacity: Number(recruitCapacity), reservationCapacity: Number(reservationCapacity), attendees: 0, applicantIds: [], participants: [], companionIds,
      price, priceMin: numericAmount(budgetMin), priceMax: fixedAmount ? numericAmount(budgetMin) : numericAmount(budgetMax), genres, ...(configuredRankPrices && Object.keys(configuredRankPrices).length ? { rankPrices: configuredRankPrices } : {}), category: eventCategoryFromPrefecture(extractedLocation.prefecture), eventType: finalType, clubId: finalType === "club" ? selectedClubId : undefined, status: "open", createdBy: CURRENT_USER.id,
      applicationDeadline: decisionDate, cancellationPolicy: cancellationPolicy.trim() || DEFAULT_CANCELLATION_POLICY, selectionMethod: finalType === "official" ? selectionMethod : "first_come", tabelogUrl: tabelogUrl.trim() || undefined, googleMapsUrl: googleMapsUrl.trim() || undefined, publicNotes: publicNotes.trim() || undefined, privateMemo: privateMemo.trim() || undefined,
    };
    pendingEvents.unshift(newEvent);
    void recordHomeActivity({ id: `event:${newEvent.id}`, kind: "event", title: newEvent.title, description: finalType === "official" ? "新しい公式イベントが公開されました" : finalType === "club" ? "新しい部活イベントが公開されました" : "新しいグルメ会が公開されました", createdAt: newEvent.createdAt!, route: "/event-detail", params: { id: newEvent.id } });
    void scheduleOrganizerDeadlineNotification(newEvent);
    void awardXp(CURRENT_USER.points, POINT_ACTIONS.eventCreate.points, POINT_ACTIONS.eventCreate.label).then(setXpReward);
  };

  const inputStyle = { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border } as const;
  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Pressable onPress={() => router.back()}><Text style={{ color: colors.muted }}>キャンセル</Text></Pressable><Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: colors.foreground }}>イベント作成</Text><View style={{ width: 54 }} /></View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {params.sourceThreadId ? <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 13, padding: 12, marginBottom: 4, backgroundColor: "#EEF4FB", borderWidth: 1, borderColor: "#D4E3F2" }}><IconSymbol name="doc.text.fill" size={18} color="#4D78A4" /><Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 18, fontWeight: "700", color: "#3F6489" }}>掲示板のタイトルと本文を引き継ぎました。必要に応じて編集してください。</Text></View> : null}
        {(userIsOperator || joinedClubs.length > 0) ? <><FieldLabel>イベント種別 *</FieldLabel><View style={{ flexDirection: "row", gap: 8 }}>{([...(userIsOperator ? ["official"] as const : []), "gourmet", ...(joinedClubs.length ? ["club"] as const : [])] as Event["eventType"][]).map((type) => <Pressable key={type} onPress={() => chooseEventType(type)} style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 12, backgroundColor: eventType === type ? "#5B9BD5" : colors.surface }}><Text style={{ fontSize: 12, fontWeight: "800", color: eventType === type ? "#FFF" : colors.foreground }}>{type === "official" ? "公式" : type === "club" ? "部活" : "グルメ会"}</Text></Pressable>)}</View></> : null}

        {eventType === "club" ? <><FieldLabel>開催する部活 *</FieldLabel><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{joinedClubs.map((club) => { const selected = selectedClubId === club.id; return <Pressable key={club.id} onPress={() => setSelectedClubId(club.id)} style={{ borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: selected ? "#4E6756" : colors.surface, borderWidth: 1, borderColor: selected ? "#4E6756" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "800", color: selected ? "#FFF" : colors.foreground }}>{club.icon} {club.name}</Text></Pressable>; })}</View></> : null}

        {eventType === "official" ? <><FieldLabel>参加者の決め方 *</FieldLabel><View style={{ flexDirection: "row", gap: 10 }}>{(["first_come", "lottery"] as const).map((value) => <Pressable key={value} onPress={() => setSelectionMethod(value)} style={{ flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 12, backgroundColor: selectionMethod === value ? "#E8A0BF" : colors.surface }}><Text style={{ fontWeight: "800", color: selectionMethod === value ? "#FFF" : colors.foreground }}>{value === "first_come" ? "先着順" : "抽選"}</Text></Pressable>)}</View></> : null}

        <FieldLabel>{eventType === "club" ? "店名・会場名（任意）" : "店名 *"}</FieldLabel><TextInput value={restaurantName} onChangeText={setRestaurantName} placeholder={eventType === "club" ? "例：代々木公園、〇〇スタジアム" : "店舗名"} placeholderTextColor={colors.muted} style={inputStyle} />
        <FieldLabel>{eventType === "club" ? "イベント名 *" : "イベント名（任意）"}</FieldLabel><TextInput value={eventName} onChangeText={setEventName} placeholder={eventType === "club" ? "例：朝の代々木公園ランニング" : "未入力の場合は店名を表示"} placeholderTextColor={colors.muted} style={inputStyle} />
        <FieldLabel>日時 *</FieldLabel><View style={{ gap: 9 }}><CalendarField label="開催日" value={date} onChange={setDate} /><SelectField label="開始時間（15分単位）" value={time} options={TIME_OPTIONS} onChange={setTime} /></View>
        <FieldLabel>住所（任意）</FieldLabel><TextInput value={address} onChangeText={setAddress} placeholder="例：東京都渋谷区恵比寿1-1-1" placeholderTextColor={colors.muted} style={inputStyle} />
        {address.trim() ? <Text style={{ marginTop: 7, fontSize: 12, fontWeight: "700", color: extractedLocation.prefecture ? "#3E78A1" : colors.error }}>{extractedLocation.prefecture ? `抽出エリア：${formatEventArea(extractedLocation.prefecture, extractedLocation.tokyoArea, address)}` : "都道府県を住所に含めてください"}</Text> : null}
        <FieldLabel>食べログURL（任意）</FieldLabel><TextInput value={tabelogUrl} onChangeText={setTabelogUrl} placeholder="https://tabelog.com/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={inputStyle} />
        <FieldLabel>GoogleマップURL（任意）</FieldLabel><TextInput value={googleMapsUrl} onChangeText={setGoogleMapsUrl} placeholder="https://maps.app.goo.gl/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={inputStyle} />
        {eventType !== "club" ? <><FieldLabel>グルメジャンル *（複数選択可）</FieldLabel><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{GOURMET_GENRES.map((genre) => { const selected = genres.includes(genre); return <Pressable key={genre} onPress={() => setGenres((current) => selected ? current.filter((item) => item !== genre) : [...current, genre])} style={{ borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: selected ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selected ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#FFF" : colors.foreground }}>{genre}</Text></Pressable>; })}</View></> : null}
        <FieldLabel>予約人数 *</FieldLabel><SelectField label="予約人数" value={reservationCapacity} options={CAPACITY_OPTIONS} onChange={setReservationCapacity} />
        <FieldLabel>募集人数（自分以外） *</FieldLabel><SelectField label="募集人数" value={recruitCapacity} options={CAPACITY_OPTIONS} onChange={setRecruitCapacity} />

        <FieldLabel>金額 *</FieldLabel>
        <Pressable onPress={() => { setFixedAmount((value) => !value); setBudgetMin(""); setBudgetMax(""); }} style={{ flexDirection: "row", alignItems: "center", marginBottom: 9 }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: fixedAmount ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: fixedAmount ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{fixedAmount ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, color: colors.foreground, fontSize: 13 }}>固定金額で設定する</Text></Pressable>
        {fixedAmount ? <View style={{ flexDirection: "row", alignItems: "center" }}><TextInput value={budgetMin} onChangeText={(value) => setBudgetMin(value.replace(/[^0-9]/g, ""))} placeholder="例：8000" placeholderTextColor={colors.muted} keyboardType="number-pad" inputMode="numeric" style={[inputStyle, { flex: 1 }]} /><Text style={{ marginLeft: 8, color: colors.foreground, fontWeight: "700" }}>円</Text></View> : <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ flex: 1 }}><SelectField label="下限金額" value={budgetMin} options={AMOUNT_OPTIONS} onChange={setBudgetMin} /></View><Text style={{ color: colors.muted }}>〜</Text><View style={{ flex: 1 }}><SelectField label="上限金額" value={budgetMax} options={AMOUNT_OPTIONS} onChange={setBudgetMax} /></View></View>}

        {eventType === "official" ? <><FieldLabel>ランク別料金</FieldLabel><Pressable onPress={() => setUseRankPrices((value) => !value)} style={{ flexDirection: "row", alignItems: "center" }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: useRankPrices ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: useRankPrices ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{useRankPrices ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, color: colors.foreground, fontSize: 13 }}>ランク別料金を設定する</Text></Pressable>{useRankPrices ? <View style={{ gap: 8, marginTop: 10 }}>{(["regular", "silver", "gold", "platinum"] as const).map((rank) => <View key={rank} style={{ flexDirection: "row", alignItems: "center" }}><Text style={{ width: 82, fontSize: 12, fontWeight: "700", color: colors.foreground }}>{rank === "regular" ? "レギュラー" : rank === "silver" ? "シルバー" : rank === "gold" ? "ゴールド" : "プラチナ"}</Text><View style={{ flex: 1 }}><SelectField label={`${rank}料金`} value={rankPrices[rank]} options={AMOUNT_OPTIONS} onChange={(value) => setRankPrices((current) => ({ ...current, [rank]: value }))} /></View></View>)}</View> : null}</> : null}

        <FieldLabel>同席者</FieldLabel><MemberPicker selectedIds={companionIds} onChange={setCompanionIds} />
        <FieldLabel>写真 *</FieldLabel><Pressable onPress={handlePickImage} style={{ height: 150, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderStyle: imageUri ? "solid" : "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>{imageUri ? <Image source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <><IconSymbol name="photo.fill" size={30} color={colors.muted} /><Text style={{ marginTop: 7, color: colors.muted, fontSize: 13 }}>写真を選択</Text></>}</Pressable>
        <FieldLabel>参加者決定の予定期日 *</FieldLabel><CalendarField label="参加者決定予定日" value={decisionDate} onChange={setDecisionDate} />
        <FieldLabel>キャンセルポリシー</FieldLabel><TextInput value={cancellationPolicy} onChangeText={setCancellationPolicy} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 88 }]} />
        <FieldLabel>自由記述欄</FieldLabel><TextInput value={publicNotes} onChangeText={setPublicNotes} placeholder="参加者に伝えたい内容" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 100 }]} />
        <FieldLabel>自分用メモ</FieldLabel><TextInput value={privateMemo} onChangeText={setPrivateMemo} placeholder="他の人には公開されません" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 90 }]} />
        <View style={{ marginTop: 26, padding: 14, borderRadius: 14, backgroundColor: "#FFF8F0", borderWidth: 1, borderColor: "#EED9BF" }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground, marginBottom: 10 }}>イベント開催時のルール</Text>{["イベントの日時・人数・場所などに誤りがないことを確認してください", "原則、参加者はIRO+メンバー限定としてください（やむをえず外部の方も参加される場合は、その旨を自由記述欄に記載してください）", "募集期日までに参加者を確定し、専用チャットにて参加確定連絡をお願いします"].map((rule) => <Text key={rule} style={{ fontSize: 12, lineHeight: 19, color: colors.foreground, marginBottom: 5 }}>・{rule}</Text>)}<Pressable onPress={() => setTermsAccepted((value) => !value)} style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}><View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: termsAccepted ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: termsAccepted ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{termsAccepted ? <IconSymbol name="checkmark" size={15} color="#FFF" /> : null}</View><Text style={{ flex: 1, marginLeft: 9, fontSize: 14, fontWeight: "800", color: colors.foreground }}>上記のルールを確認し、同意する <Text style={{ color: colors.error }}>必須</Text></Text></Pressable></View>
        <Pressable disabled={!termsAccepted} onPress={handleCreate} style={{ marginTop: 22, minHeight: 56, borderRadius: 16, backgroundColor: termsAccepted ? "#18171A" : "#B8B8BD", alignItems: "center", justifyContent: "center", opacity: termsAccepted ? 1 : 0.65 }}><Text style={{ fontSize: 17, fontWeight: "900", color: "#FFF" }}>イベントを作成する</Text></Pressable>
      </ScrollView>
      <XpRewardPopup reward={xpReward} onClose={() => { setXpReward(null); router.back(); }} />
    </ScreenContainer>
  );
}
