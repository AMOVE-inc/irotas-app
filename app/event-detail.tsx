import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { EVENTS, CURRENT_USER, DEFAULT_AVATAR, MEMBERS, getMemberById, type Event, type MemberRank } from "@/constants/mock-data";
import { EventImage } from "@/components/event-image";
import { PersistentBottomNav } from "@/components/persistent-bottom-nav";
import { MemberRankBadge, MemberRoleBadge, stripRankFromName } from "@/components/member-rank-badge";
import { MentionSuggestions, MentionText } from "@/components/mention-ui";
import { getMentionGroups, getMentionQuery, getMentionedMemberIds, insertMention } from "@/lib/mentions";
import { EVENT_TERMS_URL } from "@/constants/external-links";
import { joinEventChat, removeMemberFromRoom } from "@/lib/chat-store";
import { getAllEvents } from "@/lib/event-store";
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
import { isAdminRole } from "@/lib/access-control";
import { canViewerAccessClubContent, resolveViewerMemberId } from "@/lib/club-viewer-access";
import { recordActivityEvent } from "@/lib/ai-data-store";
import { getDiscordAuthorById, getDiscordAuthorByName } from "@/lib/discord-author-directory";
import { Image } from "expo-image";
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

export default function EventDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: authUser } = useAuthContext();
  const clubs = useClubs();
  const authenticatedViewerMemberId = resolveViewerMemberId(authUser?.memberId, Boolean(authUser), CURRENT_USER.id);

  // モックデータ + 動的追加分から検索
  const allEvents = useMemo(() => getAllEvents(EVENTS), []);
  const initialEvent = allEvents.find((e) => e.id === id);
  const [event, setEvent] = useState<Event | undefined>(initialEvent);

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
  const [eventComments, setEventComments] = useState<{ id: string; author: string; text: string; createdAt: string }[]>([]);
  const [eventCommentText, setEventCommentText] = useState("");
  const [eventCommentFocused, setEventCommentFocused] = useState(false);
  const [showAdminEdit, setShowAdminEdit] = useState(false);
  const [adminTitle, setAdminTitle] = useState(event?.title ?? "");
  const [adminDescription, setAdminDescription] = useState(event?.description ?? "");
  const [adminParticipants, setAdminParticipants] = useState((event?.participants ?? []).join("\n"));
  const [adminDate, setAdminDate] = useState(event?.date ?? "");
  const [adminTime, setAdminTime] = useState(event?.time ?? "");
  const [adminLocation, setAdminLocation] = useState(event?.location ?? "");
  const [adminCapacity, setAdminCapacity] = useState(String(event?.capacity ?? ""));
  const [adminReservationCapacity, setAdminReservationCapacity] = useState(String(event?.reservationCapacity ?? event?.capacity ?? ""));
  const [adminPrice, setAdminPrice] = useState(event?.price ?? "");
  const [adminDeadline, setAdminDeadline] = useState(event?.applicationDeadline ?? "");
  const [adminCancellationPolicy, setAdminCancellationPolicy] = useState(event?.cancellationPolicy ?? "");
  const [adminTabelogUrl, setAdminTabelogUrl] = useState(event?.tabelogUrl ?? "");
  const [adminGoogleMapsUrl, setAdminGoogleMapsUrl] = useState(event?.googleMapsUrl ?? "");
  const [participantSearch, setParticipantSearch] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [memberDirectory, setMemberDirectory] = useState<Api.PublicMember[]>([]);
  const [, setEventRevision] = useState(0);
  // ボタン連打防止フラグ
  const joiningRef = useRef(false);
  const usePointsRef = useRef(false);
  const favoriteEventIds = useEventFavorites();
  const eventMentionGroups = useMemo(() => getMentionGroups(MEMBERS, clubs).filter((group) => group.category === "club" || group.category === "branch"), [clubs]);
  const eventMentionQuery = getMentionQuery(eventCommentText);

  useEffect(() => {
    setEvent(allEvents.find((item) => item.id === id));
    if (!id || !authUser) return;
    let active = true;
    const imported = allEvents.find((item) => item.id === id);
    void Api.getEvent(id)
      .then((value) => { if (active) setEvent({ ...imported, ...value, description: value.description?.trim() || imported?.description || "", image: value.image || imported?.image || "", tabelogUrl: value.tabelogUrl || imported?.tabelogUrl, googleMapsUrl: value.googleMapsUrl || imported?.googleMapsUrl, organizerProfileId: imported?.organizerProfileId || value.organizerProfileId, organizerName: imported?.organizerName || value.organizerName, organizerAvatar: imported?.organizerAvatar || value.organizerAvatar, organizerRank: imported?.organizerRank || value.organizerRank } as Event); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [allEvents, authUser, id]);

  useEffect(() => { void Api.getMemberDirectory().then(setMemberDirectory).catch(() => setMemberDirectory([])); }, []);

  useEffect(() => {
    if (!event || showAdminEdit) return;
    setAdminTitle(event.title); setAdminDescription(event.description); setAdminParticipants((event.participants ?? []).join("\n"));
    setAdminDate(event.date); setAdminTime(event.time); setAdminLocation(event.location); setAdminCapacity(String(event.capacity));
    setAdminReservationCapacity(String(event.reservationCapacity ?? event.capacity)); setAdminPrice(event.price ?? "");
    setAdminDeadline(event.applicationDeadline ?? ""); setAdminCancellationPolicy(event.cancellationPolicy ?? "");
    setAdminTabelogUrl(event.tabelogUrl ?? ""); setAdminGoogleMapsUrl(event.googleMapsUrl ?? "");
  }, [event, showAdminEdit]);

  useEffect(() => {
    if (!event) return;
    const viewerId = event.viewerMemberId ?? authenticatedViewerMemberId;
    const status = event.viewerParticipationStatus;
    setIsJoined(status ? status === "confirmed" || status === "cancel_requested" : event.participants.includes(viewerId));
    setHasApplied(status ? status === "applied" || status === "confirmed" || status === "cancel_requested" : Boolean(event.applicantIds?.includes(viewerId)));
    if (!event.viewerMemberId || !event.chatId) return;
    if (event.isOrganizer || status === "confirmed" || status === "cancel_requested") {
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
  useEffect(() => { if (!id) return; void AsyncStorage.getItem(`irotas_event_comments_v1:${id}`).then((raw) => setEventComments(raw ? JSON.parse(raw) : [])).catch(() => setEventComments([])); }, [id]);

  if (!event) {
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
  const getRankPrice = (evt: Event): string => {
    if (!evt.rankPrices) return evt.price;
    const rank = (authUser?.memberRank ?? CURRENT_USER.rank) as "regular" | "silver" | "gold" | "platinum";
    return evt.rankPrices[rank] ?? evt.price;
  };
  const effectivePrice = getRankPrice(event);
  const hasRankPrices = !!event.rankPrices;

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
  const confirmedIds = [...new Set([...(event.participants ?? []), ...(event.companionIds ?? [])])];
  const confirmedDisplayIds = event.createdBy
    ? [event.createdBy, ...confirmedIds.filter((memberId) => memberId !== event.createdBy)]
    : confirmedIds;
  const applicantCount = event.applicantIds?.length ?? event.attendees;
  const organizer = getMemberById(event.createdBy);
  const viewerMemberId = event.viewerMemberId ?? authenticatedViewerMemberId;
  const isOrganizer = event.isOrganizer ?? event.createdBy === viewerMemberId;
  const pendingApplicantIds = getPendingGourmetApplicants(event);
  const pendingCancellationRequests = getPendingCancellationRequests(event);
  const hasPendingCancellationRequest = pendingCancellationRequests.some((request) => request.memberId === viewerMemberId);
  const requiresOrganizerApproval = true;
  const canAdminEdit = isAdminRole(authUser?.role, authUser?.accessRole);
  const canManageEvent = canAdminEdit || isOrganizer;
  const showApplicationConfirmation = (title: string, message: string, buttons: AlertButton[]) => setApplicationConfirmation({ title, message, buttons });

  const handleEventComment = () => {
    const content = eventCommentText.trim();
    if (!content) return;
    const next = [...eventComments, { id: `ec_${Date.now()}`, author: authUser?.name ?? CURRENT_USER.name, text: content, createdAt: new Date().toISOString() }];
    setEventComments(next);
    setEventCommentText("");
    void AsyncStorage.setItem(`irotas_event_comments_v1:${event.id}`, JSON.stringify(next));
    const preview = content.length > 50 ? `${content.slice(0, 50)}...` : content;
    for (const memberId of getMentionedMemberIds(content, MEMBERS, eventMentionGroups).filter((targetId) => targetId !== viewerMemberId)) {
      const member = getMemberById(memberId);
      if (member) void sendMentionNotification(member.name, authUser?.name ?? CURRENT_USER.name, event.title, preview);
    }
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

  const approveApplicant = (memberId: string) => {
    const member = getMemberById(memberId);
    Alert.alert("参加申込を承認", `${member?.name ?? "メンバー"}さんの参加を確定しますか？`, [
      { text: "キャンセル", style: "cancel" },
      { text: "承認する", onPress: async () => {
        if (event.viewerMemberId) {
          try {
            const updated = await Api.reviewEventApplicant(event.id, memberId, "approve");
            if (updated.chatId) {
              joinEventChat(updated.id, updated.title, updated.chatId, updated.createdBy);
              joinEventChat(updated.id, updated.title, updated.chatId, memberId);
            }
            setEvent(updated);
            Alert.alert("承認完了", `${member?.name ?? "メンバー"}さんの参加を確定し、参加者専用チャットへ追加しました。`);
          } catch (error) {
            Alert.alert("承認できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
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
      } },
    ]);
  };

  const handleFinalizeParticipants = () => {
    if (pendingApplicantIds.length > 0) {
      Alert.alert("承認待ちがあります", "すべての申込を確認してから参加者確定を完了してください。");
      return;
    }
    Alert.alert("参加者を確定", "現在の参加確定者で専用チャットを作成し、参加者へ通知しますか？", [
      { text: "戻る", style: "cancel" },
      { text: "確定する", onPress: async () => {
        if (event.viewerMemberId) {
          try {
            const updated = await Api.finalizeEventParticipants(event.id);
            setEvent(updated);
            if (updated.chatId) {
              const room = joinEventChat(updated.id, updated.title, updated.chatId, updated.createdBy);
              setChatRoomId(room.id);
            }
            Alert.alert("参加者を確定しました", "確定した参加者を専用チャットへ追加し、通知しました。");
          } catch (error) {
            Alert.alert("確定できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
          }
          return;
        }
        const room = joinEventChat(event.id, event.title, event.chatId, event.createdBy);
        event.chatId = room.id;
        for (const memberId of event.participants ?? []) {
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
        Alert.alert("参加者を確定しました", "確定した参加者を専用チャットへ追加し、通知しました。");
      } },
    ]);
  };

  const handleCancelEvent = () => {
    Alert.alert("事前連絡の確認", "参加確定者に事前連絡を入れましたか？", [
      { text: "戻る", style: "cancel" },
      { text: "連絡済み", style: "destructive", onPress: () => Alert.alert("イベントを中止", "中止後、参加確定者チャットへキャンセル完了の連絡を自動投稿します。中止しますか？", [
        { text: "戻る", style: "cancel" },
        { text: "中止する", style: "destructive", onPress: async () => {
          try {
            await Api.cancelEvent(event.id, true);
            Alert.alert("イベントを中止しました", "参加確定者チャットへキャンセル完了の連絡を投稿しました。", [{ text: "OK", onPress: () => router.replace("/events") }]);
          } catch (error) {
            Alert.alert("中止できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
          }
        } },
      ]) },
    ]);
  };

  const cancelGourmetParticipant = (memberId: string) => {
    const member = getMemberById(memberId);
    Alert.alert("参加をキャンセル", `${member?.name ?? "メンバー"}さんの参加を幹事側でキャンセルしますか？`, [
      { text: "戻る", style: "cancel" },
      { text: "キャンセルする", style: "destructive", onPress: async () => {
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
        if (event.chatId) await removeMemberFromRoom(event.chatId, memberId);
        setEventRevision((value) => value + 1);
        Alert.alert("キャンセル完了", "必要に応じて「追加募集を開始」から募集を再開できます。");
      } },
    ]);
  };

  const handleReopenGourmetRecruitment = () => {
    if (!reopenGourmetRecruitment(event)) {
      Alert.alert("追加募集できません", "現在、募集定員に達しています。");
      return;
    }
    setEventRevision((value) => value + 1);
    Alert.alert("追加募集を開始しました", "イベント一覧に「空席あり」として表示されます。");
  };

  const handleCancellationRequest = () => {
    if (!contactedOrganizer || !cancellationPolicyConfirmed) {
      Alert.alert("確認が必要です", "幹事への事前連絡とキャンセルポリシーの確認にチェックしてください。");
      return;
    }
    Alert.alert("キャンセル申請", "幹事へキャンセル申請を送りますか？", [
      { text: "戻る", style: "cancel" },
      { text: "申請する", style: "destructive", onPress: async () => {
        if (event.viewerMemberId) {
          try {
            setEvent(await Api.requestEventCancellation(event.id, contactedOrganizer, cancellationPolicyConfirmed));
            Alert.alert("申請しました", "幹事にキャンセル申請を送りました。確定連絡をお待ちください。");
          } catch (error) {
            Alert.alert("申請できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
          }
          return;
        }
        submitEventCancellationRequest(event, CURRENT_USER.id);
        await notifyEventCancellationRequest(event, CURRENT_USER.id);
        setEventRevision((value) => value + 1);
        Alert.alert("申請しました", "幹事に通知しました。キャンセルの確定連絡をお待ちください。");
      } },
    ]);
  };

  const handleApproveCancellation = (memberId: string) => {
    const member = getMemberById(memberId);
    Alert.alert("キャンセルを承認", `${member?.name ?? "メンバー"}さんを参加者から外し、1枠を再募集しますか？`, [
      { text: "戻る", style: "cancel" },
      { text: "承認して再募集", onPress: async () => {
        if (event.viewerMemberId) {
          try {
            setEvent(await Api.reviewEventCancellation(event.id, memberId, "approve"));
            Alert.alert("再募集を開始しました", "キャンセル分の空席をイベント一覧へ反映しました。");
          } catch (error) {
            Alert.alert("承認できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
          }
          return;
        }
        approveEventCancellationRequest(event, memberId);
        if (event.chatId) await removeMemberFromRoom(event.chatId, memberId);
        setEventRevision((value) => value + 1);
        Alert.alert("再募集を開始しました", "キャンセル分の空席をイベント一覧へ反映しました。");
      } },
    ]);
  };

  const handleOpenChat = () => {
    if (chatRoomId) {
      router.push({ pathname: "/chat", params: { id: chatRoomId } });
    }
  };

  const openMemberProfile = (memberId: string) => {
    const discordAuthor = getDiscordAuthorById(memberId);
    router.push({ pathname: "/member-profile", params: { id: memberId, ...(discordAuthor ? { legacyName: discordAuthor.name } : {}) } });
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
              {eventEnded ? "開催終了" : event.status === "open" ? "受付中" : event.status === "full" ? "満席" : "終了"}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => { const favorite = event.isFavorite ?? favoriteEventIds.includes(event.id); if (event.viewerMemberId) { void Api.setEventFavorite(event.id, !favorite).then(() => setEvent({ ...event, isFavorite: !favorite })).catch((error) => Alert.alert("更新できませんでした", error instanceof Error ? error.message : "もう一度お試しください。")); } else { void toggleEventFavoriteWithNotifications(event, CURRENT_USER.id); } if (!favorite) void recordActivityEvent({ userId: CURRENT_USER.id, eventName: "event_favorited", entityType: "event", entityId: event.id }); }} accessibilityLabel={(event.isFavorite ?? favoriteEventIds.includes(event.id)) ? "お気に入りから削除" : "お気に入りに追加"} style={{ position: "absolute", top: 56, right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name={(event.isFavorite ?? favoriteEventIds.includes(event.id)) ? "heart.fill" : "heart"} size={20} color={(event.isFavorite ?? favoriteEventIds.includes(event.id)) ? "#F59AB9" : "#FFF"} />
        </Pressable>
        <Pressable onPress={() => { void Clipboard.setStringAsync(`https://irotas-app-20260721.k1998915n.chatgpt.site/event-detail?id=${encodeURIComponent(event.id)}`).finally(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2200); }); }} accessibilityLabel="イベントリンクをコピー" style={{ position: "absolute", top: 100, right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name="square.and.arrow.up" size={19} color="#FFF" />
        </Pressable>
        {linkCopied ? <View style={{ position: "absolute", top: 146, right: 16, borderRadius: 10, backgroundColor: "rgba(25,25,28,0.92)", paddingHorizontal: 12, paddingVertical: 9 }}><Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>リンクをコピーしました</Text></View> : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 236 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <EventImage event={event} style={{ width: "100%", height: 250, borderRadius: 16, marginBottom: 16 }} />
        {/* Title */}
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 12 }}>
          {event.title}
        </Text>
        {event.restaurantName && event.restaurantName !== event.title ? (
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.muted, marginTop: -5, marginBottom: 12 }}>
            {event.restaurantName}
          </Text>
        ) : null}

        {/* 参加済みチャットバナー */}
        {isJoined && chatRoomId && (
          <Pressable
            onPress={handleOpenChat}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#34C75915",
              borderRadius: 14,
              padding: 14,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: "#34C75930",
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "#34C75920",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <IconSymbol name="message.fill" size={18} color="#34C759" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#34C759" }}>
                参加者専用チャット
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                タップしてチャットを開く →
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color="#34C759" />
          </Pressable>
        )}

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
                募集人数（幹事除く） {event.capacity}人
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
          {[{ label: "現在の参加申込", value: applicantCount, color: "#5B9BD5" }, { label: "募集定員", value: event.capacity, color: "#E8A0BF" }, { label: "参加確定", value: confirmedIds.length, color: "#34C759" }].map((item) => (
            <View key={item.label} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12, alignItems: "center", borderTopWidth: 3, borderTopColor: item.color }}>
              <Text style={{ fontSize: 10, color: colors.muted, textAlign: "center" }}>{item.label}</Text>
              <Text style={{ fontSize: 22, fontWeight: "900", color: item.color, marginTop: 3 }}>{item.value}<Text style={{ fontSize: 11 }}>人</Text></Text>
            </View>
          ))}
        </View>

        <Pressable onPress={() => openMemberProfile(event.organizerProfileId ?? event.createdBy)} accessibilityLabel="幹事のプロフィールを表示" style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <Image source={event.eventType === "official" ? DEFAULT_AVATAR : (event.organizerAvatar ?? organizer?.avatar ?? DEFAULT_AVATAR)} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
          <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 11, color: colors.muted }}>幹事</Text><View style={{ flexDirection: "row", alignItems: "center" }}><Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{event.eventType === "official" ? "IRO＋運営" : stripRankFromName(event.organizerName ?? organizer?.name ?? "メンバー")}</Text>{event.eventType !== "official" && event.organizerRank ? <MemberRankBadge rank={event.organizerRank} name={event.organizerName} compact /> : null}<MemberRoleBadge name={event.organizerName} role={event.eventType === "official" ? "operator" : undefined} compact /></View></View>
          <IconSymbol name="chevron.right" size={17} color={colors.muted} />
        </Pressable>

        {canManageEvent ? <Pressable onPress={() => { setAdminTitle(event.title); setAdminDescription(event.description); setAdminParticipants((event.participants ?? []).join("\n")); setShowAdminEdit(true); }} style={{ marginBottom: 16, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: "#B42318" }}><Text style={{ color: "#FFF", fontSize: 14, fontWeight: "900" }}>{canAdminEdit ? "管理者：イベント情報を編集" : "イベント情報を編集"}</Text></Pressable> : null}

        {isOrganizer ? (
          <View style={{ backgroundColor: "#F5F8FC", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#DCE7F2" }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>幹事メニュー</Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 }}>申込を承認すると参加が確定し、自動で参加者チャットに追加されます。</Text>
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 14, marginBottom: 7 }}>承認待ち（{pendingApplicantIds.length}人）</Text>
            {pendingApplicantIds.length ? pendingApplicantIds.map((memberId) => {
              const member = getMemberById(memberId);
              return <View key={memberId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}><Pressable onPress={() => openMemberProfile(memberId)} style={{ flex: 1, flexDirection: "row", alignItems: "center" }}><Image source={member?.avatar ?? DEFAULT_AVATAR} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" /><Text style={{ flex: 1, marginLeft: 9, fontSize: 14, fontWeight: "700", color: colors.foreground }}>{member?.name ?? "メンバー"}</Text></Pressable><Pressable onPress={() => approveApplicant(memberId)} style={{ borderRadius: 9, backgroundColor: "#34C759", paddingHorizontal: 12, paddingVertical: 7 }}><Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>承認</Text></Pressable></View>;
            }) : <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 8 }}>現在、承認待ちの申込はありません。</Text>}

            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 14, marginBottom: 7 }}>キャンセル申請（{pendingCancellationRequests.length}件）</Text>
            {pendingCancellationRequests.length ? pendingCancellationRequests.map((request) => { const member = getMemberById(request.memberId); return <View key={request.memberId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}><Pressable onPress={() => openMemberProfile(request.memberId)} style={{ flex: 1, flexDirection: "row", alignItems: "center" }}><Image source={member?.avatar ?? DEFAULT_AVATAR} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" /><View style={{ flex: 1, marginLeft: 9 }}><Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{member?.name ?? "メンバー"}</Text><Text style={{ fontSize: 10, color: colors.muted }}>事前連絡・ポリシー確認済み</Text></View></Pressable><Pressable onPress={() => handleApproveCancellation(request.memberId)} style={{ borderRadius: 9, backgroundColor: "#D94C55", paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>承認・再募集</Text></Pressable></View>; }) : <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 8 }}>現在、キャンセル申請はありません。</Text>}

            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 14, marginBottom: 7 }}>参加確定者</Text>
            {(event.participants ?? []).map((memberId) => {
              const member = getMemberById(memberId);
              return <View key={memberId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}><Pressable onPress={() => openMemberProfile(memberId)} style={{ flex: 1, flexDirection: "row", alignItems: "center" }}><Image source={member?.avatar ?? DEFAULT_AVATAR} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" /><Text style={{ flex: 1, marginLeft: 9, fontSize: 14, fontWeight: "700", color: colors.foreground }}>{member?.name ?? "メンバー"}</Text></Pressable>{memberId !== event.createdBy ? <Pressable onPress={() => cancelGourmetParticipant(memberId)} style={{ borderRadius: 9, borderWidth: 1, borderColor: colors.error, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: colors.error, fontSize: 11, fontWeight: "800" }}>幹事キャンセル</Text></Pressable> : null}</View>;
            })}
            {event.status !== "open" && (event.participants ?? []).length < event.capacity ? <Pressable onPress={handleReopenGourmetRecruitment} style={{ marginTop: 12, borderRadius: 11, backgroundColor: "#E8A0BF", paddingVertical: 11, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#FFF" }}>追加募集を開始</Text></Pressable> : null}
            <Pressable disabled={Boolean(event.participantsFinalizedAt)} onPress={handleFinalizeParticipants} style={{ marginTop: 12, borderRadius: 11, backgroundColor: event.participantsFinalizedAt ? "#93C9A0" : "#34A853", paddingVertical: 11, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#FFF" }}>{event.participantsFinalizedAt ? "参加者確定済み" : "参加者確定を完了"}</Text></Pressable>
            <Pressable onPress={handleCancelEvent} style={{ marginTop: 10, borderRadius: 11, borderWidth: 1, borderColor: "#D94C55", paddingVertical: 11, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#D94C55" }}>イベントを中止</Text></Pressable>
          </View>
        ) : null}

        {canManageEvent && !isOrganizer ? <Pressable onPress={handleCancelEvent} style={{ marginTop: -6, marginBottom: 16, borderRadius: 11, borderWidth: 1, borderColor: "#D94C55", paddingVertical: 11, alignItems: "center" }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#D94C55" }}>イベントを中止</Text></Pressable> : null}

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
          {!isOfficialEvent && priceNum > 0 && (
            <Text style={{ marginTop: 12, fontSize: 12, color: colors.muted }}>
              イロタスポイントは公式イベントの参加費にのみ利用できます。
            </Text>
          )}
        </View>

        {/* Description */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
            イベント詳細
          </Text>
          <MentionText content={event.description} groups={eventMentionGroups} onMentionPress={(label) => { const normalized = stripRankFromName(label); const target = memberDirectory.find((member) => stripRankFromName(member.displayName) === normalized) ?? MEMBERS.find((member) => stripRankFromName(member.name) === normalized) ?? getDiscordAuthorByName(normalized); if (target) openMemberProfile(target.id); }} />
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

        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}><Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>イベントへのコメント</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>参加申込前でも閲覧・コメントできます。@で部活・支部をメンションできます。</Text>{eventComments.map((comment) => <View key={comment.id} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border }}><Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>{comment.author}</Text><MentionText content={comment.text} groups={eventMentionGroups} /></View>)}{eventMentionQuery !== null ? <MentionSuggestions query={eventMentionQuery} groups={eventMentionGroups} members={[]} onSelect={(label) => setEventCommentText((value) => insertMention(value, label))} /> : null}<View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 14 }}><TextInput value={eventCommentText} onChangeText={(value) => setEventCommentText(value.replace(/@everyone\b/gi, ""))} onFocus={() => setEventCommentFocused(true)} onBlur={() => setEventCommentFocused(false)} placeholder="質問やコメントを入力" placeholderTextColor={colors.muted} multiline style={{ flex: 1, minHeight: 44, maxHeight: 100, borderRadius: 14, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }} /><Pressable disabled={!eventCommentText.trim()} onPress={handleEventComment} style={{ width: 44, height: 44, borderRadius: 22, marginLeft: 8, alignItems: "center", justifyContent: "center", backgroundColor: eventCommentText.trim() ? "#D65E8D" : colors.border }}><IconSymbol name="paperplane.fill" size={19} color="#FFF" /></Pressable></View></View>

        {isJoined && !isOrganizer ? (
          <View style={{ backgroundColor: "#FFF4F2", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#F3D0CA" }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.error }}>イベントをキャンセルする場合</Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.foreground, marginTop: 5 }}>先に参加者チャットで幹事へ連絡してから申請してください。幹事の承認後、空席が再募集されます。</Text>
            {[{ label: "事前に幹事へ連絡しました", value: contactedOrganizer, set: setContactedOrganizer }, { label: "キャンセルポリシーを確認しました", value: cancellationPolicyConfirmed, set: setCancellationPolicyConfirmed }].map((item) => <Pressable key={item.label} onPress={() => item.set(!item.value)} style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: item.value ? "#D94C55" : colors.surface, borderWidth: 1, borderColor: item.value ? "#D94C55" : colors.border, alignItems: "center", justifyContent: "center" }}>{item.value ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "700", color: colors.foreground }}>{item.label}</Text></Pressable>)}
            <Pressable disabled={hasPendingCancellationRequest || !contactedOrganizer || !cancellationPolicyConfirmed} onPress={handleCancellationRequest} style={{ marginTop: 12, borderRadius: 11, paddingVertical: 11, alignItems: "center", backgroundColor: hasPendingCancellationRequest ? "#B8B8BD" : "#D94C55", opacity: !hasPendingCancellationRequest && (!contactedOrganizer || !cancellationPolicyConfirmed) ? 0.45 : 1 }}><Text style={{ color: "#FFF", fontSize: 14, fontWeight: "900" }}>{hasPendingCancellationRequest ? "キャンセル申請中" : "キャンセル申請する"}</Text></Pressable>
          </View>
        ) : null}

        {!isJoined && !hasApplied && !isOrganizer && event.status === "open" ? (
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
        {confirmedIds.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
              参加確定者 ({confirmedIds.length}人)
            </Text>
            <View style={{ borderRadius: 14, backgroundColor: colors.surface, overflow: "hidden" }}>
              {confirmedDisplayIds.map((uid) => {
                const directoryMember = memberDirectory.find((item) => item.id === uid);
                const member = getMemberById(uid);
                const discordAuthor = getDiscordAuthorById(uid);
                const memberName = directoryMember?.displayName ?? member?.name ?? discordAuthor?.name ?? "メンバー";
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
                      borderTopWidth: uid === confirmedDisplayIds[0] ? 0 : 0.5,
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
                      <MemberRankBadge rank={memberRank} name={memberName} compact />
                      <MemberRoleBadge name={memberName} compact />
                      {uid === event.createdBy ? <View style={{ marginLeft: 6, borderRadius: 8, backgroundColor: "#D93636", paddingHorizontal: 7, paddingVertical: 3 }}><Text style={{ fontSize: 10, fontWeight: "900", color: "#FFF" }}>幹事</Text></View> : null}
                    </View>
                    <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
      <PersistentBottomNav active="/events" />

      <Modal visible={showAdminEdit} transparent animationType="slide" onRequestClose={() => setShowAdminEdit(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(20,18,24,0.5)" }}>
          <View style={{ maxHeight: "90%", borderRadius: 20, backgroundColor: colors.background, overflow: "hidden" }}>
            <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground }}>イベント情報を編集</Text>
              {[
                ["タイトル", adminTitle, setAdminTitle], ["開催日（YYYY-MM-DD）", adminDate, setAdminDate], ["開始時刻（HH:MM）", adminTime, setAdminTime], ["場所", adminLocation, setAdminLocation],
                ["募集人数（幹事除く）", adminCapacity, setAdminCapacity], ["予約人数", adminReservationCapacity, setAdminReservationCapacity], [event.eventType === "gourmet" || event.eventType === "club" ? "予算" : "参加費", adminPrice, setAdminPrice],
                ["募集締切（YYYY-MM-DD）", adminDeadline, setAdminDeadline], ["食べログURL", adminTabelogUrl, setAdminTabelogUrl], ["GoogleマップURL", adminGoogleMapsUrl, setAdminGoogleMapsUrl], ["キャンセルポリシー", adminCancellationPolicy, setAdminCancellationPolicy],
              ].map(([label, value, setter]) => <View key={String(label)}><Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>{String(label)}</Text><TextInput value={String(value)} onChangeText={setter as (value: string) => void} multiline={String(label) === "キャンセルポリシー"} style={{ marginTop: 5, minHeight: String(label) === "キャンセルポリシー" ? 70 : undefined, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, color: colors.foreground, textAlignVertical: "top" }} /></View>)}
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>詳細</Text><TextInput value={adminDescription} onChangeText={setAdminDescription} multiline style={{ marginTop: 5, minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, color: colors.foreground, textAlignVertical: "top" }} />
              <Text style={{ marginTop: 12, fontSize: 12, fontWeight: "800", color: colors.muted }}>参加確定者（名前またはIDで検索）</Text>
              <TextInput value={participantSearch} onChangeText={setParticipantSearch} placeholder="名前またはIDを入力" placeholderTextColor={colors.muted} style={{ marginTop: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, color: colors.foreground }} />
              {participantSearch.trim() ? memberDirectory.filter((member) => `${member.id} ${member.displayName}`.toLowerCase().includes(participantSearch.trim().toLowerCase())).slice(0, 8).map((member) => <Pressable key={member.id} onPress={() => { const ids = adminParticipants.split(/[\n,、]/).map((value) => value.trim()).filter(Boolean); if (!ids.includes(member.id)) setAdminParticipants([...ids, member.id].join("\n")); setParticipantSearch(""); }} style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ fontSize: 13, color: colors.foreground }}>{member.displayName}　{member.memberTerm ?? ""}</Text></Pressable>) : null}
              <TextInput value={adminParticipants} onChangeText={setAdminParticipants} multiline placeholder="参加確定者ID（1行に1人）" placeholderTextColor={colors.muted} style={{ marginTop: 7, minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, color: colors.foreground, textAlignVertical: "top" }} />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}><Pressable onPress={() => setShowAdminEdit(false)} style={{ flex: 1, paddingVertical: 13, alignItems: "center", borderRadius: 11, backgroundColor: colors.surface }}><Text style={{ fontWeight: "800", color: colors.foreground }}>キャンセル</Text></Pressable><Pressable onPress={async () => { try { const updated = await Api.updateEventDetails(event.id, { title: adminTitle.trim(), description: adminDescription.trim(), participants: adminParticipants.split(/[\n,、]/).map((value) => value.trim()).filter(Boolean), date: adminDate.trim(), time: adminTime.trim(), location: adminLocation.trim(), capacity: Number(adminCapacity), reservationCapacity: Number(adminReservationCapacity), price: adminPrice.trim(), applicationDeadline: adminDeadline.trim(), cancellationPolicy: adminCancellationPolicy.trim(), tabelogUrl: adminTabelogUrl.trim(), googleMapsUrl: adminGoogleMapsUrl.trim() }); setEvent(updated); setShowAdminEdit(false); Alert.alert("更新しました"); } catch (error) { Alert.alert("更新できませんでした", error instanceof Error ? error.message : "もう一度お試しください。"); } }} style={{ flex: 1, paddingVertical: 13, alignItems: "center", borderRadius: 11, backgroundColor: "#B42318" }}><Text style={{ fontWeight: "900", color: "#FFF" }}>保存</Text></Pressable></View>
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
              <Text style={{ textAlign: "center", fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 8 }}>{applicationConfirmation?.message.split("\n").slice(1).join("\n")}</Text>
              {isOfficialEvent && priceNum > 0 && irotasPoints > 0 ? <View style={{ marginTop: 18, borderRadius: 16, padding: 14, backgroundColor: "#FFF7E8", borderWidth: 1, borderColor: "#F4D89D" }}><View style={{ flexDirection: "row", alignItems: "center" }}><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "900", color: "#A56712" }}>イロタスポイントを使う</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>保有 {irotasPoints.toLocaleString()}pt</Text></View><Switch value={usePoints} onValueChange={(value) => { usePointsRef.current = value; setUsePoints(value); }} trackColor={{ false: colors.border, true: "#FF9500" }} thumbColor="#FFF" /></View>{usePoints ? <Text style={{ marginTop: 10, fontSize: 13, fontWeight: "900", color: "#2E8B57" }}>{pointsToUse.toLocaleString()}pt利用 → お支払い {finalPrice.toLocaleString()}円</Text> : null}</View> : null}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>{applicationConfirmation?.buttons.map((button) => { const cancel = button.style === "cancel"; return <Pressable key={button.text} onPress={() => { setApplicationConfirmation(null); if (!cancel) button.onPress?.(); }} style={{ flex: 1, minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: cancel ? colors.surface : isOfficialEvent ? "#D65E8D" : "#5B9BD5", borderWidth: cancel ? 1 : 0, borderColor: colors.border }}><Text style={{ fontSize: 15, fontWeight: "900", color: cancel ? colors.foreground : "#FFF" }}>{button.text}</Text></Pressable>; })}</View>
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
        {isJoined && chatRoomId && (
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

        {/* 参加ボタン */}
        <Pressable
          disabled={isJoined || hasApplied || isOrganizer || event.status !== "open" || (requiresOrganizerApproval && !termsAccepted)}
          onPress={isJoined || hasApplied || isOrganizer || event.status !== "open" || (requiresOrganizerApproval && !termsAccepted) ? undefined : handleJoin}
          style={({ pressed }) => ({
            backgroundColor: isJoined
              ? "#34C759"
              : hasApplied
              ? "#5B9BD5"
              : event.status !== "open"
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
            {isOrganizer ? "幹事メニューで申込を管理" : isJoined ? "✓ 参加確定" : hasApplied ? "✓ 申込済み（幹事の承認待ち）" : event.status !== "open" ? "募集終了" : requiresOrganizerApproval && !termsAccepted ? "規約に同意して申し込む" : event.selectionMethod === "lottery" ? "抽選に申し込む" : "参加を申し込む"}
          </Text>
        </Pressable>
      </View> : null}
    </View>
  );
}
