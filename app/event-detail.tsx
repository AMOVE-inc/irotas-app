import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { EVENTS, CURRENT_USER, DEFAULT_AVATAR, getMemberById, type Event } from "@/constants/mock-data";
import { EVENT_TERMS_URL } from "@/constants/external-links";
import { joinEventChat, removeMemberFromRoom } from "@/lib/chat-store";
import { getAllEvents } from "@/lib/event-store";
import { approveGourmetApplication, cancelGourmetParticipation, getPendingGourmetApplicants, reopenGourmetRecruitment, submitGourmetApplication } from "@/lib/gourmet-event";
import { getIrotasPoints, adjustIrotasPoints } from "@/lib/irotas-points-store";
import { createPaymentRecord } from "@/lib/payment-store";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar-links";
import { toggleEventFavorite, useEventFavorites } from "@/lib/event-favorites-store";
import { cancelOrganizerDeadlineNotifications, notifyEventCancellationRequest, notifyEventConfirmation, scheduleEventReminders } from "@/lib/notifications";
import { approveEventCancellationRequest, getPendingCancellationRequests, submitEventCancellationRequest } from "@/lib/event-cancellation";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { useClubs } from "@/lib/club-store";
import { canViewClubEvent } from "@/lib/access-control";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";

export default function EventDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: authUser } = useAuthContext();
  const clubs = useClubs();

  // モックデータ + 動的追加分から検索
  const allEvents = getAllEvents(EVENTS);
  const event = allEvents.find((e) => e.id === id);

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
  const [, setEventRevision] = useState(0);
  // ボタン連打防止フラグ
  const joiningRef = useRef(false);
  const favoriteEventIds = useEventFavorites();

  useEffect(() => {
    getIrotasPoints(CURRENT_USER.id).then(setIrotasPoints);
  }, []);

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
  if (event.eventType === "club" && !canViewClubEvent(authUser?.role, CURRENT_USER.id, eventClub?.memberIds ?? [])) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]}><View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}><IconSymbol name="lock.fill" size={44} color={colors.muted} /><Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground, marginTop: 15 }}>部員限定イベントです</Text><Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: "center", marginTop: 7 }}>{eventClub?.name ?? "この部活"}に入部すると、イベント詳細の確認と参加申込ができます。</Text><Pressable onPress={() => router.replace("/clubs")} style={{ marginTop: 20, borderRadius: 14, backgroundColor: colors.foreground, paddingHorizontal: 20, paddingVertical: 12 }}><Text style={{ color: colors.background, fontWeight: "900" }}>部活一覧を見る</Text></Pressable></View></ScreenContainer>;
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
    const rank = CURRENT_USER.rank as "regular" | "silver" | "gold" | "platinum";
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
  const pointsToUse = usePoints ? Math.min(irotasPoints, priceNum) : 0;
  const finalPrice = Math.max(0, priceNum - pointsToUse);
  const confirmedIds = [...new Set([...(event.participants ?? []), ...(event.companionIds ?? [])])];
  const applicantCount = event.applicantIds?.length ?? event.attendees;
  const organizer = getMemberById(event.createdBy);
  const isOrganizer = event.createdBy === CURRENT_USER.id;
  const pendingApplicantIds = getPendingGourmetApplicants(event);
  const pendingCancellationRequests = getPendingCancellationRequests(event);
  const hasPendingCancellationRequest = pendingCancellationRequests.some((request) => request.memberId === CURRENT_USER.id);
  const requiresOrganizerApproval = event.eventType === "gourmet" || event.eventType === "club";

  const handleJoin = () => {
    if (event.status === "full") {
      Alert.alert("満席", "このイベントは満席です");
      return;
    }
    // 連打防止: 既に処理中の場合はスキップ
    if (joiningRef.current) return;
    if (requiresOrganizerApproval && !termsAccepted) {
      Alert.alert("規約への同意が必要です", "イベント参加規約を確認し、同意にチェックしてください。");
      return;
    }

    const priceLabel = priceNum === 0
      ? "無料"
      : usePoints && pointsToUse > 0
        ? `${finalPrice.toLocaleString()}円（${pointsToUse}pt割引適用）`
        : effectivePrice;
    Alert.alert(
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
            try {
              const applicants = event.applicantIds ?? [...(event.participants ?? [])];
              if (requiresOrganizerApproval) submitGourmetApplication(event, CURRENT_USER.id);
              else {
                if (!applicants.includes(CURRENT_USER.id)) applicants.push(CURRENT_USER.id);
                event.applicantIds = applicants;
                event.attendees = applicants.length;
              }
              setHasApplied(true);

              if (requiresOrganizerApproval) {
                Alert.alert("申込完了", "幹事へ参加申込を送りました。承認後、参加者チャットへ入れるようになります。");
                return;
              }

              if (event.selectionMethod === "lottery") {
                Alert.alert("申込完了", "抽選への申込を受け付けました。参加確定の連絡をお待ちください。");
                return;
              }

              // イロタスポイントを使用する場合は消費
              if (usePoints && pointsToUse > 0) {
                const newBalance = await adjustIrotasPoints(
                  CURRENT_USER.id,
                  CURRENT_USER.name,
                  -pointsToUse,
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

              // 支払いレコードを作成
              await createPaymentRecord({
                eventId: event.id,
                userId: CURRENT_USER.id,
                userName: CURRENT_USER.name,
                userRank: CURRENT_USER.rank,
                amount: finalPrice,
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

  const cancelGourmetParticipant = (memberId: string) => {
    const member = getMemberById(memberId);
    Alert.alert("参加をキャンセル", `${member?.name ?? "メンバー"}さんの参加を幹事側でキャンセルしますか？`, [
      { text: "戻る", style: "cancel" },
      { text: "キャンセルする", style: "destructive", onPress: async () => {
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
    router.push({ pathname: "/member-profile", params: { id: memberId } });
  };

  const handleOpenMap = () => {
    if (event.googleMapsUrl) { void Linking.openURL(event.googleMapsUrl); return; }
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
      {/* Header Image */}
      <View>
        <Image
          source={event.image}
          style={{ width: "100%", height: 250 }}
          contentFit="cover"
          transition={300}
        />
        <Pressable
          onPress={() => router.back()}
          style={{
            position: "absolute",
            top: 50,
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
        <View style={{ position: "absolute", top: 50, right: 16 }}>
          <View
            style={{
              backgroundColor:
                event.status === "open"
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
              {event.status === "open" ? "受付中" : event.status === "full" ? "満席" : "終了"}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => toggleEventFavorite(event.id)} accessibilityLabel={favoriteEventIds.includes(event.id) ? "お気に入りから削除" : "お気に入りに追加"} style={{ position: "absolute", top: 92, right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name={favoriteEventIds.includes(event.id) ? "heart.fill" : "heart"} size={20} color={favoriteEventIds.includes(event.id) ? "#F59AB9" : "#FFF"} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
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
            onPress={handleOpenMap}
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
              <Text style={{ fontSize: 13, color: "#A7C7E7" }}>タップして地図を開く ↗</Text>
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

        <Pressable onPress={() => openMemberProfile(event.createdBy)} accessibilityLabel="幹事のプロフィールを表示" style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <Image source={event.eventType === "official" ? DEFAULT_AVATAR : (organizer?.avatar ?? DEFAULT_AVATAR)} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
          <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 11, color: colors.muted }}>幹事</Text><Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{event.eventType === "official" ? "IRO＋運営" : (organizer?.name ?? "メンバー")}</Text></View>
          <IconSymbol name="chevron.right" size={17} color={colors.muted} />
        </Pressable>

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
          </View>
        ) : null}

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
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>参加費</Text>
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
          {priceNum > 0 && irotasPoints > 0 && !isJoined && (
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
                onValueChange={setUsePoints}
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
          <Text style={{ fontSize: 15, lineHeight: 24, color: colors.foreground }}>
            {event.description}
          </Text>
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

        {isJoined && !isOrganizer ? (
          <View style={{ backgroundColor: "#FFF4F2", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#F3D0CA" }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.error }}>イベントをキャンセルする場合</Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.foreground, marginTop: 5 }}>先に参加者チャットで幹事へ連絡してから申請してください。幹事の承認後、空席が再募集されます。</Text>
            {[{ label: "事前に幹事へ連絡しました", value: contactedOrganizer, set: setContactedOrganizer }, { label: "キャンセルポリシーを確認しました", value: cancellationPolicyConfirmed, set: setCancellationPolicyConfirmed }].map((item) => <Pressable key={item.label} onPress={() => item.set(!item.value)} style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}><View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: item.value ? "#D94C55" : colors.surface, borderWidth: 1, borderColor: item.value ? "#D94C55" : colors.border, alignItems: "center", justifyContent: "center" }}>{item.value ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "700", color: colors.foreground }}>{item.label}</Text></Pressable>)}
            <Pressable disabled={hasPendingCancellationRequest || !contactedOrganizer || !cancellationPolicyConfirmed} onPress={handleCancellationRequest} style={{ marginTop: 12, borderRadius: 11, paddingVertical: 11, alignItems: "center", backgroundColor: hasPendingCancellationRequest ? "#B8B8BD" : "#D94C55", opacity: !hasPendingCancellationRequest && (!contactedOrganizer || !cancellationPolicyConfirmed) ? 0.45 : 1 }}><Text style={{ color: "#FFF", fontSize: 14, fontWeight: "900" }}>{hasPendingCancellationRequest ? "キャンセル申請中" : "キャンセル申請する"}</Text></Pressable>
          </View>
        ) : null}

        {requiresOrganizerApproval && !isJoined && !hasApplied && !isOrganizer ? (
          <View style={{ backgroundColor: "#FFF8F0", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#EED9BF" }}>
            <Pressable onPress={() => setTermsAccepted((value) => !value)} style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: termsAccepted ? "#E8A0BF" : colors.surface, borderWidth: 1, borderColor: termsAccepted ? "#E8A0BF" : colors.border, alignItems: "center", justifyContent: "center" }}>{termsAccepted ? <IconSymbol name="checkmark" size={15} color="#FFF" /> : null}</View>
              <Text style={{ flex: 1, marginLeft: 9, fontSize: 14, fontWeight: "800", color: colors.foreground }}>イベント参加規約に同意する</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(EVENT_TERMS_URL)} style={{ marginLeft: 33, marginTop: 7 }}><Text style={{ fontSize: 13, color: "#5B9BD5", textDecorationLine: "underline" }}>イベント参加規約を確認する</Text></Pressable>
          </View>
        ) : null}

        {[{ url: event.tabelogUrl, label: "食べログを開く" }, { url: event.googleMapsUrl, label: "Googleマップを開く" }, { url: !event.tabelogUrl && !event.googleMapsUrl ? event.externalUrl : undefined, label: "店舗・イベントURLを開く" }].map((link) => link.url ? <Pressable key={link.label} onPress={() => Linking.openURL(link.url!)} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EAF5FA", borderRadius: 14, padding: 14, marginBottom: 10 }}><IconSymbol name="link" size={18} color="#5B9BD5" /><Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: "#5B9BD5", marginLeft: 8 }} numberOfLines={1}>{link.label}</Text><IconSymbol name="chevron.right" size={16} color="#5B9BD5" /></Pressable> : null)}

        {/* 参加確定者一覧 */}
        {confirmedIds.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
              参加確定者 ({confirmedIds.length}人)
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {confirmedIds.map((uid) => {
                const member = getMemberById(uid);
                return (
                  <Pressable
                    key={uid}
                    onPress={() => openMemberProfile(uid)}
                    accessibilityLabel={`${member?.name ?? "メンバー"}のプロフィールを表示`}
                    style={{
                      alignItems: "center",
                      width: 62,
                    }}
                  >
                    <Image
                      source={member?.avatar ?? DEFAULT_AVATAR}
                      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: uid === CURRENT_USER.id ? 2 : 0, borderColor: "#E8A0BF" }}
                      contentFit="cover"
                    />
                    <Text style={{ fontSize: 11, color: colors.foreground, marginTop: 5, textAlign: "center" }} numberOfLines={1}>{member?.name ?? "メンバー"}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
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
          onPress={isJoined || hasApplied || isOrganizer || (requiresOrganizerApproval && !termsAccepted) ? undefined : handleJoin}
          style={({ pressed }) => ({
            backgroundColor: isJoined
              ? "#34C759"
              : hasApplied
              ? "#5B9BD5"
              : event.status === "full"
              ? colors.muted
              : "#E8A0BF",
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            opacity: requiresOrganizerApproval && !termsAccepted && !hasApplied && !isJoined && !isOrganizer ? 0.45 : pressed && !isJoined && !hasApplied ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#FFF" }}>
            {isOrganizer ? "幹事メニューで申込を管理" : isJoined ? "✓ 参加確定" : hasApplied ? "✓ 申込済み（幹事の承認待ち）" : event.status === "full" ? "満席" : requiresOrganizerApproval && !termsAccepted ? "規約に同意して申し込む" : event.selectionMethod === "lottery" ? "抽選に申し込む" : "参加を申し込む"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
