import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { MentionSuggestions, MentionText } from "@/components/mention-ui";
import { TextFormattingToolbar } from "@/components/text-formatting-toolbar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  CURRENT_USER,
  DEFAULT_AVATAR,
  MEMBERS,
  CLUBS,
  getMemberById,
  type ChatMessage,
} from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { getRoomById, getMessages, saveMessagesToStorage, loadMessagesFromStorage, loadDynamicRooms, renameRoom, addMemberToRoom, removeMemberFromRoom, toggleMessageReaction } from "@/lib/chat-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
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
import { applyTextFormat, type TextFormat, type TextSelection } from "@/lib/text-formatting";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "😋", "🙏"] as const;
const MORE_REACTION_EMOJIS = ["👏", "😊", "😍", "🥳", "😆", "😭", "😮", "🤔", "🙌", "✨", "🔥", "💯", "🍽️", "🍣", "🍷", "☕", "🍺", "🍰", "👌", "💪", "🙏🏻", "👀", "💡", "✅"] as const;

function MessageBubble({ message, isMe, myAvatarUri, onReact, mentionGroups }: { message: ChatMessage; isMe: boolean; myAvatarUri?: string | null; onReact: (emoji: string) => void; mentionGroups: ReturnType<typeof getMentionGroups> }) {
  const colors = useColors();
  const sender = getMemberById(message.senderId);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showMoreReactions, setShowMoreReactions] = useState(false);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // アバター画像の決定: 自分はプロフィール画像、他者はモックデータのアバター
  const avatarSource = isMe
    ? (myAvatarUri ? { uri: myAvatarUri } : (sender?.avatar ?? DEFAULT_AVATAR))
    : (sender?.avatar ?? DEFAULT_AVATAR);

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
        <Image
          source={avatarSource}
          style={[
            { width: 28, height: 28, borderRadius: 14 },
            isMe ? { marginLeft: 8 } : { marginRight: 8 },
          ]}
          contentFit="cover"
        />
      )}
      <View style={{ maxWidth: "70%" }}>
        {!isMe && (sender || message.externalAuthorName) ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2, marginLeft: 2 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>{message.externalAuthorName ?? sender?.name}</Text>
            {sender ? <NewMemberMark member={sender} size={11} /> : null}
          </View>
        ) : null}
        <View
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
              <MentionText content={message.content} outgoing={isMe} groups={mentionGroups} />
            </View>
          ) : null}
        </View>
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
          {Object.entries(message.reactions ?? {}).map(([emoji, memberIds]) => (
            <Pressable
              key={emoji}
              onPress={() => onReact(emoji)}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 11, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: memberIds.includes(CURRENT_USER.id) ? "#F8DCE9" : colors.surface, borderWidth: 1, borderColor: memberIds.includes(CURRENT_USER.id) ? "#E8A0BF" : colors.border }}
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
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const userIsAdmin = authUser?.role === "admin";
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messageText, setMessageText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [messageSelection, setMessageSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const mentionGroups = useMemo(() => getMentionGroups(MEMBERS, CLUBS), []);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

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
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    id ? getMessages(id) : [],
  );
  // 自分のプロフィール画像（AsyncStorageから読み込み）
  const [myAvatarUri, setMyAvatarUri] = useState<string | null>(null);

  // 初回起動時: プロフィール画像と永続化メッセージを読み込む
  useEffect(() => {
    if (!id) return;
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
    });
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

  const handleMessageFormat = useCallback((format: TextFormat) => {
    const result = applyTextFormat(messageText, messageSelection, format);
    setMessageText(result.text);
    setMessageSelection(result.selection);
    inputRef.current?.focus();
  }, [messageSelection, messageText]);

  // 通知権限を初回に要求
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  const insets = useSafeAreaInsets();
  const [pendingImage, setPendingImage] = useState<string | null>(null);

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

  const handleSend = useCallback(() => {
    if (!messageText.trim() && !pendingImage) return;
    const content = messageText.trim();
    const newMessage: ChatMessage = {
      id: `m_new_${Date.now()}`,
      chatId: id || "",
      senderId: CURRENT_USER.id,
      content,
      imageUri: pendingImage ?? undefined,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMessage]);
    setMessageText("");
    setMessageSelection({ start: 0, end: 0 });
    setPendingImage(null);
    setMentionQuery(null);

    // AsyncStorageに永続化
    if (id) {
      saveMessagesToStorage(id, [newMessage]);
    }

    // メンション通知を送信
    if (room && content.includes("@")) {
      const preview = content.length > 50 ? `${content.slice(0, 50)}...` : content;
      const targets = getMentionedMemberIds(content, MEMBERS, mentionGroups, room.participants).filter((memberId) => memberId !== CURRENT_USER.id);
      for (const memberId of targets) {
        const member = getMemberById(memberId);
        if (member) void sendMentionNotification(member.name, CURRENT_USER.name, room.name, preview);
      }
    }
  }, [messageText, pendingImage, id, room, mentionGroups]);

  const handleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!id) return;
    const updated = await toggleMessageReaction(id, messageId, emoji, CURRENT_USER.id);
    if (updated) setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
  }, [id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  if (!room) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16, color: colors.muted }}>チャットが見つかりません</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!canAccessChatRoom(room, CURRENT_USER.id, CURRENT_USER.rank, userIsAdmin)) {
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
  const canManageRoom = userIsAdmin || room.createdBy === CURRENT_USER.id;
  const canInviteMembers = canManageRoom && room.type !== "rank" && room.type !== "event" && room.type !== "dm";
  const inviteCandidates = (room.type === "group" ? getFriends(CURRENT_USER.id) : MEMBERS.filter((member) => member.id !== CURRENT_USER.id))
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
            <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>
              {roomParticipants.length}人参加中
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => setShowParticipants(true)}
        >
          <IconSymbol name="person.2.fill" size={20} color={colors.muted} />
        </Pressable>
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
              isMe={item.senderId === CURRENT_USER.id}
              myAvatarUri={myAvatarUri}
              onReact={(emoji) => handleReaction(item.id, emoji)}
              mentionGroups={mentionGroups}
            />
          )}
          contentContainerStyle={{ paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}
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

        {/* メンション候補リスト */}
        {mentionQuery !== null && (
          <MentionSuggestions
            query={mentionQuery}
            groups={mentionGroups}
            members={MEMBERS.filter((member) => member.id !== CURRENT_USER.id && room.participants.includes(member.id))}
            onSelect={handleSelectMention}
          />
        )}

        {/* Input */}
        <View
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
          <View style={{ paddingHorizontal: 16 }}><TextFormattingToolbar onFormat={handleMessageFormat} /></View>
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
            {/* 画像選択ボタン */}
            <TouchableOpacity
              onPress={handlePickPhoto}
              style={{ marginRight: 10 }}
            >
              <IconSymbol
                name="photo.fill"
                size={26}
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
        </View>
      </KeyboardAvoidingView>

      {/* ===== 参加者一覧モーダル ===== */}
      <Modal
        visible={showParticipants}
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
                      const ok = await renameRoom(id, newTitle.trim());
                      if (ok) {
                        const r = getRoomById(id);
                        if (r) setRoom(r);
                        Alert.alert("変更完了", `チャット名を「${newTitle.trim()}」に変更しました`);
                      } else {
                        Alert.alert("エラー", "変更できませんでした（デフォルトチャットは変更不可）");
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
              if (!member) return null;
              const isCurrentUser = pid === CURRENT_USER.id;
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
                      source={member.avatar}
                      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface }}
                      contentFit="cover"
                    />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                        {member.name}{isCurrentUser ? " (あなた)" : ""}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
                        {member.branch} ・ {member.rank}
                      </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                  </TouchableOpacity>
                  {canRemove && (
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          "メンバーを削除",
                          `${member.name}をこのチャットから削除しますか？`,
                          [
                            { text: "キャンセル", style: "cancel" },
                            {
                              text: "削除",
                              style: "destructive",
                              onPress: async () => {
                                if (!id) return;
                                await removeMemberFromRoom(id, pid);
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
                    await removeMemberFromRoom(id, CURRENT_USER.id);
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
            {inviteCandidates.map((member) => (
              <TouchableOpacity
                key={member.id}
                onPress={async () => {
                  if (!id) return;
                  const added = await addMemberToRoom(id, member.id);
                  if (!added) {
                    Alert.alert("追加できません", "相互に友達のメンバーだけを追加できます。");
                    return;
                  }
                  setRoomParticipants((prev) => [...prev, member.id]);
                  Alert.alert("追加完了", `${member.name}をチャットに追加しました`);
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
                  source={member.avatar}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface }}
                  contentFit="cover"
                />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{member.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{member.branch} ・ {member.rank}</Text>
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
            ))}
            {inviteCandidates.length === 0 && (
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
