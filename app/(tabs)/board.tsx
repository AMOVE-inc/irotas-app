import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { MentionSuggestions, MentionText } from "@/components/mention-ui";
import { TextFormattingToolbar } from "@/components/text-formatting-toolbar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  BOARD_THREADS,
  BOARD_CATEGORIES,
  BOARD_COMMENTS,
  RANK_COLORS,
  RANK_LABELS,
  CURRENT_USER,
  MEMBERS,
  CLUBS,
  type BoardThread,
  type BoardComment,
  type BoardCategory,
} from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { createBoardChat } from "@/lib/chat-store";
import { canManageBoardCategories, canViewClubThread } from "@/lib/access-control";
import { GOURMET_ADVICE_BUDGETS, isGoogleMapsUrl, MEAL_BUDGETS, MEAL_REPORT_AREAS } from "@/lib/meal-report";
import { communityRestaurantFromMealReport, registerCommunityRestaurant } from "@/lib/gourmet-map-community";
import { useClubs } from "@/lib/club-store";
import { getMentionGroups, getMentionQuery, getMentionedMemberIds, insertMention } from "@/lib/mentions";
import { sendMentionNotification } from "@/lib/notifications";
import { applyTextFormat, type TextFormat, type TextSelection } from "@/lib/text-formatting";
import { toggleReactionMember } from "@/lib/chat-reactions";
import { awardCoupon } from "@/lib/coupon-store";
import { createContestPrizeCoupon, getContestWinner, isContestCommentingOpen } from "@/lib/gourmet-contest";
import { loadCommentReactions, loadThreadReactions, saveCommentReactions, saveThreadReactions } from "@/lib/board-reactions";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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

const BOARD_MENTION_GROUPS = getMentionGroups(MEMBERS, CLUBS);
const THREAD_REACTION_EMOJIS = ["👏", "😊", "❤️", "🎉", "😋"] as const;


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

function GourmetAdviceContent({ thread, compact = false }: { thread: BoardThread; compact?: boolean }) {
  const colors = useColors();
  const advice = thread.gourmetAdvice;
  if (!advice) return null;
  return (
    <View style={{ backgroundColor: "#FFF9EA", borderRadius: 12, padding: compact ? 10 : 14, marginBottom: compact ? 8 : 16, borderWidth: 1, borderColor: "#F0DDA8" }}>
      {[{ label: "テーマ", value: advice.theme }, { label: "エリア", value: advice.area }, { label: "利用シーン", value: advice.scene }, { label: "予算", value: advice.budget }].map((item) => (
        <View key={item.label} style={{ flexDirection: "row", marginBottom: 5 }}><Text style={{ width: 74, fontSize: 12, fontWeight: "900", color: "#9A6A12" }}>{item.label}</Text><Text style={{ flex: 1, fontSize: 13, color: colors.foreground }} numberOfLines={compact ? 1 : undefined}>{item.value}</Text></View>
      ))}
      {!compact ? <Text style={{ fontSize: 14, lineHeight: 21, color: colors.foreground, marginTop: 7 }}><Text style={{ fontWeight: "900" }}>一言　</Text>{advice.comment}</Text> : null}
    </View>
  );
}

function SelfIntroductionContent({ thread, compact = false }: { thread: BoardThread; compact?: boolean }) {
  const colors = useColors();
  const introduction = thread.selfIntroduction;
  if (!introduction) return null;
  return (
    <View style={{ backgroundColor: "#F5F2F8", borderRadius: 12, padding: compact ? 10 : 14, marginBottom: compact ? 8 : 16, borderWidth: 1, borderColor: "#DED6E7" }}>
      <Text style={{ fontSize: 12, fontWeight: "900", color: "#6A5B87", marginBottom: 5 }}>自己紹介</Text>
      <MentionText content={introduction.introduction} groups={BOARD_MENTION_GROUPS} />
      {!compact && introduction.wantToTry ? <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}><Text style={{ fontSize: 12, fontWeight: "900", color: "#6A5B87", marginBottom: 5 }}>IRO+でやってみたいこと</Text><MentionText content={introduction.wantToTry} groups={BOARD_MENTION_GROUPS} /></View> : null}
      {!compact && introduction.favoriteRestaurants ? <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}><Text style={{ fontSize: 12, fontWeight: "900", color: "#6A5B87", marginBottom: 5 }}>お気に入りのお店</Text><Text style={{ fontSize: 14, lineHeight: 21, color: colors.foreground }}>{introduction.favoriteRestaurants}</Text></View> : null}
      {!compact && introduction.desiredRestaurants ? <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}><Text style={{ fontSize: 12, fontWeight: "900", color: "#6A5B87", marginBottom: 5 }}>行ってみたいお店</Text><Text style={{ fontSize: 14, lineHeight: 21, color: colors.foreground }}>{introduction.desiredRestaurants}</Text></View> : null}
    </View>
  );
}

function ThreadCard({ thread, onPress, onEdit }: { thread: BoardThread; onPress: () => void; onEdit?: () => void }) {
  const colors = useColors();
  const router = useRouter();
  const isParticipant = thread.recruitParticipants?.includes(CURRENT_USER.id);
  const isAuthorCard = thread.author.id === CURRENT_USER.id;
  const isPlatinum = thread.author.rank === "platinum";
  const showsRightPreview =
    thread.category === "gourmet-contest" ||
    thread.category === "free-chat" ||
    thread.category === "kanto-branch" ||
    thread.category === "kansai-branch" ||
    thread.category.startsWith("club-");
  const rightPreviewImage = showsRightPreview ? thread.images?.[0] : undefined;

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
            <NewMemberMark member={thread.author} size={13} />
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

      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          {!thread.selfIntroduction ? <Text
            style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}
            numberOfLines={2}
          >
            {thread.title}
          </Text> : null}

          {/* Preview */}
          {thread.mealReport ? (
            <MealReportContent thread={thread} compact />
          ) : thread.gourmetAdvice ? (
            <GourmetAdviceContent thread={thread} compact />
          ) : thread.selfIntroduction ? (
            <SelfIntroductionContent thread={thread} compact />
          ) : (
            <Text style={{ marginBottom: 8 }} numberOfLines={2}><MentionText content={thread.preview} groups={BOARD_MENTION_GROUPS} /></Text>
          )}
        </View>
        {rightPreviewImage ? (
          <Image
            source={{ uri: rightPreviewImage }}
            style={{ width: 72, height: 72, borderRadius: 9, marginLeft: 10 }}
            contentFit="cover"
          />
        ) : null}
      </View>

      {/* Images */}
      {!rightPreviewImage && thread.images && thread.images.length > 0 && (
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
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [commentSelection, setCommentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const commentInputRef = useRef<TextInput>(null);
  const mentionGroups = useMemo(() => BOARD_MENTION_GROUPS, []);
  const [comments, setComments] = useState<BoardComment[]>(
    BOARD_COMMENTS.filter((c) => c.threadId === thread.id),
  );
  const [threadReactions, setThreadReactions] = useState(thread.reactions ?? {});
  const [contestWinnerName, setContestWinnerName] = useState<string | null>(null);
  const [reactionsHydrated, setReactionsHydrated] = useState(false);
  const [chatRoomId, setChatRoomId] = useState<string | null>(thread.chatId ?? null);
  const [showSelectMembers, setShowSelectMembers] = useState(false);
  const [recruitCapacity, setRecruitCapacity] = useState<number | undefined>(thread.recruitCapacity);
  const [showCapacityEdit, setShowCapacityEdit] = useState(false);
  const [capacityInput, setCapacityInput] = useState(String(thread.recruitCapacity ?? ""));

  const isAuthor = thread.author.id === CURRENT_USER.id;
  const isParticipant = (thread.recruitParticipants ?? []).includes(CURRENT_USER.id);
  const isPlatinum = thread.author.rank === "platinum";
  const isContest = Boolean(thread.gourmetContest);
  const contestCommentingOpen = isContest ? isContestCommentingOpen(thread) : true;

  useEffect(() => {
    void Promise.all([
      loadThreadReactions(thread.id, thread.reactions),
      loadCommentReactions(comments),
    ]).then(([savedThreadReactions, savedComments]) => {
      setThreadReactions(savedThreadReactions);
      setComments(savedComments);
      setReactionsHydrated(true);
    });
  // Initial hydration only; subsequent changes are saved directly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  useEffect(() => {
    if (!reactionsHydrated || !thread.gourmetContest || contestCommentingOpen) return;
    const winner = getContestWinner(comments);
    if (!winner) return;
    setContestWinnerName(winner.author.name);
    const coupon = createContestPrizeCoupon(thread, winner.author.id);
    if (coupon) void awardCoupon(coupon);
  }, [comments, contestCommentingOpen, reactionsHydrated, thread]);

  const handleComment = () => {
    if (!commentText.trim() || !contestCommentingOpen) return;
    const content = commentText.trim();
    const newComment: BoardComment = {
      id: `bc_new_${Date.now()}`,
      threadId: thread.id,
      author: CURRENT_USER,
      content,
      createdAt: new Date().toISOString(),
    };
    setComments([...comments, newComment]);
    setCommentText("");
    setCommentSelection({ start: 0, end: 0 });
    setMentionQuery(null);
    const preview = content.length > 50 ? `${content.slice(0, 50)}...` : content;
    for (const memberId of getMentionedMemberIds(content, MEMBERS, mentionGroups).filter((id) => id !== CURRENT_USER.id)) {
      const member = MEMBERS.find((item) => item.id === memberId);
      if (member) void sendMentionNotification(member.name, CURRENT_USER.name, thread.title || "自己紹介", preview);
    }
  };

  const handleThreadReaction = (emoji: string) => {
    setThreadReactions((current) => {
      const next = toggleReactionMember(current, emoji, CURRENT_USER.id);
      void saveThreadReactions(thread.id, next);
      return next;
    });
  };

  const handleCommentHeart = (commentId: string) => {
    setComments((current) => current.map((comment) => {
      if (comment.id !== commentId) return comment;
      const reactions = toggleReactionMember(comment.reactions, "❤️", CURRENT_USER.id);
      void saveCommentReactions(comment.id, reactions);
      return { ...comment, reactions };
    }));
  };

  const handleCommentTextChange = (text: string) => {
    setCommentText(text);
    setMentionQuery(getMentionQuery(text));
  };

  const handleCommentMention = (label: string) => {
    setCommentText((current) => {
      const next = insertMention(current, label);
      setCommentSelection({ start: next.length, end: next.length });
      return next;
    });
    setMentionQuery(null);
    commentInputRef.current?.focus();
  };

  const handleCommentFormat = (format: TextFormat) => {
    const result = applyTextFormat(commentText, commentSelection, format);
    setCommentText(result.text);
    setCommentSelection(result.selection);
    commentInputRef.current?.focus();
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
          {thread.selfIntroduction ? "自己紹介" : thread.title}
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
                <NewMemberMark member={thread.author} size={13} />
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
          ) : thread.gourmetAdvice ? (
            <GourmetAdviceContent thread={thread} />
          ) : thread.selfIntroduction ? (
            <SelfIntroductionContent thread={thread} />
          ) : (
            <View style={{ marginBottom: 16 }}><MentionText content={thread.preview} groups={mentionGroups} /></View>
          )}

          {thread.gourmetContest ? (
            <View style={{ backgroundColor: "#FFF6E6", borderRadius: 12, borderWidth: 1, borderColor: "#F0D39A", padding: 14, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "900", color: "#8A5A00" }}>コメント募集期間</Text>
              <Text style={{ fontSize: 14, color: colors.foreground, marginTop: 4 }}>{thread.gourmetContest.commentDeadline} 23:59まで</Text>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 7 }}>コメントのハートが最も多い方が優勝です。締切後に自動集計し、優勝者へイベントクーポンを配布します。</Text>
              {contestWinnerName ? <Text style={{ fontSize: 13, fontWeight: "900", color: "#C97813", marginTop: 9 }}>優勝：{contestWinnerName}さん（クーポン配布済み）</Text> : null}
            </View>
          ) : null}

          {thread.selfIntroduction ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
              {THREAD_REACTION_EMOJIS.map((emoji) => {
                const memberIds = threadReactions[emoji] ?? [];
                const selected = memberIds.includes(CURRENT_USER.id);
                return <Pressable key={emoji} onPress={() => handleThreadReaction(emoji)} accessibilityLabel={`${emoji}スタンプ`} style={{ flexDirection: "row", alignItems: "center", backgroundColor: selected ? "#F0E7F7" : colors.surface, borderWidth: 1, borderColor: selected ? "#7D6A92" : colors.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ fontSize: 17 }}>{emoji}</Text>{memberIds.length > 0 ? <Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted, marginLeft: 4 }}>{memberIds.length}</Text> : null}</Pressable>;
              })}
            </View>
          ) : null}

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
                <View style={{ marginLeft: 32 }}><MentionText content={comment.content} groups={mentionGroups} /></View>
                {isContest ? <Pressable onPress={() => handleCommentHeart(comment.id)} disabled={!contestCommentingOpen} style={{ marginLeft: 32, marginTop: 7, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: (comment.reactions?.["❤️"] ?? []).includes(CURRENT_USER.id) ? "#FFE4EA" : colors.surface, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontSize: 15 }}>❤️</Text><Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted, marginLeft: 4 }}>{comment.reactions?.["❤️"]?.length ?? 0}</Text></Pressable> : null}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Comment input */}
        {contestCommentingOpen ? <View style={{ backgroundColor: colors.background, borderTopWidth: 0.5, borderTopColor: colors.border }}>
          {mentionQuery !== null ? <MentionSuggestions query={mentionQuery} groups={mentionGroups} members={MEMBERS.filter((member) => member.id !== CURRENT_USER.id)} onSelect={handleCommentMention} /> : null}
          <Text style={{ fontSize: 11, color: colors.muted, paddingHorizontal: 16, paddingTop: 6 }}>@を入力して個人・グループをメンション</Text>
          {!thread.selfIntroduction ? <View style={{ paddingHorizontal: 16 }}><TextFormattingToolbar onFormat={handleCommentFormat} /></View> : null}
          <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom, 10) : 10,
          }}
        >
          <TextInput
            ref={commentInputRef}
            value={commentText}
            selection={commentSelection}
            onSelectionChange={(event) => setCommentSelection(event.nativeEvent.selection)}
            onChangeText={handleCommentTextChange}
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
        </View> : <View style={{ padding: 14, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}><Text style={{ textAlign: "center", fontSize: 13, fontWeight: "700", color: colors.muted }}>コメント募集は終了しました</Text></View>}
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
  const [contentSelection, setContentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const contentInputRef = useRef<TextInput>(null);
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
      selectionLimit: 10,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...uris].slice(0, 10));
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
                ref={contentInputRef}
                value={content}
                selection={contentSelection}
                onSelectionChange={(event) => setContentSelection(event.nativeEvent.selection)}
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
              <TextFormattingToolbar onFormat={(format) => { const result = applyTextFormat(content, contentSelection, format); setContent(result.text); setContentSelection(result.selection); contentInputRef.current?.focus(); }} />
            </View>

            {/* 写真 */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
                写真（最大10枚）
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
  canManage,
}: {
  visible: boolean;
  onClose: () => void;
  category: string;
  categories: BoardCategory[];
  onAdd: (thread: BoardThread) => void;
  canManage: boolean;
}) {
  const colors = useColors();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const contentInputRef = useRef<TextInput>(null);
  const [contentSelection, setContentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [introductionText, setIntroductionText] = useState("");
  const [wantToTry, setWantToTry] = useState("");
  const [favoriteRestaurants, setFavoriteRestaurants] = useState("");
  const [desiredRestaurants, setDesiredRestaurants] = useState("");
  const [introductionSelection, setIntroductionSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [wantToTrySelection, setWantToTrySelection] = useState<TextSelection>({ start: 0, end: 0 });
  const introductionInputRef = useRef<TextInput>(null);
  const wantToTryInputRef = useRef<TextInput>(null);
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
  const [adviceTheme, setAdviceTheme] = useState("");
  const [adviceArea, setAdviceArea] = useState("");
  const [adviceScene, setAdviceScene] = useState("");
  const [adviceBudget, setAdviceBudget] = useState("");
  const [adviceComment, setAdviceComment] = useState("");
  const [contestDeadline, setContestDeadline] = useState("");
  const [contestPrizeTitle, setContestPrizeTitle] = useState("グルメ選手権 優勝クーポン");
  const [contestPrizeDescription, setContestPrizeDescription] = useState("次回のIRO+公式イベントで利用できる優勝特典です。");
  const [contestPrizeExpiresAt, setContestPrizeExpiresAt] = useState("");
  const [formError, setFormError] = useState("");
  const [optionModal, setOptionModal] = useState<"prefecture" | "budget" | "advice-budget" | null>(null);
  const isMealReport = category === "meal-report";
  const isGourmetAdvice = category === "gourmet-advice";
  const isIntroduction = category === "introduction";
  const isGourmetContest = category === "gourmet-contest";
  const mealReportValid =
    restaurantName.trim().length > 0 &&
    prefecture.length > 0 &&
    rating > 0 &&
    isGoogleMapsUrl(googleMapUrl) &&
    (!tabelogUrl.trim() || /^https?:\/\/(?:www\.)?tabelog\.com\//i.test(tabelogUrl.trim()));
  const adviceValid = adviceTheme.trim().length > 0 && adviceArea.trim().length > 0 && adviceScene.trim().length > 0 && adviceBudget.length > 0 && adviceComment.trim().length > 0;
  const contestValid = title.trim().length > 0 && content.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(contestDeadline) && contestPrizeTitle.trim().length > 0 && contestPrizeDescription.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(contestPrizeExpiresAt);
  const canSubmit = isMealReport ? mealReportValid : isGourmetAdvice ? adviceValid : isIntroduction ? introductionText.trim().length > 0 : isGourmetContest ? contestValid : title.trim().length > 0 && content.trim().length > 0;

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
      selectionLimit: 10,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...uris].slice(0, 10));
    }
  };

  const handleCreate = () => {
    if (isMealReport && !mealReportValid) {
      setFormError("店名・場所・評価・有効なGoogleマップURLを入力してください。");
      return;
    }
    if (isGourmetAdvice && !adviceValid) {
      setFormError("テーマ・エリア・利用シーン・予算・一言をすべて入力してください。");
      return;
    }
    if (isIntroduction && !introductionText.trim()) {
      setFormError("自己紹介文を入力してください。");
      return;
    }
    if (isGourmetContest && !canManage) {
      setFormError("グルメ選手権を投稿できるのは運営メンバーのみです。");
      return;
    }
    if (isGourmetContest && !contestValid) {
      setFormError("タイトル・内容・コメント締切・クーポン情報をすべて入力してください。日付はYYYY-MM-DD形式です。");
      return;
    }
    if (!isMealReport && !isGourmetAdvice && !isIntroduction && !isGourmetContest && (!title.trim() || !content.trim())) return;
    const normalizedComment = mealComment.trim();
    const normalizedMenu = recommendedMenu.trim();
    const newThread: BoardThread = {
      id: `t_new_${Date.now()}`,
      title: isMealReport ? restaurantName.trim() : isGourmetAdvice ? adviceTheme.trim() : isIntroduction ? "自己紹介" : title.trim(),
      author: CURRENT_USER,
      category: category as BoardThread["category"],
      commentCount: 0,
      lastUpdated: new Date().toISOString(),
      preview: isMealReport
        ? normalizedComment || normalizedMenu || `${prefecture}でいただきました。`
        : isGourmetAdvice ? adviceComment.trim() : isIntroduction ? introductionText.trim() : content.trim(),
      isRecruiting: isMealReport || isGourmetAdvice || isIntroduction || isGourmetContest ? false : isRecruiting,
      recruitCapacity: !isMealReport && !isGourmetAdvice && !isIntroduction && !isGourmetContest && isRecruiting ? parseInt(capacity || "10", 10) : undefined,
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
      gourmetAdvice: isGourmetAdvice ? { theme: adviceTheme.trim(), area: adviceArea.trim(), scene: adviceScene.trim(), budget: adviceBudget, comment: adviceComment.trim() } : undefined,
      selfIntroduction: isIntroduction ? { introduction: introductionText.trim(), wantToTry: wantToTry.trim() || undefined, favoriteRestaurants: favoriteRestaurants.trim() || undefined, desiredRestaurants: desiredRestaurants.trim() || undefined } : undefined,
      gourmetContest: isGourmetContest ? { commentDeadline: contestDeadline, prizeTitle: contestPrizeTitle.trim(), prizeDescription: contestPrizeDescription.trim(), prizeExpiresAt: contestPrizeExpiresAt } : undefined,
    };
    onAdd(newThread);
    if (!isMealReport && !isGourmetAdvice) {
      const mentionContent = isIntroduction ? `${introductionText} ${wantToTry} ${favoriteRestaurants} ${desiredRestaurants}` : content;
      const preview = mentionContent.length > 50 ? `${mentionContent.slice(0, 50)}...` : mentionContent;
      const boardName = categories.find((item) => item.key === category)?.label ?? "掲示板";
      for (const memberId of getMentionedMemberIds(mentionContent, MEMBERS, BOARD_MENTION_GROUPS).filter((id) => id !== CURRENT_USER.id)) {
        const member = MEMBERS.find((item) => item.id === memberId);
        if (member) void sendMentionNotification(member.name, CURRENT_USER.name, boardName, preview);
      }
    }
    onClose();
    setTitle("");
    setContent("");
    setMentionQuery(null);
    setContentSelection({ start: 0, end: 0 });
    setIntroductionText(""); setWantToTry(""); setFavoriteRestaurants(""); setDesiredRestaurants("");
    setIntroductionSelection({ start: 0, end: 0 }); setWantToTrySelection({ start: 0, end: 0 });
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
    setAdviceTheme(""); setAdviceArea(""); setAdviceScene(""); setAdviceBudget(""); setAdviceComment("");
    setContestDeadline(""); setContestPrizeTitle("グルメ選手権 優勝クーポン"); setContestPrizeDescription("次回のIRO+公式イベントで利用できる優勝特典です。"); setContestPrizeExpiresAt("");
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

          {isIntroduction ? (
            <View style={{ gap: 18, marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>自己紹介文 <Text style={{ color: colors.error }}>必須</Text></Text>
                <TextInput ref={introductionInputRef} value={introductionText} selection={introductionSelection} onSelectionChange={(event) => setIntroductionSelection(event.nativeEvent.selection)} onChangeText={(text) => { setIntroductionText(text); setFormError(""); }} placeholder="プロフィール・趣味・職業などを自由に記載してください" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, minHeight: 130 }} />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>IRO+でやってみたいこと（任意）</Text>
                <TextInput ref={wantToTryInputRef} value={wantToTry} selection={wantToTrySelection} onSelectionChange={(event) => setWantToTrySelection(event.nativeEvent.selection)} onChangeText={setWantToTry} placeholder="例：気になるお店を巡るグルメ会を企画したい" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, minHeight: 100 }} />
              </View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>お気に入りのお店（任意）</Text><TextInput value={favoriteRestaurants} onChangeText={setFavoriteRestaurants} placeholder="例：店名やURLを自由に入力" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, minHeight: 80 }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>行ってみたいお店（任意）</Text><TextInput value={desiredRestaurants} onChangeText={setDesiredRestaurants} placeholder="例：店名やURLを自由に入力" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, minHeight: 80 }} /></View>
              {formError ? <Text style={{ fontSize: 13, color: colors.error }}>{formError}</Text> : null}
            </View>
          ) : isMealReport ? (
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
                    {prefecture || "エリアを選択"}
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
          ) : isGourmetAdvice ? (
            <View style={{ gap: 16, marginBottom: 16 }}>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>テーマ <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={adviceTheme} onChangeText={setAdviceTheme} placeholder="例：誕生日プレートが可愛いお店" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>エリア <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={adviceArea} onChangeText={setAdviceArea} placeholder="例：都内、渋谷周辺" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>利用シーン <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={adviceScene} onChangeText={setAdviceScene} placeholder="例：お誕生日ディナー" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>予算 <Text style={{ color: colors.error }}>必須</Text></Text><Pressable onPress={() => setOptionModal("advice-budget")} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ fontSize: 15, color: adviceBudget ? colors.foreground : colors.muted }}>{adviceBudget || "予算を選択"}</Text><IconSymbol name="chevron.down" size={18} color={colors.muted} /></Pressable></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>一言 <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={adviceComment} onChangeText={setAdviceComment} placeholder="例：友人のお誕生日をサプライズでお祝いしたく、おすすめのお店を教えてください！" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, minHeight: 120 }} /></View>
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
                ref={contentInputRef}
                value={content}
                selection={contentSelection}
                onSelectionChange={(event) => setContentSelection(event.nativeEvent.selection)}
                onChangeText={(text) => { setContent(text); setMentionQuery(getMentionQuery(text)); }}
                placeholder="投稿の内容を入力..."
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
                style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, minHeight: 150, marginBottom: 16 }}
              />
              <TextFormattingToolbar onFormat={(format) => { const result = applyTextFormat(content, contentSelection, format); setContent(result.text); setContentSelection(result.selection); contentInputRef.current?.focus(); }} />
              {mentionQuery !== null ? <MentionSuggestions query={mentionQuery} groups={BOARD_MENTION_GROUPS} members={MEMBERS.filter((member) => member.id !== CURRENT_USER.id)} onSelect={(label) => { setContent((current) => { const next = insertMention(current, label); setContentSelection({ start: next.length, end: next.length }); return next; }); setMentionQuery(null); contentInputRef.current?.focus(); }} /> : null}
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: mentionQuery === null ? -10 : 6, marginBottom: 16 }}>@を入力して個人・グループをメンション</Text>
              {isGourmetContest ? <View style={{ gap: 14, marginBottom: 16 }}>
                <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>運営メンバーだけが選手権スレを作成できます。会員はコメントとハート投票のみ行えます。</Text>
                <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>コメント募集締切 <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={contestDeadline} onChangeText={setContestDeadline} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
                <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>優勝クーポン名 <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={contestPrizeTitle} onChangeText={setContestPrizeTitle} placeholder="グルメ選手権 優勝クーポン" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
                <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>クーポン内容 <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={contestPrizeDescription} onChangeText={setContestPrizeDescription} multiline placeholder="利用できるイベントや特典内容" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 80, fontSize: 15, color: colors.foreground }} /></View>
                <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>クーポン有効期限 <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={contestPrizeExpiresAt} onChangeText={setContestPrizeExpiresAt} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
                {formError ? <Text style={{ fontSize: 13, color: colors.error }}>{formError}</Text> : null}
              </View> : null}
            </>
          )}

          {/* Photo Attachment */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
              写真（最大10枚）
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

          {!isMealReport && !isGourmetAdvice && !isIntroduction && !isGourmetContest ? (
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
          options={MEAL_REPORT_AREAS}
          value={prefecture}
          onSelect={setPrefecture}
          onClose={() => setOptionModal(null)}
        />
        <ReportOptionModal visible={optionModal === "advice-budget"} title="予算を選択" options={GOURMET_ADVICE_BUDGETS} value={adviceBudget} onSelect={setAdviceBudget} onClose={() => setOptionModal(null)} />
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
  const { compose, category: categoryParam, view } = useLocalSearchParams<{ compose?: string; category?: string; view?: string }>();
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
  const isThreadView = view === "threads" && Boolean(categoryParam);

  useEffect(() => {
    if (compose !== "meal-report") return;
    setActiveGroup("all");
    setActiveCategory("meal-report");
    setShowCreateThread(true);
    router.setParams({ compose: "" });
  }, [compose, router]);

  useEffect(() => {
    if (!isThreadView || !categoryParam) return;
    const selectedCategory = categories.find((category) => category.key === categoryParam);
    if (!selectedCategory || !canAccessCategory(selectedCategory)) {
      router.replace("/board");
      return;
    }
    setActiveGroup(selectedCategory.group);
    setActiveCategory(selectedCategory.key);
  // `canAccessCategory` reads the current role/club membership on each route change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryParam, isThreadView, router]);
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
    if (club) {
      if (club.name.includes("ラーメン")) return { icon: "fork.knife", description: `${club.memberIds.length}人で活動中`, accent: "#E16B43" };
      if (club.name.includes("ワイン")) return { icon: "wineglass.fill", description: `${club.memberIds.length}人で活動中`, accent: "#8E5572" };
      if (club.name.includes("スイーツ")) return { icon: "birthday.cake.fill", description: `${club.memberIds.length}人で活動中`, accent: "#D85B86" };
      if (club.name.includes("料理")) return { icon: "frying.pan.fill", description: `${club.memberIds.length}人で活動中`, accent: "#D68C35" };
      return { icon: "person.3.fill", description: `${club.memberIds.length}人で活動中`, accent: "#34C759" };
    }
    const presentations: Record<string, { icon: string; description: string; accent: string }> = {
      introduction: { icon: "person.fill", description: "メンバー同士で自己紹介", accent: "#6A8FB3" },
      "meal-report": { icon: "fork.knife", description: "今日食べたお店をみんなに共有", accent: "#E16B43" },
      "gourmet-contest": { icon: "trophy.fill", description: "コメントとハート投票で今月のグルメ王を決定", accent: "#C6962C" },
      "gourmet-advice": { icon: "sparkles", description: "お店選びやグルメの相談", accent: "#8C6DB0" },
      "free-chat": { icon: "bubble.left.and.bubble.right.fill", description: "気軽に投稿できる自由な掲示板", accent: "#5F9E8C" },
      "club-all": { icon: "calendar", description: "各部活の今月の活動をまとめて確認", accent: "#4E8F65" },
    };
    return presentations[category.key] ?? { icon: "bubble.left.and.bubble.right.fill", description: "掲示板カテゴリ", accent: "#A7C7E7" };
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

  const handleOpenCategory = (category: BoardCategory) => {
    router.push({ pathname: "/board", params: { category: category.key, view: "threads" } });
  };

  const activeCategoryLabel = categories.find((category) => category.key === activeCategory)?.label ?? "掲示板";

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
        {isThreadView ? (
          <Pressable accessibilityLabel="掲示板トップへ戻る" onPress={() => router.replace("/board")} style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingVertical: 4 }}>
            <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
            <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: 20, fontWeight: "800", color: colors.foreground }}>
              {activeCategoryLabel}
            </Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, letterSpacing: -0.5 }}>
            掲示板
          </Text>
        )}
      </View>

      {/* 大分類 + スレッド分類 */}
      {!isThreadView ? <View style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: "#FBFDFF" }}>
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
          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {visibleCategories.map((cat) => {
                const active = activeCategory === cat.key;
                return <Pressable key={cat.key} onPress={() => setActiveCategory(cat.key)} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, backgroundColor: active ? "#5B5A73" : "#ECECF1" }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: active ? "#FFF" : "#303044" }}>{cat.label}</Text>
                </Pressable>;
              })}
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
            {activeGroup === "club" ? <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 1 }}>活動レポートと入部中の部活</Text> : null}
            {visibleCategories.map((cat) => {
              const presentation = categoryPresentation(cat);
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => handleOpenCategory(cat)}
                  style={{ flexDirection: "row", alignItems: "center", minHeight: 62, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${presentation.accent}20`, alignItems: "center", justifyContent: "center" }}><IconSymbol name={presentation.icon as any} size={21} color={presentation.accent} /></View>
                  <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>{cat.label}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>{presentation.description}</Text></View>
                  <IconSymbol name="chevron.right" size={17} color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
        )}
        {userIsAdmin ? <Pressable onPress={() => setShowAddCategory(true)} style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end", marginHorizontal: 16, marginBottom: 10, paddingVertical: 5 }}><IconSymbol name="plus" size={13} color={colors.muted} /><Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>カテゴリを追加</Text></Pressable> : null}
      </View> : null}

      {(isThreadView || activeGroup === "area") ? <FlatList
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
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 92 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <IconSymbol name="bubble.left.and.bubble.right.fill" size={48} color={colors.border} />
            <Text style={{ fontSize: 16, color: colors.muted, marginTop: 12 }}>
              このカテゴリにはまだ投稿がありません
            </Text>
          </View>
        }
      /> : <View style={{ flex: 1 }} />}

      {(isThreadView || activeGroup === "area") && (activeCategory !== "gourmet-contest" || userIsAdmin) ? (
        <Pressable
          accessibilityLabel={`${categories.find((category) => category.key === activeCategory)?.label ?? "掲示板"}に投稿`}
          onPress={() => setShowCreateThread(true)}
          style={{ position: "absolute", right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: "#18171A", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 6 }}
        >
          <IconSymbol name="plus" size={27} color="#FFF" />
        </Pressable>
      ) : null}

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
        canManage={userIsAdmin}
        onAdd={(thread) => {
          setDynamicThreads((prev) => [thread, ...prev]);
          const submission = communityRestaurantFromMealReport(thread);
          if (submission) {
            void registerCommunityRestaurant(submission).catch(() => {
              Alert.alert("投稿は完了しました", "グルメマップへの自動登録のみ失敗しました。運営が後ほど確認します。");
            });
          }
        }}
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
