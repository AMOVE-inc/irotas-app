import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { EVENTS, CURRENT_USER, DEFAULT_AVATAR, MEMBERS, getMemberById, type Event, type MemberRank } from "@/constants/mock-data";
import { EventImage } from "@/components/event-image";
import { PersistentBottomNav } from "@/components/persistent-bottom-nav";
import { MemberClubLeaderBadges, MemberRankBadge, MemberRoleBadge, stripRankFromName } from "@/components/member-rank-badge";
import { MentionSuggestions, MentionText, mentionDisplayName } from "@/components/mention-ui";
import { extractMentionLabels, getMentionGroups, getMentionQuery, getMentionedMemberIds, insertMention } from "@/lib/mentions";
import { EVENT_TERMS_URL, PUBLIC_APP_URL } from "@/constants/external-links";
import { joinEventChat, removeMemberFromRoom } from "@/lib/chat-store";
import { getAllEvents } from "@/lib/event-store";
import { eventRecruitmentChannel, isDiscordRecruitmentOpen } from "@/lib/event-recruitment-channel";
import { approveGourmetApplication, cancelGourmetParticipation, getPendingGourmetApplicants, reopenGourmetRecruitment, submitGourmetApplication } from "@/lib/gourmet-event";
import { getIrotasPoints, adjustIrotasPoints } from "@/lib/irotas-points-store";
import { createPaymentRecord } from "@/lib/payment-store";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar-links";
import { toggleEventFavoriteWithNotifications, useEventFavorites } from "@/lib/event-favorites-store";
import { cancelOrganizerDeadlineNotifications, notifyEventCancellationRequest, notifyEventConfirmation, scheduleEventReminders, sendMentionNotification } from "@/lib/notifications";
import { approveEventCancellationRequest, getPendingCancellationRequests, submitEventCancellationRequest } from "@/lib/event-cancellation";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { useClubs } from "@/lib/club-store";
import { isAdminRole, isOperatorRole } from "@/lib/access-control";
import { canViewerAccessClubContent, resolveViewerMemberId } from "@/lib/club-viewer-access";
import { recordActivityEvent } from "@/lib/ai-data-store";
import { getDiscordAuthorById, getDiscordAuthorByName } from "@/lib/discord-author-directory";
import { findMentionedClub, findMentionedMemberId } from "@/lib/mention-targets";
import { getConfirmedParticipantDisplayIds } from "@/lib/event-confirmed-participants";
import { isEventOrganizer } from "@/lib/event-participation";
import { EVENT_AMOUNT_OPTIONS, EVENT_CAPACITY_OPTIONS, EVENT_RESERVATION_CAPACITY_OPTIONS, EVENT_RANKS, EVENT_TIME_OPTIONS, eventCapacityLabel, eventCapacityOptionLabel, eventFormSaveFields, eventFormValuesFromEvent, hasOnlyCompanionChanges, minimumReservationCapacity, type EventFormValues, validateEventForm } from "@/lib/event-form";
import { GOURMET_GENRES } from "@/constants/event-options";
import { displayEventTitle } from "@/lib/event-title";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Api from "@/lib/_core/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import {
  Alert,
  type AlertButton,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

type EventComment = Api.SharedEventComment;

const eventCommentsKey = (eventId: string) => `irotas_event_comments_v1:${eventId}`;
const deletedEventCommentsKey = (eventId: string) => `irotas_deleted_event_comments_v1:${eventId}`;

function SharedEventSelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return <><Pressable onPress={() => setVisible(true)} style={{ marginTop: 5, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 11, justifyContent: "center" }}><Text style={{ color: value ? colors.foreground : colors.muted }}>{value ? eventCapacityOptionLabel(value) : "選択してください"}</Text></Pressable><Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}><View style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderColor: colors.border }}><Text style={{ flex: 1, color: colors.foreground, fontSize: 18, fontWeight: "900" }}>{label}</Text><Pressable onPress={() => setVisible(false)}><Text style={{ color: "#D65E8D", fontWeight: "800" }}>閉じる</Text></Pressable></View><ScrollView>{options.map((option) => <Pressable key={option} onPress={() => { onChange(option); setVisible(false); }} style={{ padding: 15, borderBottomWidth: 0.5, borderColor: colors.border }}><Text style={{ color: colors.foreground, fontWeight: value === option ? "900" : "500" }}>{value === option ? "✓ " : ""}{eventCapacityOptionLabel(option)}</Text></Pressable>)}</ScrollView></View></Modal></>;
}

function selectedMemberIds(value: string) {
  return [...new Set(value.split(/[\n,、]/).map((item) => item.trim()).filter(Boolean))];
}

function EventMemberPicker({
  label,
  selectedIds,
  onChange,
  members,
  excludedIds = [],
}: {
  label: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  members: Api.PublicMember[];
  excludedIds?: string[];
}) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const excluded = new Set(excludedIds);
  const normalizedIds = [...new Set(selectedIds)].filter((id) => !excluded.has(id));
  const candidates = query.trim()
    ? members.filter((member) => !excluded.has(member.id) && !normalizedIds.includes(member.id) && `${member.displayName} ${member.id}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];
  const selected = normalizedIds.map((id) => ({ id, member: members.find((member) => member.id === id) }));
  return <View>
    <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>{label}（名前または会員IDで検索）</Text>
    <TextInput value={query} onChangeText={setQuery} placeholder="名前または会員IDを入力" placeholderTextColor={colors.muted} style={{ marginTop: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, color: colors.foreground }} />
    {candidates.map((member) => {
      const avatar = typeof member.profile.avatarUrl === "string" ? member.profile.avatarUrl : undefined;
      return <Pressable key={member.id} onPress={() => { onChange([...normalizedIds, member.id]); setQuery(""); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Image source={avatar ? { uri: avatar } : DEFAULT_AVATAR} style={{ width: 28, height: 28, borderRadius: 14 }} contentFit="cover" />
        <Text style={{ marginLeft: 8, fontSize: 13, color: colors.foreground }}>{stripRankFromName(member.displayName)}　{member.id}</Text>
      </Pressable>;
    })}
    {selected.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
      {selected.map(({ id, member }) => {
        const avatar = typeof member?.profile.avatarUrl === "string" ? member.profile.avatarUrl : undefined;
        return <Pressable key={id} onPress={() => onChange(normalizedIds.filter((selectedId) => selectedId !== id))} accessibilityLabel={`${member?.displayName ?? "会員"}を解除`} style={{ flexDirection: "row", alignItems: "center", maxWidth: "100%", borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 4, paddingLeft: 5, paddingRight: 9, backgroundColor: colors.surface }}>
          <Image source={avatar ? { uri: avatar } : DEFAULT_AVATAR} style={{ width: 22, height: 22, borderRadius: 11 }} contentFit="cover" />
          <Text numberOfLines={1} style={{ marginLeft: 5, maxWidth: 170, fontSize: 12, fontWeight: "800", color: colors.foreground }}>{member ? stripRankFromName(member.displayName) : `会員ID ${id}`}</Text>
          <Text style={{ marginLeft: 5, color: colors.muted }}>×</Text>
        </Pressable>;
      })}
    </View> : null}
  </View>;
}

export default function EventDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user: authUser, loading: authLoading } = useAuthContext();
  const clubs = useClubs();
  const authenticatedViewerMemberId = resolveViewerMemberId(authUser?.memberId, Boolean(authUser), CURRENT_USER.id);

  // モックデータ + 動的追加分から検索
  const allEvents = useMemo(() => getAllEvents(EVENTS), []);
  // Imported fixtures are not authoritative after an organizer edits an event.
  // Wait for the server instead of flashing the original Discord snapshot.
  const initialEvent = eventId?.startsWith("discord-event-") ? undefined : allEvents.find((e) => e.id === eventId);
  const [event, setEvent] = useState<Event | undefined>(initialEvent);
  const [eventLoading, setEventLoading] = useState(!initialEvent);
  const [eventResolved, setEventResolved] = useState(Boolean(initialEvent));

  const [isJoined, setIsJoined] = useState(() => {
    // 既に参加済かチェック
    return event?.participants.includes(CURRENT_USER.id) ?? false;
  });
  const [hasApplied, setHasApplied] = useState(() => event?.applicantIds?.includes(CURRENT_USER.id) ?? false);
  const [chatRoomId, setChatRoomId] = useState<string | null>(() => {
    return event?.chatId ?? null;
  });
  // イロタスポイント
  const [irotasPoints, setIrotasPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [contactedOrganizer, setContactedOrganizer] = useState(false);
  const [cancellationPolicyConfirmed, setCancellationPolicyConfirmed] = useState(false);
  const [applicationConfirmation, setApplicationConfirmation] = useState<{ title: string; message: string; buttons: AlertButton[] } | null>(null);
  const [eventComments, setEventComments] = useState<EventComment[]>([]);
  const [eventCommentText, setEventCommentText] = useState("");
  const [editingEventCommentId, setEditingEventCommentId] = useState<string | null>(null);
  const [editingEventCommentText, setEditingEventCommentText] = useState("");
  const [eventCommentBusy, setEventCommentBusy] = useState(false);
  const [eventCommentActionTarget, setEventCommentActionTarget] = useState<EventComment | null>(null);
  const [eventCommentDeleteTarget, setEventCommentDeleteTarget] = useState<EventComment | null>(null);
  const [eventCommentFocused, setEventCommentFocused] = useState(false);
  const [showAdminEdit, setShowAdminEdit] = useState(false);
  const [adminTitle, setAdminTitle] = useState(event?.title ?? "");
  const [adminParticipants, setAdminParticipants] = useState((event?.participants ?? []).join("\n"));
  const [adminDate, setAdminDate] = useState(event?.date ?? "");
  const [adminTime, setAdminTime] = useState(event?.time ?? "");
  const [adminLocation, setAdminLocation] = useState(event?.location ?? "");
  const [adminCapacity, setAdminCapacity] = useState(event?.capacityMode ?? String(event?.capacity ?? ""));
  const [adminReservationCapacity, setAdminReservationCapacity] = useState(String(event?.reservationCapacity ?? event?.capacity ?? ""));
  const [adminDeadline, setAdminDeadline] = useState(event?.applicationDeadline ?? "");
  const [adminCancellationPolicy, setAdminCancellationPolicy] = useState(event?.cancellationPolicy ?? "");
  const [adminTabelogUrl, setAdminTabelogUrl] = useState(event?.tabelogUrl ?? "");
  const [adminGoogleMapsUrl, setAdminGoogleMapsUrl] = useState(event?.googleMapsUrl ?? "");
  const [adminEventType, setAdminEventType] = useState<Event["eventType"]>(event?.eventType ?? "gourmet");
  const [adminClubId, setAdminClubId] = useState(event?.clubId ?? "");
  const [adminRestaurantName, setAdminRestaurantName] = useState(event?.restaurantName ?? "");
  const [adminFixedAmount, setAdminFixedAmount] = useState(true);
  const [adminBudgetMin, setAdminBudgetMin] = useState("");
  const [adminBudgetMax, setAdminBudgetMax] = useState("");
  const [adminCompanionIds, setAdminCompanionIds] = useState<string[]>(event?.companionIds ?? []);
  const [adminImage, setAdminImage] = useState(typeof event?.image === "string" ? event.image : "");
  const [adminImageChanged, setAdminImageChanged] = useState(false);
  const [adminPublicNotes, setAdminPublicNotes] = useState(event?.publicNotes ?? event?.description ?? "");
  const [adminPrivateMemo, setAdminPrivateMemo] = useState(event?.privateMemo ?? "");
  const [adminSelectionMethod, setAdminSelectionMethod] = useState<"first_come" | "lottery">(event?.selectionMethod === "lottery" ? "lottery" : "first_come");
  const [adminRecruitmentStatus, setAdminRecruitmentStatus] = useState<"draft" | "open">(event?.recruitmentStatus === "draft" ? "draft" : "open");
  const [adminUseRankPrices, setAdminUseRankPrices] = useState(Boolean(event?.rankPrices));
  const [adminRankPrices, setAdminRankPrices] = useState<EventFormValues["rankPrices"]>({ regular: "", silver: "", gold: "", platinum: "" });
  const [adminGenres, setAdminGenres] = useState<string[]>(event?.genres ?? []);
  const [adminInitialForm, setAdminInitialForm] = useState<EventFormValues | null>(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [memberDirectory, setMemberDirectory] = useState<Api.PublicMember[]>([]);
  const [approvingMemberId, setApprovingMemberId] = useState<string | null>(null);
  const [finalizingParticipants, setFinalizingParticipants] = useState(false);
  const [attendanceSheet, setAttendanceSheet] = useState<{ participants: Api.EventAttendanceParticipant[]; absentMemberIds: string[]; correcting: boolean } | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [, setEventRevision] = useState(0);
  // ボタン連打防止フラグ
  const joiningRef = useRef(false);
  const eventCommentInputRef = useRef<TextInput>(null);
  const eventCommentSendingRef = useRef(false);
  const usePointsRef = useRef(false);
  const favoriteEventIds = useEventFavorites();
  // Event comments support the same club, branch, and member mentions as other composers.
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
  const eventMentionGroups = useMemo(() => getMentionGroups(eventMentionMembers, clubs), [eventMentionMembers, clubs]);
  const eventMentionQuery = getMentionQuery(eventCommentText);

  useEffect(() => {
    const fallback = eventId?.startsWith("discord-event-") ? undefined : allEvents.find((item) => item.id === eventId);
    setEvent(fallback);
    setEventLoading(true);
    setEventResolved(false);
    if (!eventId) { setEvent(undefined); setEventLoading(false); setEventResolved(true); return; }
    if (authLoading) return;
    let active = true;
    void Api.getEvent(eventId)
      .then((value) => { if (active) {
        setEvent(value);
      } })
      .catch(async () => {
        // A server list is safe as fallback; never show the stale imported fixture.
        try {
          const events = await Api.getEvents({ includeCancelled: true });
          if (active) setEvent(events.find((item) => item.id === eventId) ?? fallback);
        } catch {
          if (active) setEvent(fallback);
        }
      })
      .finally(() => { if (active) { setEventLoading(false); setEventResolved(true); } });
    return () => { active = false; };
  }, [allEvents, authLoading, eventId]);

  useEffect(() => { void Api.getMemberDirectory().then(setMemberDirectory).catch(() => setMemberDirectory([])); }, []);
  useEffect(() => {
    if (!event) return;
    const ids = [...new Set([...(event.applicantIds ?? []), ...(event.participants ?? []), ...(event.companionIds ?? [])])];
    const missing = ids.filter((id) => !memberDirectory.some((member) => member.id === id));
    if (!missing.length) return;
    let active = true;
    void Promise.all(missing.map((id) => Api.getMemberProfile(id).catch(() => null))).then((members) => {
      const found = members.filter((member): member is Api.PublicMember => Boolean(member));
      if (active && found.length) setMemberDirectory((current) => [...current, ...found.filter((member) => !current.some((known) => known.id === member.id))]);
    });
    return () => { active = false; };
  }, [event?.id, event?.applicantIds, event?.participants, event?.companionIds, memberDirectory]);

  useEffect(() => {
    if (!event || showAdminEdit) return;
    const form = eventFormValuesFromEvent(event);
    setAdminTitle(event.title); setAdminParticipants((event.participants ?? []).join("\n"));
    setAdminDate(event.date); setAdminTime(event.time); setAdminLocation(event.location); setAdminCapacity(event.capacityMode ?? String(event.capacity));
    setAdminReservationCapacity(String(event.reservationCapacity ?? event.capacity));
    setAdminDeadline(event.applicationDeadline ?? ""); setAdminCancellationPolicy(event.cancellationPolicy ?? "");
    setAdminTabelogUrl(event.tabelogUrl ?? ""); setAdminGoogleMapsUrl(event.googleMapsUrl ?? ""); setAdminRecruitmentStatus(event.recruitmentStatus === "draft" ? "draft" : "open");
    setAdminEventType(form.eventType); setAdminClubId(form.clubId); setAdminRestaurantName(form.restaurantName); setAdminFixedAmount(form.fixedAmount); setAdminBudgetMin(form.budgetMin); setAdminBudgetMax(form.budgetMax); setAdminCompanionIds(form.companionIds); setAdminImage(form.image); setAdminImageChanged(false); setAdminPublicNotes(form.publicNotes); setAdminPrivateMemo(form.privateMemo); setAdminSelectionMethod(form.selectionMethod); setAdminUseRankPrices(form.useRankPrices); setAdminRankPrices(form.rankPrices); setAdminGenres(form.genres);
  }, [event, showAdminEdit]);

  useEffect(() => {
    if (!event) return;
    const viewerId = event.viewerMemberId ?? authenticatedViewerMemberId;
    const status = event.viewerParticipationStatus;
    setIsJoined(status ? status === "confirmed" || status === "cancel_requested" : event.participants.includes(viewerId));
    setHasApplied(status ? status === "applied" || status === "confirmed" || status === "cancel_requested" : Boolean(event.applicantIds?.includes(viewerId)));
    if (!event.viewerMemberId || !event.chatId) return;
    if (isEventOrganizer(event, viewerId) || status === "confirmed" || status === "cancel_requested") {
      const room = joinEventChat(event.id, event.title, event.chatId, viewerId);
      setChatRoomId(room.id);
    } else {
      void removeMemberFromRoom(event.chatId, viewerId);
      setChatRoomId(null);
    }
  }, [authenticatedViewerMemberId, event]);

  useEffect(() => {
    getIrotasPoints(CURRENT_USER.id).then(setIrotasPoints);
  }, []);
  useEffect(() => { if (!event?.id) return; void recordActivityEvent({ userId: CURRENT_USER.id, eventName: "event_viewed", entityType: "event", entityId: event.id, dedupeKey: `${CURRENT_USER.id}:event_viewed:${event.id}:${new Date().toISOString().slice(0, 10)}` }); }, [event?.id]);
  useEffect(() => {
    if (!event?.id || authLoading) return;
    const currentEventId = event.id;
    let active = true;
    setEventComments([]);
    const refresh = async () => {
      try { const comments = await Api.getEventComments(currentEventId); if (active) setEventComments(comments); }
      catch { /* Keep the last confirmed server result during a temporary connection failure. */ }
    };
    const migrateDeviceComments = async () => {
      // Earlier releases stored event edits/deletions only on this device.
      // Replay the current member's changes once, then use D1 exclusively.
      const [raw, deletedRaw] = await Promise.all([
        AsyncStorage.getItem(eventCommentsKey(currentEventId)),
        AsyncStorage.getItem(deletedEventCommentsKey(currentEventId)),
      ]);
      const local = raw ? JSON.parse(raw) as EventComment[] : [];
      const deletedIds = deletedRaw ? JSON.parse(deletedRaw) as string[] : [];
      let migrated = true;
      for (const comment of local) {
        if (!/^ec_\d{10,20}$/.test(comment.id) || comment.authorId !== authenticatedViewerMemberId || deletedIds.includes(comment.id)) continue;
        try { await Api.createEventComment(currentEventId, comment.text, comment.id); } catch { migrated = false; }
      }
      for (const commentId of deletedIds) {
        try { await Api.deleteEventComment(currentEventId, commentId); }
        catch (error) { if (!(error instanceof Error && /見つかりません|404/.test(error.message))) migrated = false; }
      }
      if (migrated) await Promise.all([
        AsyncStorage.removeItem(eventCommentsKey(currentEventId)),
        AsyncStorage.removeItem(deletedEventCommentsKey(currentEventId)),
      ]);
    };
    void refresh();
    void migrateDeviceComments().catch(() => {}).finally(() => { if (active) void refresh(); });
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [event?.id, authLoading, authenticatedViewerMemberId]);

  if ((!event || event.id !== eventId) && (eventLoading || !eventResolved)) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-6"><Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 40 }}>読み込み中…</Text></ScreenContainer>;
  }

  if (!event || event.id !== eventId) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-6">
        <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 40 }}>
          イベントが見つかりませんでした
        </Text>
      </ScreenContainer>
    );
  }

  const eventClub = event.eventType === "club" ? clubs.find((club) => club.id === event.clubId) : undefined;
  const eventEnded = Date.parse(`${event.date}T23:59:59`) < Date.now();
  const discordRecruitmentOpen = !eventEnded && isDiscordRecruitmentOpen(event);
  if (event.eventType === "club" && (!eventClub || !canViewerAccessClubContent(eventClub, authUser?.memberId, CURRENT_USER.id, isAdminRole(authUser?.role, authUser?.accessRole)))) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}><IconSymbol name="lock.fill" size={44} color={colors.muted} /><Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground, marginTop: 15 }}>部員限定イベントです</Text><Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: "center", marginTop: 7 }}>{eventClub?.name ?? "この部活動"}に入部すると、イベント詳細の確認と参加申込ができます。</Text><Pressable onPress={() => router.replace("/clubs")} style={{ marginTop: 20, borderRadius: 14, backgroundColor: colors.foreground, paddingHorizontal: 20, paddingVertical: 12 }}><Text style={{ color: colors.background, fontWeight: "900" }}>部活動一覧を見る</Text></Pressable></View></ScreenContainer>;
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "日時未設定";
    // YYYY-MM-DD形式を直接パース（タイムゾーン問題を回避）
    const match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      const day = parseInt(match[3]);
      const d = new Date(year, month - 1, day);
      const days = ["日", "月", "火", "水", "木", "金", "土"];
      return `${year}年${month}月${day}日(${days[d.getDay()]})`;
    }
    // その他の形式はそのまま表示
    return dateStr;
  };

  // ユーザーのランクに応じた料金を取得
  const eventHasRankPrices = (evt: Event) => {
    const rankPrices = evt.rankPrices;
    return evt.eventType === "official" && Boolean(rankPrices && EVENT_RANKS.some((rank) => Boolean(rankPrices[rank])));
  };
  const getRankPrice = (evt: Event): string => {
    if (!eventHasRankPrices(evt)) return evt.price;
    const rank = (authUser?.memberRank ?? CURRENT_USER.rank) as "regular" | "silver" | "gold" | "platinum";
    return evt.rankPrices?.[rank] ?? evt.price;
  };
  const effectivePrice = getRankPrice(event);
  const hasRankPrices = eventHasRankPrices(event);

  // 参加費の数値を取得（「3,000円」→ 3000）
  const parsePriceNumber = (priceStr: string): number => {
    const match = priceStr.replace(/,/g, "").match(/\d+/);
    const num = match ? parseInt(match[0], 10) : 0;
    return isNaN(num) ? 0 : num;
  };
  const priceNum = parsePriceNumber(effectivePrice);
  const isOfficialEvent = event.eventType === "official";
  const pointsToUse = usePoints && isOfficialEvent ? Math.min(irotasPoints, priceNum) : 0;
  const finalPrice = Math.max(0, priceNum - pointsToUse);
  const organizerId = event.organizerProfileId ?? event.createdBy;
  const companionIds = [...new Set(event.companionIds ?? [])].filter((memberId) => memberId !== organizerId);
  // Companions join the event chat, but are not applicants and therefore do not consume or count toward the recruiting capacity.
  const confirmedDisplayIds = getConfirmedParticipantDisplayIds(event.participants, undefined, organizerId);
  const confirmedParticipantIds = event.isCancelled ? [] : confirmedDisplayIds.filter((memberId) => memberId !== organizerId && !companionIds.includes(memberId));
  const cancelledParticipantIds = event.isCancelled
    ? [...new Set(event.cancelledParticipantIds ?? confirmedDisplayIds)].filter((memberId) => memberId !== organizerId && !companionIds.includes(memberId))
    : [];
  const applicantCount = event.applicantIds?.length ?? event.attendees;
  const organizer = getMemberById(organizerId) ?? getMemberById(event.createdBy);
  const organizerDirectoryMember = memberDirectory.find((member) => member.id === organizerId);
  const viewerMemberId = event.viewerMemberId ?? authenticatedViewerMemberId;
  const isOrganizer = isEventOrganizer(event, viewerMemberId);
  const pendingApplicantIds = event.isCancelled ? [] : getPendingGourmetApplicants(event);
  const confirmedParticipantCount = (event.participants ?? []).length;
  const canFinalizeParticipants = !event.participantsFinalizedAt && pendingApplicantIds.length === 0 && confirmedParticipantCount > 0;
  const displayMember = (memberId: string) => {
    const directoryMember = memberDirectory.find((member) => member.id === memberId);
    const staticMember = getMemberById(memberId);
    const discordAuthor = getDiscordAuthorById(memberId);
    return {
      name: stripRankFromName(directoryMember?.displayName ?? staticMember?.name ?? discordAuthor?.name ?? `会員ID ${memberId}`),
      badgeName: directoryMember?.displayName ?? staticMember?.name ?? discordAuthor?.name ?? "",
      avatar: typeof directoryMember?.profile.avatarUrl === "string" ? directoryMember.profile.avatarUrl : staticMember?.avatar ?? discordAuthor?.avatarUrl ?? DEFAULT_AVATAR,
      rank: (directoryMember?.memberRank ?? staticMember?.rank ?? discordAuthor?.rank) as MemberRank | undefined,
      role: directoryMember?.accessRole,
      roles: directoryMember?.discordRoles,
    };
  };
  const displayCommentAuthor = (comment: { author: string; authorId?: string }) => {
    const directoryMember = comment.authorId
      ? memberDirectory.find((member) => member.id === comment.authorId)
      : memberDirectory.find((member) => stripRankFromName(member.displayName) === stripRankFromName(comment.author));
    const staticMember = comment.authorId ? getMemberById(comment.authorId) : getMemberById(comment.author);
    const discordAuthor = comment.authorId ? getDiscordAuthorById(comment.authorId) : getDiscordAuthorByName(comment.author);
    return {
      name: stripRankFromName(directoryMember?.displayName ?? staticMember?.name ?? discordAuthor?.name ?? comment.author),
      badgeName: directoryMember?.displayName ?? staticMember?.name ?? discordAuthor?.name ?? comment.author,
      avatar: typeof directoryMember?.profile.avatarUrl === "string" ? directoryMember.profile.avatarUrl : staticMember?.avatar ?? discordAuthor?.avatarUrl ?? DEFAULT_AVATAR,
      rank: (directoryMember?.memberRank ?? staticMember?.rank ?? discordAuthor?.rank) as MemberRank | undefined,
      role: directoryMember?.accessRole ?? staticMember?.role,
      roles: directoryMember?.discordRoles,
    };
  };
  const pendingCancellationRequests = getPendingCancellationRequests(event);
  const hasPendingCancellationRequest = pendingCancellationRequests.some((request) => request.memberId === viewerMemberId);
  const requiresOrganizerApproval = true;
  const canAdminEdit = isAdminRole(authUser?.role, authUser?.accessRole);
  const userIsOperator = isOperatorRole(authUser?.role, authUser?.accessRole);
  const isDiscordImportedEvent = event.id.startsWith("discord-event-");
  const editableClubs = clubs.filter((club) => canViewerAccessClubContent(club, authUser?.memberId, CURRENT_USER.id, canAdminEdit));
  const canManageEvent = canAdminEdit || isOrganizer || (isDiscordImportedEvent && userIsOperator);
  const showApplicationConfirmation = (title: string, message: string, buttons: AlertButton[]) => setApplicationConfirmation({ title, message, buttons });

  const handleEventComment = async () => {
    const content = eventCommentText.trim();
    if (!content || eventCommentBusy || eventCommentSendingRef.current) return;
    eventCommentSendingRef.current = true;
    setEventCommentBusy(true);
    try {
      const saved = await Api.createEventComment(event.id, content);
      setEventComments((current) => [...current.filter((comment) => comment.id !== saved.id), saved].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      setEventCommentText("");
    } catch (error) {
      Alert.alert("コメントを送信できませんでした", error instanceof Error ? error.message : "通信状況を確認して再度お試しください。");
      setEventCommentBusy(false);
      eventCommentSendingRef.current = false;
      return;
    }
    setEventCommentBusy(false);
    eventCommentSendingRef.current = false;
    const preview = content.length > 50 ? `${content.slice(0, 50)}...` : content;
    const mentionedMemberIds = new Set(getMentionedMemberIds(content, MEMBERS, eventMentionGroups));
    for (const label of extractMentionLabels(content)) {
      const directoryMember = memberDirectory.find((member) => stripRankFromName(member.displayName) === stripRankFromName(label));
      if (directoryMember) mentionedMemberIds.add(directoryMember.id);
    }
    for (const memberId of mentionedMemberIds) {
      if (memberId === viewerMemberId) continue;
      const directoryMember = memberDirectory.find((member) => member.id === memberId);
      const member = getMemberById(memberId);
      if (directoryMember || member) void sendMentionNotification(directoryMember?.displayName ?? member?.name ?? "会員", authUser?.name ?? CURRENT_USER.name, event.title, preview);
    }
  };

  const handleSaveEventCommentEdit = async () => {
    if (!editingEventCommentId || !editingEventCommentText.trim() || eventCommentBusy) return;
    setEventCommentBusy(true);
    try {
      const saved = await Api.updateEventComment(event.id, editingEventCommentId, editingEventCommentText.trim());
      setEventComments((current) => current.map((comment) => comment.id === saved.id ? saved : comment));
      setEditingEventCommentId(null);
      setEditingEventCommentText("");
    } catch (error) {
      Alert.alert("コメントを編集できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
    } finally { setEventCommentBusy(false); }
  };

  const handleDeleteEventComment = async (commentId: string) => {
    if (eventCommentBusy) return;
    setEventCommentBusy(true);
    try {
      await Api.deleteEventComment(event.id, commentId);
      setEventComments((current) => current.filter((comment) => comment.id !== commentId));
      setEventCommentDeleteTarget(null);
      if (editingEventCommentId === commentId) {
        setEditingEventCommentId(null);
        setEditingEventCommentText("");
      }
    } catch (error) {
      Alert.alert("コメントを削除できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
    } finally { setEventCommentBusy(false); }
  };

  const handleJoin = () => {
    if (event.status === "full") {
      Alert.alert("満席", "このイベントは満席です");
      return;
    }
    // 連打防止: 既に処理中の場合はスキップ
    if (joiningRef.current) return;
    if (!termsAccepted) {
      Alert.alert("規約への同意が必要です", "イベント参加規約を確認し、同意にチェックしてください。");
      return;
    }

    const priceLabel = priceNum === 0
      ? "無料"
      : usePoints && pointsToUse > 0
        ? `${finalPrice.toLocaleString()}円（${pointsToUse}pt割引適用）`
        : effectivePrice;
    showApplicationConfirmation(
      "参加申込の確認",
      `「${event.title}」に申し込みますか？\n${requiresOrganizerApproval ? "幹事の承認後に参加確定となり、参加者チャットへ入れます。" : event.selectionMethod === "lottery" ? "抽選イベントです。申込後、参加確定をお待ちください。" : `参加費: ${priceLabel}`}`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "申し込む",
          onPress: async () => {
            // 連打防止ロック
            if (joiningRef.current) return;
            joiningRef.current = true;
            const confirmedPointsToUse = usePointsRef.current && isOfficialEvent ? Math.min(irotasPoints, priceNum) : 0;
            const confirmedFinalPrice = Math.max(0, priceNum - confirmedPointsToUse);
            try {
              if (event.viewerMemberId) {
                const application = await Api.applyToEvent(event.id, termsAccepted, confirmedPointsToUse);
                const updated = application.event;
                setEvent(updated);
                if (application.pointBalance !== null) setIrotasPoints(application.pointBalance);
                const confirmed = updated.viewerParticipationStatus === "confirmed";
                setHasApplied(true);
                setIsJoined(confirmed);
                Alert.alert(
                  confirmed ? "参加確定" : "申込完了",
                  confirmed
                    ? `参加が確定しました。${application.pointsUsed ? `${application.pointsUsed.toLocaleString()}ptを参加費に利用しました。` : ""}参加者専用チャットは確定者へ順次案内されます。`
                    : requiresOrganizerApproval
                      ? `幹事へ参加申込を送りました。${application.pointsUsed ? `${application.pointsUsed.toLocaleString()}ptを確保しました。` : ""}承認後に参加が確定します。`
                      : "抽選への申込を受け付けました。参加確定の連絡をお待ちください。",
                );
                return;
              }
              const applicants = event.applicantIds ?? [...(event.participants ?? [])];
              if (requiresOrganizerApproval) submitGourmetApplication(event, CURRENT_USER.id);
              else {
                if (!applicants.includes(CURRENT_USER.id)) applicants.push(CURRENT_USER.id);
                event.applicantIds = applicants;
                event.attendees = applicants.length;
              }
              setHasApplied(true);
              await recordActivityEvent({ userId: CURRENT_USER.id, eventName: "event_applied", entityType: "event", entityId: event.id });

              if (requiresOrganizerApproval) {
                Alert.alert("申込完了", "幹事へ参加申込を送りました。承認後、参加者チャットへ入れるようになります。");
                return;
              }

              if (event.selectionMethod === "lottery") {
                Alert.alert("申込完了", "抽選への申込を受け付けました。参加確定の連絡をお待ちください。");
                return;
              }

              // イロタスポイントを使用する場合は消費
              if (confirmedPointsToUse > 0) {
                const newBalance = await adjustIrotasPoints(
                  CURRENT_USER.id,
                  CURRENT_USER.name,
                  -confirmedPointsToUse,
                  `イベント「${event.title}」参加費割引`
                );
                setIrotasPoints(newBalance);
              }
              // 参加者リストに追加（nullチェック付き）
              const participants = event.participants ?? [];
              if (!participants.includes(CURRENT_USER.id)) {
                participants.push(CURRENT_USER.id);
                event.participants = participants;
              }
              setIsJoined(true);
              await recordActivityEvent({ userId: CURRENT_USER.id, eventName: "event_confirmed", entityType: "event", entityId: event.id });

              // 支払いレコードを作成
              await createPaymentRecord({
                eventId: event.id,
                userId: CURRENT_USER.id,
                userName: CURRENT_USER.name,
                userRank: CURRENT_USER.rank,
                amount: confirmedFinalPrice,
              });

              // チャットルームに参加（なければ作成）
              const room = joinEventChat(
                event.id,
                event.title,
                event.chatId,
                CURRENT_USER.id,
              );
              event.chatId = room.id;
              setChatRoomId(room.id);
              await notifyEventConfirmation(event, CURRENT_USER.id, room.id);
              await scheduleEventReminders(event, CURRENT_USER.id, room.id);

              // チャットへ誘導
              Alert.alert(
                "参加完了！",
                `「${event.title}」への参加が完了しました。\n参加者専用チャットに参加しますか？`,
                [
                  { text: "後で", style: "cancel" },
                  {
                    text: "チャットを開く",
                    onPress: () => {
                      router.push({ pathname: "/chat", params: { id: room.id } });
                    },
                  },
                ],
              );
            } catch (err) {
              console.error("[EventDetail] handleJoin error:", err);
              Alert.alert("エラー", "参加処理中にエラーが発生しました。もう一度お試しください。");
            } finally {
              joiningRef.current = false;
            }
          },
        },
      ],
    );
  };

  const approveApplicant = async (memberId: string) => {
    const member = displayMember(memberId);
    if (authUser) {
      try {
        setApprovingMemberId(memberId);
        const updated = await Api.reviewEventApplicant(event.id, memberId, "approve");
        if (updated.chatId) {
          joinEventChat(updated.id, updated.title, updated.chatId, updated.createdBy);
          joinEventChat(updated.id, updated.title, updated.chatId, memberId);
        }
        setEvent(updated);
        Alert.alert("承認完了", `${member?.name ?? "メンバー"}さんの参加を確定し、参加者専用チャットへ追加しました。`);
      } catch (error) {
        Alert.alert("承認できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
      } finally {
        setApprovingMemberId(null);
      }
      return;
    }
    approveGourmetApplication(event, memberId);
    const room = joinEventChat(event.id, event.title, event.chatId, event.createdBy);
    joinEventChat(event.id, event.title, room.id, memberId);
    event.chatId = room.id;
    await notifyEventConfirmation(event, memberId, room.id);
    await scheduleEventReminders(event, memberId, room.id);
    setEventRevision((value) => value + 1);
    Alert.alert("承認完了", `${member?.name ?? "メンバー"}さんの参加を確定し、参加者チャットへ追加しました。`);
  };

  const finalizeParticipants = async () => {
    setFinalizingParticipants(true);
    try {
      if (event.viewerMemberId) {
        const updated = await Api.finalizeEventParticipants(event.id);
        setEvent(updated);
        if (updated.chatId) {
          const room = joinEventChat(updated.id, updated.title, updated.chatId, updated.createdBy);
          setChatRoomId(room.id);
        }
        Alert.alert("参加者を確定しました", "参加者を確定し、イベントの募集を締め切りました。");
        return;
      }
      const room = joinEventChat(event.id, event.title, event.chatId, event.createdBy);
      event.chatId = room.id;
      for (const memberId of [...new Set([...(event.participants ?? []), ...companionIds])]) {
        const alreadyJoined = room.participants.includes(memberId);
        joinEventChat(event.id, event.title, room.id, memberId);
        if (!alreadyJoined) {
          await notifyEventConfirmation(event, memberId, room.id);
          await scheduleEventReminders(event, memberId, room.id);
        }
      }
      event.participantsFinalizedAt = new Date().toISOString();
      await cancelOrganizerDeadlineNotifications(event.id);
      setEventRevision((value) => value + 1);
      Alert.alert("参加者を確定しました", "参加者を確定し、イベントの募集を締め切りました。");
    } catch (error) {
      Alert.alert("確定できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
    } finally {
      setFinalizingParticipants(false);
    }
  };

  const handleFinalizeParticipants = () => {
    if (pendingApplicantIds.length > 0) {
      Alert.alert("承認待ちがあります", "すべての申込を確認してから参加者確定を完了してください。");
      return;
    }
    setApplicationConfirmation({
      title: "参加者を確定しますか？",
      message: "参加者を確定し、イベントの募集を締め切ります。",
      buttons: [
        { text: "戻る", style: "cancel" },
        { text: "確定する", onPress: () => { void finalizeParticipants(); } },
      ],
    });
  };

  const handleCancelEvent = () => {
    setApplicationConfirmation({
      title: "イベントを中止しますか？",
      message: "すでに参加者が確定している場合は、事前に参加者へご連絡をお願いします。\n本当にキャンセルしますか？",
      buttons: [
        { text: "戻る", style: "cancel" },
        { text: "中止する", style: "destructive", onPress: async () => {
          try {
            await Api.cancelEvent(event.id, true);
            // 確認ダイアログを閉じた直後から、幹事画面の下部も中止済みにする。
            setEvent((current) => current ? { ...current, status: "ended", isCancelled: true } : current);
            Alert.alert("イベントを中止しました", "参加申込者・参加確定者へ通知し、参加者チャットにもお知らせを投稿しました。", [{ text: "OK", onPress: () => router.replace("/events") }]);
          } catch (error) {
            Alert.alert("中止できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
          }
        } },
      ],
    });
  };

  const handleDeleteEvent = () => {
    setApplicationConfirmation({
      title: "イベントを完全に削除しますか？",
      message: "中止とは異なり、過去の参加・申込履歴を含めてイベントを完全に削除します。この操作は元に戻せません。",
      buttons: [
        { text: "戻る", style: "cancel" },
        { text: "完全に削除", style: "destructive", onPress: async () => {
          try {
            await Api.deleteEvent(event.id);
            Alert.alert("イベントを削除しました", "イベントと関連する申込履歴を削除しました。", [{ text: "OK", onPress: () => router.replace("/events") }]);
          } catch (error) {
            Alert.alert("削除できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
          }
        } },
      ],
    });
  };

  const handleSetRecruitmentStatus = async (recruitmentStatus: "draft" | "open") => {
    try {
      setEvent(await Api.setOfficialEventRecruitmentStatus(event.id, recruitmentStatus));
      Alert.alert(recruitmentStatus === "open" ? "募集を開始しました" : "募集前に戻しました", recruitmentStatus === "open" ? "メンバーがこの公式イベントへ申し込めるようになりました。" : "メンバーからの申込みは受け付けません。");
    } catch (error) {
      Alert.alert("募集ステータスを変更できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
    }
  };

  const handleCloseDiscordRecruitment = () => {
    setApplicationConfirmation({
      title: "Discordでの募集を終了しますか？",
      message: "アプリ上の表示を募集終了に変更します。Discord側の募集投稿は別途終了してください。",
      buttons: [
        { text: "戻る", style: "cancel" },
        { text: "募集終了にする", onPress: async () => {
          try {
            setEvent(await Api.closeDiscordEventRecruitment(event.id));
            Alert.alert("募集を終了しました", "アプリ上の表示を募集終了に変更しました。");
          } catch (error) {
            Alert.alert("変更できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
          }
        } },
      ],
    });
  };

  const cancelGourmetParticipant = (memberId: string) => {
    const member = displayMember(memberId);
    setApplicationConfirmation({
      title: "参加をキャンセルしますか？",
      message: `${member.name}さんの参加を取り消します。本当にキャンセルしますか？`,
      buttons: [
      { text: "戻る", style: "cancel" },
      { text: "キャンセル", style: "destructive", onPress: async () => {
        if (event.viewerMemberId) {
          try {
            setEvent(await Api.reviewEventApplicant(event.id, memberId, "cancel"));
            Alert.alert("キャンセル完了", "空席をイベント一覧へ反映しました。");
          } catch (error) {
            Alert.alert("処理できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
          }
          return;
        }
        cancelGourmetParticipation(event, memberId);
        setEventRevision((value) => value + 1);
        Alert.alert("キャンセル完了", "必要に応じて「追加募集を開始」から募集を再開できます。");
      } },
    ],
    });
  };

  const handleReopenGourmetRecruitment = async () => {
    if (event.viewerMemberId) {
      try {
        setEvent(await Api.reopenEventRecruitment(event.id));
        Alert.alert("追加募集を開始しました", "イベント一覧にも反映されます。");
      } catch (error) {
        Alert.alert("追加募集できません", error instanceof Error ? error.message : "もう一度お試しください。");
      }
      return;
    }
    if (!reopenGourmetRecruitment(event)) {
      Alert.alert("追加募集できません", "現在、募集定員に達しています。");
      return;
    }
    setEventRevision((value) => value + 1);
    Alert.alert("追加募集を開始しました", "イベント一覧に「空席あり」として表示されます。");
  };

  const submitCancellationRequest = async () => {
    if (event.viewerMemberId) {
      try {
        setEvent(await Api.requestEventCancellation(event.id, contactedOrganizer, cancellationPolicyConfirmed));
        Alert.alert(isJoined ? "申請しました" : "申込を取り消しました", isJoined ? "幹事にキャンセル申請を送りました。確定連絡をお待ちください。" : "イベントへの参加申込を取り消しました。");
      } catch (error) {
        Alert.alert("申請できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
      }
      return;
    }
    submitEventCancellationRequest(event, CURRENT_USER.id);
    await notifyEventCancellationRequest(event, CURRENT_USER.id);
    setEventRevision((value) => value + 1);
    Alert.alert("申請しました", "幹事に通知しました。キャンセルの確定連絡をお待ちください。");
  };

  const handleCancellationRequest = () => {
    if (hasApplied && !isJoined) {
      setApplicationConfirmation({
        title: "申込を取り消しますか？",
        message: "参加確定前のため、幹事への連絡は不要です。\n参加申込を取り消すと元に戻せません。",
        buttons: [{ text: "戻る", style: "cancel" }, { text: "取り消す", style: "destructive", onPress: () => { void submitCancellationRequest(); } }],
      });
      return;
    }
    if (!contactedOrganizer || !cancellationPolicyConfirmed) {
      Alert.alert("確認が必要です", "幹事への事前連絡とキャンセルポリシーの確認にチェックしてください。");
      return;
    }
    if (!event.viewerMemberId) { void submitCancellationRequest(); return; }
    void Api.getEventCancellationPenaltyPreview(event.id).then((preview) => {
      const cutoff = new Date(preview.cutoffAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
      const warning = preview.applies
        ? `前日0:00（JST）以降のキャンセルはペナルティ1ポイントの対象です（今回の基準：${cutoff}）。確定後は${preview.pointsAfterCancellation}点になります。${preview.restrictionUntil ? ` 3点到達のため${preview.restrictionUntil.replace("T", " ").slice(0, 16)}まで新規申込・参加ができなくなります。` : ""}`
        : "このキャンセルはペナルティポイントの対象外です。";
      setApplicationConfirmation({ title: "キャンセル申請", message: `${warning}\n\n幹事へキャンセル申請を送りますか？`, buttons: [{ text: "戻る", style: "cancel" }, { text: "申請する", style: "destructive", onPress: () => { void submitCancellationRequest(); } }] });
    }).catch(() => setApplicationConfirmation({ title: "キャンセル申請", message: "幹事へキャンセル申請を送りますか？", buttons: [{ text: "戻る", style: "cancel" }, { text: "申請する", style: "destructive", onPress: () => { void submitCancellationRequest(); } }] }));
  };

  const handleFinalizeAttendance = () => {
    setAttendanceLoading(true);
    void Api.getEventAttendance(event.id).then((result) => {
      if (result.finalized && !result.canCorrect) {
        Alert.alert("開催結果は確定済みです", `実参加人数は${result.actualAttendeeCount ?? 0}人です。`);
        return;
      }
      setAttendanceSheet({ participants: result.participants, absentMemberIds: result.participants.filter((item) => item.status === "absent").map((item) => item.memberId), correcting: result.finalized });
    }).catch((error) => Alert.alert("取得できませんでした", error instanceof Error ? error.message : "もう一度お試しください。"))
      .finally(() => setAttendanceLoading(false));
  };

  const handleApproveCancellation = async (memberId: string) => {
    try {
      if (event.viewerMemberId) setEvent(await Api.reviewEventCancellation(event.id, memberId, "approve"));
      else {
        approveEventCancellationRequest(event, memberId);
        setEventRevision((value) => value + 1);
      }
      Alert.alert("再募集を開始しました", "キャンセル分の空席をイベント一覧へ反映しました。イベントは募集中になり、再び申し込めます。");
    } catch (error) {
      Alert.alert("承認できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
    }
  };

  const handleOpenChat = () => {
    if (chatRoomId) {
      router.push({ pathname: "/chat", params: { id: chatRoomId } });
    }
  };

  const openMemberProfile = (memberId: string, displayName?: string) => {
    const discordAuthor = getDiscordAuthorById(memberId) ?? (displayName ? getDiscordAuthorByName(displayName) : undefined);
    const directoryMatch = memberDirectory.find((member) => member.id === memberId)
      ?? (displayName ? memberDirectory.find((member) => stripRankFromName(member.displayName) === stripRankFromName(displayName)) : undefined);
    const resolvedId = directoryMatch?.id ?? discordAuthor?.id ?? memberId;
    router.push({ pathname: "/member-profile", params: { id: resolvedId, ...(discordAuthor ? { legacyName: discordAuthor.name } : displayName ? { legacyName: displayName } : {}) } });
  };

  const handleOpenMap = () => {
    if (event.googleMapsUrl) { void Linking.openURL(/^https?:\/\//i.test(event.googleMapsUrl) ? event.googleMapsUrl : `https://${event.googleMapsUrl}`); return; }
    const query = encodeURIComponent(event.location);
    const url = Platform.OS === "ios"
      ? `maps:?q=${query}`
      : `https://maps.google.com/?q=${query}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(`https://maps.google.com/?q=${query}`);
      }
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header controls */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 140, zIndex: 10 }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            position: "absolute",
            top: 14,
            left: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconSymbol name="arrow.left" size={18} color="#FFF" />
        </Pressable>

        {/* Status badge */}
        <View style={{ position: "absolute", top: 14, right: 16 }}>
          <View
            style={{
              backgroundColor:
                eventEnded
                  ? "#8E8E93"
                  : event.recruitmentStatus === "draft"
                  ? "#7E6C9E"
                  : discordRecruitmentOpen
                  ? "#604C8C"
                  : event.status === "open"
                  ? "#34C759"
                  : event.status === "full"
                  ? "#FF9500"
                  : "#8E8E93",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFF" }}>
              {eventEnded ? "開催終了" : event.discordRecruitmentClosedAt ? "募集終了" : event.recruitmentStatus === "draft" ? "募集前" : discordRecruitmentOpen ? "Discord受付" : event.status === "open" ? "募集中" : event.status === "full" ? (event.participantsFinalizedAt ? "募集終了" : "満席") : "終了"}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => { const favorite = event.isFavorite ?? favoriteEventIds.includes(event.id); if (event.viewerMemberId) { void Api.setEventFavorite(event.id, !favorite).then(() => setEvent({ ...event, isFavorite: !favorite })).catch((error) => Alert.alert("更新できませんでした", error instanceof Error ? error.message : "もう一度お試しください。")); } else { void toggleEventFavoriteWithNotifications(event, CURRENT_USER.id); } if (!favorite) void recordActivityEvent({ userId: CURRENT_USER.id, eventName: "event_favorited", entityType: "event", entityId: event.id }); }} accessibilityLabel={(event.isFavorite ?? favoriteEventIds.includes(event.id)) ? "お気に入りから削除" : "お気に入りに追加"} style={{ position: "absolute", top: 56, right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name={(event.isFavorite ?? favoriteEventIds.includes(event.id)) ? "heart.fill" : "heart"} size={20} color={(event.isFavorite ?? favoriteEventIds.includes(event.id)) ? "#F59AB9" : "#FFF"} />
        </Pressable>
        <Pressable onPress={() => { void Clipboard.setStringAsync(`${PUBLIC_APP_URL}/event-detail?id=${encodeURIComponent(event.id)}`).finally(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2200); }); }} accessibilityLabel="イベントリンクをコピー" style={{ position: "absolute", top: 100, right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name="square.and.arrow.up" size={19} color="#FFF" />
        </Pressable>
        {linkCopied ? <View style={{ position: "absolute", top: 146, right: 16, borderRadius: 10, backgroundColor: "rgba(25,25,28,0.92)", paddingHorizontal: 12, paddingVertical: 9 }}><Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>リンクをコピーしました</Text></View> : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 236 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <EventImage event={event} style={{ width: "100%", height: 250, borderRadius: 16, marginBottom: 16 }} />
        {/* Title */}
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 12 }}>
          {displayEventTitle(event.title)}
        </Text>
        {event.restaurantName && event.restaurantName !== event.title ? (
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.muted, marginTop: -5, marginBottom: 12 }}>
            {event.restaurantName}
          </Text>
        ) : null}

        {/* Info cards */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#E8A0BF15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSymbol name="clock.fill" size={20} color="#E8A0BF" />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                {formatDate(event.date)}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>{event.time}〜</Text>
            </View>
          </View>

          <Pressable
            disabled={!event.googleMapsUrl}
            onPress={event.googleMapsUrl ? handleOpenMap : undefined}
            style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#A7C7E715",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSymbol name="mappin.and.ellipse" size={20} color="#A7C7E7" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                {event.location}
              </Text>
              <Text style={{ fontSize: 13, color: event.googleMapsUrl ? "#A7C7E7" : colors.muted }}>{event.googleMapsUrl ? "タップして地図を開く ↗" : "ー"}</Text>
            </View>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#34C75915",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSymbol name="person.2.fill" size={20} color="#34C759" />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                予約人数 {event.reservationCapacity ?? event.capacity + 1}人
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                募集人数（幹事除く） {eventCapacityLabel(event)}
              </Text>
            </View>
          </View>
          {event.tabelogUrl ? <Pressable onPress={() => Linking.openURL(/^https?:\/\//i.test(event.tabelogUrl!) ? event.tabelogUrl! : `https://${event.tabelogUrl!}`)} style={{ flexDirection: "row", alignItems: "center", marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: colors.border }}><View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFF1E8", alignItems: "center", justifyContent: "center" }}><IconSymbol name="link" size={19} color="#E67A31" /></View><View style={{ flex: 1, marginLeft: 12 }}><Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>食べログ</Text><Text style={{ fontSize: 13, color: "#E67A31" }}>タップして食べログを開く ↗</Text></View><IconSymbol name="chevron.right" size={16} color="#E67A31" /></Pressable> : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 16, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: colors.border }}>
            <Pressable onPress={() => Linking.openURL(getGoogleCalendarUrl(event))} style={{ flex: 1, minHeight: 42, borderRadius: 10, backgroundColor: "#F4F6F8", alignItems: "center", justifyContent: "center", flexDirection: "row" }}><IconSymbol name="calendar" size={16} color="#4285F4" /><Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "800", color: colors.foreground }}>Googleカレンダー</Text></Pressable>
            <Pressable onPress={() => Linking.openURL(getOutlookCalendarUrl(event))} style={{ flex: 1, minHeight: 42, borderRadius: 10, backgroundColor: "#F4F6F8", alignItems: "center", justifyContent: "center", flexDirection: "row" }}><IconSymbol name="calendar" size={16} color="#0078D4" /><Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "800", color: colors.foreground }}>Outlook</Text></Pressable>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          {[{ label: "現在の参加申込", value: `${applicantCount}人`, color: "#5B9BD5" }, { label: "募集定員", value: eventCapacityLabel(event), color: "#E8A0BF" }, { label: "参加確定", value: `${confirmedParticipantIds.length}人`, color: "#34C759" }].map((item) => (
            <View key={item.label} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12, alignItems: "center", borderTopWidth: 3, borderTopColor: item.color }}>
              <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center" }}>{item.label}</Text>
              <Text style={{ fontSize: item.label === "募集定員" && event.capacityMode ? 16 : 22, fontWeight: "900", color: item.color, marginTop: 3 }}>{item.value}</Text>
            </View>
          ))}
        </View>

        <Pressable onPress={() => openMemberProfile(event.organizerProfileId ?? event.createdBy, event.organizerName)} accessibilityLabel="幹事のプロフィールを表示" style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <Image source={event.organizerAvatar ?? (typeof organizerDirectoryMember?.profile.avatarUrl === "string" ? organizerDirectoryMember.profile.avatarUrl : organizer?.avatar ?? DEFAULT_AVATAR)} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
          <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 11, color: colors.muted }}>幹事</Text><View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}><Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{stripRankFromName(event.organizerName ?? organizerDirectoryMember?.displayName ?? organizer?.name ?? "メンバー")}</Text>{event.organizerRank ? <MemberRankBadge rank={event.organizerRank} name={event.organizerName} compact /> : null}<MemberClubLeaderBadges roles={organizerDirectoryMember?.discordRoles} name={event.organizerName} compact /><MemberRoleBadge name="" role={/IRO\+代表/.test(event.organizerName ?? "") ? "admin" : organizerDirectoryMember?.accessRole ?? (event.eventType === "official" ? "operator" : undefined)} compact /></View></View>
          <IconSymbol name="chevron.right" size={17} color={colors.muted} />
        </Pressable>

        {companionIds.length ? <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginTop: -8, marginBottom: 16 }}>
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>同席者</Text>
          {companionIds.map((memberId) => {
            const member = displayMember(memberId);
            return <Pressable key={memberId} onPress={() => openMemberProfile(memberId)} accessibilityLabel={`${member.name}のプロフィールを表示`} style={{ flexDirection: "row", alignItems: "center", minHeight: 44, paddingVertical: 5 }}><Image source={member.avatar} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" /><View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginLeft: 9 }}><Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{member.name}</Text>{member.rank ? <MemberRankBadge rank={member.rank} name={member.badgeName} role={member.role} compact /> : null}<MemberClubLeaderBadges roles={member.roles} name={member.badgeName} compact /><MemberRoleBadge name="" role={member.role} compact /></View><IconSymbol name="chevron.right" size={16} color={colors.muted} /></Pressable>;
          })}
        </View> : null}

        {canManageEvent ? <Pressable onPress={() => router.push({ pathname: "/create-event", params: { editId: event.id } })} style={{ marginBottom: 16, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: "#B42318" }}><Text style={{ color: "#FFF", fontSize: 14, fontWeight: "900" }}>{canAdminEdit ? "管理者：イベント情報を編集" : isDiscordImportedEvent && userIsOperator && !isOrganizer ? "運営：イベント情報を編集" : "イベント情報を編集"}</Text></Pressable> : null}
        {discordRecruitmentOpen ? <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#D7C9EB", backgroundColor: "#F7F3FC", padding: 14, marginBottom: 16 }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#604C8C" }}>このイベントはDiscordで受付中</Text><Text style={{ fontSize: 12, lineHeight: 19, color: colors.foreground, marginTop: 5 }}>本イベントはDiscordから移行したイベントです。参加希望は元のDiscordの募集投稿へお願いします。参加者もDiscord側で確定するため、アプリからは申し込めません。確定後、幹事・運営が編集画面で参加者を記録できます。</Text></View> : null}
        {canManageEvent && eventRecruitmentChannel(event) === "discord" && event.status === "open" && !event.isCancelled ? <Pressable onPress={handleCloseDiscordRecruitment} style={{ marginTop: -6, marginBottom: 16, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: "#6B5A96" }}><Text style={{ color: "#FFF", fontSize: 14, fontWeight: "900" }}>Discordでの募集を終了</Text></Pressable> : null}
        {canAdminEdit && event.eventType === "official" && eventRecruitmentChannel(event) === "app" && !event.isCancelled ? <Pressable onPress={() => { void handleSetRecruitmentStatus(event.recruitmentStatus === "draft" ? "open" : "draft"); }} style={{ marginTop: -6, marginBottom: 16, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: "#5B9BD5" }}><Text style={{ color: "#FFF", fontSize: 14, fontWeight: "900" }}>{event.recruitmentStatus === "draft" ? "管理者：募集を開始" : "管理者：募集前に戻す"}</Text></Pressable> : null}
        {canAdminEdit ? <Pressable onPress={handleDeleteEvent} style={{ marginTop: -6, marginBottom: 16, borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#D94C55" }}><Text style={{ color: "#D94C55", fontSize: 14, fontWeight: "900" }}>管理者：イベントを完全に削除</Text></Pressable> : null}

        {isOrganizer ? (
          <View style={{ backgroundColor: "#F5F8FC", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#DCE7F2" }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>幹事メニュー</Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 }}>申込を承認すると参加が確定し、自動で参加者チャットに追加されます。</Text>
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 14, marginBottom: 7 }}>承認待ち（{pendingApplicantIds.length}人）</Text>
            {pendingApplicantIds.length ? pendingApplicantIds.map((memberId) => {
              const member = displayMember(memberId);
              const approving = approvingMemberId === memberId;
              return <View key={memberId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}><Pressable onPress={() => openMemberProfile(memberId)} style={{ flex: 1, flexDirection: "row", alignItems: "center" }}><Image source={member.avatar} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" /><View style={{ flex: 1, marginLeft: 9, flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}><Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{member.name}</Text>{member.rank ? <MemberRankBadge rank={member.rank} name={member.badgeName} role={member.role} compact /> : null}<MemberClubLeaderBadges roles={member.roles} name={member.badgeName} compact /><MemberRoleBadge name="" role={member.role} compact /></View></Pressable><Pressable disabled={approving} onPress={() => approveApplicant(memberId)} style={{ borderRadius: 9, backgroundColor: "#34C759", paddingHorizontal: 12, paddingVertical: 7, opacity: approving ? 0.6 : 1 }}><Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>{approving ? "承認中…" : "承認"}</Text></Pressable></View>;
            }) : <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 8 }}>現在、承認待ちの申込はありません。</Text>}

            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 14, marginBottom: 7 }}>キャンセル申請（{pendingCancellationRequests.length}件）</Text>
            {pendingCancellationRequests.length ? pendingCancellationRequests.map((request) => { const member = displayMember(request.memberId); return <View key={request.memberId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}><Pressable onPress={() => openMemberProfile(request.memberId)} style={{ flex: 1, flexDirection: "row", alignItems: "center" }}><Image source={member.avatar} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" /><View style={{ flex: 1, marginLeft: 9, flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}><Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{member.name}</Text>{member.rank ? <MemberRankBadge rank={member.rank} name={member.badgeName} role={member.role} compact /> : null}<MemberClubLeaderBadges roles={member.roles} name={member.badgeName} compact /><MemberRoleBadge name="" role={member.role} compact /></View></Pressable><Pressable onPress={() => void handleApproveCancellation(request.memberId)} style={{ borderRadius: 9, backgroundColor: "#D94C55", paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>承認・再募集</Text></Pressable></View>; }) : <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 8 }}>現在、キャンセル申請はありません。</Text>}

            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 14, marginBottom: 7 }}>参加確定者{event.isCancelled ? "（0人）" : ""}</Text>
            {(event.isCancelled ? [] : event.participants ?? []).map((memberId) => {
              const member = displayMember(memberId);
              return <View key={memberId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}><Pressable onPress={() => openMemberProfile(memberId)} style={{ flex: 1, flexDirection: "row", alignItems: "center" }}><Image source={member.avatar} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" /><View style={{ flex: 1, marginLeft: 9, flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}><Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{member.name}</Text>{member.rank ? <MemberRankBadge rank={member.rank} name={member.badgeName} role={member.role} compact /> : null}<MemberClubLeaderBadges roles={member.roles} name={member.badgeName} compact /><MemberRoleBadge name="" role={member.role} compact /></View></Pressable>{memberId !== event.createdBy ? <Pressable onPress={() => cancelGourmetParticipant(memberId)} style={{ borderRadius: 9, borderWidth: 1, borderColor: colors.error, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: colors.error, fontSize: 11, fontWeight: "800" }}>幹事キャンセル</Text></Pressable> : null}</View>;
            })}
            {event.isCancelled ? <><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 14, marginBottom: 7 }}>キャンセル済み（{cancelledParticipantIds.length}人）</Text>{cancelledParticipantIds.length ? cancelledParticipantIds.map((memberId) => { const member = displayMember(memberId); return <Pressable key={memberId} onPress={() => openMemberProfile(memberId)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}><Image source={member.avatar} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" /><View style={{ flex: 1, marginLeft: 9, flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}><Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{member.name}</Text>{member.rank ? <MemberRankBadge rank={member.rank} name={member.badgeName} role={member.role} compact /> : null}<MemberClubLeaderBadges roles={member.roles} name={member.badgeName} compact /><MemberRoleBadge name="" role={member.role} compact /></View><IconSymbol name="chevron.right" size={16} color={colors.muted} /></Pressable>; }) : <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 8 }}>キャンセル済みの参加者はいません。</Text>}</> : <>{event.status !== "open" && (Boolean(event.capacityMode) || (event.participants ?? []).length < event.capacity) ? <Pressable onPress={handleReopenGourmetRecruitment} style={{ marginTop: 12, borderRadius: 11, backgroundColor: "#E8A0BF", paddingVertical: 11, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#FFF" }}>追加募集を開始</Text></Pressable> : null}<Pressable disabled={!canFinalizeParticipants || finalizingParticipants} onPress={handleFinalizeParticipants} style={{ marginTop: 12, borderRadius: 11, backgroundColor: canFinalizeParticipants && !finalizingParticipants ? "#34A853" : "#AEB6B0", paddingVertical: 11, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#FFF" }}>{event.participantsFinalizedAt ? "参加者確定済み" : finalizingParticipants ? "参加者を確定中…" : canFinalizeParticipants ? "参加者確定を完了" : "参加確定者がいません"}</Text></Pressable>{new Date(`${event.date}T${event.time}:00+09:00`).getTime() + 3 * 60 * 60 * 1000 <= Date.now() ? <Pressable disabled={attendanceLoading} onPress={handleFinalizeAttendance} style={{ marginTop: 10, borderRadius: 11, backgroundColor: attendanceLoading ? "#9CBFDF" : "#5B9BD5", paddingVertical: 11, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#FFF" }}>{attendanceLoading ? "出欠を読み込み中…" : "開催結果（実出欠）を確定"}</Text></Pressable> : null}<Pressable onPress={handleCancelEvent} style={{ marginTop: 10, borderRadius: 11, borderWidth: 1, borderColor: "#D94C55", paddingVertical: 11, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#D94C55" }}>イベントを中止</Text></Pressable></>}
          </View>
        ) : null}

        {canManageEvent && !isOrganizer && !event.isCancelled ? <Pressable onPress={handleCancelEvent} style={{ marginTop: -6, marginBottom: 16, borderRadius: 11, borderWidth: 1, borderColor: "#D94C55", paddingVertical: 11, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#D94C55" }}>イベントを中止</Text></Pressable> : null}

        {event.genres?.length ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>グルメジャンル</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{event.genres.map((genre) => <View key={genre} style={{ borderRadius: 15, backgroundColor: "#F0E7EC", paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ fontSize: 12, fontWeight: "700", color: "#9C4F73" }}>{genre}</Text></View>)}</View>
          </View>
        ) : null}

        {/* Price + イロタスポイント割引 */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{event.eventType === "gourmet" ? "予算" : "参加費"}</Text>
              {hasRankPrices && (
                <Text style={{ fontSize: 11, color: "#E8A0BF", marginTop: 2 }}>
                  ランク別料金適用中（{CURRENT_USER.rank.toUpperCase()}）
                </Text>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {usePoints && pointsToUse > 0 ? (
                <>
                  <Text style={{ fontSize: 13, color: colors.muted, textDecorationLine: "line-through" }}>
                    {effectivePrice}
                  </Text>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: "#34C759" }}>
                    {finalPrice === 0 ? "無料" : `${finalPrice.toLocaleString()}円`}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 22, fontWeight: "800", color: "#E8A0BF" }}>{effectivePrice}</Text>
              )}
            </View>
          </View>

          {/* ランク別料金一覧 */}
          {hasRankPrices && event.rankPrices && (
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 0.5,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
                ランク別料金
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {([
                  { key: "regular", label: "レギュラー", color: "#8E8E93" },
                  { key: "silver", label: "シルバー", color: "#8E8E93" },
                  { key: "gold", label: "ゴールド", color: "#FF9500" },
                  { key: "platinum", label: "プラチナ", color: "#A7C7E7" },
                ] as const).map(({ key, label, color }) => {
                  const rankPrice = event.rankPrices![key];
                  if (!rankPrice) return null;
                  const isCurrent = CURRENT_USER.rank === key;
                  return (
                    <View
                      key={key}
                      style={{
                        flex: 1,
                        minWidth: 70,
                        backgroundColor: isCurrent ? `${color}20` : colors.background,
                        borderRadius: 8,
                        padding: 8,
                        alignItems: "center",
                        borderWidth: isCurrent ? 1.5 : 0.5,
                        borderColor: isCurrent ? color : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 10, color: isCurrent ? color : colors.muted, fontWeight: isCurrent ? "700" : "400" }}>
                        {label}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: isCurrent ? color : colors.foreground, marginTop: 2 }}>
                        {rankPrice}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* イロタスポイント割引トグル */}
          {isOfficialEvent && priceNum > 0 && irotasPoints > 0 && !isJoined && (
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 0.5,
                borderTopColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#FF9500" }}>
                  ★ イロタスポイントを使用する
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  保有: {irotasPoints.toLocaleString()}pt
                  {usePoints && pointsToUse > 0 ? ` → ${pointsToUse.toLocaleString()}pt使用` : ""}
                </Text>
              </View>
              <Switch
                value={usePoints}
                onValueChange={(value) => { usePointsRef.current = value; setUsePoints(value); }}
                trackColor={{ false: colors.border, true: "#FF9500" }}
                thumbColor="#FFF"
              />
            </View>
          )}
        </View>

        {/* Description */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
            イベント詳細
          </Text>
          <MentionText content={event.description} groups={eventMentionGroups} onClubMentionPress={(group) => { const club = findMentionedClub(group.label, clubs); if (!club) return; if (canViewerAccessClubContent(club, authUser?.memberId, CURRENT_USER.id, isAdminRole(authUser?.role, authUser?.accessRole))) { router.push({ pathname: "/board", params: { category: `club-${club.id}`, view: "threads" } }); return; } router.push({ pathname: "/clubs", params: { clubId: club.id } }); }} onMentionPress={(label) => { const normalized = mentionDisplayName(label); const targetId = getDiscordAuthorByName(normalized)?.id ?? findMentionedMemberId(normalized, [...memberDirectory.map((member) => ({ id: member.id, displayName: mentionDisplayName(member.displayName) })), ...MEMBERS.map((member) => ({ id: member.id, name: mentionDisplayName(member.name) }))]); if (targetId) openMemberProfile(targetId); }} />
        </View>

        {event.applicationDeadline ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>参加者決定の予定期日</Text>
            <Text style={{ fontSize: 15, color: colors.foreground, marginTop: 6 }}>{event.applicationDeadline}</Text>
          </View>
        ) : null}

        {event.cancellationPolicy ? (
          <View style={{ backgroundColor: "#FFF8F0", borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#F1DFC9" }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>キャンセルポリシー</Text>
            <Text style={{ fontSize: 14, lineHeight: 21, color: colors.foreground, marginTop: 7 }}>{event.cancellationPolicy}</Text>
          </View>
        ) : null}

        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>イベントへのコメント</Text>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>参加申込前でも閲覧・コメントできます。@で会員・部活・支部をメンションできます。</Text>
          {eventComments.map((comment) => {
            const author = displayCommentAuthor(comment);
            const profileId = comment.authorId
              ?? memberDirectory.find((member) => stripRankFromName(member.displayName) === stripRankFromName(comment.author))?.id
              ?? getDiscordAuthorByName(comment.author)?.id;
            const openAuthor = () => { if (profileId) openMemberProfile(profileId, comment.author); };
            return <Pressable key={comment.id} onLongPress={() => setEventCommentActionTarget(comment)} delayLongPress={350} accessibilityHint="長押しするとコメントの操作メニューを開きます" style={{ flexDirection: "row", marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border }}>
              <Pressable onPress={openAuthor} disabled={!profileId}><Image source={author.avatar} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 9 }} contentFit="cover" /></Pressable>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                  <Pressable onPress={openAuthor} disabled={!profileId}><Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>{author.name}</Text></Pressable>
                  {author.rank ? <MemberRankBadge rank={author.rank} name={author.badgeName} role={author.role} compact /> : null}
                  <MemberClubLeaderBadges roles={author.roles} name={author.badgeName} compact />
                  <MemberRoleBadge name="" role={author.role} compact />
                </View>
                {editingEventCommentId === comment.id ? <View style={{ gap: 7 }}><TextInput value={editingEventCommentText} onChangeText={setEditingEventCommentText} multiline autoFocus style={{ minHeight: 84, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: colors.foreground }} /><View style={{ flexDirection: "row", gap: 8 }}><Pressable onPress={handleSaveEventCommentEdit} style={{ backgroundColor: "#3478C7", borderRadius: 8, paddingHorizontal: 13, paddingVertical: 7 }}><Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>保存</Text></Pressable><Pressable onPress={() => setEventCommentDeleteTarget(comment)} style={{ backgroundColor: "#FCE7E7", borderRadius: 8, paddingHorizontal: 13, paddingVertical: 7 }}><Text style={{ color: colors.error, fontSize: 12, fontWeight: "800" }}>削除</Text></Pressable><Pressable onPress={() => setEditingEventCommentId(null)} style={{ paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ color: colors.muted, fontSize: 12 }}>キャンセル</Text></Pressable></View></View> : <MentionText content={comment.text} groups={eventMentionGroups} onMentionPress={(label) => { const normalized = mentionDisplayName(label); const targetId = getDiscordAuthorByName(normalized)?.id ?? memberDirectory.find((member) => mentionDisplayName(member.displayName) === normalized)?.id ?? findMentionedMemberId(normalized, MEMBERS); if (targetId) openMemberProfile(targetId); }} />}
              </View>
            </Pressable>;
          })}
          {eventMentionQuery !== null ? <MentionSuggestions query={eventMentionQuery} groups={eventMentionGroups} members={MEMBERS} onSelect={(label) => setEventCommentText((value) => insertMention(value, label))} /> : null}
          <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 14 }}><TextInput ref={eventCommentInputRef} value={eventCommentText} onChangeText={(value) => setEventCommentText(value.replace(/@everyone\b/gi, ""))} onFocus={() => setEventCommentFocused(true)} onBlur={() => setEventCommentFocused(false)} placeholder="質問やコメントを入力" placeholderTextColor={colors.muted} multiline style={{ flex: 1, minHeight: 44, maxHeight: 100, borderRadius: 14, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }} /><Pressable disabled={!eventCommentText.trim() || eventCommentBusy} onPress={() => { void handleEventComment(); }} style={{ width: 44, height: 44, borderRadius: 22, marginLeft: 8, alignItems: "center", justifyContent: "center", backgroundColor: eventCommentText.trim() && !eventCommentBusy ? "#D65E8D" : colors.border }}><IconSymbol name="paperplane.fill" size={19} color="#FFF" /></Pressable></View>
        </View>

        {(isJoined || hasApplied) && !isOrganizer ? (
          <View style={{ backgroundColor: "#FFF4F2", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#F3D0CA" }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.error }}>イベントをキャンセルする場合</Text>
            {isJoined ? <><Text style={{ fontSize: 12, lineHeight: 18, color: colors.foreground, marginTop: 5 }}>先に参加者チャットで幹事へ連絡してから申請してください。幹事の承認後、空席が再募集されます。</Text>{[{ label: "事前に幹事へ連絡しました", value: contactedOrganizer, set: setContactedOrganizer }, { label: "キャンセルポリシーを確認しました", value: cancellationPolicyConfirmed, set: setCancellationPolicyConfirmed }].map((item) => <Pressable key={item.label} onPress={() => item.set(!item.value)} style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: item.value ? "#D94C55" : colors.surface, borderWidth: 1, borderColor: item.value ? "#D94C55" : colors.border, alignItems: "center", justifyContent: "center" }}>{item.value ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "700", color: colors.foreground }}>{item.label}</Text></Pressable>)}</> : <Text style={{ fontSize: 12, lineHeight: 18, color: colors.foreground, marginTop: 5 }}>参加確定前は、幹事への連絡なしで参加申込を取り消せます。</Text>}
            <Pressable disabled={hasPendingCancellationRequest || (isJoined && (!contactedOrganizer || !cancellationPolicyConfirmed))} onPress={handleCancellationRequest} style={{ marginTop: 12, borderRadius: 11, paddingVertical: 11, alignItems: "center", backgroundColor: hasPendingCancellationRequest ? "#B8B8BD" : "#D94C55", opacity: !hasPendingCancellationRequest && isJoined && (!contactedOrganizer || !cancellationPolicyConfirmed) ? 0.45 : 1 }}><Text style={{ color: "#FFF", fontSize: 14, fontWeight: "900" }}>{hasPendingCancellationRequest ? "キャンセル申請中" : isJoined ? "キャンセル申請する" : "参加申込を取り消す"}</Text></Pressable>
          </View>
        ) : null}

        {!isJoined && !hasApplied && !isOrganizer && event.status === "open" && event.recruitmentStatus !== "draft" && !discordRecruitmentOpen ? (
          <View style={{ backgroundColor: "#FFF8F0", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#EED9BF" }}>
            <Pressable onPress={() => setTermsAccepted((value) => !value)} style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: termsAccepted ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: termsAccepted ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{termsAccepted ? <IconSymbol name="checkmark" size={15} color="#FFF" /> : null}</View>
              <Text style={{ flex: 1, marginLeft: 9, fontSize: 14, fontWeight: "800", color: colors.foreground }}>イベント参加規約に同意する</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(EVENT_TERMS_URL)} style={{ marginLeft: 33, marginTop: 7 }}><Text style={{ fontSize: 13, color: "#5B9BD5", textDecorationLine: "underline" }}>イベント参加規約を確認する</Text></Pressable>
          </View>
        ) : null}

        {isJoined && new Date(`${event.date}T${event.time}:00`) < new Date() ? <Pressable onPress={() => router.push({ pathname: "/event-feedback" as any, params: { id: event.id } })} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FFF4D8", borderRadius: 14, padding: 15, marginBottom: 16, borderWidth: 1, borderColor: "#EFD494" }}><IconSymbol name="star.fill" size={22} color="#D69A14" /><View style={{ flex: 1, marginLeft: 10 }}><Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>イベントを評価する</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>次回のイベント改善にご協力ください</Text></View><IconSymbol name="chevron.right" size={17} color="#D69A14" /></Pressable> : null}

        {/* 参加確定者一覧 */}
        <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
              参加確定者 ({confirmedParticipantIds.length}人)
            </Text>
            {confirmedParticipantIds.length ? <View style={{ borderRadius: 14, backgroundColor: colors.surface, overflow: "hidden" }}>
              {confirmedParticipantIds.map((uid) => {
                const directoryMember = memberDirectory.find((item) => item.id === uid);
                const member = getMemberById(uid);
                const discordAuthor = getDiscordAuthorById(uid);
                const memberName = directoryMember?.displayName ?? member?.name ?? discordAuthor?.name ?? `会員ID ${uid}`;
                const directoryAvatar = typeof directoryMember?.profile?.avatarUrl === "string" ? directoryMember.profile.avatarUrl : undefined;
                const rawRank = directoryMember?.memberRank ?? member?.rank ?? discordAuthor?.rank ?? "regular";
                const memberRank = (["regular", "silver", "gold", "platinum"].includes(rawRank) ? rawRank : "regular") as MemberRank;
                return (
                  <Pressable
                    key={uid}
                    onPress={() => openMemberProfile(uid)}
                    accessibilityLabel={`${memberName}のプロフィールを表示`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      minHeight: 64,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderTopWidth: uid === confirmedParticipantIds[0] ? 0 : 0.5,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Image
                      source={directoryAvatar ? { uri: directoryAvatar } : member?.avatar ?? (discordAuthor?.avatarUrl ? { uri: discordAuthor.avatarUrl } : DEFAULT_AVATAR)}
                      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: uid === CURRENT_USER.id ? 2 : 0, borderColor: "#E8A0BF" }}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 11 }}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }} numberOfLines={1}>{stripRankFromName(memberName)}</Text>
                      <MemberRankBadge rank={memberRank} name={memberName} role={directoryMember?.accessRole ?? member?.role} compact />
                      <MemberRoleBadge name={memberName} role={directoryMember?.accessRole ?? member?.role} compact />
                    </View>
                    <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View> : <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>参加者確定待ち</Text>}
          </View>
      </ScrollView>
      <PersistentBottomNav active="/events" />

      <Modal visible={eventCommentActionTarget !== null} transparent animationType="fade" onRequestClose={() => setEventCommentActionTarget(null)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,18,24,0.45)" }}>
          <Pressable accessibilityLabel="コメント操作を閉じる" onPress={() => setEventCommentActionTarget(null)} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
          <View style={{ width: "100%", maxWidth: 520, alignSelf: "center", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22 }}>
            <View style={{ width: 42, height: 5, borderRadius: 3, alignSelf: "center", backgroundColor: colors.border, marginBottom: 10 }} />
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 5 }} numberOfLines={2}>{eventCommentActionTarget?.text}</Text>
            {[
              { label: "返信", icon: "arrowshape.turn.up.left.fill", action: () => { const target = eventCommentActionTarget; setEventCommentActionTarget(null); if (!target) return; setEventCommentText(`@${stripRankFromName(target.author)} `); requestAnimationFrame(() => eventCommentInputRef.current?.focus()); } },
              { label: "テキストをコピー", icon: "doc.on.doc", action: () => { const target = eventCommentActionTarget; setEventCommentActionTarget(null); if (target) void Clipboard.setStringAsync(target.text); } },
              { label: "メッセージリンクをコピー", icon: "link", action: () => { const target = eventCommentActionTarget; setEventCommentActionTarget(null); if (target) void Clipboard.setStringAsync(`${PUBLIC_APP_URL}/event-detail?id=${encodeURIComponent(event.id)}&comment=${encodeURIComponent(target.id)}`); } },
              ...((eventCommentActionTarget?.canEdit) ? [
                { label: "コメントを編集", icon: "pencil", action: () => { const target = eventCommentActionTarget; setEventCommentActionTarget(null); if (!target) return; setEditingEventCommentId(target.id); setEditingEventCommentText(target.text); } },
                { label: "コメントを削除", icon: "trash", destructive: true, action: () => { const target = eventCommentActionTarget; setEventCommentActionTarget(null); if (target) setEventCommentDeleteTarget(target); } },
              ] : []),
            ].map((item) => <Pressable key={item.label} onPress={item.action} style={{ minHeight: 50, flexDirection: "row", alignItems: "center", borderTopWidth: 0.5, borderTopColor: colors.border }}><IconSymbol name={item.icon as any} size={20} color={("destructive" in item && item.destructive) ? colors.error : colors.foreground} /><Text style={{ marginLeft: 12, fontSize: 15, fontWeight: "700", color: ("destructive" in item && item.destructive) ? colors.error : colors.foreground }}>{item.label}</Text></Pressable>)}
            <Pressable onPress={() => setEventCommentActionTarget(null)} style={{ minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.surface, marginTop: 8 }}><Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>キャンセル</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={eventCommentDeleteTarget !== null} transparent animationType="fade" onRequestClose={() => setEventCommentDeleteTarget(null)}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(20,18,24,0.52)" }}>
          <View style={{ width: "100%", maxWidth: 390, borderRadius: 20, backgroundColor: colors.background, padding: 20 }}>
            <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "900", color: colors.foreground }}>コメントを削除しますか？</Text>
            <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 8 }}>削除後は元に戻せません。</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}><Pressable onPress={() => setEventCommentDeleteTarget(null)} style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.surface }}><Text style={{ fontWeight: "800", color: colors.foreground }}>キャンセル</Text></Pressable><Pressable disabled={eventCommentBusy} onPress={() => { if (eventCommentDeleteTarget) void handleDeleteEventComment(eventCommentDeleteTarget.id); }} style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#D94C55", opacity: eventCommentBusy ? 0.5 : 1 }}><Text style={{ fontWeight: "900", color: "#FFF" }}>{eventCommentBusy ? "削除中…" : "削除"}</Text></Pressable></View>
          </View>
        </View>
      </Modal>

      <Modal visible={attendanceSheet !== null} transparent animationType="slide" onRequestClose={() => setAttendanceSheet(null)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,18,24,0.5)" }}>
          <View style={{ maxHeight: "86%", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{attendanceSheet?.correcting ? "開催結果（実出欠）を訂正" : "開催結果（実出欠）を確定"}</Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 6 }}>{attendanceSheet?.correcting ? "管理者による訂正です。実参加人数に合わせて出欠と関連XPを再計算します。" : "初期状態では全員を出席にしています。欠席者だけ「欠席」に変更してから確定してください。確定後に実参加人数に応じてXPが反映されます。"}</Text>
            <ScrollView style={{ marginTop: 14 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {attendanceSheet?.participants.map((participant) => {
                const absent = attendanceSheet.absentMemberIds.includes(participant.memberId);
                const directoryMember = getMemberById(participant.memberId);
                return <Pressable key={participant.memberId} onPress={() => setAttendanceSheet((current) => !current ? current : { ...current, absentMemberIds: absent ? current.absentMemberIds.filter((id) => id !== participant.memberId) : [...current.absentMemberIds, participant.memberId] })} style={{ minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                  <Image source={directoryMember?.avatar ?? DEFAULT_AVATAR} style={{ width: 38, height: 38, borderRadius: 19 }} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{participant.name}</Text><Text style={{ marginTop: 2, fontSize: 11, color: absent ? "#D94C55" : "#2E8B57" }}>{absent ? "欠席" : "出席"}</Text></View>
                  <View style={{ width: 44, height: 28, borderRadius: 14, backgroundColor: absent ? "#FDE6E8" : "#DCF5E3", alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 11, fontWeight: "900", color: absent ? "#C33B45" : "#278545" }}>{absent ? "欠席" : "出席"}</Text></View>
                </Pressable>;
              })}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}><Pressable onPress={() => setAttendanceSheet(null)} style={{ flex: 1, minHeight: 50, borderRadius: 13, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Text style={{ fontWeight: "800", color: colors.foreground }}>キャンセル</Text></Pressable><Pressable onPress={() => { const absentIds = attendanceSheet?.absentMemberIds ?? []; const correcting = attendanceSheet?.correcting; void Api.finalizeEventAttendance(event.id, absentIds).then((result) => { setAttendanceSheet(null); Alert.alert(correcting ? "開催結果を訂正しました" : "開催結果を確定しました", `実参加人数は${result.actualAttendeeCount}人です。XPを反映しました。`); }).catch((error) => Alert.alert("確定できませんでした", error instanceof Error ? error.message : "もう一度お試しください。")); }} style={{ flex: 1.35, minHeight: 50, borderRadius: 13, backgroundColor: "#5B9BD5", alignItems: "center", justifyContent: "center" }}><Text style={{ fontWeight: "900", color: "#FFF" }}>{attendanceSheet?.correcting ? "実出欠を訂正" : "実出欠を確定"}</Text></Pressable></View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAdminEdit} transparent animationType="slide" onRequestClose={() => setShowAdminEdit(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(20,18,24,0.5)" }}>
          <View style={{ maxHeight: "90%", borderRadius: 20, backgroundColor: colors.background, overflow: "hidden" }}>
            <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground }}>イベント情報を編集</Text>
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>イベント種別</Text><View style={{ flexDirection: "row", gap: 7, marginTop: 5 }}>{([...(userIsOperator ? ["official"] as const : []), "gourmet", ...(editableClubs.length ? ["club"] as const : [])] as Event["eventType"][]).map((type) => <Pressable key={type} onPress={() => { setAdminEventType(type); if (type !== "official") setAdminUseRankPrices(false); if (type === "club" && !adminClubId) setAdminClubId(editableClubs[0]?.id ?? ""); }} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: adminEventType === type ? "#5B9BD5" : colors.surface }}><Text style={{ textAlign: "center", fontSize: 12, fontWeight: "800", color: adminEventType === type ? "#FFF" : colors.foreground }}>{type === "official" ? "公式" : type === "club" ? "部活動" : "グルメ会"}</Text></Pressable>)}</View>
              {adminEventType === "club" ? <><Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>開催する部活動</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 5 }}>{editableClubs.map((club) => <Pressable key={club.id} onPress={() => setAdminClubId(club.id)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: adminClubId === club.id ? "#4E6756" : colors.surface }}><Text style={{ fontSize: 12, fontWeight: "800", color: adminClubId === club.id ? "#FFF" : colors.foreground }}>{club.icon} {club.name}</Text></Pressable>)}</View></> : null}
              {adminEventType === "official" ? <><Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>募集ステータス</Text><View style={{ flexDirection: "row", gap: 7, marginTop: 5 }}>{(["draft", "open"] as const).map((status) => <Pressable key={status} onPress={() => setAdminRecruitmentStatus(status)} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: adminRecruitmentStatus === status ? "#5B9BD5" : colors.surface }}><Text style={{ textAlign: "center", fontSize: 12, fontWeight: "800", color: adminRecruitmentStatus === status ? "#FFF" : colors.foreground }}>{status === "draft" ? "募集前" : "募集中"}</Text></Pressable>)}</View><Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>参加者の決め方</Text><View style={{ flexDirection: "row", gap: 7, marginTop: 5 }}>{(["first_come", "lottery"] as const).map((method) => <Pressable key={method} onPress={() => setAdminSelectionMethod(method)} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: adminSelectionMethod === method ? "#E8A0BF" : colors.surface }}><Text style={{ textAlign: "center", fontSize: 12, fontWeight: "800", color: adminSelectionMethod === method ? "#FFF" : colors.foreground }}>{method === "first_come" ? "先着順" : "抽選"}</Text></Pressable>)}</View></> : null}
              {[[adminEventType === "club" ? "店名・会場名" : "店名", adminRestaurantName, setAdminRestaurantName], ["イベント名", adminTitle, setAdminTitle], ["開催日（YYYY-MM-DD）", adminDate, setAdminDate], ["住所", adminLocation, setAdminLocation], ["募集締切（YYYY-MM-DD）", adminDeadline, setAdminDeadline], ["食べログURL", adminTabelogUrl, setAdminTabelogUrl], ["GoogleマップURL", adminGoogleMapsUrl, setAdminGoogleMapsUrl], ["キャンセルポリシー", adminCancellationPolicy, setAdminCancellationPolicy]].map(([label, value, setter]) => <View key={String(label)}><Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>{String(label)}</Text><TextInput value={String(value)} onChangeText={setter as (value: string) => void} multiline={String(label) === "キャンセルポリシー"} style={{ marginTop: 5, minHeight: String(label) === "キャンセルポリシー" ? 70 : undefined, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, color: colors.foreground, textAlignVertical: "top" }} /></View>)}
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>開始時刻（15分単位）</Text><SharedEventSelectField label="開始時刻" value={adminTime} options={EVENT_TIME_OPTIONS} onChange={setAdminTime} />
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>募集人数（幹事除く）</Text><SharedEventSelectField label="募集人数" value={adminCapacity} options={EVENT_CAPACITY_OPTIONS} onChange={setAdminCapacity} />
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>予約人数</Text><SharedEventSelectField label="予約人数" value={adminReservationCapacity} options={EVENT_RESERVATION_CAPACITY_OPTIONS} onChange={setAdminReservationCapacity} />
              {adminEventType !== "club" ? <><Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>グルメジャンル（複数選択）</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 5 }}>{GOURMET_GENRES.map((genre) => { const selected = adminGenres.includes(genre); return <Pressable key={genre} onPress={() => setAdminGenres((current) => selected ? current.filter((item) => item !== genre) : [...current, genre])} style={{ borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: selected ? "#5D5C74" : colors.surface }}><Text style={{ fontSize: 12, fontWeight: "800", color: selected ? "#FFF" : colors.foreground }}>{genre}</Text></Pressable>; })}</View></> : null}
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>{adminEventType === "official" ? "参加費" : "予算"}</Text>
              <Pressable onPress={() => { const next = adminBudgetMin !== "未定"; setAdminFixedAmount(false); setAdminBudgetMin(next ? "未定" : ""); setAdminBudgetMax(next ? "未定" : ""); }} style={{ marginTop: 6 }}><Text style={{ color: adminBudgetMin === "未定" ? "#D65E8D" : colors.foreground, fontWeight: "800" }}>{adminBudgetMin === "未定" ? "✓ " : "□ "}未定</Text></Pressable>
              {adminBudgetMin !== "未定" ? <><Pressable onPress={() => { setAdminFixedAmount((value) => !value); setAdminBudgetMin(""); setAdminBudgetMax(""); }} style={{ marginTop: 6 }}><Text style={{ color: "#D65E8D", fontWeight: "800" }}>{adminFixedAmount ? "✓ 固定金額で設定" : "範囲で設定"}</Text></Pressable>{adminFixedAmount ? <TextInput value={adminBudgetMin} onChangeText={(value) => setAdminBudgetMin(value.replace(/[^0-9]/g, ""))} placeholder="例：8000" keyboardType="number-pad" style={{ marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, color: colors.foreground }} /> : <View style={{ gap: 8, marginTop: 6 }}><SharedEventSelectField label="予算下限" value={adminBudgetMin} options={EVENT_AMOUNT_OPTIONS} onChange={setAdminBudgetMin} /><SharedEventSelectField label="予算上限" value={adminBudgetMax} options={EVENT_AMOUNT_OPTIONS} onChange={setAdminBudgetMax} /></View>}</> : null}
              {adminEventType === "official" ? <><Pressable onPress={() => setAdminUseRankPrices((value) => !value)} style={{ marginTop: 12 }}><Text style={{ color: "#D65E8D", fontWeight: "800" }}>{adminUseRankPrices ? "✓ ランク別料金を設定" : "ランク別料金を設定する"}</Text></Pressable>{adminUseRankPrices ? EVENT_RANKS.map((rank) => <View key={rank}><Text style={{ marginTop: 8, fontSize: 12, color: colors.muted }}>{rank}</Text><SharedEventSelectField label={`${rank}料金`} value={adminRankPrices[rank]} options={EVENT_AMOUNT_OPTIONS} onChange={(value) => setAdminRankPrices((current) => ({ ...current, [rank]: value }))} /></View>) : null}</> : null}
              <EventMemberPicker label="同席者" selectedIds={adminCompanionIds} onChange={(ids) => { setAdminCompanionIds(ids); setAdminReservationCapacity((current) => String(Math.max(Number(current || 0), minimumReservationCapacity(adminCapacity, ids)))); }} members={memberDirectory} excludedIds={[organizerId]} />
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>写真</Text><Pressable onPress={async () => { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) { Alert.alert("権限が必要です", "写真を選ぶには写真ライブラリへのアクセスを許可してください"); return; } const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 }); if (!result.canceled && result.assets[0]) { setAdminImage(result.assets[0].uri); setAdminImageChanged(true); } }} style={{ marginTop: 5, height: 120, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>{adminImage ? <Image source={{ uri: adminImage }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <Text style={{ color: colors.muted }}>写真を選択</Text>}</Pressable>
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>自由記述欄</Text><TextInput value={adminPublicNotes} onChangeText={setAdminPublicNotes} multiline style={{ marginTop: 5, minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, color: colors.foreground, textAlignVertical: "top" }} />
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>自分用メモ</Text><TextInput value={adminPrivateMemo} onChangeText={setAdminPrivateMemo} multiline style={{ marginTop: 5, minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, color: colors.foreground, textAlignVertical: "top" }} />
              <EventMemberPicker label="参加確定者" selectedIds={selectedMemberIds(adminParticipants)} onChange={(ids) => setAdminParticipants(ids.join("\n"))} members={memberDirectory} excludedIds={[organizerId]} />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}><Pressable onPress={() => setShowAdminEdit(false)} style={{ flex: 1, paddingVertical: 13, alignItems: "center", borderRadius: 11, backgroundColor: colors.surface }}><Text style={{ fontWeight: "800", color: colors.foreground }}>キャンセル</Text></Pressable><Pressable disabled={adminSaving} onPress={async () => { const form: EventFormValues = { eventType: adminEventType, clubId: adminClubId, restaurantName: adminRestaurantName, eventName: adminTitle, date: adminDate, time: adminTime, address: adminLocation, reservationCapacity: adminReservationCapacity, recruitCapacity: adminCapacity, fixedAmount: adminFixedAmount, budgetMin: adminBudgetMin, budgetMax: adminBudgetMax, tabelogUrl: adminTabelogUrl, googleMapsUrl: adminGoogleMapsUrl, companionIds: adminCompanionIds, image: adminImage, decisionDate: adminDeadline, publicNotes: adminPublicNotes, privateMemo: adminPrivateMemo, cancellationPolicy: adminCancellationPolicy, selectionMethod: adminSelectionMethod, useRankPrices: adminUseRankPrices, rankPrices: adminRankPrices, genres: adminGenres }; const validationError = validateEventForm(form, { requireImage: false, allowedClubIds: editableClubs.map((club) => club.id), allowEmptyGenres: true, allowPastDate: true }); if (validationError) { Alert.alert("入力エラー", validationError); return; } setAdminSaving(true); try { const fields = eventFormSaveFields(form); const uploadedImage = adminImageChanged ? (await Api.uploadEventImage(adminImage)).imageUrl : undefined; const companionOnly = !adminImageChanged && adminInitialForm !== null && hasOnlyCompanionChanges(adminInitialForm, form) && !(adminEventType === "official" && adminRecruitmentStatus !== (event.recruitmentStatus === "draft" ? "draft" : "open")); const updated = companionOnly ? await Api.updateEventCompanions(event.id, fields.companionIds ?? []) : await Api.updateEventDetails(event.id, { ...fields, recruitmentStatus: adminEventType === "official" ? adminRecruitmentStatus : undefined, image: uploadedImage, title: fields.title, description: fields.description, participants: selectedMemberIds(adminParticipants).filter((memberId) => memberId !== organizerId) }); setEvent(updated); setShowAdminEdit(false); Alert.alert("更新しました"); } catch (error) { Alert.alert("更新できませんでした", error instanceof Error ? error.message : "もう一度お試しください。"); } finally { setAdminSaving(false); } }} style={{ flex: 1, paddingVertical: 13, alignItems: "center", borderRadius: 11, backgroundColor: "#B42318", opacity: adminSaving ? 0.6 : 1 }}><Text style={{ fontWeight: "900", color: "#FFF" }}>{adminSaving ? "保存中…" : "保存"}</Text></Pressable></View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={applicationConfirmation !== null} transparent animationType="fade" onRequestClose={() => setApplicationConfirmation(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.52)", alignItems: "center", justifyContent: "center", padding: 22 }}>
          <View style={{ width: "100%", maxWidth: 430, borderRadius: 24, backgroundColor: colors.background, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 24, elevation: 12 }}>
            <View style={{ height: 8, backgroundColor: isOfficialEvent ? "#D65E8D" : "#5B9BD5" }} />
            <View style={{ padding: 22 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: isOfficialEvent ? "#FCEAF2" : "#EAF3FA", marginBottom: 12 }}><IconSymbol name="calendar" size={25} color={isOfficialEvent ? "#D65E8D" : "#5B9BD5"} /></View>
              <Text style={{ textAlign: "center", fontSize: 20, fontWeight: "900", color: colors.foreground }}>{applicationConfirmation?.title}</Text>
              <Text style={{ textAlign: "center", fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.foreground, marginTop: 12 }}>{event.title}</Text>
              <Text style={{ textAlign: "center", fontSize: 13, fontWeight: "800", color: "#5865F2", marginTop: 8 }}>{event.date}　{event.time}</Text>
              <Text style={{ textAlign: "center", fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 8 }}>{applicationConfirmation?.message}</Text>
              {isOfficialEvent && priceNum > 0 && irotasPoints > 0 ? <View style={{ marginTop: 18, borderRadius: 16, padding: 14, backgroundColor: "#FFF7E8", borderWidth: 1, borderColor: "#F4D89D" }}><View style={{ flexDirection: "row", alignItems: "center" }}><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#A56712" }}>イロタスポイントを使う</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>保有 {irotasPoints.toLocaleString()}pt</Text></View><Switch value={usePoints} onValueChange={(value) => { usePointsRef.current = value; setUsePoints(value); }} trackColor={{ false: colors.border, true: "#FF9500" }} thumbColor="#FFF" /></View>{usePoints ? <Text style={{ marginTop: 10, fontSize: 13, fontWeight: "900", color: "#2E8B57" }}>{pointsToUse.toLocaleString()}pt利用 → お支払い {finalPrice.toLocaleString()}円</Text> : null}</View> : null}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>{applicationConfirmation?.buttons.map((button) => { const cancel = button.style === "cancel"; const destructive = button.style === "destructive"; return <Pressable key={button.text} onPress={() => { setApplicationConfirmation(null); if (!cancel) button.onPress?.(); }} style={{ flex: 1, minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: cancel ? colors.surface : destructive ? "#D94C55" : isOfficialEvent ? "#D65E8D" : "#5B9BD5", borderWidth: cancel ? 1 : 0, borderColor: colors.border }}><Text style={{ fontSize: 15, fontWeight: "900", color: cancel ? colors.foreground : "#FFF" }}>{button.text}</Text></Pressable>; })}</View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom CTA */}
      {!eventCommentFocused ? <View
        style={{
          position: "absolute",
          bottom: Platform.OS === "web" ? 72 : 82,
          left: 0,
          right: 0,
          backgroundColor: colors.background,
          borderTopWidth: 0.5,
          borderTopColor: colors.border,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Platform.OS === "web" ? 16 : 34,
          gap: 10,
        }}
      >
        {/* チャットボタン（参加済みの場合） */}
        {(isJoined || isOrganizer) && chatRoomId && (
          <Pressable
            onPress={handleOpenChat}
            style={({ pressed }) => ({
              backgroundColor: "#34C75915",
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#34C75930",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <IconSymbol name="message.fill" size={18} color="#34C759" />
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#34C759", marginLeft: 8 }}>
              参加者チャットを開く
            </Text>
          </Pressable>
        )}

        {/* 中止済み表示。参加者は上のボタンからチャットを引き続き確認できる。 */}
        {event.isCancelled ? (
          <View style={{ backgroundColor: "#D94C55", borderRadius: 14, paddingVertical: 16, alignItems: "center" }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#FFF" }}>キャンセル済み</Text>
          </View>
        ) : (
        /* 参加ボタン */
        <Pressable
          disabled={isJoined || hasApplied || isOrganizer || event.status !== "open" || event.recruitmentStatus === "draft" || discordRecruitmentOpen || (requiresOrganizerApproval && !termsAccepted)}
          onPress={isJoined || hasApplied || isOrganizer || event.status !== "open" || event.recruitmentStatus === "draft" || discordRecruitmentOpen || (requiresOrganizerApproval && !termsAccepted) ? undefined : handleJoin}
          style={({ pressed }) => ({
            backgroundColor: isOrganizer
              ? (event.participantsFinalizedAt ? "#34C759" : "#B42318")
              : isJoined
              ? "#34C759"
              : hasApplied
              ? "#5B9BD5"
              : event.status !== "open" || event.recruitmentStatus === "draft" || discordRecruitmentOpen
              ? colors.muted
              : !termsAccepted
              ? "#B8B8BD"
              : "#E8A0BF",
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            opacity: requiresOrganizerApproval && !termsAccepted && !hasApplied && !isJoined && !isOrganizer ? 1 : pressed && !isJoined && !hasApplied ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#FFF" }}>
            {discordRecruitmentOpen ? "Discordで受付中（アプリ申込不可）" : isOrganizer ? (event.participantsFinalizedAt ? "幹事イベント（参加者確定済み）" : event.recruitmentStatus === "draft" ? "幹事イベント（募集前）" : "幹事イベント（参加者募集中）") : isJoined ? "✓ 参加確定" : hasApplied ? "✓ 申込済み（幹事の承認待ち）" : event.recruitmentStatus === "draft" ? "募集開始前" : event.status !== "open" ? "募集終了" : requiresOrganizerApproval && !termsAccepted ? "規約に同意して申し込む" : event.selectionMethod === "lottery" ? "抽選に申し込む" : "参加を申し込む"}
          </Text>
        </Pressable>
        )}
      </View> : null}
    </View>
  );
}
