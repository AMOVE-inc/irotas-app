import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CURRENT_USER, DEFAULT_AVATAR, EVENTS, MEMBERS, getRankFromPoints, type Event } from "@/constants/mock-data";
import { MentionSuggestions } from "@/components/mention-ui";
import { XpRewardPopup } from "@/components/xp-reward-popup";
import type { XpReward } from "@/lib/xp-store";
import { GOURMET_GENRES } from "@/constants/event-options";
import { useAuthContext } from "@/lib/auth-context";
import { isAdminRole, isOperatorRole } from "@/lib/access-control";
import { canViewerAccessClubContent, resolveViewerMemberId } from "@/lib/club-viewer-access";
import { useClubs } from "@/lib/club-store";
import { pendingEvents } from "@/lib/event-store";
import { eventRecruitmentChannel } from "@/lib/event-recruitment-channel";
import { scheduleOrganizerDeadlineNotification } from "@/lib/notifications";
import { extractEventLocation, formatEventArea } from "@/lib/event-location";
import { DEFAULT_CANCELLATION_POLICY, EVENT_AMOUNT_OPTIONS, EVENT_CAPACITY_OPTIONS, EVENT_RANK_AMOUNT_OPTIONS, EVENT_RESERVATION_CAPACITY_OPTIONS, EVENT_RANKS, EVENT_TIME_OPTIONS, eventCapacityOptionLabel, eventFormSaveFields, eventFormValuesFromEvent, validateEventForm } from "@/lib/event-form";
import { useColors } from "@/hooks/use-colors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { recordHomeActivity } from "@/lib/home-activity-store";
import * as Api from "@/lib/_core/api";
import { getMentionQuery, insertMention } from "@/lib/mentions";

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
        <Text style={{ fontSize: 15, color: value ? colors.foreground : colors.muted }}>{value ? eventCapacityOptionLabel(value) : "選択してください"}</Text>
        <IconSymbol name="chevron.down" size={17} color={colors.muted} />
      </Pressable>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>{label}</Text><Pressable onPress={() => setVisible(false)}><IconSymbol name="xmark" size={22} color={colors.muted} /></Pressable></View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>{options.map((option) => <Pressable key={option} onPress={() => { onChange(option); setVisible(false); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 15, color: colors.foreground }}>{eventCapacityOptionLabel(option)}</Text>{value === option ? <IconSymbol name="checkmark" size={18} color="#E8A0BF" /> : null}</Pressable>)}</ScrollView>
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

function MemberPicker({ selectedIds, onChange, members, viewerMemberId, loading, title = "同席者を選択", allowSelf = false }: { selectedIds: string[]; onChange: (ids: string[]) => void; members: Api.PublicMember[]; viewerMemberId: string; loading: boolean; title?: string; allowSelf?: boolean }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const candidates = members.filter((member) => (allowSelf || member.id !== viewerMemberId) && (`${member.displayName} ${member.id}`).toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Pressable onPress={() => setVisible(true)} style={{ minHeight: 48, borderRadius: 12, backgroundColor: colors.surface, padding: 12, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 14, color: selectedIds.length ? colors.foreground : colors.muted }}>{selectedIds.length ? `${selectedIds.length}人を選択中` : "名前・会員IDから選択"}</Text>
      </Pressable>
      {selectedIds.length > 0 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 }}>{selectedIds.map((id) => { const member = members.find((item) => item.id === id); return member ? <View key={id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#E8A0BF18", borderRadius: 16, paddingHorizontal: 9, paddingVertical: 5 }}><Text style={{ fontSize: 12, color: colors.foreground }}>{member.displayName}</Text><Pressable onPress={() => onChange(selectedIds.filter((value) => value !== id))} style={{ marginLeft: 5 }}><IconSymbol name="xmark" size={12} color={colors.muted} /></Pressable></View> : null; })}</View> : null}
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>{title}</Text><Pressable onPress={() => setVisible(false)}><Text style={{ color: "#E8A0BF", fontWeight: "800" }}>完了</Text></Pressable></View>
          {title === "参加確定者を選択" ? <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>現在選択中（{selectedIds.length}人）</Text>
            {selectedIds.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>{selectedIds.map((id) => {
              const selectedMember = members.find((member) => member.id === id);
              return <Pressable key={id} onPress={() => onChange(selectedIds.filter((value) => value !== id))} accessibilityLabel={`${selectedMember?.displayName ?? id}を選択解除`} style={{ flexDirection: "row", alignItems: "center", borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#E8A0BF18" }}><Text style={{ color: colors.foreground, fontWeight: "700" }}>{selectedMember?.displayName ?? id}</Text><IconSymbol name="xmark" size={12} color={colors.muted} style={{ marginLeft: 6 }} /></Pressable>;
            })}</ScrollView> : <Text style={{ color: colors.muted, marginTop: 6 }}>まだ選択されていません</Text>}
          </View> : null}
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
  const params = useLocalSearchParams<{ sourceThreadId?: string; sourceTitle?: string; sourceDescription?: string; sourceCategory?: string; editId?: string }>();
  const editId = typeof params.editId === "string" ? params.editId : "";
  const { user: authUser } = useAuthContext();
  const userIsOperator = isOperatorRole(authUser?.role, authUser?.accessRole);
  const userIsAdmin = isAdminRole(authUser?.role, authUser?.accessRole);
  const clubs = useClubs();
  const viewerMemberId = resolveViewerMemberId(authUser?.memberId, Boolean(authUser), CURRENT_USER.id);
  const joinedClubs = clubs.filter((club) => canViewerAccessClubContent(club, authUser?.memberId, CURRENT_USER.id, userIsAdmin, Boolean(authUser)));
  const sourceClubId = params.sourceCategory?.startsWith("club-") ? params.sourceCategory.slice("club-".length) : "";
  const sourceIsJoinedClub = Boolean(sourceClubId && joinedClubs.some((club) => club.id === sourceClubId));
  const initialEditingEvent = editId
    ? EVENTS.find((item) => item.id === editId)
    : undefined;
  const initialEditForm = initialEditingEvent ? eventFormValuesFromEvent(initialEditingEvent) : undefined;
  const [eventType, setEventType] = useState<Event["eventType"]>(initialEditForm?.eventType ?? (params.sourceThreadId ? (sourceIsJoinedClub ? "club" : "gourmet") : userIsOperator ? "official" : "gourmet"));
  const [selectedClubId, setSelectedClubId] = useState(initialEditForm?.clubId ?? (sourceIsJoinedClub ? sourceClubId : ""));
  const [restaurantName, setRestaurantName] = useState(initialEditForm?.restaurantName ?? "");
  const [eventName, setEventName] = useState(initialEditForm?.eventName ?? params.sourceTitle ?? "");
  const [date, setDate] = useState(initialEditForm?.date ?? "");
  const [time, setTime] = useState(initialEditForm?.time ?? "");
  const [address, setAddress] = useState(initialEditForm?.address ?? "");
  const [reservationCapacity, setReservationCapacity] = useState(initialEditForm?.reservationCapacity ?? "");
  const [recruitCapacity, setRecruitCapacity] = useState(initialEditForm?.recruitCapacity ?? "");
  const [fixedAmount, setFixedAmount] = useState(initialEditForm?.fixedAmount ?? false);
  const [budgetMin, setBudgetMin] = useState(initialEditForm?.budgetMin ?? "");
  const [budgetMax, setBudgetMax] = useState(initialEditForm?.budgetMax ?? "");
  const [tabelogUrl, setTabelogUrl] = useState(initialEditForm?.tabelogUrl ?? "");
  const [googleMapsUrl, setGoogleMapsUrl] = useState(initialEditForm?.googleMapsUrl ?? "");
  const [companionIds, setCompanionIds] = useState<string[]>(initialEditForm?.companionIds ?? []);
  const [imageUri, setImageUri] = useState(initialEditForm?.image ?? "");
  const [decisionDate, setDecisionDate] = useState(initialEditForm?.decisionDate ?? "");
  const [publicNotes, setPublicNotes] = useState(initialEditForm?.publicNotes ?? params.sourceDescription ?? "");
  const [privateMemo, setPrivateMemo] = useState(initialEditForm?.privateMemo ?? "");
  const [cancellationPolicy, setCancellationPolicy] = useState(initialEditForm?.cancellationPolicy ?? DEFAULT_CANCELLATION_POLICY);
  const [selectionMethod, setSelectionMethod] = useState<"first_come" | "lottery">(initialEditForm?.selectionMethod ?? "first_come");
  const [recruitmentStatus, setRecruitmentStatus] = useState<"draft" | "open">(initialEditingEvent?.recruitmentStatus === "draft" ? "draft" : "open");
  const [recruitmentChannel, setRecruitmentChannel] = useState<"discord" | "app">(initialEditingEvent ? eventRecruitmentChannel(initialEditingEvent) : "app");
  const [confirmedParticipantIds, setConfirmedParticipantIds] = useState<string[]>(initialEditingEvent?.participants ?? []);
  const [useRankPrices, setUseRankPrices] = useState(initialEditForm?.useRankPrices ?? false);
  const [rankPrices, setRankPrices] = useState<Record<"regular" | "silver" | "gold" | "platinum", string>>(initialEditForm?.rankPrices ?? { regular: "", silver: "", gold: "", platinum: "" });
  const [termsAccepted, setTermsAccepted] = useState(Boolean(editId));
  const [genres, setGenres] = useState<string[]>(initialEditForm?.genres ?? []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [memberDirectory, setMemberDirectory] = useState<Api.PublicMember[]>([]);
  const [memberDirectoryLoading, setMemberDirectoryLoading] = useState(true);
  const [xpReward, setXpReward] = useState<XpReward | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(initialEditingEvent ?? null);
  const [editLoading, setEditLoading] = useState(Boolean(editId && !initialEditingEvent));
  const [initialImageUri, setInitialImageUri] = useState(initialEditForm?.image ?? "");
  const extractedLocation = useMemo(() => extractEventLocation(address), [address]);
  const eventMentionMembers = useMemo(() => memberDirectory.length > 0
    ? memberDirectory.map((member) => ({
      id: member.id,
      name: member.displayName,
      branch: member.branches.includes("kansai") ? "kansai" : "kanto",
      generation: Number(member.memberTerm?.match(/\d+/)?.[0] ?? 0),
      rank: member.memberRank,
      role: member.accessRole === "admin" ? "admin" : member.accessRole === "operator" ? "operator" : "member",
    })) as unknown as typeof MEMBERS
    : MEMBERS, [memberDirectory]);
  const publicNotesMentionQuery = getMentionQuery(publicNotes);

  useEffect(() => { void Api.getMemberDirectory().then(setMemberDirectory).catch(() => setMemberDirectory([])).finally(() => setMemberDirectoryLoading(false)); }, []);

  useEffect(() => {
    if (!editId) return;
    let active = true;
    const fallback = initialEditingEvent;
    void Api.getEvent(editId).catch(() => fallback).then((fetchedEvent) => {
      if (!active) return;
      if (!fetchedEvent) { setFormError("イベントが見つかりません"); return; }
      const populatedFields = Object.fromEntries(
        Object.entries(fetchedEvent).filter(([, value]) => value !== undefined && value !== null && value !== ""),
      ) as Partial<Event>;
      const event = fallback ? { ...fallback, ...populatedFields } as Event : fetchedEvent;
      const form = eventFormValuesFromEvent(event);
      setEditingEvent(event);
      setEventType(form.eventType); setSelectedClubId(form.clubId); setRestaurantName(form.restaurantName);
      setEventName(form.eventName); setDate(form.date); setTime(form.time); setAddress(form.address);
      setReservationCapacity(form.reservationCapacity); setRecruitCapacity(form.recruitCapacity);
      setFixedAmount(form.fixedAmount); setBudgetMin(form.budgetMin); setBudgetMax(form.budgetMax);
      setTabelogUrl(form.tabelogUrl); setGoogleMapsUrl(form.googleMapsUrl); setCompanionIds(form.companionIds);
      setImageUri(form.image); setInitialImageUri(form.image); setDecisionDate(form.decisionDate);
      setPublicNotes(form.publicNotes); setPrivateMemo(form.privateMemo); setCancellationPolicy(form.cancellationPolicy);
      setSelectionMethod(form.selectionMethod); setUseRankPrices(form.useRankPrices); setRankPrices(form.rankPrices);
      setGenres(form.genres); setRecruitmentStatus(event.recruitmentStatus === "draft" ? "draft" : "open");
      setRecruitmentChannel(eventRecruitmentChannel(event));
      setConfirmedParticipantIds(event.participants ?? []);
      setTermsAccepted(true);
    }).finally(() => { if (active) setEditLoading(false); });
    return () => { active = false; };
  }, [editId]);

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
    const validationError = validateEventForm(form, { requireImage: false, requireTerms: true, termsAccepted, allowedClubIds: joinedClubs.map((club) => club.id), allowEmptyGenres: Boolean(editId), allowPastDate: Boolean(editId) });
    if (validationError) { setFormError(validationError); return; }
    setFormError("");
    const finalType: Event["eventType"] = eventType === "official" && !userIsOperator ? "gourmet" : eventType;
    const savedFields = eventFormSaveFields({ ...form, eventType: finalType });
    const draftEvent: Event = {
      id: `event_${Date.now()}`, createdAt: new Date().toISOString(), ...savedFields,
      description: savedFields.description, image: imageUri, attendees: 0, applicantIds: [], participants: [], status: "open", recruitmentStatus: finalType === "official" ? recruitmentStatus : "open", createdBy: viewerMemberId,
    };
    setIsSubmitting(true);
    if (editId && editingEvent) {
      try {
        const uploadedImage = imageUri && imageUri !== initialImageUri ? (await Api.uploadEventImage(imageUri)).imageUrl : undefined;
        const updated = await Api.updateEventDetails(editId, {
          ...savedFields,
          capacityMode: savedFields.capacityMode ?? null,
          recruitmentChannel,
          recruitmentStatus: finalType === "official" ? recruitmentStatus : undefined,
          ...(uploadedImage ? { image: uploadedImage } : {}),
          participants: recruitmentChannel === "discord" ? confirmedParticipantIds : editingEvent.participants ?? [],
        });
        setIsSubmitting(false);
        router.replace({ pathname: "/event-detail", params: { id: updated.id } });
      } catch (error) {
        setIsSubmitting(false);
        Alert.alert("イベントを保存できませんでした", error instanceof Error ? error.message : "通信状況を確認して、もう一度お試しください。");
      }
      return;
    }
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
    void recordHomeActivity({ id: `event:${newEvent.id}`, kind: "event", title: newEvent.title, description: finalType === "official" ? recruitmentStatus === "draft" ? "公式イベントを募集前で登録しました" : "新しい公式イベントが公開されました" : finalType === "club" ? "新しい部活動イベントが公開されました" : "新しいグルメ会が公開されました", createdAt: newEvent.createdAt!, route: "/event-detail", params: { id: newEvent.id } });
    if (newEvent.recruitmentStatus !== "draft") void scheduleOrganizerDeadlineNotification(newEvent);
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
  const handleCancel = () => {
    if (editId) {
      router.replace({ pathname: "/event-detail", params: { id: editId } });
      return;
    }
    router.back();
  };
  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Pressable onPress={handleCancel}><Text style={{ color: colors.muted }}>キャンセル</Text></Pressable><Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: colors.foreground }}>{editId ? "イベント編集" : "イベント作成"}</Text><View style={{ width: 54 }} /></View>
      {editLoading ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color="#E8A0BF" /><Text style={{ marginTop: 12, color: colors.muted }}>イベント情報を読み込んでいます…</Text></View> :
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {params.sourceThreadId ? <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 13, padding: 12, marginBottom: 4, backgroundColor: "#EEF4FB", borderWidth: 1, borderColor: "#D4E3F2" }}><IconSymbol name="doc.text.fill" size={18} color="#4D78A4" /><Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 18, fontWeight: "700", color: "#3F6489" }}>掲示板のタイトルと本文を引き継ぎました。必要に応じて編集してください。</Text></View> : null}
        {(userIsOperator || joinedClubs.length > 0) ? <><FieldLabel>イベント種別 *</FieldLabel><View style={{ flexDirection: "row", gap: 8 }}>{([...(userIsOperator ? ["official"] as const : []), "gourmet", ...(joinedClubs.length ? ["club"] as const : [])] as Event["eventType"][]).map((type) => <Pressable key={type} onPress={() => chooseEventType(type)} style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 12, backgroundColor: eventType === type ? "#5B9BD5" : colors.surface }}><Text style={{ fontSize: 12, fontWeight: "800", color: eventType === type ? "#FFF" : colors.foreground }}>{type === "official" ? "公式" : type === "club" ? "部活動" : "グルメ会"}</Text></Pressable>)}</View></> : null}

        {eventType === "club" ? <><FieldLabel>開催する部活動 *</FieldLabel><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{joinedClubs.map((club) => { const selected = selectedClubId === club.id; return <Pressable key={club.id} onPress={() => setSelectedClubId(club.id)} style={{ borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: selected ? "#4E6756" : colors.surface, borderWidth: 1, borderColor: selected ? "#4E6756" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "800", color: selected ? "#FFF" : colors.foreground }}>{club.icon} {club.name}</Text></Pressable>; })}</View></> : null}

        {eventType === "official" ? <><FieldLabel>募集ステータス *</FieldLabel><View style={{ flexDirection: "row", gap: 10 }}>{(["draft", "open"] as const).map((value) => <Pressable key={value} onPress={() => setRecruitmentStatus(value)} style={{ flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 12, backgroundColor: recruitmentStatus === value ? "#E8A0BF" : colors.surface }}><Text style={{ fontWeight: "800", color: recruitmentStatus === value ? "#FFF" : colors.foreground }}>{value === "draft" ? "募集前" : "募集中"}</Text></Pressable>)}</View><Text style={{ marginTop: 7, fontSize: 12, color: colors.muted }}>募集前で登録したイベントは、管理者が詳細画面から募集を開始できます。</Text><FieldLabel>参加者の決め方 *</FieldLabel><View style={{ flexDirection: "row", gap: 10 }}>{(["first_come", "lottery"] as const).map((value) => <Pressable key={value} onPress={() => setSelectionMethod(value)} style={{ flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 12, backgroundColor: selectionMethod === value ? "#E8A0BF" : colors.surface }}><Text style={{ fontWeight: "800", color: selectionMethod === value ? "#FFF" : colors.foreground }}>{value === "first_come" ? "先着順" : "抽選"}</Text></Pressable>)}</View></> : null}

        {editId && editingEvent?.id.startsWith("discord-event-") ? <>
          <FieldLabel>参加申込の受付先</FieldLabel>
          <View style={{ flexDirection: "row", gap: 10 }}>{(["discord", "app"] as const).map((value) => <Pressable key={value} onPress={() => setRecruitmentChannel(value)} style={{ flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: recruitmentChannel === value ? "#6B5A96" : colors.border, backgroundColor: recruitmentChannel === value ? "#F1ECFA" : colors.surface }}><Text style={{ fontWeight: "800", color: recruitmentChannel === value ? "#5B4788" : colors.foreground }}>{value === "discord" ? "Discordで受付" : "アプリで受付"}</Text></Pressable>)}</View>
          <Text style={{ marginTop: 7, fontSize: 12, lineHeight: 18, color: colors.muted }}>Discordで受付中はアプリ内の参加申込を停止します。Discordで参加者を確定後、イベント情報を編集して参加者を反映してください。</Text>
          {recruitmentChannel === "discord" ? <><FieldLabel>Discordで確定した参加者（任意）</FieldLabel><MemberPicker selectedIds={confirmedParticipantIds} onChange={setConfirmedParticipantIds} members={memberDirectory} viewerMemberId={viewerMemberId} loading={memberDirectoryLoading} title="参加確定者を選択" allowSelf /><Text style={{ marginTop: 7, fontSize: 12, lineHeight: 18, color: colors.muted }}>Discordで募集を続ける間はここで確定者を記録できます。会員の登録がない方は選択できません。</Text></> : null}
        </> : null}

        <FieldLabel>{eventType === "club" ? "店名・会場名（任意）" : "店名 *"}</FieldLabel><TextInput value={restaurantName} onChangeText={setRestaurantName} placeholder={eventType === "club" ? "例：代々木公園、〇〇スタジアム" : "店舗名"} placeholderTextColor={colors.muted} style={inputStyle} />
        <FieldLabel>{eventType === "club" ? "イベント名 *" : "イベント名（任意）"}</FieldLabel><TextInput value={eventName} onChangeText={setEventName} placeholder={eventType === "club" ? "例：朝の代々木公園ランニング" : "未入力の場合は店名を表示"} placeholderTextColor={colors.muted} style={inputStyle} />
        <FieldLabel>日時 *</FieldLabel><View style={{ gap: 9 }}><CalendarField label="開催日" value={date} onChange={setDate} /><SelectField label="開始時間" value={time} options={EVENT_TIME_OPTIONS} onChange={setTime} /></View>
        <FieldLabel>住所（任意）</FieldLabel><TextInput value={address} onChangeText={setAddress} placeholder="例：東京都渋谷区恵比寿1-1-1" placeholderTextColor={colors.muted} style={inputStyle} />
        {address.trim() ? <Text style={{ marginTop: 7, fontSize: 12, fontWeight: "700", color: extractedLocation.prefecture ? "#3E78A1" : colors.error }}>{extractedLocation.prefecture ? `抽出エリア：${formatEventArea(extractedLocation.prefecture, extractedLocation.tokyoArea, address)}` : "都道府県を住所に含めてください"}</Text> : null}
        <FieldLabel>食べログURL（任意）</FieldLabel><TextInput value={tabelogUrl} onChangeText={setTabelogUrl} placeholder="https://tabelog.com/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={inputStyle} />
        <FieldLabel>GoogleマップURL（任意）</FieldLabel><TextInput value={googleMapsUrl} onChangeText={setGoogleMapsUrl} placeholder="https://maps.app.goo.gl/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={inputStyle} />
        {eventType !== "club" ? <><FieldLabel>グルメジャンル *（複数選択可）</FieldLabel><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{GOURMET_GENRES.map((genre) => { const selected = genres.includes(genre); return <Pressable key={genre} onPress={() => setGenres((current) => selected ? current.filter((item) => item !== genre) : [...current, genre])} style={{ borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: selected ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selected ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#FFF" : colors.foreground }}>{genre}</Text></Pressable>; })}</View></> : null}
        <FieldLabel>予約人数 *</FieldLabel><SelectField label="予約人数" value={reservationCapacity} options={EVENT_RESERVATION_CAPACITY_OPTIONS} onChange={setReservationCapacity} />
        <FieldLabel>募集人数（自分以外） *</FieldLabel><SelectField label="募集人数" value={recruitCapacity} options={EVENT_CAPACITY_OPTIONS} onChange={setRecruitCapacity} />

        <FieldLabel>{eventType === "official" ? useRankPrices ? "参加費（任意）" : "参加費 *" : "予算 *"}</FieldLabel>
        <Pressable onPress={() => { const next = budgetMin !== "未定"; setFixedAmount(false); setBudgetMin(next ? "未定" : ""); setBudgetMax(next ? "未定" : ""); }} style={{ marginBottom: 9 }}><Text style={{ color: budgetMin === "未定" ? "#D65E8D" : colors.foreground, fontWeight: "700" }}>{budgetMin === "未定" ? "✓ " : "□ "}未定</Text></Pressable>
        {budgetMin !== "未定" ? <>
        <Pressable onPress={() => { setFixedAmount((value) => !value); setBudgetMin(""); setBudgetMax(""); }} style={{ flexDirection: "row", alignItems: "center", marginBottom: 9 }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: fixedAmount ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: fixedAmount ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{fixedAmount ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, color: colors.foreground, fontSize: 13 }}>固定金額で設定する</Text></Pressable>
        {fixedAmount ? <View style={{ flexDirection: "row", alignItems: "center" }}><TextInput value={budgetMin} onChangeText={(value) => setBudgetMin(value.replace(/[^0-9]/g, ""))} placeholder="例：8000" placeholderTextColor={colors.muted} keyboardType="number-pad" inputMode="numeric" style={[inputStyle, { flex: 1 }]} /><Text style={{ marginLeft: 8, color: colors.foreground, fontWeight: "700" }}>円</Text></View> : <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ flex: 1 }}><SelectField label="下限金額" value={budgetMin} options={EVENT_AMOUNT_OPTIONS} onChange={setBudgetMin} /></View><Text style={{ color: colors.muted }}>〜</Text><View style={{ flex: 1 }}><SelectField label="上限金額" value={budgetMax} options={EVENT_AMOUNT_OPTIONS} onChange={setBudgetMax} /></View></View>}
        </> : null}

        {eventType === "official" ? <><FieldLabel>ランク別料金</FieldLabel><Pressable onPress={() => setUseRankPrices((value) => !value)} style={{ flexDirection: "row", alignItems: "center" }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: useRankPrices ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: useRankPrices ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{useRankPrices ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, color: colors.foreground, fontSize: 13 }}>ランク別料金を設定する</Text></Pressable>{useRankPrices ? <><Text style={{ marginTop: 8, fontSize: 12, color: colors.muted }}>各ランクの参加費を500円単位で選択してください。</Text><View style={{ gap: 8, marginTop: 10 }}>{EVENT_RANKS.map((rank) => <View key={rank} style={{ flexDirection: "row", alignItems: "center" }}><Text style={{ width: 82, fontSize: 12, fontWeight: "700", color: colors.foreground }}>{rank === "regular" ? "レギュラー" : rank === "silver" ? "シルバー" : rank === "gold" ? "ゴールド" : "プラチナ"}</Text><View style={{ flex: 1 }}><SelectField label={`${rank}料金`} value={rankPrices[rank]} options={EVENT_RANK_AMOUNT_OPTIONS} onChange={(value) => setRankPrices((current) => ({ ...current, [rank]: value }))} /></View></View>)}</View></> : null}</> : null}

        <FieldLabel>同席者</FieldLabel><MemberPicker selectedIds={companionIds} onChange={setCompanionIds} members={memberDirectory} viewerMemberId={viewerMemberId} loading={memberDirectoryLoading} />
        <FieldLabel>写真（任意）</FieldLabel><Pressable onPress={handlePickImage} style={{ height: 150, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderStyle: imageUri ? "solid" : "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>{imageUri ? <Image source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <><IconSymbol name="photo.fill" size={30} color={colors.muted} /><Text style={{ marginTop: 7, color: colors.muted, fontSize: 13 }}>写真を選択</Text></>}</Pressable>
        <FieldLabel>参加者決定の予定期日 *</FieldLabel><CalendarField label="参加者決定予定日" value={decisionDate} onChange={setDecisionDate} />
        <FieldLabel>キャンセルポリシー</FieldLabel><TextInput value={cancellationPolicy} onChangeText={setCancellationPolicy} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 88 }]} />
        <FieldLabel>自由記述欄</FieldLabel><TextInput value={publicNotes} onChangeText={setPublicNotes} placeholder="参加者に伝えたい内容。「@」でメンション" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 100 }]} />
        {publicNotesMentionQuery !== null ? <MentionSuggestions query={publicNotesMentionQuery} groups={[]} members={eventMentionMembers} onSelect={(label, memberId) => setPublicNotes((value) => insertMention(value, label, memberId))} /> : null}
        <FieldLabel>自分用メモ</FieldLabel><TextInput value={privateMemo} onChangeText={setPrivateMemo} placeholder="他の人には公開されません" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={[inputStyle, { minHeight: 90 }]} />
        <View style={{ marginTop: 26, padding: 14, borderRadius: 14, backgroundColor: "#FFF8F0", borderWidth: 1, borderColor: "#EED9BF" }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground, marginBottom: 10 }}>イベント開催時のルール</Text>{["イベントの日時・人数・場所などに誤りがないことを確認してください", "原則、参加者はIRO+メンバー限定としてください（やむをえず外部の方も参加される場合は、その旨を自由記述欄に記載してください）", "募集期日までに参加者を確定し、専用チャットにて参加確定連絡をお願いします"].map((rule) => <Text key={rule} style={{ fontSize: 12, lineHeight: 19, color: colors.foreground, marginBottom: 5 }}>・{rule}</Text>)}<Pressable onPress={() => setTermsAccepted((value) => !value)} style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}><View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: termsAccepted ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: termsAccepted ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{termsAccepted ? <IconSymbol name="checkmark" size={15} color="#FFF" /> : null}</View><Text style={{ flex: 1, marginLeft: 9, fontSize: 14, fontWeight: "800", color: colors.foreground }}>上記のルールを確認し、同意する <Text style={{ color: colors.error }}>必須</Text></Text></Pressable></View>
        {formError ? <Text accessibilityRole="alert" style={{ marginTop: 16, color: colors.error, fontSize: 13, fontWeight: "800" }}>{formError}</Text> : null}
        <Pressable disabled={isSubmitting} onPress={() => { void handleCreate(); }} style={{ marginTop: 22, minHeight: 56, borderRadius: 16, backgroundColor: termsAccepted && !isSubmitting ? "#18171A" : "#B8B8BD", alignItems: "center", justifyContent: "center", opacity: isSubmitting ? 0.65 : 1 }}><Text style={{ fontSize: 17, fontWeight: "900", color: "#FFF" }}>{isSubmitting ? (editId ? "保存しています…" : "作成しています…") : (editId ? "変更を保存する" : "イベントを作成する")}</Text></Pressable>
      </ScrollView>}
      <XpRewardPopup reward={xpReward} onClose={() => { setXpReward(null); if (createdEventId) router.replace({ pathname: "/event-detail", params: { id: createdEventId } }); }} />
      {isSubmitting ? <View pointerEvents="auto" style={{ position: "absolute", inset: 0, backgroundColor: "rgba(255,255,255,0.72)", alignItems: "center", justifyContent: "center" }}><View style={{ minWidth: 170, borderRadius: 18, padding: 22, alignItems: "center", backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 14, elevation: 6 }}><ActivityIndicator size="large" color="#D65E8D" /><Text style={{ marginTop: 12, fontSize: 14, fontWeight: "900", color: colors.foreground }}>{editId ? "イベントを保存中です" : "イベントを作成中です"}</Text></View></View> : null}
    </ScreenContainer>
  );
}
