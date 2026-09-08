import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, DEFAULT_AVATAR, getRankFromPoints, type Event } from "@/constants/mock-data";
import { XpRewardPopup } from "@/components/xp-reward-popup";
import type { XpReward } from "@/lib/xp-store";
import { GOURMET_GENRES } from "@/constants/event-options";
import { useAuthContext } from "@/lib/auth-context";
import { isOperatorRole } from "@/lib/access-control";
import { canViewerAccessClubContent, resolveViewerMemberId } from "@/lib/club-viewer-access";
import { useClubs } from "@/lib/club-store";
import { pendingEvents } from "@/lib/event-store";
import { scheduleOrganizerDeadlineNotification } from "@/lib/notifications";
import { extractEventLocation, formatEventArea } from "@/lib/event-location";
import { DEFAULT_CANCELLATION_POLICY, EVENT_AMOUNT_OPTIONS, EVENT_CAPACITY_OPTIONS, EVENT_RANKS, EVENT_TIME_OPTIONS, eventFormSaveFields, validateEventForm } from "@/lib/event-form";
import { useColors } from "@/hooks/use-colors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { recordHomeActivity } from "@/lib/home-activity-store";
import * as Api from "@/lib/_core/api";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

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
  const required = (children.includes("*") && !children.startsWith("写真")) || children.startsWith("キャンセルポリシー");
  const label = children.replace(/\s*\*\s*/g, "").replace(/[（(](?:任意|複数選択可)[）)]/g, "").trim();
  return <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 7, marginTop: 16 }}>{label}{required ? <Text style={{ color: colors.error }}> 必須</Text> : null}</Text>;
}

function MemberPicker({ selectedIds, onChange, members, viewerMemberId, loading }: { selectedIds: string[]; onChange: (ids: string[]) => void; members: Api.PublicMember[]; viewerMemberId: string; loading: boolean }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const candidates = members.filter((member) => member.id !== viewerMemberId && (`${member.displayName} ${member.id}`).toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Pressable onPress={() => setVisible(true)} style={{ minHeight: 48, borderRadius: 12, backgroundColor: colors.surface, padding: 12, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 14, color: selectedIds.length ? colors.foreground : colors.muted }}>{selectedIds.length ? `${selectedIds.length}人を選択中` : "名前・会員IDから選択"}</Text>
      </Pressable>
      {selectedIds.length > 0 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 }}>{selectedIds.map((id) => { const member = members.find((item) => item.id === id); return member ? <View key={id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#E8A0BF18", borderRadius: 16, paddingHorizontal: 9, paddingVertical: 5 }}><Text style={{ fontSize: 12, color: colors.foreground }}>{member.displayName}</Text><Pressable onPress={() => onChange(selectedIds.filter((value) => value !== id))} style={{ marginLeft: 5 }}><IconSymbol name="xmark" size={12} color={colors.muted} /></Pressable></View> : null; })}</View> : null}
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>同席者を選択</Text><Pressable onPress={() => setVisible(false)}><Text style={{ color: "#E8A0BF", fontWeight: "800" }}>完了</Text></Pressable></View>
          <TextInput value={query} onChangeText={setQuery} placeholder="名前または会員IDで検索" placeholderTextColor={colors.muted} style={{ margin: 16, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} />
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>{loading ? <Text style={{ paddingVertical: 18, color: colors.muted }}>会員情報を読み込み中…</Text> : candidates.length ? candidates.map((member) => { const selected = selectedIds.includes(member.id); const avatar = typeof member.profile.avatarUrl === "string" ? member.profile.avatarUrl : DEFAULT_AVATAR; return <Pressable key={member.id} onPress={() => onChange(selected ? selectedIds.filter((id) => id !== member.id) : [...selectedIds, member.id])} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Image source={avatar} style={{ width: 40, height: 40, borderRadius: 20 }} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{member.displayName}</Text><Text style={{ fontSize: 12, color: colors.muted }}>ID: {member.id}・{member.memberTerm ?? "期未設定"}</Text></View><View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: selected ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: selected ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{selected ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View></Pressable>; }) : <Text style={{ paddingVertical: 18, color: colors.muted }}>一致する有効会員はいません。</Text>}</ScrollView>
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
  const userIsOperator = isOperatorRole(authUser?.role, authUser?.accessRole);
  const clubs = useClubs();
  const viewerMemberId = resolveViewerMemberId(authUser?.memberId, Boolean(authUser), CURRENT_USER.id);
  const joinedClubs = clubs.filter((club) => canViewerAccessClubContent(club, authUser?.memberId, CURRENT_USER.id));
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [memberDirectory, setMemberDirectory] = useState<Api.PublicMember[]>([]);
  const [memberDirectoryLoading, setMemberDirectoryLoading] = useState(true);
  const [xpReward, setXpReward] = useState<XpReward | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const extractedLocation = useMemo(() => extractEventLocation(address), [address]);

  useEffect(() => { void Api.getMemberDirectory().then(setMemberDirectory).catch(() => setMemberDirectory([])).finally(() => setMemberDirectoryLoading(false)); }, []);

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
  const handleCreate = async () => {
    const form = { eventType, clubId: selectedClubId, restaurantName, eventName, date, time, address, reservationCapacity, recruitCapacity, fixedAmount, budgetMin, budgetMax, tabelogUrl, googleMapsUrl, companionIds, image: imageUri, decisionDate, publicNotes, privateMemo, cancellationPolicy, selectionMethod, useRankPrices, rankPrices, genres };
    const validationError = validateEventForm(form, { requireImage: false, requireTerms: true, termsAccepted, allowedClubIds: joinedClubs.map((club) => club.id) });
    if (validationError) { setFormError(validationError); return; }
    setFormError("");
    const finalType: Event["eventType"] = eventType === "official" && !userIsOperator ? "gourmet" : eventType;
    const savedFields = eventFormSaveFields({ ...form, eventType: finalType });
    const draftEvent: Event = {
      id: `event_${Date.now()}`, createdAt: new Date().toISOString(), ...savedFields,
      description: savedFields.description, image: imageUri || require("@/assets/images/irotas-logo-square.png"), attendees: 0, applicantIds: [], participants: [], status: "open", createdBy: viewerMemberId,
    };
    setIsSubmitting(true);
    let newEvent: Event;
    try {
      const uploadedImage = imageUri ? (await Api.uploadEventImage(imageUri)).imageUrl : undefined;
      newEvent = await Api.createEvent({ ...draftEvent, ...(uploadedImage ? { image: uploadedImage } : {}) });
    } catch (error) {
      setIsSubmitting(false);
      Alert.alert("イベントを作成できませんでした", error instanceof Error ? error.message : "通信状況を確認して、もう一度お試しください。");
      return;
    }
    pendingEvents.unshift(newEvent);
    void recordHomeActivity({ id: `event:${newEvent.id}`, kind: "event", title: newEvent.title, description: finalType === "official" ? "新しい公式イベントが公開されました" : finalType === "club" ? "新しい部活動イベントが公開されました" : "新しいグルメ会が公開されました", createdAt: newEvent.createdAt!, route: "/event-detail", params: { id: newEvent.id } });
    void scheduleOrganizerDeadlineNotification(newEvent);
    setIsSubmitting(false);
    // 作成XPはイベント作成APIで一意に付与済み。画面遷移前に獲得通知を表示する。
    if (finalType !== "official" && !userIsOperator) {
      const previousXp = memberDirectory.find((member) => member.id === viewerMemberId)?.xp ?? 0;
      setCreatedEventId(newEvent.id);
      setXpReward({ amount: 10, reason: "イベントの新規作成", previousXp, nextXp: previousXp + 10, previousLevel: Math.max(1, Math.floor(previousXp / 50) + 1), nextLevel: Math.max(1, Math.floor((previousXp + 10) / 50) + 1), previousRank: getRankFromPoints(previousXp), nextRank: getRankFromPoints(previousXp + 10) });
      return;
    }
    router.replace({ pathname: "/event-detail", params: { id: newEvent.id } });
  };

  const inputStyle = { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border } as const;
  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Pressable onPress={() => router.back()}><Text style={{ color: colors.muted }}>キャンセル</Text></Pressable><Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: colors.foreground }}>イベント作成</Text><View style={{ width: 54 }} /></View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {params.sourceThreadId ? <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 13, padding: 12, marginBottom: 4, backgroundColor: "#EEF4FB", borderWidth: 1, borderColor: "#D4E3F2" }}><IconSymbol name="doc.text.fill" size={18} color="#4D78A4" /><Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 18, fontWeight: "700", color: "#3F6489" }}>掲示板のタイトルと本文を引き継ぎました。必要に応じて編集してください。</Text></View> : null}
        {(userIsOperator || joinedClubs.length > 0) ? <><FieldLabel>イベント種別 *</FieldLabel><View style={{ flexDirection: "row", gap: 8 }}>{([...(userIsOperator ? ["official"] as const : []), "gourmet", ...(joinedClubs.length ? ["club"] as const : [])] as Event["eventType"][]).map((type) => <Pressable key={type} onPress={() => chooseEventType(type)} style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 12, backgroundColor: eventType === type ? "#5B9BD5" : colors.surface }}><Text style={{ fontSize: 12, fontWeight: "800", color: eventType === type ? "#FFF" : colors.foreground }}>{type === "official" ? "公式" : type === "club" ? "部活動" : "グルメ会"}</Text></Pressable>)}</View></> : null}

        {eventType === "club" ? <><FieldLabel>開催する部活動 *</FieldLabel><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{joinedClubs.map((club) => { const selected = selectedClubId === club.id; return <Pressable key={club.id} onPress={() => setSelectedClubId(club.id)} style={{ borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: selected ? "#4E6756" : colors.surface, borderWidth: 1, borderColor: selected ? "#4E6756" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "800", color: selected ? "#FFF" : colors.foreground }}>{club.icon} {club.name}</Text></Pressable>; })}</View></> : null}

        {eventType === "official" ? <><FieldLabel>参加者の決め方 *</FieldLabel><View style={{ flexDirection: "row", gap: 10 }}>{(["first_come", "lottery"] as const).map((value) => <Pressable key={value} onPress={() => setSelectionMethod(value)} style={{ flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 12, backgroundColor: selectionMethod === value ? "#E8A0BF" : colors.surface }}><Text style={{ fontWeight: "800", color: selectionMethod === value ? "#FFF" : colors.foreground }}>{value === "first_come" ? "先着順" : "抽選"}</Text></Pressable>)}</View></> : null}

        <FieldLabel>{eventType === "club" ? "店名・会場名（任意）" : "店名 *"}</FieldLabel><TextInput value={restaurantName} onChangeText={setRestaurantName} placeholder={eventType === "club" ? "例：代々木公園、〇〇スタジアム" : "店舗名"} placeholderTextColor={colors.muted} style={inputStyle} />
        <FieldLabel>{eventType === "club" ? "イベント名 *" : "イベント名（任意）"}</FieldLabel><TextInput value={eventName} onChangeText={setEventName} placeholder={eventType === "club" ? "例：朝の代々木公園ランニング" : "未入力の場合は店名を表示"} placeholderTextColor={colors.muted} style={inputStyle} />
        <FieldLabel>日時 *</FieldLabel><View style={{ gap: 9 }}><CalendarField label="開催日" value={date} onChange={setDate} /><SelectField label="開始時間（15分単位）" value={time} options={EVENT_TIME_OPTIONS} onChange={setTime} /></View>
        <FieldLabel>住所（任意）</FieldLabel><TextInput value={address} onChangeText={setAddress} placeholder="例：東京都渋谷区恵比寿1-1-1" placeholderTextColor={colors.muted} style={inputStyle} />
        {address.trim() ? <Text style={{ marginTop: 7, fontSize: 12, fontWeight: "700", color: extractedLocation.prefecture ? "#3E78A1" : colors.error }}>{extractedLocation.prefecture ? `抽出エリア：${formatEventArea(extractedLocation.prefecture, extractedLocation.tokyoArea, address)}` : "都道府県を住所に含めてください"}</Text> : null}
        <FieldLabel>食べログURL（任意）</FieldLabel><TextInput value={tabelogUrl} onChangeText={setTabelogUrl} placeholder="https://tabelog.com/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={inputStyle} />
        <FieldLabel>GoogleマップURL（任意）</FieldLabel><TextInput value={googleMapsUrl} onChangeText={setGoogleMapsUrl} placeholder="https://maps.app.goo.gl/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={inputStyle} />
        {eventType !== "club" ? <><FieldLabel>グルメジャンル *（複数選択可）</FieldLabel><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{GOURMET_GENRES.map((genre) => { const selected = genres.includes(genre); return <Pressable key={genre} onPress={() => setGenres((current) => selected ? current.filter((item) => item !== genre) : [...current, genre])} style={{ borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: selected ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selected ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#FFF" : colors.foreground }}>{genre}</Text></Pressable>; })}</View></> : null}
        <FieldLabel>予約人数 *</FieldLabel><SelectField label="予約人数" value={reservationCapacity} options={EVENT_CAPACITY_OPTIONS} onChange={setReservationCapacity} />
        <FieldLabel>募集人数（自分以外） *</FieldLabel><SelectField label="募集人数" value={recruitCapacity} options={EVENT_CAPACITY_OPTIONS} onChange={setRecruitCapacity} />

        <FieldLabel>{eventType === "official" ? "参加費 *" : "予算 *"}</FieldLabel>
        <Pressable onPress={() => { setFixedAmount((value) => !value); setBudgetMin(""); setBudgetMax(""); }} style={{ flexDirection: "row", alignItems: "center", marginBottom: 9 }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: fixedAmount ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: fixedAmount ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{fixedAmount ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, color: colors.foreground, fontSize: 13 }}>固定金額で設定する</Text></Pressable>
        {fixedAmount ? <View style={{ flexDirection: "row", alignItems: "center" }}><TextInput value={budgetMin} onChangeText={(value) => setBudgetMin(value.replace(/[^0-9]/g, ""))} placeholder="例：8000" placeholderTextColor={colors.muted} keyboardType="number-pad" inputMode="numeric" style={[inputStyle, { flex: 1 }]} /><Text style={{ marginLeft: 8, color: colors.foreground, fontWeight: "700" }}>円</Text></View> : <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ flex: 1 }}><SelectField label="下限金額" value={budgetMin} options={EVENT_AMOUNT_OPTIONS} onChange={setBudgetMin} /></View><Text style={{ color: colors.muted }}>〜</Text><View style={{ flex: 1 }}><SelectField label="上限金額" value={budgetMax} options={EVENT_AMOUNT_OPTIONS} onChange={setBudgetMax} /></View></View>}

        {eventType === "official" ? <><FieldLabel>ランク別料金</FieldLabel><Pressable onPress={() => setUseRankPrices((value) => !value)} style={{ flexDirection: "row", alignItems: "center" }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: useRankPrices ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: useRankPrices ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{useRankPrices ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, color: colors.foreground, fontSize: 13 }}>ランク別料金を設定する</Text></Pressable>{useRankPrices ? <View style={{ gap: 8, marginTop: 10 }}>{EVENT_RANKS.map((rank) => <View key={rank} style={{ flexDirection: "row", alignItems: "center" }}><Text style={{ width: 82, fontSize: 12, fontWeight: "700", color: colors.foreground }}>{rank === "regular" ? "レギュラー" : rank === "silver" ? "シルバー" : rank === "gold" ? "ゴールド" : "プラチナ"}</Text><View style={{ flex: 1 }}><SelectField label={`${rank}料金`} value={rankPrices[rank]} options={EVENT_AMOUNT_OPTIONS} onChange={(value) => setRankPrices((current) => ({ ...current, [rank]: value }))} /></View></View>)}</View> : null}</> : null}

        <FieldLabel>同席者</FieldLabel><MemberPicker selectedIds={companionIds} onChange={setCompanionIds} members={memberDirectory} viewerMemberId={viewerMemberId} loading={memberDirectoryLoading} />
        <FieldLabel>写真（任意）</FieldLabel><Pressable onPress={handlePickImage} style={{ height: 150, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderStyle: imageUri ? "solid" : "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>{imageUri ? <Image source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <><IconSymbol name="photo.fill" size={30} color={colors.muted} /><Text style={{ marginTop: 7, color: colors.muted, fontSize: 13 }}>写真を選択</Text></>}</Pressable>
        <FieldLabel>参加者決定の予定期日 *</FieldLabel><CalendarField label="参加者決定予定日" value={decisionDate} onChange={setDecisionDate} />
        <FieldLabel>キャンセルポリシー</FieldLabel><TextInput value={cancellationPolicy} onChangeText={setCancellationPolicy} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 88 }]} />
        <FieldLabel>自由記述欄</FieldLabel><TextInput value={publicNotes} onChangeText={setPublicNotes} placeholder="参加者に伝えたい内容" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 100 }]} />
        <FieldLabel>自分用メモ</FieldLabel><TextInput value={privateMemo} onChangeText={setPrivateMemo} placeholder="他の人には公開されません" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 90 }]} />
        <View style={{ marginTop: 26, padding: 14, borderRadius: 14, backgroundColor: "#FFF8F0", borderWidth: 1, borderColor: "#EED9BF" }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground, marginBottom: 10 }}>イベント開催時のルール</Text>{["イベントの日時・人数・場所などに誤りがないことを確認してください", "原則、参加者はIRO+メンバー限定としてください（やむをえず外部の方も参加される場合は、その旨を自由記述欄に記載してください）", "募集期日までに参加者を確定し、専用チャットにて参加確定連絡をお願いします"].map((rule) => <Text key={rule} style={{ fontSize: 12, lineHeight: 19, color: colors.foreground, marginBottom: 5 }}>・{rule}</Text>)}<Pressable onPress={() => setTermsAccepted((value) => !value)} style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}><View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: termsAccepted ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: termsAccepted ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{termsAccepted ? <IconSymbol name="checkmark" size={15} color="#FFF" /> : null}</View><Text style={{ flex: 1, marginLeft: 9, fontSize: 14, fontWeight: "800", color: colors.foreground }}>上記のルールを確認し、同意する <Text style={{ color: colors.error }}>必須</Text></Text></Pressable></View>
        {formError ? <Text accessibilityRole="alert" style={{ marginTop: 16, color: colors.error, fontSize: 13, fontWeight: "800" }}>{formError}</Text> : null}
        <Pressable disabled={isSubmitting} onPress={() => { void handleCreate(); }} style={{ marginTop: 22, minHeight: 56, borderRadius: 16, backgroundColor: termsAccepted && !isSubmitting ? "#18171A" : "#B8B8BD", alignItems: "center", justifyContent: "center", opacity: isSubmitting ? 0.65 : 1 }}><Text style={{ fontSize: 17, fontWeight: "900", color: "#FFF" }}>{isSubmitting ? "作成しています…" : "イベントを作成する"}</Text></Pressable>
      </ScrollView>
      <XpRewardPopup reward={xpReward} onClose={() => { setXpReward(null); if (createdEventId) router.replace({ pathname: "/event-detail", params: { id: createdEventId } }); }} />
      {isSubmitting ? <View pointerEvents="auto" style={{ position: "absolute", inset: 0, backgroundColor: "rgba(255,255,255,0.72)", alignItems: "center", justifyContent: "center" }}><View style={{ minWidth: 170, borderRadius: 18, padding: 22, alignItems: "center", backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 14, elevation: 6 }}><ActivityIndicator size="large" color="#D65E8D" /><Text style={{ marginTop: 12, fontSize: 14, fontWeight: "900", color: colors.foreground }}>イベントを作成中です</Text></View></View> : null}
    </ScreenContainer>
  );
}
