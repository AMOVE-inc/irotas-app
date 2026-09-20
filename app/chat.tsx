import { ScreenContainer } from "@/components/screen-container";
import { ExpandableImage } from "@/components/expandable-image";
import { EventImage } from "@/components/event-image";
import { SaveableVideo } from "@/components/saveable-video";
import { ReplyReferenceView } from "@/components/reply-reference-view";
import { MemberClubLeaderBadges, MemberRankBadge, MemberRoleBadge, stripRankFromName } from "@/components/member-rank-badge";
import { NewMemberMark } from "@/components/new-member-mark";
import { MentionSuggestions, MentionText } from "@/components/mention-ui";
import { ContentLinkCards } from "@/components/content-link-cards";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CalendarField } from "@/components/calendar-field";
import {
  CURRENT_USER,
  DEFAULT_AVATAR,
  MEMBERS,
  CLUBS,
  BOARD_THREADS,
  getMemberById,
  type ChatMessage,
  type ChatRoom,
  type Event,
} from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { isAdminRole, isOperatorRole, canPostToChat } from "@/lib/access-control";
import { getAllRooms, getRoomById, getMessages, saveMessagesToStorage, deleteMessageFromStorage, loadMessagesFromStorage, loadDynamicRooms, markRoomRead, renameRoom, addMemberToRoom, removeMemberFromRoom, toggleMessageReaction } from "@/lib/chat-store";
import { markChatRoomOptimisticallyRead } from "@/lib/chat-unread-sync";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { dismissChatRoomImmediately, showSentChatPreviewImmediately } from "@/components/chat-list-screen";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  requestNotificationPermissions,
} from "@/lib/notifications";
import { canAccessChatRoom } from "@/lib/chat-access";
import { getFriends } from "@/lib/friendship";
import { getMentionGroups, getMentionQuery, insertMention } from "@/lib/mentions";
import { chatMentionMemberIds } from "@/lib/chat-mention-scope";
import { type TextSelection } from "@/lib/text-formatting";
import type { InternalLinkPathname } from "@/lib/internal-links";
import * as Api from "@/lib/_core/api";
import { getDiscordAuthorById, getDiscordAuthorByName } from "@/lib/discord-author-directory";
import { displayMemberName } from "@/lib/display-name";
import { displayEventTitle } from "@/lib/event-title";
import { discordEventConfirmedCount, discordEventDisplayCapacity } from "@/lib/discord-event-attendance";
import { getConfirmedRecruitParticipantCount } from "@/lib/event-participation";
import { isDiscordRecruitmentOpen } from "@/lib/event-recruitment-channel";
import { importedIntroductionReactions, isUnidentifiedReaction, mergedIntroductionReactions } from "@/lib/introduction-reactions";
import { replyReference } from "@/lib/reply-reference";
import { reconcileOptimisticReactions } from "@/lib/chat-reactions";
import { initialMessageIndex, normalizedUnreadCount } from "@/lib/unread-position";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😋", "🙏"] as const;
const MORE_REACTION_EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋", "😛", "🤪", "🤔", "🫡", "😎", "🥳", "😮", "😢", "😭", "😡", "👍", "👎", "👏", "🙌", "🙏", "💪", "👀", "❤️", "🩷", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🔥", "✨", "🎉", "💯", "✅", "❌", "💡", "📌", "🍽️", "🍣", "🍖", "🍜", "🍕", "🍰", "☕", "🍺", "🍷"] as const;
const RETIRED_ANNOUNCEMENT = "IRO+運営からのお知らせをお届けします。最新情報はこちらでご確認ください。";
const JAPAN_TIME_ZONE = "Asia/Tokyo";
const AUGUST_2026_JST_START = Date.parse("2026-07-31T15:00:00.000Z");
const SEPTEMBER_2026_JST_START = Date.parse("2026-08-31T15:00:00.000Z");
const isRetiredAnnouncement = (message: ChatMessage) => {
  if (message.chatId !== "board-announcement") return false;
  if (message.content === RETIRED_ANNOUNCEMENT) return true;
  const createdAt = Date.parse(message.createdAt);
  return Number.isFinite(createdAt)
    && createdAt >= AUGUST_2026_JST_START
    && createdAt < SEPTEMBER_2026_JST_START;
};
const formatJapanDate = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: JAPAN_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
}).format(new Date(value));
const formatJapanTime = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: JAPAN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
}).format(new Date(value));

function importedIntroductionMessages(archive: Awaited<ReturnType<typeof Api.getBoardArchive>>, currentReactions: Record<string, Record<string, string[]>> = {}): ChatMessage[] {
  const introductionThreads = archive.threads.filter((thread) => thread.category === "introduction");
  const introductionIds = new Set(introductionThreads.map((thread) => thread.id));
  const records = [...introductionThreads, ...archive.comments.filter((comment) => introductionIds.has(comment.threadId))];
  return records.map((record) => ({
    id: `discord-introduction-${record.id}`,
    chatId: "board-introduction",
    senderId: `discord-${record.authorId}`,
    externalMessageId: record.id,
    externalAuthorName: displayMemberName(record.authorName),
    senderAvatar: record.authorAvatarUrl ?? undefined,
    content: record.content,
    createdAt: record.createdAt,
    attachmentUrls: record.images,
    reactions: mergedIntroductionReactions(importedIntroductionReactions(record.id, record.reactions), currentReactions[record.id]),
  })).filter((message) => message.content.trim().length > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function systemMessageText(content: string): string {
  const text = content.replace(/^【IRO\+\s*システム】\s*/, "");
  const legacyWelcome = text.match(/^「(.+)」の参加者専用チャットへようこそ！$/);
  if (legacyWelcome) return `「${legacyWelcome[1]}」の参加者専用グループが作成されました`;
  const joined = text.match(/^(.+?)がチャットに参加しました$/);
  return joined ? `${stripRankFromName(joined[1])}がチャットに参加しました` : text;
}

function ChatAttachmentImage({ uri, galleryUris, galleryIndex }: { uri: string; galleryUris: string[]; galleryIndex: number }) {
  const [size, setSize] = useState({ width: 220, height: 180 });
  return <ExpandableImage
    source={{ uri }} uri={uri} galleryUris={galleryUris} galleryIndex={galleryIndex}
    style={{ width: size.width, height: size.height, backgroundColor: "rgba(0,0,0,0.05)" }}
    contentFit="contain"
    onLoad={({ source }) => {
      if (source.width > 0 && source.height > 0) {
        setSize({ width: 220, height: Math.min(360, Math.max(120, Math.round(220 * source.height / source.width))) });
      }
    }}
  />;
}

function isVideoAttachment(uri: string) {
  try { return /\.(?:mp4|mov|webm)(?:[?#]|$)/i.test(decodeURIComponent(uri)); }
  catch { return false; }
}

function ChatAttachmentVideo({ uri }: { uri: string }) {
  return <SaveableVideo uri={uri} style={{ width: 220, height: 300, maxWidth: "100%" }} />;
}

function EventChatCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const colors = useColors();
  const isPast = Date.parse(`${event.date}T23:59:59`) < Date.now();
  const status = isPast ? "終了" : event.status === "open" ? isDiscordRecruitmentOpen(event) ? "Discord受付" : "募集中" : "募集終了";
  const confirmed = discordEventConfirmedCount(event);
  const capacity = event.reservationCapacity ?? event.capacity + 1;
  const attendance = confirmed !== null
    ? `${confirmed}名/${discordEventDisplayCapacity(event)}名`
    : event.capacityMode ? null
      : `${Math.max(event.capacity - getConfirmedRecruitParticipantCount(event), 0)}名/${capacity}名`;
  return <Pressable
    accessibilityRole="link"
    accessibilityLabel={`${event.date} ${event.time} ${displayEventTitle(event.title)}の詳細を開く`}
    onPress={onPress}
    style={{ marginHorizontal: 16, marginBottom: 16, minHeight: 130, flexDirection: "row", borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}
  >
    <View style={{ width: 116, alignSelf: "stretch" }}>
      <EventImage event={event} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </View>
    <View style={{ flex: 1, paddingHorizontal: 11, paddingVertical: 10, justifyContent: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
        <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>
          {event.date.replace(/-/g, "/")} {event.time}
        </Text>
        <Text style={{ fontSize: 10, fontWeight: "800", color: status === "募集中" ? "#248A3D" : status === "Discord受付" ? "#604C8C" : colors.muted, backgroundColor: status === "募集中" ? "#E7F8ED" : status === "Discord受付" ? "#EFE9FA" : "#F0F0F2", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>{status}</Text>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "900", color: colors.foreground, marginTop: 6 }}>
        {displayEventTitle(event.title)}
      </Text>
      {event.restaurantName && event.restaurantName !== event.title ? <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "700", color: colors.foreground, marginTop: 5 }}>{event.restaurantName}</Text> : null}
      <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>{event.location}</Text>
      {attendance ? <Text style={{ fontSize: 11, fontWeight: "800", color: "#34A853", marginTop: 5 }}>{attendance}</Text> : null}
      <Text style={{ fontSize: 11, fontWeight: "800", color: "#2065B7", marginTop: 6 }}>イベント詳細を見る ›</Text>
    </View>
  </Pressable>;
}

function MessageBubble({ message, isMe, canDelete, readOnly, viewerId, viewerName, viewerAvatarUrl, myAvatarUri, senderMember, memberDirectory, onReact, mentionGroups, onOpenInternalLink, onOpenProfile, onOpenReactionProfile, onOpenReply, highlighted, onReply, onEdit, onDelete }: { message: ChatMessage; isMe: boolean; canDelete: boolean; readOnly?: boolean; viewerId: string; viewerName: string; viewerAvatarUrl?: string; myAvatarUri?: string | null; senderMember?: Api.PublicMember; memberDirectory: Api.PublicMember[]; onReact: (emoji: string, pollChoices?: string[], allowMultiple?: boolean) => void; mentionGroups: ReturnType<typeof getMentionGroups>; onOpenInternalLink: (pathname: InternalLinkPathname, params: Record<string, string>) => void; onOpenProfile: () => void; onOpenReactionProfile: (memberId: string, name: string, avatarUrl?: string) => void; onOpenReply: (messageId: string) => void; highlighted?: boolean; onReply: () => void; onEdit: () => void; onDelete: () => void }) {
  const colors = useColors();
  const sender = getMemberById(message.senderId);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showMoreReactions, setShowMoreReactions] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [reactionDetails, setReactionDetails] = useState<{ emoji: string; memberIds: string[] } | null>(null);
  const reactionLongPress = useRef(false);
  const pollLines = message.content.startsWith("📊 ") ? message.content.split("\n") : [];
  const pollChoices = pollLines.filter((line) => line.startsWith("◯ ")).map((line) => line.slice(2));
  const pollAllowsMultiple = pollLines.includes("🔢 複数回答可");
  const isSystemMessage = message.content.startsWith("【IRO+ システム】");

  if (isSystemMessage) {
    return (
      <View style={{ alignItems: "center", marginVertical: 10, paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted, textAlign: "center" }}>
          {systemMessageText(message.content)}
        </Text>
      </View>
    );
  }

  const formatTime = (dateStr: string) => {
    return formatJapanTime(dateStr);
  };

  // アバター画像の決定: 自分はプロフィール画像、他者はモックデータのアバター
  const isOfficialAccount = /IRO[+＋](?:運営|\s*サポート)/.test(message.externalAuthorName ?? sender?.name ?? "");
  const discordAuthor = getDiscordAuthorByName(message.externalAuthorName ?? sender?.name ?? "");
  const avatarSource = isOfficialAccount
    ? require("@/assets/images/irotas-logo-square.png")
    : isMe
    ? (myAvatarUri ? { uri: myAvatarUri } : (sender?.avatar ?? DEFAULT_AVATAR))
    : (discordAuthor?.avatarUrl ? { uri: discordAuthor.avatarUrl } : (message.senderAvatar ? { uri: message.senderAvatar } : (sender?.avatar ?? DEFAULT_AVATAR)));

  return (
    <View
      style={{
        flexDirection: isMe ? "row-reverse" : "row",
        alignItems: "flex-start",
        marginBottom: 10,
        paddingHorizontal: 16,
      }}
    >
      {/* 自分のアバターは表示せず、相手と公式システム通知だけに表示する。 */}
      {!isMe && avatarSource && (
        <Pressable onPress={onOpenProfile} accessibilityLabel={`${message.externalAuthorName ?? sender?.name ?? "メンバー"}のプロフィールを表示`}>
          <Image
            source={avatarSource}
            style={[
              { width: 28, height: 28, borderRadius: 14 },
              isMe ? { marginLeft: 8 } : { marginRight: 8 },
            ]}
            contentFit="cover"
          />
        </Pressable>
      )}
      <View style={{ maxWidth: "70%" }}>
        {!isMe && !isSystemMessage && (sender || message.externalAuthorName) ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2, marginLeft: 2 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>{stripRankFromName(senderMember?.displayName ?? message.externalAuthorName ?? sender?.name ?? "メンバー")}</Text>
            {sender ? <NewMemberMark member={sender} size={11} /> : null}
            <MemberRankBadge rank={(senderMember?.memberRank ?? sender?.rank ?? "regular") as any} name={senderMember?.displayName ?? message.externalAuthorName} role={senderMember?.accessRole} compact />
            <MemberRoleBadge name={senderMember?.displayName ?? message.externalAuthorName} role={senderMember?.accessRole ?? sender?.role} compact />
            <MemberClubLeaderBadges roles={senderMember?.discordRoles} compact />
          </View>
        ) : null}
        <Pressable onLongPress={() => setShowActions(true)} delayLongPress={350}
          style={{
            backgroundColor: isMe ? "#E8A0BF" : "#ECECEF",
            borderWidth: highlighted ? 3 : isMe ? 0 : 1,
            borderColor: highlighted ? "#3478C7" : isMe ? "transparent" : "#D4D4D8",
            borderRadius: 16,
            borderBottomRightRadius: isMe ? 4 : 16,
            // 相手の吹き出しはアイコン側（左上）から伸びるようにする。
            borderTopLeftRadius: isMe ? 16 : 4,
            borderBottomLeftRadius: 16,
            overflow: "hidden",
          }}
        >
          {message.replyTo ? <View style={{ paddingHorizontal: 10, paddingTop: 8 }}><ReplyReferenceView reply={message.replyTo} outgoing={isMe} onPress={() => onOpenReply(message.replyTo!.id)} /></View> : null}
          {message.imageUri || message.attachmentUrls?.length ? (
            <View style={{ gap: 4 }}>
              {(message.attachmentUrls?.length ? message.attachmentUrls : [message.imageUri!]).map((uri, index, gallery) => isVideoAttachment(uri)
                ? <ChatAttachmentVideo key={`${uri}-${index}`} uri={uri} />
                : <ChatAttachmentImage key={`${uri}-${index}`} uri={uri} galleryUris={gallery.filter((item) => !isVideoAttachment(item))} galleryIndex={gallery.slice(0, index).filter((item) => !isVideoAttachment(item)).length} />)}
            </View>
          ) : null}
          {message.content ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              {pollChoices.length >= 2 ? <View style={{ minWidth: 220 }}><MentionText content={pollLines[0].replace(/^📊 /, "")} outgoing={isMe} groups={mentionGroups} /><Text style={{ fontSize: 10, fontWeight: "800", color: isMe ? "#FFF" : colors.muted, marginTop: 5 }}>{pollAllowsMultiple ? "複数回答可" : "1つ選択"}</Text><View style={{ gap: 7, marginTop: 10 }}>{pollChoices.map((choice) => { const voteKey = `🗳️${choice}`; const voters = message.reactions?.[voteKey] ?? []; const selected = voters.includes(viewerId); return <Pressable key={choice} disabled={readOnly} onPress={() => onReact(voteKey, pollChoices, pollAllowsMultiple)} style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: selected ? "#5865F2" : isMe ? "#FFF8" : colors.border, backgroundColor: selected ? "#5865F228" : "transparent" }}><Text style={{ fontSize: 13, fontWeight: "800", color: isMe ? "#FFF" : colors.foreground }}>{selected ? "●" : "○"} {choice}　{voters.length}</Text></Pressable>; })}</View><Text style={{ fontSize: 10, color: isMe ? "#FFF" : colors.muted, marginTop: 9 }}>{pollLines.find((line) => line.startsWith("⏱"))}</Text></View> : <><MentionText content={message.content} outgoing={isMe} groups={mentionGroups} rooms={getAllRooms()} threads={BOARD_THREADS} onOpenInternalLink={onOpenInternalLink} /><ContentLinkCards content={message.content} /></>}
            </View>
          ) : null}
        </Pressable>
        <Text
          style={{
            fontSize: 10,
            color: colors.muted,
            marginTop: 2,
            textAlign: isMe ? "right" : "left",
            marginHorizontal: 4,
          }}
        >
          {formatTime(message.createdAt)}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 3, justifyContent: isMe ? "flex-end" : "flex-start" }}>
          {Object.entries(message.reactions ?? {}).filter(([emoji]) => !emoji.startsWith("🗳️")).map(([emoji, memberIds]) => (
            <Pressable
              key={emoji}
              onPress={() => {
                if (reactionLongPress.current) {
                  reactionLongPress.current = false;
                  return;
                }
                if (!readOnly) onReact(emoji);
              }}
              onLongPress={() => {
                reactionLongPress.current = true;
                setReactionDetails({ emoji, memberIds });
              }}
              delayLongPress={350}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 11, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: memberIds.includes(viewerId) ? "#F8DCE9" : colors.surface, borderWidth: 1, borderColor: memberIds.includes(viewerId) ? "#E8A0BF" : colors.border }}
            >
              <Text style={{ fontSize: 13 }}>{emoji}</Text>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted, marginLeft: 3 }}>{memberIds.length}</Text>
            </Pressable>
          ))}
          {!readOnly ? <Pressable onPress={() => setShowReactionPicker((value) => !value)} accessibilityLabel="リアクションを追加" style={{ paddingHorizontal: 5, paddingVertical: 2 }}>
            <Text style={{ fontSize: 15, color: colors.muted }}>☺︎＋</Text>
          </Pressable> : null}
        </View>
        {showReactionPicker && !readOnly ? (
          <View style={{ maxWidth: 280, flexDirection: "row", flexWrap: "wrap", borderRadius: 18, paddingHorizontal: 6, paddingVertical: 5, marginTop: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: isMe ? "flex-end" : "flex-start" }}>
            {REACTION_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => { onReact(emoji); setShowReactionPicker(false); }} style={{ paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 19 }}>{emoji}</Text></Pressable>)}
            <Pressable onPress={() => setShowMoreReactions((value) => !value)} style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.background }}><Text style={{ fontSize: 11, fontWeight: "800", color: colors.foreground }}>{showMoreReactions ? "閉じる" : "その他"}</Text></Pressable>
            {showMoreReactions ? <View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>{MORE_REACTION_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => { onReact(emoji); setShowReactionPicker(false); setShowMoreReactions(false); }} style={{ width: 34, height: 32, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 19 }}>{emoji}</Text></Pressable>)}</View> : null}
          </View>
        ) : null}
        <Modal visible={showActions} transparent animationType="fade" onRequestClose={() => setShowActions(false)}><Pressable onPress={() => setShowActions(false)} style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.48)", justifyContent: "flex-end" }}><Pressable onPress={() => {}} style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 30 }}><View style={{ flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.surface, borderRadius: 16, padding: 10, marginBottom: 10 }}>{REACTION_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => { onReact(emoji); setShowActions(false); }} style={{ padding: 7 }}><Text style={{ fontSize: 24 }}>{emoji}</Text></Pressable>)}</View>{[{ label: "返信", icon: "arrowshape.turn.up.left", action: onReply }, { label: "リンクをコピー", icon: "link", action: () => { void Clipboard.setStringAsync(`https://app.irotas-community.com/chat?id=${encodeURIComponent(message.chatId)}&message=${encodeURIComponent(message.id)}`); } }, { label: "テキストをコピー", icon: "doc.on.doc", action: () => { void Clipboard.setStringAsync(message.content); } }, ...(isMe && !readOnly ? [{ label: "メッセージを編集", icon: "pencil", action: onEdit }] : []), ...(canDelete ? [{ label: "メッセージを削除", icon: "trash", action: onDelete }] : [])].map((item) => <Pressable key={item.label} onPress={() => { item.action(); setShowActions(false); }} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><IconSymbol name={item.icon as any} size={19} color={item.label.includes("削除") ? colors.error : colors.foreground} /><Text style={{ marginLeft: 12, fontSize: 15, fontWeight: "700", color: item.label.includes("削除") ? colors.error : colors.foreground }}>{item.label}</Text></Pressable>)}</Pressable></Pressable></Modal>
        <Modal visible={reactionDetails !== null} transparent animationType="fade" onRequestClose={() => setReactionDetails(null)}>
          <Pressable onPress={() => setReactionDetails(null)} style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.48)", justifyContent: "center", padding: 28 }}>
            <Pressable onPress={() => {}} style={{ maxHeight: "72%", backgroundColor: colors.background, borderRadius: 20, padding: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}><Text style={{ fontSize: 21 }}>{reactionDetails?.emoji}</Text><Text style={{ marginLeft: 8, fontSize: 16, fontWeight: "900", color: colors.foreground }}>リアクションした人</Text><Pressable onPress={() => setReactionDetails(null)} style={{ marginLeft: "auto", padding: 4 }}><IconSymbol name="xmark" size={19} color={colors.muted} /></Pressable></View>
              <ScrollView>
                {reactionDetails?.memberIds.filter((memberId) => !isUnidentifiedReaction(memberId)).map((memberId) => {
                  const isViewer = memberId === viewerId;
                  const sharedMember = memberDirectory.find((member) => member.id === memberId);
                  const localMember = getMemberById(memberId);
                  const discordMember = getDiscordAuthorById(memberId);
                  const name = isViewer ? displayMemberName(viewerName) : sharedMember?.displayName ?? localMember?.name ?? discordMember?.name;
                  if (!name) return null;
                  const avatarUrl = isViewer ? viewerAvatarUrl : sharedMember?.profile?.avatarUrl;
                  const photoUrl = typeof avatarUrl === "string" && avatarUrl ? avatarUrl : discordMember?.avatarUrl;
                  const avatar = isViewer && myAvatarUri ? { uri: myAvatarUri } : photoUrl ? { uri: photoUrl } : localMember?.avatar ?? DEFAULT_AVATAR;
                  return <Pressable key={memberId} accessibilityRole="button" accessibilityLabel={`${name}のプロフィールを開く`} onPress={() => { setReactionDetails(null); onOpenReactionProfile(memberId, name, photoUrl); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 9 }}><Image source={avatar} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" /><Text style={{ marginLeft: 10, fontSize: 15, fontWeight: "700", color: colors.foreground }}>{name}</Text></Pressable>;
                })}
                {reactionDetails && reactionDetails.memberIds.filter((memberId) => isUnidentifiedReaction(memberId) || (!memberDirectory.some((member) => member.id === memberId) && !getMemberById(memberId) && !getDiscordAuthorById(memberId) && memberId !== viewerId)).length > 0 ? <Text style={{ color: colors.muted, paddingVertical: 9 }}>過去の記録では、ほか{reactionDetails.memberIds.filter((memberId) => isUnidentifiedReaction(memberId) || (!memberDirectory.some((member) => member.id === memberId) && !getMemberById(memberId) && !getDiscordAuthorById(memberId) && memberId !== viewerId)).length}件の押した人を特定できません</Text> : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const viewerMemberId = authUser?.memberId ?? (authUser?.id ? `member-${authUser.id}` : CURRENT_USER.id);
  const userIsAdmin = isAdminRole(authUser?.role, authUser?.accessRole);
  const canViewAllChats = isOperatorRole(authUser?.role, authUser?.accessRole);
  const { id, message: linkedMessageId, unreadCount: unreadCountParam } = useLocalSearchParams<{ id: string; message?: string; unreadCount?: string }>();
  const unreadCountFromRoute = unreadCountParam !== undefined && Number.isFinite(Number(unreadCountParam))
    ? Math.max(0, Math.floor(Number(unreadCountParam))) : null;
  const [messageText, setMessageText] = useState("");
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  useEffect(() => setReplyToMessage(null), [id]);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [savingMessageEdit, setSavingMessageEdit] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [messageSelection, setMessageSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const flatListRef = useRef<FlatList>(null);
  const linkedScrollRetry = useRef(0);
  const linkedMessageScrolled = useRef<string | null>(null);
  const initiallyPositionedChat = useRef<string | null>(null);
  const positionInitialMessagesRef = useRef<(() => void) | null>(null);
  const openingLatestScrollUntil = useRef(0);
  const lastAutomaticScrollTop = useRef(0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [isNearLatest, setIsNearLatest] = useState(true);
  const [hasOpenedIntroduction, setHasOpenedIntroduction] = useState<boolean | null>(null);
  const [introductionHydrated, setIntroductionHydrated] = useState(false);
  const introductionOpenedKey = `irotas_introduction_chat_opened_v2:${viewerMemberId}`;
  const introductionArchiveBase = useRef<Record<string, Record<string, string[]>>>({});
  const introductionReactionPending = useRef(false);

  // 参加者モーダル
  const [showParticipants, setShowParticipants] = useState(false);
  // 管理者機能用 state
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  // キーボード表示状態
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const [room, setRoom] = useState(() => getRoomById(id ?? "") ?? (id === "community-free-chat" ? {
    id, name: "フリーチャット", type: "board" as const, sourceId: "community-free-chat", participants: [], createdBy: "system", shared: true,
  } : undefined));
  const [roomEvent, setRoomEvent] = useState<Event | null>(null);
  useEffect(() => {
    const eventId = room?.type === "event" ? room.sourceId : null;
    setRoomEvent(null);
    if (!eventId) return;
    let active = true;
    void Api.getEvent(eventId).then((event) => { if (active) setRoomEvent(event); }).catch(() => {});
    return () => { active = false; };
  }, [room?.type, room?.sourceId]);
  const [openingUnreadCount, setOpeningUnreadCount] = useState<number | null>(() =>
    unreadCountFromRoute ?? getRoomById(id ?? "")?.unreadCount ?? null,
  );
  const staffViewingOnly = Boolean(canViewAllChats && room && (room.type === "dm" || room.type === "club") && !room.participants.includes(viewerMemberId));
  const [clubAccessDenied, setClubAccessDenied] = useState(false);
  const [roomParticipants, setRoomParticipants] = useState<string[]>(
    () => getRoomById(id ?? "")?.participants ?? []
  );
  const [directory, setDirectory] = useState<Api.PublicMember[]>([]);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setDirectoryLoaded(false);
    void Api.getMemberDirectory().then((members) => {
      if (active) setDirectory(members);
    }).catch(() => {
      if (active) setDirectory([]);
    }).finally(() => {
      if (active) setDirectoryLoaded(true);
    });
    return () => { active = false; };
  }, [authUser?.id]);
  const mentionMembers = useMemo(() => directory.length > 0
    ? directory.map((member) => ({
      id: member.id,
      name: member.displayName,
      branch: member.branches.includes("kansai") ? "kansai" : "kanto",
      generation: Number(member.memberTerm?.match(/\d+/)?.[0] ?? 0),
      rank: member.memberRank,
      role: member.accessRole === "admin" ? "admin" : member.accessRole === "operator" ? "operator" : "member",
    })) as unknown as typeof MEMBERS
    : MEMBERS, [directory]);
  const mentionGroups = useMemo(() => {
    const roomMemberIds = roomParticipants;
    const groups = getMentionGroups(mentionMembers, CLUBS).map((group) => group.id === "everyone"
      ? { ...group, description: "このチャットの対象メンバー全員", memberIds: roomMemberIds }
      : group);
    groups.push(
      { id: "all-current-room", label: "全体", description: "このチャットの対象メンバー全員", memberIds: roomMemberIds, category: "everyone" },
      { id: "chat-participants", label: "チャット内の人全員", description: "このチャットの参加者全員", memberIds: roomMemberIds, category: "everyone" },
    );
    return groups;
  }, [mentionMembers, roomParticipants]);
  const mentionScopeIds = useMemo(() => chatMentionMemberIds(roomParticipants), [roomParticipants]);
  const mentionMemberIds = useMemo(() => mentionScopeIds.filter((memberId) => memberId !== viewerMemberId), [mentionScopeIds, viewerMemberId]);
  const mentionSuggestionGroups = useMemo(() => {
    const allowed = new Set(mentionScopeIds);
    return mentionGroups.filter((group) => group.label === "everyone"
      || (group.memberIds.length > 0 && group.memberIds.every((memberId) => allowed.has(memberId))));
  }, [mentionGroups, mentionScopeIds]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesHydrated, setMessagesHydrated] = useState(false);
  const pendingReactionChoices = useRef(new Map<string, Map<string, boolean>>());
  const sharedFetchSequence = useRef(0);
  const sharedFetchInFlight = useRef(false);
  const introductionChat = id === "board-introduction";
  // inverted リストではデータの先頭が入力欄側に置かれるため、最新メッセージを
  // 先頭にしておけばスクロール処理なしで最初から最新位置を描画できる。
  const displayedMessages = useMemo(() => {
    const seenWelcome = new Set<string>();
    const unique = messages.filter((message, index) => {
      const normalized = systemMessageText(message.content);
      if (room?.type === "event" && message.content.startsWith("【IRO+ システム】") && normalized.endsWith("の参加者専用グループが作成されました")) {
        if (seenWelcome.has(normalized)) return false;
        seenWelcome.add(normalized);
      }
      return !messages.slice(0, index).some((earlier) =>
        earlier.senderId === message.senderId && earlier.content === message.content &&
        earlier.imageUri === message.imageUri &&
        JSON.stringify(earlier.attachmentUrls ?? []) === JSON.stringify(message.attachmentUrls ?? []) &&
        Math.abs(Date.parse(earlier.createdAt) - Date.parse(message.createdAt)) <= 2_000,
      );
    });
    return introductionChat ? unique.reverse() : unique;
  }, [introductionChat, messages, room?.type]);
  const jumpToMessage = useCallback((messageId: string) => {
    const index = displayedMessages.findIndex((item) => item.id === messageId);
    if (index < 0) {
      Alert.alert("返信元を表示できません", "返信元のメッセージが見つかりませんでした。");
      return;
    }
    linkedScrollRetry.current = 0;
    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setHighlightedMessageId(messageId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 2200);
  }, [displayedMessages]);
  useEffect(() => () => { if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current); }, []);
  useEffect(() => {
    if (!linkedMessageId || linkedMessageScrolled.current === linkedMessageId) return;
    const index = displayedMessages.findIndex((item) => item.id === linkedMessageId);
    if (index < 0) return;
    linkedMessageScrolled.current = linkedMessageId;
    linkedScrollRetry.current = 0;
    const timer = setTimeout(() => flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }), 250);
    return () => clearTimeout(timer);
  }, [linkedMessageId, displayedMessages]);
  useEffect(() => {
    if (linkedMessageId || openingUnreadCount === null || !messagesHydrated || !displayedMessages.length || (introductionChat && (!introductionHydrated || hasOpenedIntroduction === null))) return;
    const unreadCount = normalizedUnreadCount(openingUnreadCount, displayedMessages.length);
    const effectiveUnreadCount = introductionChat && !hasOpenedIntroduction ? 0 : unreadCount;
    const index = initialMessageIndex(displayedMessages.length, effectiveUnreadCount, introductionChat);
    if (index === null) return;
    const positionKey = `${id}:${effectiveUnreadCount}`;
    if (initiallyPositionedChat.current === positionKey) return;
    linkedScrollRetry.current = 0;
    openingLatestScrollUntil.current = !introductionChat && effectiveUnreadCount === 0 ? Date.now() + 2500 : 0;
    const keepLatestInView = () => {
      if (Platform.OS !== "web" || Date.now() > openingLatestScrollUntil.current) return;
      const scrollNode = flatListRef.current?.getScrollableNode() as HTMLElement | null | undefined;
      if (!scrollNode) return;
      scrollNode.scrollTop = scrollNode.scrollHeight;
      lastAutomaticScrollTop.current = scrollNode.scrollTop;
    };
    const positionMessages = () => {
      if (initiallyPositionedChat.current === positionKey) {
        keepLatestInView();
        return;
      }
      if (Platform.OS === "web" && !introductionChat) {
        const scrollNode = flatListRef.current?.getScrollableNode() as HTMLElement | null | undefined;
        if (scrollNode) {
          if (effectiveUnreadCount === 0) {
            scrollNode.scrollTop = scrollNode.scrollHeight;
            lastAutomaticScrollTop.current = scrollNode.scrollTop;
            initiallyPositionedChat.current = positionKey;
            return;
          }
          const unreadMarker = scrollNode.querySelector<HTMLElement>('[data-testid="chat-first-unread-marker"]');
          if (unreadMarker) {
            scrollNode.scrollTop += unreadMarker.getBoundingClientRect().top - scrollNode.getBoundingClientRect().top - 12;
            initiallyPositionedChat.current = positionKey;
            return;
          }
        }
      }
      flatListRef.current?.scrollToIndex({ index, animated: false, viewPosition: introductionChat ? (effectiveUnreadCount > 0 ? 1 : 0) : effectiveUnreadCount > 0 ? 0.12 : 1 });
      if (Platform.OS !== "web" || introductionChat) initiallyPositionedChat.current = positionKey;
    };
    positionInitialMessagesRef.current = positionMessages;
    const frame = requestAnimationFrame(positionMessages);
    const timers = [80, 250, 600, 1200, 2400].map((delay) => setTimeout(positionMessages, delay));
    return () => {
      positionInitialMessagesRef.current = null;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
    };
  }, [displayedMessages.length, hasOpenedIntroduction, id, introductionChat, introductionHydrated, linkedMessageId, messagesHydrated, openingUnreadCount]);
  // 自分のプロフィール画像（AsyncStorageから読み込み）
  const [myAvatarUri, setMyAvatarUri] = useState<string | null>(null);
  const scrollToLatest = useCallback((animated = false) => {
    if (!displayedMessages.length) return;
    const scroll = () => {
      if (id === "board-introduction") {
        flatListRef.current?.scrollToOffset({ offset: 0, animated });
        return;
      }
      flatListRef.current?.scrollToIndex({ index: displayedMessages.length - 1, animated, viewPosition: 1 });
      flatListRef.current?.scrollToEnd({ animated });
    };
    scroll();
    requestAnimationFrame(scroll);
    setTimeout(scroll, 180);
    setTimeout(scroll, 500);
  }, [id, displayedMessages.length]);

  const applySharedMessages = useCallback((shared: ChatMessage[]) => {
    const resolved = shared.map((message) => {
      const pending = pendingReactionChoices.current.get(message.id);
      if (!pending?.size) return message;
      const merged = reconcileOptimisticReactions(message.reactions, pending, viewerMemberId);
      if (merged.remaining.size) pendingReactionChoices.current.set(message.id, merged.remaining);
      else pendingReactionChoices.current.delete(message.id);
      return { ...message, reactions: merged.reactions };
    });
    setMessages((previous) => {
      // 自己紹介はDiscordアーカイブ由来の履歴と共有チャットの新規投稿だけを表示し、テスト用ローカル履歴を混在させない。
      const archivePrefix = id === "board-introduction" ? "discord-introduction-" : null;
      const localMessages = id === "branch-kanto-free" || id === "branch-kansai-free"
        ? []
        : archivePrefix
        ? previous.filter((message) => message.id.startsWith(archivePrefix))
        : [...getMessages(id ?? ""), ...previous.filter((message) => !message.shared)];
      return [...localMessages, ...resolved]
        .filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index)
        .filter((message) => !isRetiredAnnouncement(message))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  }, [id, viewerMemberId]);

  // 初回起動時: プロフィール画像と永続化メッセージを読み込む
  useEffect(() => {
    if (!id) return;
    const cachedUnreadCount = getRoomById(id)?.unreadCount;
    const openingCount = unreadCountFromRoute ?? cachedUnreadCount ?? null;
    setOpeningUnreadCount(openingCount);
    setMessagesHydrated(false);
    initiallyPositionedChat.current = null;
    positionInitialMessagesRef.current = null;
    openingLatestScrollUntil.current = 0;
    lastAutomaticScrollTop.current = 0;
    setClubAccessDenied(false);
    if (id.startsWith("club-chat-")) setMessages([]);
    setIntroductionHydrated(id !== "board-introduction");
    if (id === "board-introduction") {
      setHasOpenedIntroduction(null);
      void AsyncStorage.getItem(introductionOpenedKey).then((value) => setHasOpenedIntroduction(value === "1"));
    } else setHasOpenedIntroduction(true);
    // 一覧のバッジは即時に消し、サーバー既読化は未読件数を取得してから行う。
    markChatRoomOptimisticallyRead(id, Math.max(0, Number(unreadCountParam ?? 0)));
    setIsLoadingRoom(true);
    const loadingFallback = setTimeout(() => setIsLoadingRoom(false), 2500);
    // プロフィール画像読み込み
    AsyncStorage.getItem("profile_avatar_uri").then((uri) => {
      if (uri) setMyAvatarUri(uri);
    });
    // 個別のチャット・メッセージを先に取得する。一覧全件の読み込みを画面表示の条件にしない。
    void Api.getSharedChatRoom(id).then((sharedRoom) => {
      const normalized = sharedRoom as unknown as ChatRoom;
      if (openingCount === null) setOpeningUnreadCount(sharedRoom.unreadCount ?? 0);
      setRoom(normalized);
      setRoomParticipants([...normalized.participants]);
      setClubAccessDenied(false);
    }).catch((error) => {
      if (id.startsWith("club-chat-") && error instanceof Api.ApiError && (error.statusCode === 403 || error.statusCode === 404)) setClubAccessDenied(true);
    }).finally(() => {
      void markRoomRead(id);
      void Api.markSharedChatRoomRead(id).catch(() => {});
      setIsLoadingRoom(false);
    });
    const fetchSequence = ++sharedFetchSequence.current;
    sharedFetchInFlight.current = true;
    void Api.getSharedChatMessages(id).then((shared) => { if (fetchSequence === sharedFetchSequence.current) applySharedMessages(shared); }).catch(async (error) => {
      if (fetchSequence !== sharedFetchSequence.current) return;
      if (id.startsWith("club-chat-")) {
        setMessages([]);
        if (error instanceof Api.ApiError && (error.statusCode === 403 || error.statusCode === 404)) setClubAccessDenied(true);
        return;
      }
      const stored = await loadMessagesFromStorage(id);
      setMessages([...(id === "board-introduction" ? [] : getMessages(id)), ...stored]
        .filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index)
        .filter((message) => !isRetiredAnnouncement(message)));
    }).finally(() => { if (fetchSequence === sharedFetchSequence.current) { sharedFetchInFlight.current = false; setMessagesHydrated(true); } });
    void loadDynamicRooms().then(() => {
      const r = getRoomById(id);
      if (r && !r.shared) {
        if (openingCount === null) setOpeningUnreadCount(r.unreadCount ?? 0);
        setRoom((current) => current?.shared && current.id === id ? current : r);
        void markRoomRead(id);
      }
      if (id === "board-introduction") {
        Api.getBoardArchive("all").then(async (archive) => {
          const currentReactions = await Api.getIntroductionArchiveReactions().then((result) => result.reactions).catch(() => ({}));
          const imported = importedIntroductionMessages(archive, currentReactions);
          introductionArchiveBase.current = Object.fromEntries(imported.map((message) => [message.externalMessageId!, Object.fromEntries(Object.entries(message.reactions ?? {}).map(([emoji, ids]) => [emoji, ids.filter((memberId) => memberId.startsWith("discord-"))]))]));
          setMessages((current) => [...imported, ...current.filter((message) => message.shared)]
            .filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
        }).catch(() => setMessages((current) => current.filter((message) => message.shared))).finally(() => setIntroductionHydrated(true));
      }
    }).catch(() => setIsLoadingRoom(false));
    return () => clearTimeout(loadingFallback);
  }, [id, applySharedMessages, introductionOpenedKey]);

  useEffect(() => {
    if (id !== "board-introduction" || !introductionHydrated) return;
    const refresh = () => {
      if (introductionReactionPending.current || (Platform.OS === "web" && document.visibilityState === "hidden")) return;
      void Api.getIntroductionArchiveReactions().then(({ reactions }) => {
        if (introductionReactionPending.current) return;
        setMessages((current) => current.map((message) => message.externalMessageId && message.id.startsWith("discord-introduction-") ? {
          ...message,
          reactions: mergedIntroductionReactions(introductionArchiveBase.current[message.externalMessageId] ?? {}, reactions[message.externalMessageId]),
        } : message));
      }).catch(() => {});
    };
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [id, introductionHydrated]);

  // 共有メッセージの編集・削除・リアクションを、参加者全員の画面へ反映する。
  useEffect(() => {
    if (!id) return;
    const refresh = () => { if (sharedFetchInFlight.current) return; const fetchSequence = ++sharedFetchSequence.current; sharedFetchInFlight.current = true; void Api.getSharedChatMessages(id).then((shared) => { if (fetchSequence === sharedFetchSequence.current) applySharedMessages(shared); }).catch((error) => {
      if (fetchSequence !== sharedFetchSequence.current) return;
      if (id.startsWith("club-chat-") && error instanceof Api.ApiError && (error.statusCode === 403 || error.statusCode === 404)) {
        setMessages([]);
        setClubAccessDenied(true);
      }
    }).finally(() => { if (fetchSequence === sharedFetchSequence.current) sharedFetchInFlight.current = false; }); };
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [id, applySharedMessages]);

  // @入力を検出してメンション候補を表示
  const handleTextChange = useCallback((text: string) => {
    setMessageText(text);
    setMentionQuery(getMentionQuery(text));
  }, []);

  const handleSelectMention = useCallback((label: string) => {
      setMessageText((current) => {
        const next = insertMention(current, label);
        setMessageSelection({ start: next.length, end: next.length });
        return next;
      });
      setMentionQuery(null);
      inputRef.current?.focus();
  }, []);


  // 通知権限を初回に要求
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  const insets = useSafeAreaInsets();
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingVideos, setPendingVideos] = useState<{ uri: string; mimeType: string }[]>([]);
  const sendingRef = useRef(false);
  const pendingSendRef = useRef<{ signature: string; messageId: string } | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [, setIsLoadingRoom] = useState(true);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDeadline, setPollDeadline] = useState("");
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollSending, setPollSending] = useState(false);

  const handlePickPhoto = useCallback(async () => {
    if (pendingImages.length + pendingVideos.length >= 10) return;
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("権限が必要です", "写真を送るには写真ライブラリへのアクセスを許可してください。");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 10 - pendingImages.length - pendingVideos.length,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPendingImages((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 10 - pendingVideos.length));
    }
  }, [pendingImages.length, pendingVideos.length]);

  const handlePickVideo = useCallback(async () => {
    if (pendingImages.length + pendingVideos.length >= 10) return;
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("権限が必要です", "動画を送るには写真ライブラリへのアクセスを許可してください。"); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: true, selectionLimit: 10 - pendingImages.length - pendingVideos.length });
    if (!result.canceled) setPendingVideos((current) => [...current, ...result.assets.map((asset) => ({
      uri: asset.uri,
      mimeType: asset.mimeType || (/\.mov(?:[?#]|$)/i.test(asset.uri) ? "video/quicktime" : /\.webm(?:[?#]|$)/i.test(asset.uri) ? "video/webm" : "video/mp4"),
    }))].slice(0, 10 - pendingImages.length));
  }, [pendingImages.length, pendingVideos.length]);

  const handleSend = useCallback(async () => {
    if (sendingRef.current) return;
    if (staffViewingOnly) return;
    if (!canPostToChat(authUser?.role, id ?? "", authUser?.accessRole)) return;
    if (!messageText.trim() && !pendingImages.length && !pendingVideos.length) return;
    const content = messageText.trim();
    if (!id) return;
    sendingRef.current = true;
    const signature = JSON.stringify([id, content, pendingImages, pendingVideos, replyToMessage?.id]);
    if (pendingSendRef.current?.signature !== signature) {
      pendingSendRef.current = { signature, messageId: `cm_${Date.now()}_${Math.random().toString(36).slice(2)}` };
    }
    try {
      const imageUrls = await Promise.all([
        ...pendingImages.map(async (uri) => (await Api.uploadEventImage(uri)).imageUrl),
        ...pendingVideos.map(async (video) => (await Api.uploadEventImage(video.uri, video.mimeType)).imageUrl),
      ]);
      const newMessage = await Api.createSharedChatMessage(id, { content, imageUrls, clientMessageId: pendingSendRef.current.messageId, replyToId: replyToMessage?.id });
      pendingSendRef.current = null;
      showSentChatPreviewImmediately(viewerMemberId, id, newMessage);
      setMessages((prev) => [...prev.filter((item) => item.id !== newMessage.id), newMessage]);
      setMessageText("");
      setReplyToMessage(null);
      setMessageSelection({ start: 0, end: 0 });
      setPendingImages([]);
      setPendingVideos([]);
      setMentionQuery(null);

    } catch (error) {
      if (error instanceof Api.ApiError && error.statusCode === 404) {
        pendingSendRef.current = null;
        const legacyMessage: ChatMessage = {
          id: `m_new_${Date.now()}`,
          chatId: id,
          senderId: viewerMemberId,
          externalAuthorName: authUser?.name ?? undefined,
          content,
          replyTo: replyToMessage ? replyReference(replyToMessage.id, replyToMessage.externalAuthorName ?? getMemberById(replyToMessage.senderId)?.name ?? "メンバー", replyToMessage.content, Boolean(replyToMessage.imageUri || replyToMessage.attachmentUrls?.length)) : undefined,
          attachmentUrls: pendingImages.length || pendingVideos.length ? [...pendingImages, ...pendingVideos.map((video) => video.uri)] : undefined,
          createdAt: new Date().toISOString(),
        };
        setMessages((previous) => [...previous, legacyMessage]);
        await saveMessagesToStorage(id, [legacyMessage]);
        showSentChatPreviewImmediately(viewerMemberId, id, legacyMessage);
        setMessageText("");
        setReplyToMessage(null);
        setMessageSelection({ start: 0, end: 0 });
        setPendingImages([]);
        setPendingVideos([]);
        setMentionQuery(null);
        return;
      }
      Alert.alert("送信できませんでした", error instanceof Error ? error.message : "通信状況を確認してもう一度お試しください。");
    } finally {
      sendingRef.current = false;
    }
  }, [messageText, pendingImages, pendingVideos, replyToMessage, id, authUser?.role, authUser?.accessRole, authUser?.name, viewerMemberId, staffViewingOnly]);

  const handleReaction = useCallback(async (messageId: string, emoji: string, pollChoices?: string[], allowMultiple = true) => {
    if (staffViewingOnly) return;
    if (!id) return;
    const importedMessage = messages.find((item) => item.id === messageId && item.externalMessageId && item.id.startsWith("discord-introduction-"));
    if (importedMessage?.externalMessageId) {
      if (introductionReactionPending.current) return;
      introductionReactionPending.current = true;
      const active = !(importedMessage.reactions?.[emoji] ?? []).includes(viewerMemberId);
      const previousReactions = importedMessage.reactions;
      setMessages((current) => current.map((message) => message.id === messageId ? {
        ...message,
        reactions: { ...message.reactions, [emoji]: active
          ? [...new Set([...(message.reactions?.[emoji] ?? []), viewerMemberId])]
          : (message.reactions?.[emoji] ?? []).filter((memberId) => memberId !== viewerMemberId) },
      } : message));
      try {
        const result = await Api.setIntroductionArchiveReaction(importedMessage.externalMessageId, emoji, active);
        setMessages((current) => current.map((message) => message.id === messageId ? {
          ...message,
          reactions: mergedIntroductionReactions(introductionArchiveBase.current[importedMessage.externalMessageId!] ?? {}, result.reactions[importedMessage.externalMessageId!]),
        } : message));
      } catch (error) {
        setMessages((current) => current.map((message) => message.id === messageId ? { ...message, reactions: previousReactions } : message));
        Alert.alert("リアクションできませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
      } finally { introductionReactionPending.current = false; }
      return;
    }
    const sharedMessage = messages.find((item) => item.id === messageId && item.shared);
    if (sharedMessage) {
      const active = !(sharedMessage.reactions?.[emoji] ?? []).includes(viewerMemberId);
      const previousReactions = sharedMessage.reactions;
      const pending = new Map(pendingReactionChoices.current.get(messageId) ?? []);
      pending.set(emoji, active);
      if (pollChoices && !allowMultiple) for (const choice of pollChoices) if (`🗳️${choice}` !== emoji) pending.set(`🗳️${choice}`, false);
      pendingReactionChoices.current.set(messageId, pending);
      setMessages((current) => current.map((message) => {
        if (message.id !== messageId) return message;
        const reactions = Object.fromEntries(Object.entries(message.reactions ?? {}).map(([key, members]) => [key, [...members]])) as Record<string, string[]>;
        if (pollChoices && !allowMultiple) {
          for (const choice of pollChoices) {
            const key = `🗳️${choice}`;
            if (key !== emoji) reactions[key] = (reactions[key] ?? []).filter((memberId) => memberId !== viewerMemberId);
          }
        }
        reactions[emoji] = active
          ? [...new Set([...(reactions[emoji] ?? []), viewerMemberId])]
          : (reactions[emoji] ?? []).filter((memberId) => memberId !== viewerMemberId);
        if (!reactions[emoji].length) delete reactions[emoji];
        return { ...message, reactions };
      }));
      try {
        if (pollChoices && !allowMultiple) {
          const otherVotes = pollChoices.map((choice) => `🗳️${choice}`).filter((key) => key !== emoji && (sharedMessage.reactions?.[key] ?? []).includes(viewerMemberId));
          await Promise.all(otherVotes.map((key) => Api.setSharedChatReaction(messageId, key, false)));
        }
        const result = await Api.setSharedChatReaction(messageId, emoji, active);
        setMessages((current) => current.map((message) => message.id === messageId ? { ...message, reactions: result.reactions } : message));
      } catch (error) {
        pendingReactionChoices.current.delete(messageId);
        setMessages((current) => current.map((message) => message.id === messageId ? { ...message, reactions: previousReactions } : message));
        Alert.alert("リアクションできませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
      }
      return;
    }
    if (pollChoices && !allowMultiple) {
      const local = messages.find((item) => item.id === messageId);
      for (const choice of pollChoices) {
        const key = `🗳️${choice}`;
        if (key !== emoji && (local?.reactions?.[key] ?? []).includes(viewerMemberId)) await toggleMessageReaction(id, messageId, key, viewerMemberId);
      }
    }
    const updated = await toggleMessageReaction(id, messageId, emoji, viewerMemberId);
    if (updated) setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
  }, [id, messages, viewerMemberId, staffViewingOnly]);

  const createPoll = useCallback(async () => {
    if (!id || pollSending || !pollQuestion.trim() || pollOptions.filter((value) => value.trim()).length < 2 || !pollDeadline.trim()) return;
    const content = `📊 **${pollQuestion.trim()}**\n${pollOptions.filter((value) => value.trim()).map((value) => `◯ ${value.trim()}`).join("\n")}\n⏱ 期限: ${pollDeadline.trim()}\n${pollAllowMultiple ? "🔢 複数回答可" : ""}`.trim();
    setPollSending(true);
    try {
      const message = await Api.createSharedChatMessage(id, { content });
      setMessages((current) => [...current.filter((item) => item.id !== message.id), message]);
      setShowPollComposer(false);
      setPollQuestion(""); setPollOptions(["", ""]); setPollDeadline(""); setPollAllowMultiple(false);
    } catch (error) {
      Alert.alert("投票を作成できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
    } finally {
      setPollSending(false);
    }
  }, [id, pollAllowMultiple, pollDeadline, pollOptions, pollQuestion, pollSending]);

  useEffect(() => {
    if (id === "board-introduction" && introductionHydrated && hasOpenedIntroduction !== null) {
      void AsyncStorage.setItem(introductionOpenedKey, "1");
    }
  }, [id, introductionHydrated, hasOpenedIntroduction, introductionOpenedKey]);

  if ((!room || room.id !== id) && !clubAccessDenied) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#E8A0BF" /><Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>チャットを読み込んでいます…</Text>
        </View>
      </ScreenContainer>
    );
  }

  const isBranchRoom = room?.id === "branch-kanto-free" ? authUser?.branches?.includes("kanto") : room?.id === "branch-kansai-free" ? authUser?.branches?.includes("kansai") : false;
  if (clubAccessDenied || (room && !canAccessChatRoom(room, viewerMemberId, (authUser?.memberRank ?? CURRENT_USER.rank) as typeof CURRENT_USER.rank, canViewAllChats) && room.id !== "board-announcement" && room.id !== "board-introduction" && !isBranchRoom)) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <IconSymbol name="lock.fill" size={40} color={colors.muted} />
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginTop: 14 }}>このチャットは閲覧できません</Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: "center", marginTop: 6 }}>
            部活チャットは承認済みの部員、その他のチャットは参加者だけが閲覧できます。
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!room) return null;

  const typeLabel = room.id === "board-announcement" ? "お知らせ" : ["community-free-chat", "branch-kanto-free", "branch-kansai-free"].includes(room.id) ? "チャット" : room.type === "event" ? "イベント" : room.type === "board" ? "掲示板" : room.type === "rank" ? "ランク専用" : room.type === "group" ? "友達グループ" : room.type === "dm" ? "DM" : "部活動";
  const typeColor = room.type === "event" ? "#E8A0BF" : room.type === "board" ? "#A7C7E7" : room.type === "rank" ? "#F59E0B" : room.type === "group" ? "#5B9BD5" : room.type === "dm" ? "#FF9500" : "#34C759";
  const requestedUnreadCount = normalizedUnreadCount(openingUnreadCount, displayedMessages.length);
  const introductionUnreadCount = introductionChat && hasOpenedIntroduction ? requestedUnreadCount : 0;
  const introductionFirstUnreadIndex = introductionUnreadCount > 0 ? introductionUnreadCount - 1 : null;
  const firstUnreadIndex = initialMessageIndex(displayedMessages.length, requestedUnreadCount, false);
  const canManageRoom = room.type !== "club" && !staffViewingOnly && (userIsAdmin || room.createdBy === viewerMemberId);
  const canInviteMembers = canManageRoom && room.type !== "rank" && room.type !== "event" && room.type !== "dm";
  const canPostAnnouncement = !staffViewingOnly && canPostToChat(authUser?.role, room.id, authUser?.accessRole);
  const sharedInviteCandidates = directory.filter((member) => member.id !== viewerMemberId && !roomParticipants.includes(member.id));
  const listedParticipants = room.type === "rank"
    ? directory.filter((member) => member.memberRank === room.requiredRank).map((member) => member.id)
    : roomParticipants;
  const localInviteCandidates = (room.type === "group" ? getFriends(CURRENT_USER.id) : MEMBERS.filter((member) => member.id !== CURRENT_USER.id))
    .filter((member) => !roomParticipants.includes(member.id));

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
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
            {room.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
            <View
              style={{
                backgroundColor: typeColor + "20",
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 1,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "600", color: typeColor }}>
                {typeLabel}
              </Text>
            </View>
            {room.type !== "rank" && room.id !== "community-free-chat" && room.id !== "board-announcement" && room.id !== "board-introduction" && room.id !== "branch-kanto-free" && room.id !== "branch-kansai-free" ? (
              <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>
                {roomParticipants.length}人参加中
              </Text>
            ) : null}
          </View>
        </View>
        {room.id !== "community-free-chat" && room.id !== "board-announcement" && room.id !== "board-introduction" && room.id !== "branch-kanto-free" && room.id !== "branch-kansai-free" ? (
          <Pressable onPress={() => setShowParticipants(true)}>
            <IconSymbol name="person.2.fill" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}
      >
        {/* Messages */}
        {id === "board-introduction" && (!introductionHydrated || hasOpenedIntroduction === null) ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color="#E8A0BF" /><Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>自己紹介を読み込んでいます…</Text></View> : <FlatList
          ref={flatListRef}
          key={`${id ?? "chat"}:${introductionChat ? "latest-first" : "default"}`}
          data={displayedMessages}
          extraData={highlightedMessageId}
          inverted={introductionChat}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={room?.type === "event" && roomEvent
            ? <EventChatCard event={roomEvent} onPress={() => router.push({ pathname: "/event-detail", params: { id: roomEvent.id } })} />
            : null}
          renderItem={({ item, index }) => {
            const previous = index > 0 ? displayedMessages[index - 1] : undefined;
            const next = index + 1 < displayedMessages.length ? displayedMessages[index + 1] : undefined;
            const day = formatJapanDate(item.createdAt);
            const previousDay = previous && formatJapanDate(previous.createdAt);
            const nextDay = next && formatJapanDate(next.createdAt);
            const dateSeparator = <View style={{ alignItems: "center", marginVertical: 10 }}><View style={{ borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 11, paddingVertical: 4 }}><Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted }}>{day}</Text></View></View>;
            return <>
              {!introductionChat && day !== previousDay ? dateSeparator : null}
              {!introductionChat && requestedUnreadCount > 0 && index === firstUnreadIndex ? <View testID="chat-first-unread-marker" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 10, paddingHorizontal: 16 }}><View style={{ flex: 1, height: 1, backgroundColor: "#E8A0BF" }} /><Text style={{ fontSize: 11, fontWeight: "900", color: "#C05B88" }}>ここから未読メッセージ</Text><View style={{ flex: 1, height: 1, backgroundColor: "#E8A0BF" }} /></View> : null}
              <MessageBubble
                message={item}
                highlighted={item.id === highlightedMessageId}
                onOpenReply={jumpToMessage}
                readOnly={staffViewingOnly}
                isMe={item.senderId === viewerMemberId || item.senderId === authUser?.memberId || (
                  Boolean(item.shared && item.externalAuthorName && authUser?.name) &&
                  stripRankFromName(item.externalAuthorName ?? "") === stripRankFromName(authUser?.name ?? "")
                )}
                canDelete={!staffViewingOnly && (userIsAdmin || item.senderId === viewerMemberId || item.senderId === authUser?.memberId || (
                  Boolean(item.shared && item.externalAuthorName && authUser?.name) &&
                  stripRankFromName(item.externalAuthorName ?? "") === stripRankFromName(authUser?.name ?? "")
                ))}
                viewerId={viewerMemberId}
                viewerName={authUser?.name ?? CURRENT_USER.name}
                viewerAvatarUrl={typeof authUser?.profile?.avatarUrl === "string" ? authUser.profile.avatarUrl : undefined}
                myAvatarUri={myAvatarUri}
                senderMember={directory.find((member) => member.id === item.senderId)}
                memberDirectory={directory}
                onReact={(emoji) => handleReaction(item.id, emoji)}
                mentionGroups={mentionGroups}
                onOpenInternalLink={(pathname, params) => router.push({ pathname, params } as any)}
                onOpenReactionProfile={(memberId, name, avatarUrl) => router.push({ pathname: "/member-profile", params: { id: memberId, legacyName: name, legacyAvatar: avatarUrl ?? "" } })}
                onOpenProfile={() => {
                  const sender = getMemberById(item.senderId);
                  const legacyName = item.externalAuthorName ?? sender?.name ?? "旧Discordメンバー";
                  const matchedMember = directory.find((member) => member.id === item.senderId);
                  const openProfile = (memberId: string) => router.push({ pathname: "/member-profile", params: { id: memberId, legacyName, legacyAvatar: item.senderAvatar ?? "" } });
                  if (/^(member-|discord-)/.test(item.senderId)) {
                    openProfile(item.senderId);
                  } else if (matchedMember) {
                    openProfile(matchedMember.id);
                  } else if (item.externalAuthorName) {
                    // 表示直後でも実際の会員名簿を確認してからプロフィールを開く。
                    void Api.getMemberDirectory().then((members) => {
                      openProfile(members.find((member) => member.id === item.senderId)?.id ?? item.senderId ?? sender?.id ?? "");
                    }).catch(() => openProfile(item.senderId ?? sender?.id ?? ""));
                  } else {
                    openProfile(item.senderId ?? sender?.id ?? "");
                  }
                }}
                onReply={() => { const sender = getMemberById(item.senderId); setReplyToMessage(item); setMessageText(`@${item.externalAuthorName ?? sender?.name ?? "メンバー"} `); inputRef.current?.focus(); }}
                onEdit={() => { setEditingMessage(item); setEditingMessageText(item.content); }}
                onDelete={() => { const remove = async () => { try { if (item.shared) await Api.deleteSharedChatMessage(item.id); else await deleteMessageFromStorage(id ?? "", item.id); setMessages((current) => current.filter((message) => message.id !== item.id)); } catch (error) { Alert.alert("削除できませんでした", error instanceof Error ? error.message : "もう一度お試しください。"); } }; if (Platform.OS === "web") { void remove(); return; } Alert.alert("メッセージを削除", "このメッセージを削除しますか？", [{ text: "キャンセル", style: "cancel" }, { text: "削除", style: "destructive", onPress: remove }]); }}
              />
              {introductionChat && introductionFirstUnreadIndex === index ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 10, paddingHorizontal: 16 }}><View style={{ flex: 1, height: 1, backgroundColor: "#E8A0BF" }} /><Text style={{ fontSize: 11, fontWeight: "900", color: "#C05B88" }}>ここから未読メッセージ</Text><View style={{ flex: 1, height: 1, backgroundColor: "#E8A0BF" }} /></View> : null}
              {/* FlatList の inverted 表示では要素内の上下も反転するため、区切りを
                  メッセージの後ろに置くと画面上ではその日の先頭に表示される。 */}
              {introductionChat && day !== nextDay ? dateSeparator : null}
            </>;
          }}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 16, paddingBottom: 120, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => requestAnimationFrame(() => positionInitialMessagesRef.current?.())}
          onScrollBeginDrag={() => { openingLatestScrollUntil.current = 0; }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            if (openingLatestScrollUntil.current > Date.now() && contentOffset.y < lastAutomaticScrollTop.current - 30) {
              openingLatestScrollUntil.current = 0;
            }
            setIsNearLatest(introductionChat ? contentOffset.y <= 80 : contentOffset.y + layoutMeasurement.height >= contentSize.height - 80);
          }}
          scrollEventThrottle={80}
          onScrollToIndexFailed={(info) => { if (linkedScrollRetry.current >= 8) return; linkedScrollRetry.current += 1; flatListRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: false }); setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.5 }), 120); }}
          ListEmptyComponent={messagesHydrated ?
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <IconSymbol name="message.fill" size={36} color={colors.border} />
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}>
                まだメッセージはありません
              </Text>
            </View>
          : null}
        />}

        {!isNearLatest && messages.length > 0 ? (
          <Pressable
            onPress={() => {
              scrollToLatest(true);
            }}
            accessibilityLabel="最新のメッセージへ移動"
            style={{ position: "absolute", right: 16, bottom: keyboardVisible ? 106 : 118, zIndex: 20, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.foreground, shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: colors.background }}>最新へ</Text>
            <IconSymbol name="arrow.down" size={14} color={colors.background} />
          </Pressable>
        ) : null}

        {/* メンション候補リスト */}
        {canPostAnnouncement && mentionQuery !== null && (
          <MentionSuggestions
            query={mentionQuery}
            groups={mentionSuggestionGroups}
            members={mentionMembers.filter((member) => member.id !== viewerMemberId)}
            memberIds={mentionMemberIds}
            onSelect={handleSelectMention}
          />
        )}

        {/* Input */}
        {canPostAnnouncement ? <View
          style={{
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          {/* @メンションのヒント */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingTop: 6,
              paddingBottom: 2,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.muted }}>
              @を入力してメンション
            </Text>
          </View>
          {replyToMessage ? <View style={{ paddingHorizontal: 16, paddingTop: 6 }}><ReplyReferenceView reply={replyReference(replyToMessage.id, replyToMessage.externalAuthorName ?? getMemberById(replyToMessage.senderId)?.name ?? "メンバー", replyToMessage.content, Boolean(replyToMessage.imageUri || replyToMessage.attachmentUrls?.length))} onPress={() => jumpToMessage(replyToMessage.id)} onCancel={() => setReplyToMessage(null)} /></View> : null}
          {/* 画像プレビュー */}
          {pendingImages.length > 0 && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 6, paddingRight: 10 }}>
                {pendingImages.map((uri, index) => <View key={`${uri}-${index}`} style={{ position: "relative" }}>
                  <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 10 }} contentFit="contain" />
                  <TouchableOpacity onPress={() => setPendingImages((current) => current.filter((_, imageIndex) => imageIndex !== index))} accessibilityLabel={`${index + 1}枚目の写真を取り消す`} style={{ position: "absolute", top: -5, right: -5, backgroundColor: "#666", borderRadius: 11, width: 22, height: 22, alignItems: "center", justifyContent: "center" }}><IconSymbol name="xmark" size={12} color="#FFF" /></TouchableOpacity>
                </View>)}
              </ScrollView>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>添付 {pendingImages.length + pendingVideos.length} / 10件</Text>
            </View>
          )}
          {pendingVideos.length > 0 ? <View style={{ paddingHorizontal: 16, paddingBottom: 6, gap: 4 }}>{pendingVideos.map((video, index) => <View key={`${video.uri}-${index}`} style={{ flexDirection: "row", alignItems: "center", padding: 8, borderRadius: 8, backgroundColor: colors.surface }}><Text style={{ flex: 1, color: colors.foreground, fontSize: 12 }}>🎬 動画 {index + 1}</Text><Pressable onPress={() => setPendingVideos((current) => current.filter((_, videoIndex) => videoIndex !== index))}><Text style={{ color: colors.muted, fontWeight: "900" }}>×</Text></Pressable></View>)}</View> : null}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: keyboardVisible ? 10 : (Platform.OS === "ios" ? Math.max(insets.bottom, 10) : 10),
            }}
          >
            {/* 添付メニュー */}
            <TouchableOpacity
              onPress={() => setShowAttachmentMenu(true)}
              style={{ marginRight: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}
            >
              <IconSymbol
                name="plus"
                size={22}
                color={colors.muted}
              />
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              value={messageText}
              selection={messageSelection}
              onSelectionChange={(event) => setMessageSelection(event.nativeEvent.selection)}
              onChangeText={handleTextChange}
              placeholder="メッセージを入力..."
              placeholderTextColor={colors.muted}
              multiline
              blurOnSubmit={false}
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 10,
                fontSize: 14,
                color: colors.foreground,
                minHeight: 44,
                maxHeight: 120,
                textAlignVertical: "top",
              }}
            />
            <Pressable
              onPress={handleSend}
              style={{ marginLeft: 10 }}
            >
              <IconSymbol
                name="paperplane.fill"
                size={24}
                color={(messageText.trim() || pendingImages.length || pendingVideos.length) ? "#E8A0BF" : colors.muted}
              />
            </Pressable>
          </View>
        </View> : <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 14, alignItems: "center" }}><View style={{ flexDirection: "row", alignItems: "center" }}><IconSymbol name="lock.fill" size={15} color={colors.muted} /><Text style={{ marginLeft: 7, fontSize: 13, fontWeight: "800", color: colors.muted }}>{staffViewingOnly ? "閲覧のみ可能です" : "運営からのお知らせ専用です"}</Text></View><Text style={{ marginTop: 4, fontSize: 11, color: colors.muted }}>{staffViewingOnly ? "参加していないチャットには投稿できません" : "メンバーから返信することはできません"}</Text></View>}
      </KeyboardAvoidingView>

      <Modal visible={showAttachmentMenu} transparent animationType="fade" onRequestClose={() => setShowAttachmentMenu(false)}><Pressable onPress={() => setShowAttachmentMenu(false)} style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.38)", justifyContent: "flex-end" }}><Pressable onPress={() => {}} style={{ backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34 }}><Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground, marginBottom: 10 }}>添付するものを選択</Text>{[{ label: "写真", icon: "photo.fill", action: () => { setShowAttachmentMenu(false); void handlePickPhoto(); } }, { label: "動画", icon: "video.fill", action: () => { setShowAttachmentMenu(false); void handlePickVideo(); } }, { label: "投票", icon: "chart.bar.fill", action: () => { setShowAttachmentMenu(false); setShowPollComposer(true); } }].map((item) => <Pressable key={item.label} onPress={item.action} style={{ minHeight: 54, flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: colors.border }}><View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#5865F218", alignItems: "center", justifyContent: "center" }}><IconSymbol name={item.icon as any} size={19} color="#5865F2" /></View><Text style={{ marginLeft: 12, fontSize: 15, fontWeight: "800", color: colors.foreground }}>{item.label}</Text></Pressable>)}</Pressable></Pressable></Modal>
      <Modal visible={editingMessage !== null} transparent animationType="fade" onRequestClose={() => setEditingMessage(null)}><Pressable onPress={() => setEditingMessage(null)} style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.48)", justifyContent: "center", padding: 24 }}><Pressable onPress={() => {}} style={{ backgroundColor: colors.background, borderRadius: 20, padding: 18 }}><Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>メッセージを編集</Text><TextInput value={editingMessageText} onChangeText={setEditingMessageText} multiline autoFocus style={{ minHeight: 110, maxHeight: 260, marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 15, lineHeight: 22, color: colors.foreground, textAlignVertical: "top" }} /><View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}><Pressable onPress={() => setEditingMessage(null)} style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surface }}><Text style={{ fontWeight: "800", color: colors.foreground }}>キャンセル</Text></Pressable><Pressable disabled={savingMessageEdit || !editingMessageText.trim()} onPress={async () => { if (!editingMessage) return; setSavingMessageEdit(true); try { const content = editingMessageText.trim(); if (editingMessage.shared) { const updated = await Api.updateSharedChatMessage(editingMessage.id, content); setMessages((current) => current.map((message) => message.id === updated.id ? updated : message)); } else { const updated = { ...editingMessage, content }; await saveMessagesToStorage(id ?? "", [updated]); setMessages((current) => current.map((message) => message.id === updated.id ? updated : message)); } setEditingMessage(null); } catch (error) { Alert.alert("編集できませんでした", error instanceof Error ? error.message : "もう一度お試しください。"); } finally { setSavingMessageEdit(false); } }} style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: editingMessageText.trim() ? "#E8A0BF" : colors.border }}><Text style={{ fontWeight: "800", color: "#FFF" }}>{savingMessageEdit ? "保存中…" : "保存"}</Text></Pressable></View></Pressable></Pressable></Modal>
      <Modal visible={showPollComposer} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPollComposer(false)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}><Pressable onPress={() => setShowPollComposer(false)}><Text style={{ color: colors.muted }}>キャンセル</Text></Pressable><Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: "900", color: colors.foreground }}>投票を作成</Text><Pressable disabled={pollSending || !pollQuestion.trim() || pollOptions.filter((v) => v.trim()).length < 2 || !pollDeadline.trim()} onPress={() => void createPoll()}><Text style={{ fontWeight: "900", color: pollQuestion.trim() && pollOptions.filter((v) => v.trim()).length >= 2 && pollDeadline.trim() ? "#5865F2" : colors.border }}>{pollSending ? "送信中…" : "作成"}</Text></Pressable></View><ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled"><Text style={{ fontSize: 12, fontWeight: "800", color: colors.muted }}>質問</Text><TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder="質問を入力" placeholderTextColor={colors.muted} style={{ borderRadius: 10, backgroundColor: colors.surface, padding: 13, color: colors.foreground }} /><Text style={{ fontSize: 12, fontWeight: "800", color: colors.muted }}>選択肢</Text>{pollOptions.map((value, index) => <TextInput key={index} value={value} onChangeText={(text) => setPollOptions((items) => items.map((item, i) => i === index ? text : item))} placeholder={`選択肢 ${index + 1}`} placeholderTextColor={colors.muted} style={{ borderRadius: 10, backgroundColor: colors.surface, padding: 13, color: colors.foreground }} />)}{pollOptions.length < 10 ? <Pressable onPress={() => setPollOptions((items) => [...items, ""])}><Text style={{ color: "#5865F2", fontWeight: "800" }}>＋ 選択肢を追加</Text></Pressable> : null}<Text style={{ fontSize: 12, fontWeight: "800", color: colors.muted, marginTop: 8 }}>投票期限</Text><CalendarField label="投票期限" value={pollDeadline} onChange={setPollDeadline} /><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: pollAllowMultiple }} onPress={() => setPollAllowMultiple((value) => !value)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7 }}><View style={{ width: 21, height: 21, borderRadius: 5, borderWidth: 1.5, borderColor: pollAllowMultiple ? "#5865F2" : colors.border, backgroundColor: pollAllowMultiple ? "#5865F2" : colors.surface, alignItems: "center", justifyContent: "center" }}>{pollAllowMultiple ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "700", color: colors.foreground }}>複数回答を許可する</Text></Pressable></ScrollView></KeyboardAvoidingView></Modal>

      {/* ===== 参加者一覧モーダル ===== */}
      <Modal
        visible={showParticipants && room.id !== "board-announcement"}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowParticipants(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* モーダルヘッダー */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingTop: 20,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
              {room.type === "rank" ? `${room.requiredRank === "platinum" ? "プラチナ" : room.requiredRank === "gold" ? "ゴールド" : "シルバー"}会員 (${listedParticipants.length})` : `参加者 (${roomParticipants.length})`}
            </Text>
            <Pressable onPress={() => setShowParticipants(false)}>
              <IconSymbol name="xmark" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {/* 管理者機能（アプリ管理者またはチャット作成者のみ表示） */}
          {canManageRoom && room.type !== "rank" && (
            <View
              style={{
                margin: 16,
                padding: 12,
                backgroundColor: colors.surface,
                borderRadius: 12,
                borderWidth: 0.5,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
                チャット管理
              </Text>
              {/* タイトル変更 */}
              {editingTitle ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <TextInput
                    value={newTitle}
                    onChangeText={setNewTitle}
                    placeholder="新しいチャット名"
                    placeholderTextColor={colors.muted}
                    style={{
                      flex: 1,
                      backgroundColor: colors.background,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      fontSize: 14,
                      color: colors.foreground,
                      borderWidth: 0.5,
                      borderColor: colors.border,
                      marginRight: 8,
                    }}
                  />
                  <TouchableOpacity
                    onPress={async () => {
                      if (!newTitle.trim() || !id) return;
                      try {
                        if (room.shared) {
                          const updated = await Api.renameSharedChatRoom(id, newTitle.trim());
                          setRoom(updated as unknown as ChatRoom);
                        } else {
                          const ok = await renameRoom(id, newTitle.trim());
                          if (!ok) throw new Error("デフォルトチャットは変更できません");
                          const updated = getRoomById(id);
                          if (updated) setRoom(updated);
                        }
                        Alert.alert("変更完了", `チャット名を「${newTitle.trim()}」に変更しました`);
                      } catch (error) {
                        Alert.alert("エラー", error instanceof Error ? error.message : "変更できませんでした");
                      }
                      setEditingTitle(false);
                      setNewTitle("");
                    }}
                    style={{
                      backgroundColor: "#E8A0BF",
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>保存</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setEditingTitle(false); setNewTitle(""); }}
                    style={{ marginLeft: 6 }}
                  >
                    <Text style={{ color: colors.muted, fontSize: 13 }}>キャンセル</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => { setEditingTitle(true); setNewTitle(room.name); }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 6,
                    marginBottom: 4,
                  }}
                >
                  <IconSymbol name="pencil" size={16} color="#E8A0BF" />
                  <Text style={{ fontSize: 13, color: "#E8A0BF", marginLeft: 6 }}>チャット名を変更</Text>
                </TouchableOpacity>
              )}
              {/* メンバー追加 */}
              {canInviteMembers ? (
                <TouchableOpacity
                  onPress={() => setShowAddMember(true)}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}
                >
                  <IconSymbol name="person.badge.plus" size={16} color="#34C759" />
                  <Text style={{ fontSize: 13, color: "#34C759", marginLeft: 6 }}>メンバーを招待</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* 参加者リスト */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
            {listedParticipants.map((pid) => {
              const member = getMemberById(pid);
              const sharedMember = directory.find((item) => item.id === pid);
              if (!member && !sharedMember) return null;
              const memberName = sharedMember?.displayName ?? member?.name ?? "メンバー";
              const isCurrentUser = pid === viewerMemberId;
              const canRemove = canManageRoom && room.type !== "event" && !isCurrentUser;
              return (
                <View
                  key={pid}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    borderBottomWidth: 0.5,
                    borderBottomColor: colors.border,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setShowParticipants(false);
                      router.push({ pathname: "/member-profile", params: { id: pid } });
                    }}
                    style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                  >
                    <Image
                      source={typeof sharedMember?.profile?.avatarUrl === "string" ? { uri: sharedMember.profile.avatarUrl } : member?.avatar ?? DEFAULT_AVATAR}
                      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface }}
                      contentFit="cover"
                    />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}><Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                        {stripRankFromName(memberName)}{isCurrentUser ? " (あなた)" : ""}
                      </Text><MemberRankBadge rank={(sharedMember?.memberRank ?? member?.rank ?? "regular") as any} name={memberName} compact /><MemberRoleBadge name={memberName} role={sharedMember?.accessRole ?? member?.role} compact /><MemberClubLeaderBadges roles={sharedMember?.discordRoles} compact /></View>
                      {sharedMember?.memberTerm ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{sharedMember.memberTerm}</Text> : null}
                    </View>
                    <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                  </TouchableOpacity>
                  {canRemove && (
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          "メンバーを削除",
                          `${memberName}をこのチャットから削除しますか？`,
                          [
                            { text: "キャンセル", style: "cancel" },
                            {
                              text: "削除",
                              style: "destructive",
                              onPress: async () => {
                                if (!id) return;
                                if (room.shared) await Api.removeSharedChatRoomMember(id, pid);
                                else await removeMemberFromRoom(id, pid);
                                setRoomParticipants((prev) => prev.filter((p) => p !== pid));
                              },
                            },
                          ]
                        );
                      }}
                      style={{ marginLeft: 8, padding: 6 }}
                    >
                      <IconSymbol name="trash" size={18} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {room.type === "rank" && !directoryLoaded ? <Text style={{ color: colors.muted, paddingVertical: 20, textAlign: "center" }}>会員一覧を読み込んでいます…</Text> : null}
            {!staffViewingOnly && (room.type === "event" || room.type === "dm" || room.type === "group" || (room.type === "board" && !["community-free-chat", "board-introduction", "branch-kanto-free", "branch-kansai-free"].includes(room.id))) ? (
              <Pressable
                onPress={() => {
                  const leave = async () => {
                    if (!id) return;
                    try {
                      if (room.shared) {
                        await Api.removeSharedChatRoomMember(id, viewerMemberId);
                        await removeMemberFromRoom(id, viewerMemberId);
                      }
                      else await removeMemberFromRoom(id, CURRENT_USER.id);
                      dismissChatRoomImmediately(viewerMemberId, id);
                      setShowParticipants(false);
                      router.replace("/chat-list");
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "もう一度お試しください。";
                      if (Platform.OS === "web") window.alert(`退出できませんでした: ${message}`);
                      else Alert.alert("退出できませんでした", message);
                    }
                  };
                  if (Platform.OS === "web") {
                    if (window.confirm("このチャットから退出しますか？退出後は、再度招待されるまで閲覧できません。")) void leave();
                  } else Alert.alert("チャットから退出", "このチャットから退出しますか？退出後は、再度招待されるまで閲覧できません。", [
                    { text: "キャンセル", style: "cancel" },
                    { text: "退出する", style: "destructive", onPress: () => { void leave(); } },
                  ]);
                }}
                style={{ marginTop: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.error, paddingVertical: 13, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.error }}>チャットから退出</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      {/* ===== メンバー追加モーダル ===== */}
      <Modal
        visible={showAddMember}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowAddMember(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingTop: 20,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>メンバーを追加</Text>
            <Pressable onPress={() => setShowAddMember(false)}>
              <IconSymbol name="xmark" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
            {(room.shared ? sharedInviteCandidates : localInviteCandidates).map((candidate) => {
              const member = "displayName" in candidate ? null : candidate;
              const sharedMember = "displayName" in candidate ? candidate : null;
              const candidateId = sharedMember?.id ?? member!.id;
              const candidateName = sharedMember?.displayName ?? member!.name;
              return (
              <TouchableOpacity
                key={candidateId}
                onPress={async () => {
                  if (!id) return;
                  try {
                    if (room.shared) await Api.addSharedChatRoomMember(id, candidateId);
                    else {
                      const added = await addMemberToRoom(id, candidateId);
                      if (!added) throw new Error("相互に友達のメンバーだけを追加できます。");
                    }
                    setRoomParticipants((prev) => prev.includes(candidateId) ? prev : [...prev, candidateId]);
                    Alert.alert("追加完了", `${candidateName}をチャットに追加しました`);
                  } catch (error) {
                    Alert.alert("追加できません", error instanceof Error ? error.message : "もう一度お試しください。");
                  }
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: 0.5,
                  borderBottomColor: colors.border,
                }}
              >
                <Image
                  source={member?.avatar ?? DEFAULT_AVATAR}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface }}
                  contentFit="cover"
                />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{candidateName}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{sharedMember ? (sharedMember.memberTerm ?? "会員") : `${member?.branch} ・ ${member?.role === "admin" ? "管理者" : member?.role === "operator" ? "運営メンバー" : member?.rank}`}</Text>
                </View>
                <View
                  style={{
                    backgroundColor: "#34C759" + "20",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#34C759", fontWeight: "600" }}>追加</Text>
                </View>
              </TouchableOpacity>
            );})}
            {(room.shared ? sharedInviteCandidates : localInviteCandidates).length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>追加できるメンバーはいません</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
