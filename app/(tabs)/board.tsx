import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  BOARD_THREADS,
  BOARD_CATEGORIES,
  BOARD_COMMENTS,
  RANK_COLORS,
  RANK_LABELS,
  CURRENT_USER,
  type BoardThread,
  type BoardComment,
  type BoardCategory,
} from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { createBoardChat } from "@/lib/chat-store";
import { canManageBoardCategories, canViewClubThread } from "@/lib/access-control";
import { isGoogleMapsUrl, MEAL_BUDGETS, PREFECTURES } from "@/lib/meal-report";
import { useClubs } from "@/lib/club-store";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState, useCallback, useEffect } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BOARD_GROUPS: { key: BoardCategory["group"]; label: string }[] = [
  { key: "all", label: "全体" },
  { key: "area", label: "エリア別" },
  { key: "club", label: "部活" },
];

const BOARD_EVENT_RULES = [
  {
    title: "✅ 1. 募集および参加確定について",
    items: [
      "メンバーの調整：原則IRO+内で募集するイベントは、参加者をIRO+メンバー限定としてください。やむをえず人数調整で外部の方も参加される場合は、事前に運営までご連絡ください。",
      "募集期間の調整：募集人数を大幅に超えた場合は、運営の判断により募集期日を早めるよう調整を促すことがあります。",
      "迅速な確定連絡：募集期日を過ぎた後、幹事様は速やかに（原則2日以内）参加者を確定し、プライベートチャットで参加確定連絡をお願いします。",
      "リアクションの徹底：確定連絡に対し、1週間以上リアクション（スタンプ可）がない場合はキャンセル扱いとなります。",
    ],
  },
  {
    title: "✅ 2. キャンセルポリシーについて",
    intro: "⚠️ 原則キャンセルはお控えください。誰もが安心して楽しくイベントを企画し、美味しい時間を共有し続けられる場所であるための規定です。",
    items: [
      "開催日の1週間前（7日前）〜当日のキャンセルは、原則としてキャンセル料100%が発生します。",
      "代理の参加者が見つかり、枠を譲渡できた場合はキャンセル料はかかりません。",
      "代理参加者を探す・決定する際は、必ず事前にイベント主催者（幹事または運営）へプライベートチャットで連絡し、承諾を得てください。個別DMは幹事が気づかず、運営でも検知できないためNGです。",
    ],
  },
  {
    title: "✅ 3. ドタキャンに対するペナルティについて",
    items: [
      "前日および当日のキャンセル（ドタキャン）に限り、キャンセル料とは別に1ペナルティポイントが付与されます。",
      "ポイントの有効期限は付与日から3ヶ月間です。",
      "累積3ポイントに達した場合、該当月から1ヶ月間、全イベントへの参加および新規申込ができません。",
      "イベントを無断欠席した場合、またはキャンセル料の支払いを拒否した場合は即退会処分となります。",
    ],
  },
] as const;

function BoardRulesPanel() {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 2, borderRadius: 14, backgroundColor: "#FFF8F0", borderWidth: 1, borderColor: "#EED9BF", overflow: "hidden" }}>
      <Pressable onPress={() => setExpanded((value) => !value)} style={{ flexDirection: "row", alignItems: "center", padding: 14 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#FF950018", alignItems: "center", justifyContent: "center" }}><IconSymbol name="shield.fill" size={18} color="#C97813" /></View>
        <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>掲示板・イベント募集のルール</Text><Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>投稿・参加前に必ず確認してください</Text></View>
        <IconSymbol name={expanded ? "chevron.up" : "chevron.down"} size={18} color={colors.muted} />
      </Pressable>
      {expanded ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 16, borderTopWidth: 0.5, borderTopColor: "#EED9BF" }}>
          {BOARD_EVENT_RULES.map((section) => (
            <View key={section.title} style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground, lineHeight: 22 }}>{section.title}</Text>
              {"intro" in section ? <Text style={{ fontSize: 13, lineHeight: 20, color: colors.foreground, marginTop: 7 }}>{section.intro}</Text> : null}
              {section.items.map((item) => <View key={item} style={{ flexDirection: "row", marginTop: 8 }}><Text style={{ fontSize: 13, lineHeight: 20, color: colors.foreground, marginRight: 7 }}>•</Text><Text style={{ flex: 1, fontSize: 13, lineHeight: 20, color: colors.foreground }}>{item}</Text></View>)}
            </View>
          ))}
          <View style={{ marginTop: 18, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>💡 最後に、メンバーの皆様へ</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.foreground, marginTop: 7 }}>急な仕事や体調不良などで、1週間を切ってキャンセルせざるを得ない場合は、まずイベント主催者・幹事へすぐに一報を入れ、コミュニティ内で代理参加者をお探しください。</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: "800", color: colors.foreground, marginTop: 8 }}>イベントは幹事の皆様の善意と、お店側の協力で成り立っています。全員が気持ちよく活動できるよう、ルール遵守とスケジュール管理をお願いします🙏🏻</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.foreground, marginTop: 8 }}>今後もみんなで最高に美味しい体験をたくさん作っていきましょう😊</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MealReportContent({ thread, compact = false }: { thread: BoardThread; compact?: boolean }) {
  const colors = useColors();
  const report = thread.mealReport;
  if (!report) return null;

  return (
    <View
      style={{
        backgroundColor: "#FFF8F0",
        borderRadius: 12,
        padding: compact ? 10 : 14,
        marginBottom: compact ? 8 : 16,
        borderWidth: 1,
        borderColor: "#F3E2D2",
      }}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>📍 {report.prefecture}</Text>
        {report.budget ? <Text style={{ fontSize: 13, color: colors.muted }}>予算 {report.budget}</Text> : null}
      </View>
      <Text style={{ fontSize: 17, color: "#F5A623", letterSpacing: 2, marginTop: 6 }}>
        {"★".repeat(report.rating)}{"☆".repeat(5 - report.rating)}
      </Text>
      {!compact && report.recommendedMenu ? (
        <Text style={{ fontSize: 14, color: colors.foreground, marginTop: 9 }}>
          <Text style={{ fontWeight: "800" }}>おすすめメニュー　</Text>{report.recommendedMenu}
        </Text>
      ) : null}
      {!compact && report.comment ? (
        <Text style={{ fontSize: 14, lineHeight: 21, color: colors.foreground, marginTop: 8 }}>
          <Text style={{ fontWeight: "800" }}>一言　</Text>{report.comment}
        </Text>
      ) : null}
      {!compact && (report.googleMapUrl || report.tabelogUrl) ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {report.googleMapUrl ? <Pressable
          onPress={async (event) => {
            event.stopPropagation?.();
            await Linking.openURL(report.googleMapUrl!);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            backgroundColor: "#EAF2FF",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <IconSymbol name="map.fill" size={16} color="#4285F4" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#4285F4", marginLeft: 6 }}>
            Google Mapで見る
          </Text>
        </Pressable> : null}
        {report.tabelogUrl ? <Pressable
          onPress={async (event) => {
            event.stopPropagation?.();
            await Linking.openURL(report.tabelogUrl!);
          }}
          style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFF0E6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <IconSymbol name="link" size={16} color="#E36D25" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#E36D25", marginLeft: 6 }}>食べログで見る</Text>
        </Pressable> : null}
        </View>
      ) : null}
    </View>
  );
}

function ThreadCard({ thread, onPress, onEdit }: { thread: BoardThread; onPress: () => void; onEdit?: () => void }) {
  const colors = useColors();
  const router = useRouter();
  const isParticipant = thread.recruitParticipants?.includes(CURRENT_USER.id);
  const isAuthorCard = thread.author.id === CURRENT_USER.id;
  const isPlatinum = thread.author.rank === "platinum";

  const timeAgo = useCallback((dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "たった今";
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    return `${days}日前`;
  }, []);

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        padding: 14,
      }}
    >
      {/* Author */}
      <Pressable
        onPress={() => router.push({ pathname: "/member-profile", params: { id: thread.author.id } })}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
      >
        <Image
          source={thread.author.avatar}
          style={{ width: 30, height: 30, borderRadius: 15 }}
          contentFit="cover"
        />
        <View style={{ marginLeft: 8, flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
              {thread.author.name}
            </Text>
            <View
              style={{
                backgroundColor: isPlatinum ? "#171717" : RANK_COLORS[thread.author.rank] + "20",
                borderWidth: isPlatinum ? 1 : 0,
                borderColor: "#D4AF37",
                borderRadius: 8,
                paddingHorizontal: 6,
                paddingVertical: 1,
                marginLeft: 6,
              }}
            >
              <Text style={{ fontSize: 9, fontWeight: "700", color: isPlatinum ? "#D4AF37" : RANK_COLORS[thread.author.rank] }}>
                {RANK_LABELS[thread.author.rank]}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>{timeAgo(thread.lastUpdated)}</Text>
          {isAuthorCard && onEdit && (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onEdit(); }}
              style={{ padding: 4 }}
            >
              <IconSymbol name="ellipsis" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </Pressable>

      {/* Title */}
      <Text
        style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}
        numberOfLines={2}
      >
        {thread.title}
      </Text>

      {/* Preview */}
      {thread.mealReport ? (
        <MealReportContent thread={thread} compact />
      ) : (
        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }} numberOfLines={2}>
          {thread.preview}
        </Text>
      )}

      {/* Images */}
      {thread.images && thread.images.length > 0 && (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          {thread.images.slice(0, 3).map((uri, i) => (
            <View key={i} style={{ position: "relative" }}>
              <Image
                source={{ uri }}
                style={{ width: 72, height: 72, borderRadius: 8 }}
                contentFit="cover"
              />
              {i === 2 && thread.images!.length > 3 && (
                <View
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "rgba(0,0,0,0.45)",
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700" }}>
                    +{thread.images!.length - 3}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Recruiting badge */}
      {thread.isRecruiting && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#A7C7E715",
            borderRadius: 10,
            padding: 10,
            marginBottom: 8,
          }}
        >
          <IconSymbol name="person.badge.plus" size={16} color="#A7C7E7" />
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#A7C7E7", marginLeft: 6, flex: 1 }}>
            参加者募集中
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {thread.recruitAttendees}/{thread.recruitCapacity}名
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <IconSymbol name="bubble.left.fill" size={14} color={colors.muted} />
          <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>
            {thread.commentCount}件のコメント
          </Text>
        </View>
        {isParticipant && thread.chatId && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              router.push({ pathname: "/chat", params: { id: thread.chatId } });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#A7C7E720",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <IconSymbol name="message.fill" size={12} color="#A7C7E7" />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#A7C7E7", marginLeft: 4 }}>
              チャット
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

// ============================================================
// SelectMembersModal - 投稿者がコメントしたメンバーを選択してチャット作成
// ============================================================
function SelectMembersModal({
  visible,
  thread,
  commenters,
  onClose,
  onCreateChat,
}: {
  visible: boolean;
  thread: BoardThread;
  commenters: BoardComment[];
  onClose: () => void;
  onCreateChat: (selectedIds: string[], chatId: string) => void;
}) {
  const colors = useColors();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // コメントしたユニークなメンバー（自分以外）
  const uniqueCommenters = commenters
    .filter((c) => c.author.id !== CURRENT_USER.id)
    .reduce<BoardComment[]>((acc, c) => {
      if (!acc.find((x) => x.author.id === c.author.id)) acc.push(c);
      return acc;
    }, []);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreate = () => {
    if (selectedIds.length === 0) {
      Alert.alert("メンバーを選択してください");
      return;
    }
    const allParticipants = [CURRENT_USER.id, ...selectedIds];
    const room = createBoardChat(thread.id, thread.title, allParticipants, CURRENT_USER.id);
    onCreateChat(selectedIds, room.id);
    setSelectedIds([]);
    onClose();
    Alert.alert("チャット作成完了", "選択したメンバーとのプライベートチャットを開設しました。");
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 20,
            paddingBottom: 14,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border,
          }}
        >
          <Pressable onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            チャットメンバーを選択
          </Text>
          <Pressable onPress={handleCreate}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: selectedIds.length > 0 ? "#E8A0BF" : colors.muted }}>
              作成
            </Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: 13, color: colors.muted, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          コメントしたメンバーからプライベートチャットに招待するメンバーを選択してください
        </Text>

        {uniqueCommenters.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Text style={{ fontSize: 15, color: colors.muted, textAlign: "center" }}>
              まだコメントしたメンバーがいません。{"\n"}コメントで参加者を募ってください。
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {uniqueCommenters.map((comment) => {
              const isSelected = selectedIds.includes(comment.author.id);
              return (
                <Pressable
                  key={comment.author.id}
                  onPress={() => toggle(comment.author.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: isSelected ? "#E8A0BF15" : colors.surface,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    borderWidth: isSelected ? 1.5 : 0,
                    borderColor: "#E8A0BF",
                  }}
                >
                  <Image
                    source={comment.author.avatar}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                      {comment.author.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
                      「{comment.content}」
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: isSelected ? "#E8A0BF" : "transparent",
                      borderWidth: isSelected ? 0 : 1.5,
                      borderColor: colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected && <IconSymbol name="checkmark" size={14} color="#FFF" />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function ThreadDetailModal({
  thread,
  onClose,
}: {
  thread: BoardThread;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<BoardComment[]>(
    BOARD_COMMENTS.filter((c) => c.threadId === thread.id),
  );
  const [chatRoomId, setChatRoomId] = useState<string | null>(thread.chatId ?? null);
  const [showSelectMembers, setShowSelectMembers] = useState(false);
  const [recruitCapacity, setRecruitCapacity] = useState<number | undefined>(thread.recruitCapacity);
  const [showCapacityEdit, setShowCapacityEdit] = useState(false);
  const [capacityInput, setCapacityInput] = useState(String(thread.recruitCapacity ?? ""));

  const isAuthor = thread.author.id === CURRENT_USER.id;
  const isParticipant = (thread.recruitParticipants ?? []).includes(CURRENT_USER.id);
  const isPlatinum = thread.author.rank === "platinum";

  const handleComment = () => {
    if (!commentText.trim()) return;
    const newComment: BoardComment = {
      id: `bc_new_${Date.now()}`,
      threadId: thread.id,
      author: CURRENT_USER,
      content: commentText.trim(),
      createdAt: new Date().toISOString(),
    };
    setComments([...comments, newComment]);
    setCommentText("");
  };

  const handleCreateChat = (selectedIds: string[], newChatId: string) => {
    setChatRoomId(newChatId);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "たった今";
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    return `${days}日前`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
          backgroundColor: colors.background,
        }}
      >
        <Pressable onPress={onClose}>
          <IconSymbol name="xmark" size={22} color={colors.foreground} />
        </Pressable>
        <Text
          style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground, marginLeft: 12 }}
          numberOfLines={1}
        >
          {thread.title}
        </Text>
        {(isParticipant || isAuthor) && chatRoomId && (
          <Pressable
            onPress={() => {
              onClose();
              router.push({ pathname: "/chat", params: { id: chatRoomId } });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#A7C7E720",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <IconSymbol name="message.fill" size={14} color="#A7C7E7" />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#A7C7E7", marginLeft: 4 }}>
              チャット
            </Text>
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 16 : 0}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {/* Thread content */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Image
              source={thread.author.avatar}
              style={{ width: 36, height: 36, borderRadius: 18 }}
              contentFit="cover"
            />
            <View style={{ marginLeft: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                  {thread.author.name}
                </Text>
                <View
                  style={{
                    backgroundColor: isPlatinum ? "#171717" : RANK_COLORS[thread.author.rank] + "20",
                    borderWidth: isPlatinum ? 1 : 0,
                    borderColor: "#D4AF37",
                    borderRadius: 8,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    marginLeft: 6,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: "700", color: isPlatinum ? "#D4AF37" : RANK_COLORS[thread.author.rank] }}>
                    {RANK_LABELS[thread.author.rank]}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                {thread.author.generation}期生
              </Text>
            </View>
          </View>

          {thread.mealReport ? (
            <MealReportContent thread={thread} />
          ) : (
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground, marginBottom: 16 }}>
              {thread.preview}
            </Text>
          )}

          {/* 画像 */}
          {thread.images && thread.images.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {thread.images.map((uri, i) => (
                <Image
                  key={i}
                  source={{ uri }}
                  style={{ width: 100, height: 100, borderRadius: 10 }}
                  contentFit="cover"
                />
              ))}
            </View>
          )}

          {/* 募集中バナー（投稿者向け：チャット作成ボタン付き） */}
          {thread.isRecruiting && (
            <View
              style={{
                backgroundColor: "#A7C7E710",
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "#A7C7E730",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <IconSymbol name="person.badge.plus" size={18} color="#A7C7E7" />
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#A7C7E7", marginLeft: 8 }}>
                  参加者募集中
                </Text>
                {thread.eventDate && (
                  <Text style={{ fontSize: 12, color: colors.muted, marginLeft: "auto" }}>
                    開催日: {thread.eventDate}
                  </Text>
                )}
              </View>
              {/* 募集人数表示 */}
              {recruitCapacity !== undefined && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <IconSymbol name="person.3.fill" size={14} color="#A7C7E7" />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginLeft: 6 }}>
                    募集人数: <Text style={{ color: "#A7C7E7" }}>{recruitCapacity}名</Text>
                  </Text>
                  {isAuthor && (
                    <Pressable
                      onPress={() => { setCapacityInput(String(recruitCapacity)); setShowCapacityEdit(true); }}
                      style={{ marginLeft: 8, backgroundColor: "#A7C7E720", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}
                    >
                      <Text style={{ fontSize: 11, color: "#A7C7E7", fontWeight: "600" }}>変更</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {/* 人数変更フォーム */}
              {showCapacityEdit && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
                  <TextInput
                    value={capacityInput}
                    onChangeText={setCapacityInput}
                    keyboardType="number-pad"
                    placeholder="人数"
                    placeholderTextColor={colors.muted}
                    style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: "#A7C7E7" }}
                  />
                  <Pressable
                    onPress={() => {
                      const n = parseInt(capacityInput, 10);
                      if (!isNaN(n) && n > 0) { setRecruitCapacity(n); setShowCapacityEdit(false); }
                    }}
                    style={{ backgroundColor: "#A7C7E7", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFF" }}>確定</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowCapacityEdit(false)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 13, color: colors.muted }}>キャンセル</Text>
                  </Pressable>
                </View>
              )}
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: isAuthor ? 12 : 0 }}>
                コメントで参加希望を募り、投稿者がメンバーを選んでプライベートチャットを作成できます。
              </Text>
              {/* 投稿者のみ：チャット作成ボタン */}
              {isAuthor && (
                <Pressable
                  onPress={() => setShowSelectMembers(true)}
                  style={{
                    backgroundColor: "#A7C7E7",
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>
                    {chatRoomId ? "チャットメンバーを追加" : "プライベートチャットを作成"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Comments */}
          <View style={{ borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              コメント ({comments.length})
            </Text>
            {comments.map((comment) => (
              <View key={comment.id} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <Image
                    source={comment.author.avatar}
                    style={{ width: 24, height: 24, borderRadius: 12 }}
                    contentFit="cover"
                  />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginLeft: 8 }}>
                    {comment.author.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 8 }}>
                    {timeAgo(comment.createdAt)}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.foreground, marginLeft: 32 }}>
                  {comment.content}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Comment input */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom, 10) : 10,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <TextInput
            value={commentText}
            onChangeText={setCommentText}
            placeholder="コメントを入力..."
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            onSubmitEditing={handleComment}
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
          <Pressable onPress={handleComment} style={{ marginLeft: 10 }}>
            <IconSymbol name="paperplane.fill" size={24} color={commentText.trim() ? "#E8A0BF" : colors.muted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* メンバー選択モーダル */}
      <SelectMembersModal
        visible={showSelectMembers}
        thread={thread}
        commenters={comments}
        onClose={() => setShowSelectMembers(false)}
        onCreateChat={handleCreateChat}
      />
    </View>
  );
}

// カテゴリ追加モーダル（管理者限定）
function AddCategoryModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (label: string) => void;
}) {
  const colors = useColors();
  const [label, setLabel] = useState("");

  const handleAdd = () => {
    if (!label.trim()) return;
    onAdd(label.trim());
    setLabel("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Pressable onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            カテゴリを追加
          </Text>
          <Pressable onPress={handleAdd}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: label.trim() ? "#E8A0BF" : colors.muted }}>
              追加
            </Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
          カテゴリ名
        </Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="例: 関東ランチ"
          placeholderTextColor={colors.muted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            color: colors.foreground,
          }}
        />
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
          ※ カテゴリの追加は管理者のみ可能です
        </Text>
      </View>
    </Modal>
  );
}

function EditThreadModal({
  thread,
  onClose,
  onSave,
}: {
  thread: BoardThread;
  onClose: () => void;
  onSave: (updated: BoardThread) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(thread.title);
  const [content, setContent] = useState(thread.preview);
  const [images, setImages] = useState<string[]>(thread.images ?? []);

  const handlePickImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("権限が必要です", "写真ライブラリへのアクセスを許可してください");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 4,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...uris].slice(0, 4));
    }
  };

  const handleSave = () => {
    if (!title.trim() || !content.trim()) return;
    onSave({
      ...thread,
      title: title.trim(),
      preview: content.trim(),
      images: images.length > 0 ? images : undefined,
      lastUpdated: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border,
          }}
        >
          <Pressable onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>投稿を編集</Text>
          <Pressable onPress={handleSave}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: title.trim() && content.trim() ? "#E8A0BF" : colors.muted,
              }}
            >
              保存
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}
        >
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* タイトル */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>タイトル</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="タイトルを入力"
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: colors.foreground,
                }}
              />
            </View>

            {/* 本文 */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>本文</Text>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="内容を入力"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: colors.foreground,
                  minHeight: 120,
                }}
              />
            </View>

            {/* 写真 */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
                写真（最大4枚）
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {images.map((uri, i) => (
                  <View key={i} style={{ position: "relative" }}>
                    <Image
                      source={{ uri }}
                      style={{ width: 80, height: 80, borderRadius: 10 }}
                      contentFit="cover"
                    />
                    <Pressable
                      onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        backgroundColor: colors.error,
                        borderRadius: 10,
                        width: 20,
                        height: 20,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>×</Text>
                    </Pressable>
                  </View>
                ))}
                {images.length < 4 && (
                  <Pressable
                    onPress={handlePickImage}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 10,
                      backgroundColor: colors.surface,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      borderStyle: "dashed",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <IconSymbol name="camera.fill" size={24} color={colors.muted} />
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>写真を追加</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ReportOptionModal({
  visible,
  title,
  options,
  value,
  allowEmpty = false,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly string[];
  value: string;
  allowEmpty?: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const displayedOptions = allowEmpty ? ["未選択", ...options] : options;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 24 }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation?.()}
          style={{ backgroundColor: colors.background, borderRadius: 20, maxHeight: "72%", overflow: "hidden" }}
        >
          <View style={{ padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, textAlign: "center" }}>
              {title}
            </Text>
          </View>
          <ScrollView>
            {displayedOptions.map((option) => {
              const optionValue = option === "未選択" ? "" : option;
              const active = value === optionValue;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    onSelect(optionValue);
                    onClose();
                  }}
                  style={{
                    paddingHorizontal: 18,
                    paddingVertical: 13,
                    borderBottomWidth: 0.5,
                    borderBottomColor: colors.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: 15, color: colors.foreground }}>{option}</Text>
                  {active ? <IconSymbol name="checkmark" size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 新規投稿モーダル
function CreateThreadModal({
  visible,
  onClose,
  category,
  categories,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  category: string;
  categories: BoardCategory[];
  onAdd: (thread: BoardThread) => void;
}) {
  const colors = useColors();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [capacity, setCapacity] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [budget, setBudget] = useState("");
  const [recommendedMenu, setRecommendedMenu] = useState("");
  const [rating, setRating] = useState(0);
  const [mealComment, setMealComment] = useState("");
  const [googleMapUrl, setGoogleMapUrl] = useState("");
  const [tabelogUrl, setTabelogUrl] = useState("");
  const [formError, setFormError] = useState("");
  const [optionModal, setOptionModal] = useState<"prefecture" | "budget" | null>(null);
  const isMealReport = category === "meal-report";
  const mealReportValid =
    restaurantName.trim().length > 0 &&
    prefecture.length > 0 &&
    rating > 0 &&
    (!googleMapUrl.trim() || isGoogleMapsUrl(googleMapUrl)) &&
    (!tabelogUrl.trim() || /^https?:\/\/(?:www\.)?tabelog\.com\//i.test(tabelogUrl.trim()));
  const canSubmit = isMealReport ? mealReportValid : title.trim().length > 0 && content.trim().length > 0;

  const handlePickImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("権限が必要です", "写真ライブラリへのアクセスを許可してください");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 4,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...uris].slice(0, 4));
    }
  };

  const handleCreate = () => {
    if (isMealReport && !mealReportValid) {
      setFormError("店名・場所・評価を入力し、リンクを入力する場合は有効なURLを指定してください。");
      return;
    }
    if (!isMealReport && (!title.trim() || !content.trim())) return;
    const normalizedComment = mealComment.trim();
    const normalizedMenu = recommendedMenu.trim();
    const newThread: BoardThread = {
      id: `t_new_${Date.now()}`,
      title: isMealReport ? restaurantName.trim() : title.trim(),
      author: CURRENT_USER,
      category: category as BoardThread["category"],
      commentCount: 0,
      lastUpdated: new Date().toISOString(),
      preview: isMealReport
        ? normalizedComment || normalizedMenu || `${prefecture}でいただきました。`
        : content.trim(),
      isRecruiting: isMealReport ? false : isRecruiting,
      recruitCapacity: !isMealReport && isRecruiting ? parseInt(capacity || "10", 10) : undefined,
      recruitAttendees: 0,
      recruitParticipants: [],
      recruitApplicants: [],
      images: images.length > 0 ? images : undefined,
      mealReport: isMealReport
        ? {
            restaurantName: restaurantName.trim(),
            prefecture,
            budget: budget || undefined,
            recommendedMenu: normalizedMenu || undefined,
            rating,
            comment: normalizedComment || undefined,
            googleMapUrl: googleMapUrl.trim() || undefined,
            tabelogUrl: tabelogUrl.trim() || undefined,
          }
        : undefined,
    };
    onAdd(newThread);
    onClose();
    setTitle("");
    setContent("");
    setIsRecruiting(false);
    setCapacity("");
    setImages([]);
    setRestaurantName("");
    setPrefecture("");
    setBudget("");
    setRecommendedMenu("");
    setRating(0);
    setMealComment("");
    setGoogleMapUrl("");
    setTabelogUrl("");
    setFormError("");
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border,
          }}
        >
          <Pressable onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            新規投稿
          </Text>
          <Pressable onPress={handleCreate}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: canSubmit ? "#E8A0BF" : colors.muted,
              }}
            >
              投稿
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* カテゴリ表示 */}
          <View
            style={{
              backgroundColor: "#E8A0BF20",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              marginBottom: 16,
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#E8A0BF" }}>
              {categories.find((c) => c.key === category)?.label ?? category}
            </Text>
          </View>

          {isMealReport ? (
            <View style={{ gap: 16, marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
                  店名 <Text style={{ color: colors.error }}>必須</Text>
                </Text>
                <TextInput
                  value={restaurantName}
                  onChangeText={setRestaurantName}
                  placeholder="例：鮨 IRO"
                  placeholderTextColor={colors.muted}
                  style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
                  場所 <Text style={{ color: colors.error }}>必須</Text>
                </Text>
                <Pressable
                  onPress={() => setOptionModal("prefecture")}
                  style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                >
                  <Text style={{ fontSize: 15, color: prefecture ? colors.foreground : colors.muted }}>
                    {prefecture || "都道府県を選択"}
                  </Text>
                  <IconSymbol name="chevron.down" size={18} color={colors.muted} />
                </Pressable>
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>予算（任意）</Text>
                <Pressable
                  onPress={() => setOptionModal("budget")}
                  style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                >
                  <Text style={{ fontSize: 15, color: budget ? colors.foreground : colors.muted }}>
                    {budget || "予算を選択"}
                  </Text>
                  <IconSymbol name="chevron.down" size={18} color={colors.muted} />
                </Pressable>
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>おすすめメニュー（任意）</Text>
                <TextInput
                  value={recommendedMenu}
                  onChangeText={setRecommendedMenu}
                  placeholder="例：季節のおまかせコース"
                  placeholderTextColor={colors.muted}
                  style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
                  評価 <Text style={{ color: colors.error }}>必須</Text>
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Pressable
                      key={star}
                      accessibilityRole="button"
                      accessibilityLabel={`${star}つ星`}
                      onPress={() => setRating(star)}
                      style={{ padding: 2 }}
                    >
                      <IconSymbol name="star.fill" size={34} color={star <= rating ? "#F5A623" : colors.border} />
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>一言（任意）</Text>
                <TextInput
                  value={mealComment}
                  onChangeText={setMealComment}
                  placeholder="お店の感想を一言"
                  placeholderTextColor={colors.muted}
                  multiline
                  textAlignVertical="top"
                  style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, minHeight: 90 }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
                  Google Mapのリンク（任意）
                </Text>
                <TextInput
                  value={googleMapUrl}
                  onChangeText={setGoogleMapUrl}
                  placeholder="https://maps.app.goo.gl/..."
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: colors.foreground,
                    borderWidth: googleMapUrl.length > 0 && !isGoogleMapsUrl(googleMapUrl) ? 1 : 0,
                    borderColor: colors.error,
                  }}
                />
                {googleMapUrl.length > 0 && !isGoogleMapsUrl(googleMapUrl) ? (
                  <Text style={{ fontSize: 12, color: colors.error, marginTop: 5 }}>Google Mapsの共有リンクを入力してください</Text>
                ) : null}
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>食べログのリンク（任意）</Text>
                <TextInput
                  value={tabelogUrl}
                  onChangeText={setTabelogUrl}
                  placeholder="https://tabelog.com/..."
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, borderWidth: tabelogUrl.length > 0 && !/^https?:\/\/(?:www\.)?tabelog\.com\//i.test(tabelogUrl.trim()) ? 1 : 0, borderColor: colors.error }}
                />
                {tabelogUrl.length > 0 && !/^https?:\/\/(?:www\.)?tabelog\.com\//i.test(tabelogUrl.trim()) ? <Text style={{ fontSize: 12, color: colors.error, marginTop: 5 }}>食べログのURLを入力してください</Text> : null}
              </View>

              {formError ? <Text style={{ fontSize: 13, color: colors.error }}>{formError}</Text> : null}
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>タイトル</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="投稿のタイトル"
                placeholderTextColor={colors.muted}
                style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, marginBottom: 16 }}
              />

              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>内容</Text>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="投稿の内容を入力..."
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
                style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, minHeight: 150, marginBottom: 16 }}
              />
            </>
          )}

          {/* Photo Attachment */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
              写真（最大4枚）
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {images.map((uri, i) => (
                <View key={i} style={{ position: "relative" }}>
                  <Image
                    source={{ uri }}
                    style={{ width: 80, height: 80, borderRadius: 10 }}
                    contentFit="cover"
                  />
                  <Pressable
                    onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      backgroundColor: colors.error,
                      borderRadius: 10,
                      width: 20,
                      height: 20,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>×</Text>
                  </Pressable>
                </View>
              ))}
              {images.length < 4 && (
                <Pressable
                  onPress={handlePickImage}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 10,
                    backgroundColor: colors.surface,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    borderStyle: "dashed",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconSymbol name="camera.fill" size={24} color={colors.muted} />
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>写真を追加</Text>
                </Pressable>
              )}
            </View>
          </View>

          {!isMealReport ? (
            <>
              {/* Recruiting toggle */}
              <Pressable
                onPress={() => setIsRecruiting(!isRecruiting)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <IconSymbol name="person.badge.plus" size={20} color="#A7C7E7" />
                <Text style={{ flex: 1, fontSize: 15, color: colors.foreground, marginLeft: 10 }}>
                  参加者を募集する
                </Text>
                <View
                  style={{
                    width: 48,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: isRecruiting ? "#A7C7E7" : colors.border,
                    justifyContent: "center",
                    paddingHorizontal: 2,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: "#FFF",
                      alignSelf: isRecruiting ? "flex-end" : "flex-start",
                    }}
                  />
                </View>
              </Pressable>

              {isRecruiting ? (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
                    募集人数
                  </Text>
                  <TextInput
                    value={capacity}
                    onChangeText={setCapacity}
                    placeholder="例: 10"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 15,
                      color: colors.foreground,
                    }}
                  />
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>
                    ※ コメントで参加希望を募り、投稿者がメンバーを選んでプライベートチャットを作成できます
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>

        <ReportOptionModal
          visible={optionModal === "prefecture"}
          title="都道府県を選択"
          options={PREFECTURES}
          value={prefecture}
          onSelect={setPrefecture}
          onClose={() => setOptionModal(null)}
        />
        <ReportOptionModal
          visible={optionModal === "budget"}
          title="予算を選択"
          options={MEAL_BUDGETS}
          value={budget}
          allowEmpty
          onSelect={setBudget}
          onClose={() => setOptionModal(null)}
        />
      </View>
    </Modal>
  );
}

export default function BoardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const { user: authUser } = useAuthContext();
  const userIsAdmin = canManageBoardCategories(authUser?.role);
  const clubs = useClubs();
  const [categories, setCategories] = useState<BoardCategory[]>(BOARD_CATEGORIES);
  const [activeGroup, setActiveGroup] = useState<BoardCategory["group"]>("all");
  const [activeCategory, setActiveCategory] = useState<string>(BOARD_CATEGORIES[0].key);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedThread, setSelectedThread] = useState<BoardThread | null>(null);
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);

  const [dynamicThreads, setDynamicThreads] = useState<BoardThread[]>([]);
  const [editedThreads, setEditedThreads] = useState<Record<string, BoardThread>>({});
  const [editingThread, setEditingThread] = useState<BoardThread | null>(null);

  useEffect(() => {
    if (compose !== "meal-report") return;
    setActiveGroup("all");
    setActiveCategory("meal-report");
    setShowCreateThread(true);
    router.setParams({ compose: "" });
  }, [compose, router]);
  const allThreads = [...dynamicThreads, ...BOARD_THREADS].map((t) => editedThreads[t.id] ?? t);
  const filteredThreads = allThreads.filter((t) => t.category === activeCategory);
  const canAccessCategory = (category: BoardCategory) => {
    if (category.group !== "club" || userIsAdmin) return true;
    if (category.key === "club-all") {
      return clubs.some((club) => canViewClubThread(authUser?.role, CURRENT_USER.id, club.memberIds));
    }
    const club = clubs.find((item) => `club-${item.id}` === category.key);
    return Boolean(club && canViewClubThread(authUser?.role, CURRENT_USER.id, club.memberIds));
  };
  const visibleCategories = categories.filter(
    (category) => category.group === activeGroup && canAccessCategory(category),
  );
  const categoryPresentation = (category: BoardCategory) => {
    const club = clubs.find((item) => `club-${item.id}` === category.key);
    if (club) return { icon: club.icon, description: `${club.memberIds.length}人で活動中`, accent: "#7D6A92" };
    const presentations: Record<string, { icon: string; description: string; accent: string }> = {
      announcement: { icon: "📣", description: "運営からの大切なお知らせ", accent: "#B75E87" },
      "meal-report": { icon: "🍽️", description: "今日食べたお店をみんなに共有", accent: "#D0784A" },
      "gourmet-advice": { icon: "💡", description: "お店選びやグルメの相談", accent: "#C08A25" },
      "free-chat": { icon: "💬", description: "メンバー同士の自由な交流", accent: "#4A86A8" },
      "club-all": { icon: "📅", description: "各部活の今月の活動をまとめて確認", accent: "#6A5B87" },
    };
    return presentations[category.key] ?? { icon: "#", description: "掲示板カテゴリ", accent: "#5B5A73" };
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleAddCategory = (label: string) => {
    if (!userIsAdmin) {
      setShowAddCategory(false);
      Alert.alert("権限がありません", "掲示板の種別を追加できるのは管理者のみです。");
      return;
    }
    const key = label.replace(/\s+/g, "-").toLowerCase() + "-" + Date.now();
    setCategories([...categories, { key, label, group: activeGroup, createdByAdmin: true }]);
    setActiveCategory(key);
  };

  const handleSelectGroup = (group: BoardCategory["group"]) => {
    setActiveGroup(group);
    const firstCategory = categories.find((category) => category.group === group && canAccessCategory(category));
    setActiveCategory(firstCategory?.key ?? "");
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, letterSpacing: -0.5 }}>
          掲示板
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => router.push("/concierge" as any)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#EEF7FC",
              borderWidth: 1,
              borderColor: "#D9EBF6",
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <IconSymbol name="sparkles" size={14} color="#A7C7E7" />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#A7C7E7", marginLeft: 4 }}>
              AI相談
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowCreateThread(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#18171A",
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <IconSymbol name="plus" size={14} color="#FFF" />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF", marginLeft: 4 }}>
              投稿
            </Text>
          </Pressable>
        </View>
      </View>

      <BoardRulesPanel />

      {/* 大分類 + スレッド分類 */}
      <View style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: "#FBFDFF" }}>
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
          {BOARD_GROUPS.map((group) => {
            const active = activeGroup === group.key;
            return (
              <Pressable
                key={group.key}
                onPress={() => handleSelectGroup(group.key)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: active ? "#5B5A73" : "#ECECF1",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: active ? "#FFFFFF" : "#303044" }}>
                  {group.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {activeGroup === "area" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
            {visibleCategories.map((cat) => (
              <Pressable key={cat.key} onPress={() => setActiveCategory(cat.key)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: activeCategory === cat.key ? colors.primary : "#F1F6F9", borderWidth: 1, borderColor: activeCategory === cat.key ? colors.primary : "#DCEAF2" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: activeCategory === cat.key ? "#FFF" : "#5F6C75" }}>{cat.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
            {activeGroup === "club" ? <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 1 }}>活動レポートと入部中の部活</Text> : null}
            {visibleCategories.map((cat) => {
              const presentation = categoryPresentation(cat);
              const selected = activeCategory === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setActiveCategory(cat.key)}
                  style={{ flexDirection: "row", alignItems: "center", minHeight: 62, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: selected ? `${presentation.accent}14` : colors.surface, borderWidth: selected ? 1.5 : 1, borderColor: selected ? presentation.accent : colors.border }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${presentation.accent}18`, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 21 }}>{presentation.icon}</Text></View>
                  <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>{cat.label}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>{presentation.description}</Text></View>
                  <IconSymbol name="chevron.right" size={17} color={selected ? presentation.accent : colors.muted} />
                </Pressable>
              );
            })}
          </View>
        )}
        {userIsAdmin ? <Pressable onPress={() => setShowAddCategory(true)} style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end", marginHorizontal: 16, marginBottom: 10, paddingVertical: 5 }}><IconSymbol name="plus" size={13} color={colors.muted} /><Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>カテゴリを追加</Text></Pressable> : null}
      </View>

      <FlatList
        data={filteredThreads}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ThreadCard
            thread={item}
            onPress={() => setSelectedThread(item)}
            onEdit={item.author.id === CURRENT_USER.id && !item.mealReport ? () => setEditingThread(item) : undefined}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8A0BF" />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <IconSymbol name="bubble.left.and.bubble.right.fill" size={48} color={colors.border} />
            <Text style={{ fontSize: 16, color: colors.muted, marginTop: 12 }}>
              このカテゴリにはまだ投稿がありません
            </Text>
          </View>
        }
      />

      {/* Thread Detail Modal */}
      <Modal
        visible={!!selectedThread}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedThread(null)}
      >
        {selectedThread && (
          <ThreadDetailModal
            thread={selectedThread}
            onClose={() => setSelectedThread(null)}
          />
        )}
      </Modal>

      {/* Create Thread Modal - 全員投稿可能 */}
      <CreateThreadModal
        visible={showCreateThread}
        onClose={() => setShowCreateThread(false)}
        category={activeCategory}
        categories={categories}
        onAdd={(thread) => setDynamicThreads((prev) => [thread, ...prev])}
      />

      {/* Edit Thread Modal - 投稿者本人のみ */}
      {editingThread && (
        <EditThreadModal
          thread={editingThread}
          onClose={() => setEditingThread(null)}
          onSave={(updated) => {
            setEditedThreads((prev) => ({ ...prev, [updated.id]: updated }));
            setEditingThread(null);
          }}
        />
      )}

      {/* Add Category Modal - 管理者限定 */}
      {userIsAdmin && (
        <AddCategoryModal
          visible={showAddCategory}
          onClose={() => setShowAddCategory(false)}
          onAdd={handleAddCategory}
        />
      )}
    </ScreenContainer>
  );
}
