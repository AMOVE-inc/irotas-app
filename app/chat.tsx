import { ScreenContainer } from "@/components/screen-container";
import { MemberClubLeaderBadges, MemberRankBadge, MemberRoleBadge, stripRankFromName } from "@/components/member-rank-badge";
import { NewMemberMark } from "@/components/new-member-mark";
import { MentionSuggestions, MentionText } from "@/components/mention-ui";
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
} from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { isAdminRole, isOperatorRole, canPostToChat } from "@/lib/access-control";
import { getAllRooms, getRoomById, getMessages, saveMessagesToStorage, loadMessagesFromStorage, loadDynamicRooms, renameRoom, addMemberToRoom, removeMemberFromRoom, toggleMessageReaction } from "@/lib/chat-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
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
  sendMentionNotification,
} from "@/lib/notifications";
import { canAccessChatRoom } from "@/lib/chat-access";
import { getFriends } from "@/lib/friendship";
import { getMentionGroups, getMentionQuery, getMentionedMemberIds, insertMention } from "@/lib/mentions";
import { type TextSelection } from "@/lib/text-formatting";
import * as Api from "@/lib/_core/api";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😋", "🙏"] as const;
const MORE_REACTION_EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋", "😛", "🤪", "🤔", "🫡", "😎", "🥳", "😮", "😢", "😭", "😡", "👍", "👎", "👏", "🙌", "🙏", "💪", "👀", "❤️", "🩷", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🔥", "✨", "🎉", "💯", "✅", "❌", "💡", "📌", "🍽️", "🍣", "🍖", "🍜", "🍕", "🍰", "☕", "🍺", "🍷"] as const;

function MessageBubble({ message, isMe, viewerId, myAvatarUri, senderMember, onReact, mentionGroups, onOpenInternalLink, onOpenProfile, canManage, onReply, onEdit, onDelete }: { message: ChatMessage; isMe: boolean; viewerId: string; myAvatarUri?: string | null; senderMember?: Api.PublicMember; onReact: (emoji: string, pollChoices?: string[], allowMultiple?: boolean) => void; mentionGroups: ReturnType<typeof getMentionGroups>; onOpenInternalLink: (pathname: "/chat" | "/board", params: Record<string, string>) => void; onOpenProfile: () => void; canManage: boolean; onReply: () => void; onEdit: () => void; onDelete: () => void }) {
  const colors = useColors();
  const sender = getMemberById(message.senderId);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showMoreReactions, setShowMoreReactions] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const pollLines = message.content.startsWith("📊 ") ? message.content.split("\n") : [];
  const pollChoices = pollLines.filter((line) => line.startsWith("◯ ")).map((line) => line.slice(2));
  const pollAllowsMultiple = pollLines.includes("🔢 複数回答可");

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // アバター画像の決定: 自分はプロフィール画像、他者はモックデータのアバター
  const avatarSource = isMe
    ? (myAvatarUri ? { uri: myAvatarUri } : (sender?.avatar ?? DEFAULT_AVATAR))
    : (message.senderAvatar ? { uri: message.senderAvatar } : (sender?.avatar ?? DEFAULT_AVATAR));

  return (
    <View
      style={{
        flexDirection: isMe ? "row-reverse" : "row",
        alignItems: "flex-end",
        marginBottom: 10,
        paddingHorizontal: 16,
      }}
    >
      {/* 自分のアバターも表示 */}
      {avatarSource && (
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
        {!isMe && (sender || message.externalAuthorName) ? (
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
            borderWidth: isMe ? 0 : 1,
            borderColor: isMe ? "transparent" : "#D4D4D8",
            borderRadius: 16,
            borderBottomRightRadius: isMe ? 4 : 16,
            borderBottomLeftRadius: isMe ? 16 : 4,
            overflow: "hidden",
          }}
        >
          {message.imageUri ? (
            <Image
              source={{ uri: message.imageUri }}
              style={{ width: 220, height: 180 }}
              contentFit="cover"
            />
          ) : null}
          {message.attachmentUrls?.length ? (
            <View style={{ gap: 4 }}>
              {message.attachmentUrls.map((uri) => <Image key={uri} source={{ uri }} style={{ width: 220, height: 180 }} contentFit="cover" />)}
            </View>
          ) : null}
          {message.content ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              {pollChoices.length >= 2 ? <View style={{ minWidth: 220 }}><MentionText content={pollLines[0].replace(/^📊 /, "")} outgoing={isMe} groups={mentionGroups} /><Text style={{ fontSize: 10, fontWeight: "800", color: isMe ? "#FFF" : colors.muted, marginTop: 5 }}>{pollAllowsMultiple ? "複数回答可" : "1つ選択"}</Text><View style={{ gap: 7, marginTop: 10 }}>{pollChoices.map((choice) => { const voteKey = `🗳️${choice}`; const voters = message.reactions?.[voteKey] ?? []; const selected = voters.includes(viewerId); return <Pressable key={choice} onPress={() => onReact(voteKey, pollChoices, pollAllowsMultiple)} style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: selected ? "#5865F2" : isMe ? "#FFF8" : colors.border, backgroundColor: selected ? "#5865F228" : "transparent" }}><Text style={{ fontSize: 13, fontWeight: "800", color: isMe ? "#FFF" : colors.foreground }}>{selected ? "●" : "○"} {choice}　{voters.length}</Text></Pressable>; })}</View><Text style={{ fontSize: 10, color: isMe ? "#FFF" : colors.muted, marginTop: 9 }}>{pollLines.find((line) => line.startsWith("⏱"))}</Text></View> : <MentionText content={message.content} outgoing={isMe} groups={mentionGroups} rooms={getAllRooms()} threads={BOARD_THREADS} onOpenInternalLink={onOpenInternalLink} />}
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
              onPress={() => onReact(emoji)}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 11, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: memberIds.includes(viewerId) ? "#F8DCE9" : colors.surface, borderWidth: 1, borderColor: memberIds.includes(viewerId) ? "#E8A0BF" : colors.border }}
            >
              <Text style={{ fontSize: 13 }}>{emoji}</Text>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted, marginLeft: 3 }}>{memberIds.length}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setShowReactionPicker((value) => !value)} accessibilityLabel="リアクションを追加" style={{ paddingHorizontal: 5, paddingVertical: 2 }}>
            <Text style={{ fontSize: 15, color: colors.muted }}>☺︎＋</Text>
          </Pressable>
        </View>
        {showReactionPicker ? (
          <View style={{ maxWidth: 280, flexDirection: "row", flexWrap: "wrap", borderRadius: 18, paddingHorizontal: 6, paddingVertical: 5, marginTop: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignSelf: isMe ? "flex-end" : "flex-start" }}>
            {REACTION_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => { onReact(emoji); setShowReactionPicker(false); }} style={{ paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 19 }}>{emoji}</Text></Pressable>)}
            <Pressable onPress={() => setShowMoreReactions((value) => !value)} style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.background }}><Text style={{ fontSize: 11, fontWeight: "800", color: colors.foreground }}>{showMoreReactions ? "閉じる" : "その他"}</Text></Pressable>
            {showMoreReactions ? <View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>{MORE_REACTION_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => { onReact(emoji); setShowReactionPicker(false); setShowMoreReactions(false); }} style={{ width: 34, height: 32, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 19 }}>{emoji}</Text></Pressable>)}</View> : null}
          </View>
        ) : null}
        <Modal visible={showActions} transparent animationType="fade" onRequestClose={() => setShowActions(false)}><Pressable onPress={() => setShowActions(false)} style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.48)", justifyContent: "flex-end" }}><Pressable onPress={() => {}} style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 30 }}><View style={{ flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.surface, borderRadius: 16, padding: 10, marginBottom: 10 }}>{REACTION_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => { onReact(emoji); setShowActions(false); }} style={{ padding: 7 }}><Text style={{ fontSize: 24 }}>{emoji}</Text></Pressable>)}</View>{[{ label: "返信", icon: "arrowshape.turn.up.left", action: onReply }, { label: "テキストをコピー", icon: "doc.on.doc", action: () => { void Clipboard.setStringAsync(message.content); } }, ...(canManage ? [{ label: "メッセージを編集", icon: "pencil", action: onEdit }, { label: "メッセージを削除", icon: "trash", action: onDelete }] : []), { label: "メッセージをピン留め", icon: "pin.fill", action: () => Alert.alert("ピン留めしました") }].map((item) => <Pressable key={item.label} onPress={() => { item.action(); setShowActions(false); }} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><IconSymbol name={item.icon as any} size={19} color={item.label.includes("削除") ? colors.error : colors.foreground} /><Text style={{ marginLeft: 12, fontSize: 15, fontWeight: "700", color: item.label.includes("削除") ? colors.error : colors.foreground }}>{item.label}</Text></Pressable>)}</Pressable></Pressable></Modal>
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
  const userCanModerate = isOperatorRole(authUser?.role, authUser?.accessRole) || userIsAdmin;
  const { id, unreadCount: unreadCountParam } = useLocalSearchParams<{ id: string; unreadCount?: string }>();
  const [messageText, setMessageText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [messageSelection, setMessageSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const mentionGroups = useMemo(() => getMentionGroups(MEMBERS, CLUBS), []);
  const flatListRef = useRef<FlatList>(null);
  const didInitialScrollRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const [isNearLatest, setIsNearLatest] = useState(true);

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

  const [room, setRoom] = useState(() => getRoomById(id ?? ""));
  const [roomParticipants, setRoomParticipants] = useState<string[]>(
    () => getRoomById(id ?? "")?.participants ?? []
  );
  const [directory, setDirectory] = useState<Api.PublicMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    id ? getMessages(id) : [],
  );
  // 自分のプロフィール画像（AsyncStorageから読み込み）
  const [myAvatarUri, setMyAvatarUri] = useState<string | null>(null);

  // 初回起動時: プロフィール画像と永続化メッセージを読み込む
  useEffect(() => {
    if (!id) return;
    setIsLoadingRoom(true);
    const loadingFallback = setTimeout(() => setIsLoadingRoom(false), 8000);
    // プロフィール画像読み込み
    AsyncStorage.getItem("profile_avatar_uri").then((uri) => {
      if (uri) setMyAvatarUri(uri);
    });
    // 動的ルームを復元してから永続化メッセージを読み込む
    loadDynamicRooms().then(() => {
      const r = getRoomById(id);
      if (r) {
        setRoom(r);
        setRoomParticipants([...r.participants]);
      }
      loadMessagesFromStorage(id).then((stored) => {
        if (stored.length > 0) {
          setMessages((prev) => {
            const storedById = new Map(stored.map((message) => [message.id, message]));
            const existingIds = new Set(prev.map((message) => message.id));
            const merged = [...prev.map((message) => storedById.get(message.id) ?? message), ...stored.filter((message) => !existingIds.has(message.id))];
            return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          });
        }
      });
      Api.getSharedChatMessages(id).then((shared) => {
        setMessages((previous) => {
          const byId = new Map(previous.map((message) => [message.id, message]));
          for (const message of shared) byId.set(message.id, message);
          return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });
      }).catch(() => {
        // 旧移行チャットは共有DBへの切替対象外でも、既存履歴を引き続き表示する。
      });
      Api.getSharedChatRooms().then((sharedRooms) => {
        const sharedRoom = sharedRooms.find((item) => item.id === id);
        if (!sharedRoom) return;
        const normalized = sharedRoom as unknown as ChatRoom;
        setRoom(normalized);
        setRoomParticipants([...normalized.participants]);
      }).catch(() => {}).finally(() => setIsLoadingRoom(false));
      Api.getMemberDirectory().then(setDirectory).catch(() => {});
    }).catch(() => setIsLoadingRoom(false));
    return () => clearTimeout(loadingFallback);
  }, [id]);

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
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [, setIsLoadingRoom] = useState(true);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDeadline, setPollDeadline] = useState("");
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollSending, setPollSending] = useState(false);

  const handlePickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("権限が必要です", "写真を送るには写真ライブラリへのアクセスを許可してください。");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPendingImage(result.assets[0].uri);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!canPostToChat(authUser?.role, id ?? "", authUser?.accessRole)) return;
    if (!messageText.trim() && !pendingImage) return;
    const content = messageText.trim();
    if (!id) return;
    try {
      let imageUrl: string | undefined;
      const supportsSharedStorage = Boolean(room?.shared) || id === "board-announcement" || id.startsWith("rank-") || id.startsWith("event_chat_");
      if (pendingImage && supportsSharedStorage) imageUrl = (await Api.uploadEventImage(pendingImage)).imageUrl;
      const newMessage = await Api.createSharedChatMessage(id, { content, imageUrl });
      setMessages((prev) => [...prev.filter((item) => item.id !== newMessage.id), newMessage]);
      setMessageText("");
      setMessageSelection({ start: 0, end: 0 });
      setPendingImage(null);
      setMentionQuery(null);

      // メンション通知を送信
      if (room && content.includes("@")) {
        const preview = content.length > 50 ? `${content.slice(0, 50)}...` : content;
        const targets = getMentionedMemberIds(content, MEMBERS, mentionGroups, room.participants).filter((memberId) => memberId !== viewerMemberId);
        for (const memberId of targets) {
          const member = getMemberById(memberId);
          if (member) void sendMentionNotification(member.name, authUser?.name ?? "メンバー", room.name, preview);
        }
      }
    } catch (error) {
      if (error instanceof Api.ApiError && error.statusCode === 404) {
        const legacyMessage: ChatMessage = {
          id: `m_new_${Date.now()}`,
          chatId: id,
          senderId: viewerMemberId,
          externalAuthorName: authUser?.name ?? undefined,
          content,
          imageUri: pendingImage ?? undefined,
          createdAt: new Date().toISOString(),
        };
        setMessages((previous) => [...previous, legacyMessage]);
        await saveMessagesToStorage(id, [legacyMessage]);
        setMessageText("");
        setMessageSelection({ start: 0, end: 0 });
        setPendingImage(null);
        setMentionQuery(null);
        return;
      }
      Alert.alert("送信できませんでした", error instanceof Error ? error.message : "通信状況を確認してもう一度お試しください。");
    }
  }, [messageText, pendingImage, id, room, mentionGroups, authUser?.role, authUser?.accessRole, authUser?.name, viewerMemberId]);

  const handleReaction = useCallback(async (messageId: string, emoji: string, pollChoices?: string[], allowMultiple = true) => {
    if (!id) return;
    const sharedMessage = messages.find((item) => item.id === messageId && item.shared);
    if (sharedMessage) {
      try {
        if (pollChoices && !allowMultiple) {
          const otherVotes = pollChoices.map((choice) => `🗳️${choice}`).filter((key) => key !== emoji && (sharedMessage.reactions?.[key] ?? []).includes(viewerMemberId));
          await Promise.all(otherVotes.map((key) => Api.setSharedChatReaction(messageId, key, false)));
        }
        const active = !(sharedMessage.reactions?.[emoji] ?? []).includes(viewerMemberId);
        const result = await Api.setSharedChatReaction(messageId, emoji, active);
        setMessages((current) => current.map((message) => message.id === messageId ? { ...message, reactions: result.reactions } : message));
      } catch (error) {
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
  }, [id, messages, viewerMemberId]);

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
    if (messages.length > 0) {
      setTimeout(() => {
        if (!didInitialScrollRef.current) {
          const unreadCount = Math.max(0, Number(unreadCountParam ?? 0));
          if (unreadCount > 0) {
            const firstUnreadIndex = Math.max(0, messages.length - unreadCount);
            flatListRef.current?.scrollToIndex({ index: firstUnreadIndex, animated: false, viewPosition: 0.08 });
            setIsNearLatest(firstUnreadIndex >= messages.length - 2);
          } else {
            flatListRef.current?.scrollToEnd({ animated: false });
            setIsNearLatest(true);
          }
          didInitialScrollRef.current = true;
          return;
        }
        if (messages.at(-1)?.senderId === viewerMemberId) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }, 100);
    }
  }, [messages, unreadCountParam, viewerMemberId]);

  if (!room) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#E8A0BF" /><Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>チャットを読み込んでいます…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!canAccessChatRoom(room, viewerMemberId, (authUser?.memberRank ?? CURRENT_USER.rank) as typeof CURRENT_USER.rank, userIsAdmin) && room.id !== "board-announcement") {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <IconSymbol name="lock.fill" size={40} color={colors.muted} />
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginTop: 14 }}>このチャットは閲覧できません</Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: "center", marginTop: 6 }}>
            ランク専用チャットは同じランクの会員、その他のチャットは参加者だけが閲覧できます。
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const typeLabel = room.type === "event" ? "イベント" : room.type === "board" ? "掲示板" : room.type === "rank" ? "ランク専用" : room.type === "group" ? "友達グループ" : room.type === "dm" ? "DM" : "部活動";
  const typeColor = room.type === "event" ? "#E8A0BF" : room.type === "board" ? "#A7C7E7" : room.type === "rank" ? "#F59E0B" : room.type === "group" ? "#5B9BD5" : room.type === "dm" ? "#FF9500" : "#34C759";
  const canManageRoom = userIsAdmin || room.createdBy === viewerMemberId;
  const canInviteMembers = canManageRoom && room.type !== "rank" && room.type !== "event" && room.type !== "dm";
  const canPostAnnouncement = canPostToChat(authUser?.role, room.id, authUser?.accessRole);
  const sharedInviteCandidates = directory.filter((member) => member.id !== viewerMemberId && !roomParticipants.includes(member.id));
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
            {room.id !== "board-announcement" ? (
              <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>
                {roomParticipants.length}人参加中
              </Text>
            ) : null}
          </View>
        </View>
        {room.id !== "board-announcement" ? (
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
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMe={item.senderId === viewerMemberId}
              viewerId={viewerMemberId}
              myAvatarUri={myAvatarUri}
              senderMember={directory.find((member) => member.id === item.senderId)}
              onReact={(emoji) => handleReaction(item.id, emoji)}
              mentionGroups={mentionGroups}
              onOpenInternalLink={(pathname, params) => router.push({ pathname, params } as any)}
              onOpenProfile={() => {
                const sender = getMemberById(item.senderId);
                router.push({ pathname: "/member-profile", params: { id: item.senderId || sender?.id || "", legacyName: item.externalAuthorName ?? sender?.name ?? "旧Discordメンバー" } });
              }}
              canManage={item.senderId === viewerMemberId || userCanModerate}
              onReply={() => { const sender = getMemberById(item.senderId); setMessageText(`@${item.externalAuthorName ?? sender?.name ?? "メンバー"} `); inputRef.current?.focus(); }}
              onEdit={() => { const next = Platform.OS === "web" ? window.prompt("メッセージを編集", item.content) : null; if (typeof next === "string" && next.trim()) { setMessages((current) => current.map((message) => message.id === item.id ? { ...message, content: next.trim() } : message)); void saveMessagesToStorage(id ?? "", [{ ...item, content: next.trim() }]); } }}
              onDelete={() => { setMessages((current) => current.filter((message) => message.id !== item.id)); }}
            />
          )}
          contentContainerStyle={{ paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            setIsNearLatest(contentOffset.y + layoutMeasurement.height >= contentSize.height - 80);
          }}
          scrollEventThrottle={80}
          onScrollToIndexFailed={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <IconSymbol name="message.fill" size={36} color={colors.border} />
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}>
                まだメッセージはありません
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                最初のメッセージを送りましょう
              </Text>
            </View>
          }
        />

        {!isNearLatest && messages.length > 0 ? (
          <Pressable
            onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
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
            groups={mentionGroups}
            members={MEMBERS.filter((member) => member.id !== CURRENT_USER.id && room.participants.includes(member.id))}
            memberIds={roomParticipants.filter((memberId) => memberId !== viewerMemberId)}
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
          {/* 画像プレビュー */}
          {pendingImage && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
              <View style={{ position: "relative", alignSelf: "flex-start" }}>
                <Image
                  source={{ uri: pendingImage }}
                  style={{ width: 80, height: 80, borderRadius: 10 }}
                  contentFit="cover"
                />
                <TouchableOpacity
                  onPress={() => setPendingImage(null)}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    backgroundColor: "#666",
                    borderRadius: 10,
                    width: 20,
                    height: 20,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconSymbol name="xmark" size={12} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
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
              returnKeyType="done"
              onSubmitEditing={handleSend}
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 10,
                fontSize: 14,
                color: colors.foreground,
              }}
            />
            <Pressable
              onPress={handleSend}
              style={{ marginLeft: 10 }}
            >
              <IconSymbol
                name="paperplane.fill"
                size={24}
                color={(messageText.trim() || pendingImage) ? "#E8A0BF" : colors.muted}
              />
            </Pressable>
          </View>
        </View> : <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 14, alignItems: "center" }}><View style={{ flexDirection: "row", alignItems: "center" }}><IconSymbol name="lock.fill" size={15} color={colors.muted} /><Text style={{ marginLeft: 7, fontSize: 13, fontWeight: "800", color: colors.muted }}>運営からのお知らせ専用です</Text></View><Text style={{ marginTop: 4, fontSize: 11, color: colors.muted }}>メンバーから返信することはできません</Text></View>}
      </KeyboardAvoidingView>

      <Modal visible={showAttachmentMenu} transparent animationType="fade" onRequestClose={() => setShowAttachmentMenu(false)}><Pressable onPress={() => setShowAttachmentMenu(false)} style={{ flex: 1, backgroundColor: "rgba(20,18,24,0.38)", justifyContent: "flex-end" }}><Pressable onPress={() => {}} style={{ backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34 }}><Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground, marginBottom: 10 }}>添付するものを選択</Text>{[{ label: "写真", icon: "photo.fill", action: () => { setShowAttachmentMenu(false); void handlePickPhoto(); } }, { label: "投票", icon: "chart.bar.fill", action: () => { setShowAttachmentMenu(false); setShowPollComposer(true); } }].map((item) => <Pressable key={item.label} onPress={item.action} style={{ minHeight: 54, flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: colors.border }}><View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#5865F218", alignItems: "center", justifyContent: "center" }}><IconSymbol name={item.icon as any} size={19} color="#5865F2" /></View><Text style={{ marginLeft: 12, fontSize: 15, fontWeight: "800", color: colors.foreground }}>{item.label}</Text></Pressable>)}</Pressable></Pressable></Modal>
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
              参加者 ({roomParticipants.length})
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
            {roomParticipants.map((pid) => {
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
            {room.type !== "rank" ? (
              <Pressable
                onPress={() => Alert.alert("チャットから退出", "このチャットから退出しますか？退出後は、再度招待されるまで閲覧できません。", [
                  { text: "キャンセル", style: "cancel" },
                  { text: "退出する", style: "destructive", onPress: async () => {
                    if (!id) return;
                    if (room.shared) await Api.removeSharedChatRoomMember(id, viewerMemberId);
                    else await removeMemberFromRoom(id, CURRENT_USER.id);
                    setShowParticipants(false);
                    router.replace("/chat-list");
                  } },
                ])}
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
