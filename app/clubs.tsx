import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  CLUBS,
  CURRENT_USER,
  EVENTS,
  MEMBERS,
  RANK_LABELS,
  getMemberById,
  type Club,
  type ClubApplication,
  type BoardThread,
} from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { createBoardChat } from "@/lib/chat-store";
import { canCreateClub, isAdminRole } from "@/lib/access-control";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import * as Api from "@/lib/_core/api";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  sendLeaderAppointmentNotification,
} from "@/lib/notifications";
import {
  addClub as addClubToStore,
  leaveClub as leaveClubInStore,
  removeClubMember as removeClubMemberInStore,
  reviewClubApplication as reviewClubApplicationInStore,
  submitClubApplication as submitClubApplicationToStore,
  updateClub as updateClubInStore,
  useClubs,
} from "@/lib/club-store";
import {
  clubMembershipActionLabel,
  clubMembershipSortPriority,
  getClubViewerAccess,
} from "@/lib/club-viewer-access";
import { getClubIntroductionContent, getLatestClubActivityReports } from "@/lib/club-introduction";
import { parseDiscordBoardArchive } from "@/lib/discord-board-import";
import { MentionText } from "@/components/mention-ui";
import { getMentionGroups } from "@/lib/mentions";

const CLUB_OVERVIEW_MENTION_GROUPS = getMentionGroups(MEMBERS, CLUBS);

// 部活動掲示板の投稿型
interface ClubPost {
  id: string;
  clubId: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: string;
  commentCount: number;
  isRecruiting: boolean;
  recruitCapacity?: number;
  chatId?: string;
}

// 部活動掲示板コメント型
interface ClubPostComment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

// ============================================================
// ClubCard - 一覧カード
// ============================================================
function ClubCard({ club, onPress, previewAsMember = false }: { club: Club; onPress?: () => void; previewAsMember?: boolean }) {
  const colors = useColors();
  const { user: authUser } = useAuthContext();
  const leader = getMemberById(club.leaderId);
  const viewerAccess = getClubViewerAccess(club, authUser?.memberId, CURRENT_USER.id);
  const isMember = previewAsMember || viewerAccess.isMember;
  const hasApplied = !previewAsMember && viewerAccess.hasApplied;
  const actionLabel = previewAsMember
    ? "入部後の表示イメージ"
    : isMember
      ? "部員専用スレへ"
      : clubMembershipActionLabel({ isMember, hasApplied });
  const actionColors = isMember
    ? { background: "#E6F4EA", border: "#B7DEC1", text: "#237A3B" }
    : hasApplied
      ? { background: "#FFF4E5", border: "#FFD7A3", text: "#C66A00" }
      : { background: "#5579A6", border: "#5579A6", text: "#FFFFFF" };

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${club.name} ${actionLabel}`}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: 16,
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: isMember ? "#B7DEC1" : hasApplied ? "#FFD7A3" : colors.border,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: "#E8A0BF15",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 24 }}>{club.icon}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
              {club.name}
            </Text>
            {previewAsMember ? (
              <View style={{ backgroundColor: "#FFF0F6", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: "#C05B88" }}>表示イメージ</Text>
              </View>
            ) : !isMember && (
              <View style={{ backgroundColor: colors.border + "60", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted }}>🔒 審査制</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            部長: {leader?.name ?? club.leaderName ?? "未設定"} · {club.memberIds.length}人
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }} numberOfLines={2}>
        {club.description}
      </Text>
      <View
        pointerEvents="none"
        style={{
          minHeight: 42,
          borderRadius: 12,
          marginTop: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: actionColors.background,
          borderWidth: 1,
          borderColor: actionColors.border,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "800", color: actionColors.text }}>
          {actionLabel}
        </Text>
      </View>
    </Pressable>
  );
}

// ============================================================
// ClubPostCard - 部活動掲示板の投稿カード
// ============================================================
function ClubPostCard({
  post,
  onPress,
  isLeader,
  onRemoveMember,
}: {
  post: ClubPost;
  onPress: () => void;
  isLeader: boolean;
  onRemoveMember?: (memberId: string) => void;
}) {
  const colors = useColors();
  const author = getMemberById(post.authorId);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "たった今";
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  };

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.background,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Image
          source={author?.avatar ?? require("@/assets/images/icon.png")}
          style={{ width: 28, height: 28, borderRadius: 14 }}
          contentFit="cover"
        />
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginLeft: 8, flex: 1 }}>
          {author?.name ?? "不明"}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>{timeAgo(post.createdAt)}</Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 4 }} numberOfLines={2}>
        {post.title}
      </Text>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }} numberOfLines={2}>
        {post.content}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <IconSymbol name="bubble.left.fill" size={13} color={colors.muted} />
          <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>{post.commentCount}件</Text>
        </View>
        {post.isRecruiting && (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#A7C7E715", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <IconSymbol name="person.badge.plus" size={12} color="#A7C7E7" />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#A7C7E7", marginLeft: 4 }}>参加者募集中</Text>
          </View>
        )}
        {post.chatId && (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#34C75915", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <IconSymbol name="message.fill" size={12} color="#34C759" />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#34C759", marginLeft: 4 }}>チャットあり</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ============================================================
// ClubPostDetailModal - 部活動掲示板投稿詳細
// ============================================================
function ClubPostDetailModal({
  post,
  club,
  isLeader,
  onClose,
  onUpdatePost,
}: {
  post: ClubPost;
  club: Club;
  isLeader: boolean;
  onClose: () => void;
  onUpdatePost: (updated: ClubPost) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const userIsAdmin = isAdminRole(authUser?.role, authUser?.accessRole);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<ClubPostComment[]>([]);
  const [chatId, setChatId] = useState<string | null>(post.chatId ?? null);
  const [showSelectMembers, setShowSelectMembers] = useState(false);
  const [recruitCapacity, setRecruitCapacity] = useState<number | undefined>(post.recruitCapacity);
  const [showCapacityEdit, setShowCapacityEdit] = useState(false);
  const [capacityInput, setCapacityInput] = useState(String(post.recruitCapacity ?? ""));

  const isAuthor = post.authorId === CURRENT_USER.id;
  const canManage = isAuthor || isLeader || userIsAdmin;
  const author = getMemberById(post.authorId);

  const handleComment = () => {
    if (!commentText.trim()) return;
    const newComment: ClubPostComment = {
      id: `cp_${Date.now()}`,
      postId: post.id,
      authorId: CURRENT_USER.id,
      content: commentText.trim(),
      createdAt: new Date().toISOString(),
    };
    setComments([...comments, newComment]);
    setCommentText("");
    onUpdatePost({ ...post, commentCount: post.commentCount + 1 });
  };

  const handleCreateChat = (selectedIds: string[]) => {
    const allParticipants = [CURRENT_USER.id, ...selectedIds];
    const room = createBoardChat(post.id, post.title, allParticipants, CURRENT_USER.id);
    setChatId(room.id);
    onUpdatePost({ ...post, chatId: room.id });
    Alert.alert("チャット作成完了", "選択したメンバーとのプライベートチャットを開設しました。");
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "たった今";
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  };

  // コメントしたユニークなメンバー（自分以外）
  const uniqueCommenters = comments
    .filter((c) => c.authorId !== CURRENT_USER.id)
    .reduce<ClubPostComment[]>((acc, c) => {
      if (!acc.find((x) => x.authorId === c.authorId)) acc.push(c);
      return acc;
    }, []);

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
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={onClose}>
          <IconSymbol name="xmark" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground, marginLeft: 12 }} numberOfLines={1}>
          {post.title}
        </Text>
        {chatId && (
          <Pressable
            onPress={() => { onClose(); router.push({ pathname: "/chat", params: { id: chatId } }); }}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#34C75920", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
          >
            <IconSymbol name="message.fill" size={14} color="#34C759" />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#34C759", marginLeft: 4 }}>チャット</Text>
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 16 : 0}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {/* 投稿者 */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Image
              source={author?.avatar ?? require("@/assets/images/icon.png")}
              style={{ width: 36, height: 36, borderRadius: 18 }}
              contentFit="cover"
            />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{author?.name ?? "不明"}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{timeAgo(post.createdAt)}</Text>
            </View>
          </View>

          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground, marginBottom: 16 }}>
            {post.content}
          </Text>

          {/* 募集中バナー（投稿者・部長向け：チャット作成ボタン付き） */}
          {post.isRecruiting && (
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
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#A7C7E7", marginLeft: 8 }}>参加者募集中</Text>
              </View>
              {/* 募集人数表示 */}
              {recruitCapacity !== undefined && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <IconSymbol name="person.3.fill" size={14} color="#A7C7E7" />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginLeft: 6 }}>
                    募集人数: <Text style={{ color: "#A7C7E7" }}>{recruitCapacity}名</Text>
                  </Text>
                  {canManage && (
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
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: canManage ? 12 : 0 }}>
                コメントで参加希望を募り、投稿者または部長がメンバーを選んでプライベートチャットを作成できます。
              </Text>
              {canManage && (
                <Pressable
                  onPress={() => {
                    if (uniqueCommenters.length === 0) {
                      Alert.alert("コメントがありません", "まだコメントしたメンバーがいません。コメントで参加希望を募ってください。");
                      return;
                    }
                    setShowSelectMembers(true);
                  }}
                  style={{ backgroundColor: "#A7C7E7", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>
                    {chatId ? "チャットメンバーを追加" : "プライベートチャットを作成"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* コメント一覧 */}
          <View style={{ borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              コメント ({comments.length})
            </Text>
            {comments.length === 0 && (
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>
                まだコメントがありません。最初のコメントを書いてみましょう。
              </Text>
            )}
            {comments.map((comment) => {
              const commentAuthor = getMemberById(comment.authorId);
              return (
                <View key={comment.id} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                    <Image
                      source={commentAuthor?.avatar ?? require("@/assets/images/icon.png")}
                      style={{ width: 24, height: 24, borderRadius: 12 }}
                      contentFit="cover"
                    />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginLeft: 8 }}>
                      {commentAuthor?.name ?? "不明"}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 8 }}>
                      {timeAgo(comment.createdAt)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: colors.foreground, marginLeft: 32 }}>
                    {comment.content}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* コメント入力 */}
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
      {showSelectMembers && (
        <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowSelectMembers(false)}>
          <SelectMembersForChatModal
            commenters={uniqueCommenters}
            onClose={() => setShowSelectMembers(false)}
            onCreateChat={(selectedIds) => {
              handleCreateChat(selectedIds);
              setShowSelectMembers(false);
            }}
          />
        </Modal>
      )}
    </View>
  );
}

// ============================================================
// SelectMembersForChatModal - コメントしたメンバーを選択してチャット作成
// ============================================================
function SelectMembersForChatModal({
  commenters,
  onClose,
  onCreateChat,
}: {
  commenters: ClubPostComment[];
  onClose: () => void;
  onCreateChat: (selectedIds: string[]) => void;
}) {
  const colors = useColors();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
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
        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>チャットメンバーを選択</Text>
        <Pressable onPress={() => { if (selectedIds.length > 0) onCreateChat(selectedIds); }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: selectedIds.length > 0 ? "#E8A0BF" : colors.muted }}>作成</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 13, color: colors.muted, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        コメントしたメンバーからプライベートチャットに招待するメンバーを選択してください
      </Text>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {commenters.map((comment) => {
          const member = getMemberById(comment.authorId);
          if (!member) return null;
          const isSelected = selectedIds.includes(comment.authorId);
          return (
            <Pressable
              key={comment.authorId}
              onPress={() => toggle(comment.authorId)}
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
              <Image source={member.avatar} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{member.name}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>「{comment.content}」</Text>
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
    </View>
  );
}

function ApplicationReviewDetails({ clubId, memberId, application }: { clubId: string; memberId: string; application?: ClubApplication }) {
  const colors = useColors();
  const fallbackMember = getMemberById(memberId);
  const [review, setReview] = useState<Api.ClubApplicantReview | null>(null);
  const [loaded, setLoaded] = useState(Boolean(fallbackMember));

  useEffect(() => {
    let active = true;
    void Api.getClubApplicantReview(clubId, memberId)
      .then((value) => { if (active) setReview(value); })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [clubId, memberId]);

  const fallbackHistory = EVENTS.filter((event) => event.participants.includes(memberId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (!loaded) return <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>申請者情報を読み込んでいます</Text>;
  if (!review && !fallbackMember) return <Text style={{ fontSize: 12, color: colors.error, marginBottom: 10 }}>申請者情報を取得できませんでした</Text>;

  const displayName = review?.displayName ?? fallbackMember?.name ?? "メンバー";
  const memberTerm = review?.memberTerm ?? (fallbackMember ? `${fallbackMember.generation}期生` : null);
  const branches = review?.branches ?? (fallbackMember ? [fallbackMember.branch] : []);
  const rank = review?.memberRank ?? fallbackMember?.rank ?? "regular";
  const profile = review?.profile ?? {};
  const favoriteCuisines = Array.isArray(profile.favoriteCuisines)
    ? profile.favoriteCuisines.filter((item): item is string => typeof item === "string")
    : fallbackMember?.interests ?? [];
  const eventHistory = review?.eventHistory ?? fallbackHistory;
  const wantsToDo = review?.wantsToDo ?? application?.wantsToDo ?? "申請内容の詳細はありません";
  const messageToLeader = review?.messageToLeader ?? application?.messageToLeader ?? "メッセージはありません";
  const joinedYear = new Date(review?.joinedAt ?? fallbackMember?.joinedAt ?? "").getFullYear();
  const rankLabel = RANK_LABELS[rank as keyof typeof RANK_LABELS] ?? rank;

  return (
    <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 12, marginBottom: 10, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Image source={fallbackMember?.avatar ?? require("@/assets/images/icon.png")} style={{ width: 38, height: 38, borderRadius: 19 }} contentFit="cover" />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{displayName}</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>会員ID {memberId}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[memberTerm, ...branches.map((branch) => branch === "kanto" ? "関東支部" : branch === "kansai" ? "関西支部" : branch), rankLabel, Number.isFinite(joinedYear) ? `入会 ${joinedYear}年` : null].filter((label): label is string => Boolean(label)).map((label) => (
          <View key={label} style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground }}>{label}</Text>
          </View>
        ))}
      </View>

      {favoriteCuisines.length > 0 ? (
        <Text style={{ fontSize: 12, color: colors.muted }}>好きなグルメ：{favoriteCuisines.join("・")}</Text>
      ) : null}

      {review ? <Text style={{ fontSize: 12, color: colors.muted }}>参加回数 {review.participationCount}回 · 幹事回数 {review.organizerCount}回</Text> : null}

      <View>
        <Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground, marginBottom: 3 }}>部活動でやってみたいこと</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.foreground }}>
          {wantsToDo}
        </Text>
      </View>
      <View>
        <Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground, marginBottom: 3 }}>部長へのメッセージ</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.foreground }}>
          {messageToLeader}
        </Text>
      </View>

      <View>
        <Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground, marginBottom: 5 }}>
          過去のイベント参加履歴（{eventHistory.length}件）
        </Text>
        {eventHistory.length > 0 ? eventHistory.map((event) => (
          <View key={event.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
            <Text style={{ flex: 1, fontSize: 12, color: colors.foreground }} numberOfLines={1}>{event.title}</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 8 }}>{event.date}</Text>
          </View>
        )) : (
          <Text style={{ fontSize: 12, color: colors.muted }}>参加履歴はまだありません</Text>
        )}
      </View>
    </View>
  );
}

// ============================================================
// ClubDetailModal - 部活動詳細（部員限定コンテンツ）
// ============================================================
function ClubDetailModal({
  club,
  archiveThreads,
  onClose,
  onApply,
  onLeave,
  onUpdateClub,
}: {
  club: Club;
  archiveThreads: BoardThread[];
  onClose: () => void;
  onApply: (clubId: string, application: ClubApplication) => Promise<Club>;
  onLeave: (clubId: string) => Promise<Club>;
  onUpdateClub: (updated: Club) => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const userIsAdmin = isAdminRole(authUser?.role, authUser?.accessRole);
  const leader = getMemberById(club.leaderId);
  const [memberIds, setMemberIds] = useState(club.memberIds);
  const [applicantIds, setApplicantIds] = useState(club.applicantIds);
  const [applications, setApplications] = useState<ClubApplication[]>(club.applications);
  const [pendingIds, setPendingIds] = useState<string[]>(
    club.applications.filter((application) => application.status === "on_hold").map((application) => application.memberId),
  );
  const [currentLeaderId, setCurrentLeaderId] = useState(club.leaderId);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ClubPost | null>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [wantsToDo, setWantsToDo] = useState("");
  const [messageToLeader, setMessageToLeader] = useState("");
  const [applicationError, setApplicationError] = useState("");
  const [previewApplication, setPreviewApplication] = useState(false);
  const [showClubOverview, setShowClubOverview] = useState(false);

  const viewerAccess = getClubViewerAccess(
    { ...club, memberIds, applicantIds, applications, leaderId: currentLeaderId },
    authUser?.memberId,
    CURRENT_USER.id,
  );
  const { isMember, hasApplied, isPending, isLeader } = viewerAccess;
  const canManageMembers = club.canReviewApplications === true || isLeader || userIsAdmin;
  const clubOverview = getClubIntroductionContent(club, archiveThreads);

  const handleApply = async () => {
    if (hasApplied || isMember) return;
    if (!wantsToDo.trim() || !messageToLeader.trim()) {
      setApplicationError("どちらの項目も入力してください。");
      return;
    }
  const application: ClubApplication = {
      memberId: authUser?.memberId ?? CURRENT_USER.id,
      wantsToDo: wantsToDo.trim(),
      messageToLeader: messageToLeader.trim(),
      status: "pending",
      appliedAt: new Date().toISOString(),
    };
    try {
      const updated = await onApply(club.id, application);
      setApplicantIds(updated.applicantIds);
      setApplications(updated.applications);
      Alert.alert("申請完了", `${club.name}への入部申請を送りました。部長の審査をお待ちください。`);
    } catch (error) {
      Alert.alert("申請できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
    }
  };

  const handleLeave = () => {
    Alert.alert("退部確認", `${club.name}から退部しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "退部する",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await onLeave(club.id);
            setMemberIds(updated.memberIds);
            onClose();
          } catch (error) {
            Alert.alert("退部できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
          }
        },
      },
    ]);
  };

  // 部長・管理者が申請を承認
  const handleApprove = (memberId: string) => {
    const member = getMemberById(memberId);
    const approve = async () => {
      try {
        const updated = await reviewClubApplicationInStore(club.id, memberId, "approve");
        setMemberIds(updated.memberIds);
        setApplicantIds(updated.applicantIds);
        setPendingIds(updated.applications.filter((item) => item.status === "on_hold").map((item) => item.memberId));
        setApplications(updated.applications);
        onUpdateClub(updated);
        Alert.alert("承認完了", `${member?.name ?? ""}さんの入部を承認しました。`);
      } catch (error) {
        Alert.alert("承認できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
      }
    };
    if (Platform.OS === "web") {
      void approve();
      return;
    }
    Alert.alert("入部承認", `${member?.name ?? ""}さんの入部を承認しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "承認する",
        onPress: approve,
      },
    ]);
  };

  // 部長・管理者が申請を保留
  const handlePending = (memberId: string) => {
    const member = getMemberById(memberId);
    const hold = async () => {
      try {
        const updated = await reviewClubApplicationInStore(club.id, memberId, "hold");
        setApplicantIds(updated.applicantIds);
        setPendingIds(updated.applications.filter((item) => item.status === "on_hold").map((item) => item.memberId));
        setApplications(updated.applications);
        onUpdateClub(updated);
        Alert.alert("保留完了", `${member?.name ?? ""}さんの申請を保留にしました。`);
      } catch (error) {
        Alert.alert("保留にできませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
      }
    };
    if (Platform.OS === "web") {
      void hold();
      return;
    }
    Alert.alert(
      "保留にする",
      `${member?.name ?? ""}さんの申請を保留にしますか？\n後から承認または却下できます。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "保留にする",
          onPress: hold,
        },
      ],
    );
  };

  // 部長・管理者が申請を却下
  const handleReject = (memberId: string) => {
    const member = getMemberById(memberId);
    const reject = async () => {
      try {
        const updated = await reviewClubApplicationInStore(club.id, memberId, "reject");
        setApplicantIds(updated.applicantIds);
        setPendingIds(updated.applications.filter((item) => item.status === "on_hold").map((item) => item.memberId));
        setApplications(updated.applications);
        onUpdateClub(updated);
      } catch (error) {
        Alert.alert("却下できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
      }
    };
    if (Platform.OS === "web") {
      void reject();
      return;
    }
    Alert.alert("却下確認", `${member?.name ?? ""}さんの申請を却下しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "却下する",
        style: "destructive",
        onPress: reject,
      },
    ]);
  };

  // 部長・管理者がメンバーを退会させる
  const handleRemoveMember = (memberId: string) => {
    const member = getMemberById(memberId);
    Alert.alert("メンバー退会", `${member?.name ?? ""}さんを退会させますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "退会させる",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await removeClubMemberInStore(club.id, memberId);
            setMemberIds(updated.memberIds);
            onUpdateClub(updated);
            Alert.alert("退会完了", `${member?.name ?? ""}さんを退会させました。`);
          } catch (error) {
            Alert.alert("退会処理に失敗しました", error instanceof Error ? error.message : "もう一度お試しください。");
          }
        },
      },
    ]);
  };

  // 管理者が部長を任命
  const handleAppointLeader = (memberId: string) => {
    const member = getMemberById(memberId);
    Alert.alert("部長任命", `${member?.name ?? ""}さんを部長に任命しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "任命する",
        onPress: () => {
          setCurrentLeaderId(memberId);
          sendLeaderAppointmentNotification(club.name, CURRENT_USER.name);
          Alert.alert("任命完了", `${member?.name ?? ""}さんを${club.name}の部長に任命しました。`);
        },
      },
    ]);
  };

  const handleOpenChat = (chatId: string) => {
    onClose();
    router.push({ pathname: "/chat", params: { id: chatId } });
  };

  // 部員でない場合は申請画面のみ表示
  if ((!isMember && !canManageMembers) || previewApplication) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border,
          }}
        >
          <Pressable onPress={() => previewApplication ? setPreviewApplication(false) : onClose()}>
            <IconSymbol name="xmark" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground, marginLeft: 12 }}>
            {club.name}
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={{ alignItems: "center", padding: 24, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {previewApplication ? <View style={{ width: "100%", backgroundColor: "#EAF3FA", borderRadius: 12, padding: 12, marginBottom: 16 }}><Text style={{ fontSize: 12, fontWeight: "800", color: "#3E6F97", textAlign: "center" }}>管理者・部長向けの申請画面プレビューです</Text></View> : null}
          <Text style={{ fontSize: 48, marginBottom: 16 }}>{club.icon}</Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>
            {club.name}
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 8 }}>
            部長: {leader?.name ?? club.leaderName ?? "未設定"} · {club.memberIds.length}人のメンバー
          </Text>
          <Pressable
            onPress={() => setShowClubOverview(true)}
            accessibilityRole="button"
            accessibilityLabel={`${club.name}の部活動概要を見る`}
            style={({ pressed }) => ({
              width: "100%",
              minHeight: 46,
              borderRadius: 13,
              marginTop: 10,
              marginBottom: 16,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 7,
              backgroundColor: pressed ? "#E2EDF6" : "#EFF6FB",
              borderWidth: 1,
              borderColor: "#B9D1E5",
            })}
          >
            <IconSymbol name="doc.text.fill" size={17} color="#3E6F97" />
            <Text style={{ fontSize: 14, fontWeight: "800", color: "#3E6F97" }}>部活動概要を見る</Text>
          </Pressable>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 20,
              marginBottom: 24,
              width: "100%",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
              🔒 審査制部活動
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
              この部活動は審査制です。入部申請を送ると部長が審査を行い、承認・保留・却下のいずれかで対応します。
            </Text>
          </View>
          {!hasApplied && !isPending ? (
            <View style={{ width: "100%", gap: 14 }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
                  部活動でやってみたいこと <Text style={{ color: colors.error }}>必須</Text>
                </Text>
                <TextInput
                  value={wantsToDo}
                  onChangeText={(value) => { setWantsToDo(value); setApplicationError(""); }}
                  placeholder="企画したい活動や挑戦したいことを入力"
                  placeholderTextColor={colors.muted}
                  multiline
                  textAlignVertical="top"
                  style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, minHeight: 96, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border }}
                />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
                  部長へのメッセージ <Text style={{ color: colors.error }}>必須</Text>
                </Text>
                <TextInput
                  value={messageToLeader}
                  onChangeText={(value) => { setMessageToLeader(value); setApplicationError(""); }}
                  placeholder="入部への思いや自己紹介を入力"
                  placeholderTextColor={colors.muted}
                  multiline
                  textAlignVertical="top"
                  style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, minHeight: 96, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border }}
                />
              </View>
              {applicationError ? <Text style={{ fontSize: 13, color: colors.error }}>{applicationError}</Text> : null}
              <Pressable
                onPress={handleApply}
                disabled={previewApplication || !wantsToDo.trim() || !messageToLeader.trim()}
                style={{
                  backgroundColor: !previewApplication && wantsToDo.trim() && messageToLeader.trim() ? "#E8A0BF" : colors.border,
                  borderRadius: 14,
                  paddingVertical: 14,
                  paddingHorizontal: 32,
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>{previewApplication ? "入部申請を送る（プレビュー）" : "入部申請を送る"}</Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: "#FF990015",
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                width: "100%",
                borderWidth: 1,
                borderColor: "#FF990030",
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#FF9900" }}>
                {isPending ? "保留中（部長の審査中）" : "審査中（部長の承認待ち）"}
              </Text>
            </View>
          )}
        </ScrollView>
        <Modal
          visible={showClubOverview}
          transparent
          animationType="fade"
          onRequestClose={() => setShowClubOverview(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.42)", justifyContent: "center", padding: 20 }}>
            <View style={{ width: "100%", maxHeight: "82%", backgroundColor: colors.background, borderRadius: 20, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 22, marginRight: 9 }}>{club.icon}</Text>
                <Text style={{ flex: 1, fontSize: 17, fontWeight: "900", color: colors.foreground }}>{club.name}の概要</Text>
                <Pressable onPress={() => setShowClubOverview(false)} accessibilityRole="button" accessibilityLabel="部活動概要を閉じる" hitSlop={10}>
                  <IconSymbol name="xmark" size={21} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 24 }}>
                <MentionText content={clubOverview} groups={CLUB_OVERVIEW_MENTION_GROUPS} />
              </ScrollView>
              <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
                <Pressable
                  onPress={() => setShowClubOverview(false)}
                  style={({ pressed }) => ({ minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? "#D57DA5" : "#E8A0BF" })}
                >
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFF" }}>閉じる</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // 部員向け詳細画面
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
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={onClose}>
          <IconSymbol name="xmark" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground, marginLeft: 12 }}>
          {club.name}
        </Text>
        {canManageMembers ? <Pressable onPress={() => setPreviewApplication(true)} style={{ borderRadius: 8, backgroundColor: "#EAF3FA", paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 }}><Text style={{ fontSize: 11, fontWeight: "800", color: "#3E6F97" }}>申請画面</Text></Pressable> : null}
        {club.chatId && (
          <Pressable
            onPress={() => handleOpenChat(club.chatId!)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#34C75920",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <IconSymbol name="message.fill" size={14} color="#34C759" />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#34C759", marginLeft: 4 }}>部活動チャット</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Club info */}
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>{club.icon}</Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{club.name}</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>{memberIds.length}人のメンバー</Text>
        </View>

        {/* Description */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground }}>{club.description}</Text>
        </View>

        {/* 部長 */}
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>部長</Text>
        {(() => {
          const currentLeader = getMemberById(currentLeaderId);
          return currentLeaderId ? (
            <Pressable
              onPress={() => { onClose(); router.push({ pathname: "/member-profile", params: { id: currentLeaderId } }); }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <Image source={currentLeader?.avatar ?? require("@/assets/images/icon.png")} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{currentLeader?.name ?? club.leaderName ?? "部長"}</Text>
                {currentLeader ? <Text style={{ fontSize: 12, color: colors.muted }}>{currentLeader.generation}期生 · {currentLeader.branch}支部</Text> : null}
              </View>
              <View style={{ backgroundColor: "#FFD70020", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#FFD700" }}>部長</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </Pressable>
          ) : null;
        })()}

        {/* 入部申請管理（部長・管理者のみ） */}
        {canManageMembers && (applicantIds.length > 0 || pendingIds.length > 0) && (
          <View style={{ marginBottom: 16 }}>
            {/* 新規申請 */}
            {applicantIds.length > 0 && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>入部申請</Text>
                  <View style={{ backgroundColor: "#FF990020", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#FF9900" }}>{applicantIds.length}件</Text>
                  </View>
                </View>
                {applicantIds.map((memberId) => {
                  return (
                    <View
                      key={memberId}
                      style={{
                        backgroundColor: colors.surface,
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 8,
                      }}
                    >
                      <ApplicationReviewDetails
                        clubId={club.id}
                        memberId={memberId}
                        application={applications.find((application) => application.memberId === memberId)}
                      />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => handleApprove(memberId)}
                          style={{ flex: 1, backgroundColor: "#34C75920", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "700", color: "#34C759" }}>承認</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handlePending(memberId)}
                          style={{ flex: 1, backgroundColor: "#FF990015", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: "#FF9900" }}>保留</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleReject(memberId)}
                          style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted }}>却下</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* 保留中 */}
            {pendingIds.length > 0 && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, marginTop: applicantIds.length > 0 ? 12 : 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>保留中</Text>
                  <View style={{ backgroundColor: "#A7C7E720", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#A7C7E7" }}>{pendingIds.length}件</Text>
                  </View>
                </View>
                {pendingIds.map((memberId) => {
                  return (
                    <View
                      key={memberId}
                      style={{
                        backgroundColor: "#A7C7E710",
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: "#A7C7E730",
                      }}
                    >
                      <ApplicationReviewDetails
                        clubId={club.id}
                        memberId={memberId}
                        application={applications.find((application) => application.memberId === memberId)}
                      />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => handleApprove(memberId)}
                          style={{ flex: 1, backgroundColor: "#34C75920", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "700", color: "#34C759" }}>承認</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleReject(memberId)}
                          style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted }}>却下</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* 部活動掲示板 */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: colors.foreground }}>部活動掲示板</Text>
          <Pressable
            onPress={() => setShowCreatePost(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#E8A0BF20",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <IconSymbol name="plus" size={14} color="#E8A0BF" />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#E8A0BF", marginLeft: 4 }}>投稿する</Text>
          </Pressable>
        </View>

        {posts.length === 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 20, alignItems: "center", marginBottom: 16 }}>
            <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
              まだ投稿がありません。{"\n"}「投稿する」ボタンから掲示板に投稿できます。
            </Text>
          </View>
        ) : (
          posts.map((post) => (
            <ClubPostCard
              key={post.id}
              post={post}
              onPress={() => setSelectedPost(post)}
              isLeader={isLeader}
            />
          ))
        )}

        {/* メンバー一覧（部員のみ閲覧可） */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, marginTop: 8 }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: colors.foreground }}>
            メンバー ({memberIds.length}人)
          </Text>
        </View>
        {memberIds.map((memberId) => {
          const member = getMemberById(memberId);
          if (!member) return null;
          const isCurrentLeader = memberId === currentLeaderId;
          const isCurrentUser = memberId === CURRENT_USER.id;
          return (
            <View
              key={memberId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border,
              }}
            >
              <Pressable
                onPress={() => { onClose(); router.push({ pathname: "/member-profile", params: { id: memberId } }); }}
                style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
              >
                <Image source={member.avatar} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{member.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{member.generation}期生 · {member.branch}支部</Text>
                </View>
              </Pressable>
              {isCurrentLeader ? (
                <View style={{ backgroundColor: "#FFD70020", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#FFD700" }}>部長</Text>
                </View>
              ) : canManageMembers && !isCurrentUser ? (
                <View style={{ flexDirection: "row", gap: 6, marginRight: 6 }}>
                  {userIsAdmin && (
                    <Pressable
                      onPress={() => handleAppointLeader(memberId)}
                      style={{ backgroundColor: "#FF950015", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#FF950030" }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#FF9500" }}>部長に任命</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleRemoveMember(memberId)}
                    style={{ backgroundColor: "#FF3B3015", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#FF3B3030" }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#FF3B30" }}>退会</Text>
                  </Pressable>
                </View>
              ) : null}
              <IconSymbol name="chevron.right" size={14} color={colors.muted} />
            </View>
          );
        })}

        {/* 退部ボタン */}
        {!isLeader && (
          <Pressable
            onPress={handleLeave}
            style={{
              marginTop: 24,
              marginBottom: 20,
              backgroundColor: colors.surface,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.muted }}>退部する</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* 投稿詳細モーダル */}
      {selectedPost && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedPost(null)}>
          <ClubPostDetailModal
            post={selectedPost}
            club={club}
            isLeader={isLeader}
            onClose={() => setSelectedPost(null)}
            onUpdatePost={(updated) => {
              setPosts(posts.map((p) => p.id === updated.id ? updated : p));
              setSelectedPost(null);
            }}
          />
        </Modal>
      )}

      {/* 投稿作成モーダル */}
      {showCreatePost && (
        <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowCreatePost(false)}>
          <CreateClubPostModal
            clubId={club.id}
            onClose={() => setShowCreatePost(false)}
            onCreate={(post) => {
              setPosts([post, ...posts]);
              setShowCreatePost(false);
            }}
          />
        </Modal>
      )}
    </View>
  );
}

// ============================================================
// CreateClubPostModal - 部活動掲示板投稿作成
// ============================================================
function CreateClubPostModal({
  clubId,
  onClose,
  onCreate,
}: {
  clubId: string;
  onClose: () => void;
  onCreate: (post: ClubPost) => void;
}) {
  const colors = useColors();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [capacity, setCapacity] = useState("");

  const handleCreate = () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("入力エラー", "タイトルと内容は必須です。");
      return;
    }
    const newPost: ClubPost = {
      id: `cp_${Date.now()}`,
      clubId,
      title: title.trim(),
      content: content.trim(),
      authorId: CURRENT_USER.id,
      createdAt: new Date().toISOString(),
      commentCount: 0,
      isRecruiting,
      recruitCapacity: isRecruiting ? parseInt(capacity || "10", 10) : undefined,
    };
    onCreate(newPost);
    Alert.alert("投稿完了", "掲示板に投稿しました！");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
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
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
          掲示板に投稿
        </Text>
        <Pressable onPress={handleCreate}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: title.trim() && content.trim() ? "#E8A0BF" : colors.muted }}>
            投稿
          </Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>タイトル *</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="例: 渋谷ラーメン巡り参加者募集"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 14,
            fontSize: 15,
            color: colors.foreground,
            marginBottom: 16,
          }}
        />
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>内容 *</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="投稿の内容を入力..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 14,
            fontSize: 15,
            color: colors.foreground,
            minHeight: 120,
            marginBottom: 16,
          }}
        />

        {/* 参加者募集トグル */}
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
          <Text style={{ flex: 1, fontSize: 15, color: colors.foreground, marginLeft: 10 }}>参加者を募集する</Text>
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

        {isRecruiting && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>募集人数</Text>
            <TextInput
              value={capacity}
              onChangeText={setCapacity}
              placeholder="例: 10"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 14,
                fontSize: 15,
                color: colors.foreground,
              }}
            />
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>
              ※ コメントで参加希望を募り、投稿者または部長がメンバーを選んでプライベートチャットを作成できます
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================
// AddClubModal - 新規部活動作成（管理者限定）
// ============================================================
function AddClubModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (club: Club) => void;
}) {
  const colors = useColors();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🏃");
  const ICONS = ["🍜", "🍷", "🍰", "👨‍🍳", "🎾", "🏃", "📚", "🎮", "🎵", "🌿", "🍺", "🎨"];

  const handleCreate = () => {
    if (!name.trim() || !description.trim()) return;
    const newClub: Club = {
      id: `club_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      leaderId: CURRENT_USER.id,
      memberIds: [CURRENT_USER.id],
      applicantIds: [],
      applications: [],
      icon,
      createdByAdmin: true,
      events: [],
    };
    onAdd(newClub);
    setName(""); setDescription(""); setIcon("🏃");
    onClose();
    Alert.alert("作成完了", `${newClub.name}を作成しました！`);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
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
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
            部活動を作成
          </Text>
          <Pressable onPress={handleCreate}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#E8A0BF" }}>作成</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>アイコン</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {ICONS.map((ic) => (
              <Pressable
                key={ic}
                onPress={() => setIcon(ic)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: icon === ic ? "#E8A0BF20" : colors.surface,
                  borderWidth: icon === ic ? 2 : 0,
                  borderColor: "#E8A0BF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 8,
                }}
              >
                <Text style={{ fontSize: 24 }}>{ic}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>部活動名 *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="例: 焼き鳥部"
            placeholderTextColor={colors.muted}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              color: colors.foreground,
              marginBottom: 16,
            }}
          />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>説明 *</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="部活動の説明を入力..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              color: colors.foreground,
              minHeight: 100,
              textAlignVertical: "top",
              marginBottom: 16,
            }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ============================================================
// Main Screen
// ============================================================
export default function ClubsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const userIsAdmin = canCreateClub(authUser?.role, authUser?.accessRole);
  const clubs = useClubs();
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [archiveThreads, setArchiveThreads] = useState<BoardThread[]>([]);
  const activityReports = getLatestClubActivityReports(archiveThreads, 3);

  useEffect(() => {
    let active = true;
    void Api.getBoardArchive("public").then((archive) => {
      if (active) setArchiveThreads(parseDiscordBoardArchive(archive).threads);
    }).catch(() => {
      // 公開範囲の移行データが取得できない場合も、部活動一覧は利用できる。
    });
    return () => { active = false; };
  }, []);
  const clubsWithAccess = clubs.map((club) => ({
    club,
    access: getClubViewerAccess(club, authUser?.memberId, CURRENT_USER.id),
  }));
  const joinedClubs = clubsWithAccess
    .filter(({ access }) => access.isMember)
    .map(({ club }) => club)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const discoverClubs = clubsWithAccess
    .filter(({ access }) => !access.isMember)
    .sort((a, b) => clubMembershipSortPriority(a.access) - clubMembershipSortPriority(b.access)
      || a.club.name.localeCompare(b.club.name, "ja"))
    .map(({ club }) => club);
  const joinedClubPreview = joinedClubs.length === 0
    ? clubs.find((club) => club.name === "スイーツ部")
    : undefined;

  const handleApply = async (clubId: string, application: ClubApplication) => {
    const updated = await submitClubApplicationToStore(clubId, application.wantsToDo, application.messageToLeader);
    setSelectedClub(updated);
    return updated;
  };

  const handleLeave = async (clubId: string) => {
    const updated = await leaveClubInStore(clubId);
    if (selectedClub?.id === clubId) setSelectedClub(updated);
    return updated;
  };

  const handleUpdateClub = (updated: Club) => {
    updateClubInStore(updated);
    if (selectedClub?.id === updated.id) setSelectedClub(updated);
  };

  const handleAddClub = (club: Club) => {
    if (!userIsAdmin) {
      setShowAddModal(false);
      Alert.alert("権限がありません", "部活動を追加できるのは管理者のみです。");
      return;
    }
    addClubToStore(club);
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前の画面へ戻る"
          hitSlop={10}
          onPress={() => router.canGoBack() ? router.back() : router.replace("/profile")}
          style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", marginRight: 4 }}
        >
          <IconSymbol name="chevron.left" size={23} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 22, fontWeight: "800", color: colors.foreground }}>部活動</Text>
        {userIsAdmin && (
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#E8A0BF",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <IconSymbol name="plus" size={16} color="#FFF" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFF", marginLeft: 4 }}>新規作成</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 16, marginBottom: 22 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 11 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground }}>活動報告</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>各部活動の最新レポート</Text>
            </View>
            <Pressable
              onPress={() => router.push({ pathname: "/board", params: { category: "club-all", view: "threads" } })}
              accessibilityRole="button"
              accessibilityLabel="活動報告をすべて見る"
              hitSlop={8}
            >
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#5579A6" }}>すべて見る ›</Text>
            </Pressable>
          </View>
          <View style={{ gap: 9 }}>
            {activityReports.map((report) => (
              <Pressable
                key={report.id}
                onPress={() => router.push({ pathname: "/board", params: { category: "club-all", view: "threads", thread: report.id } })}
                accessibilityRole="button"
                accessibilityLabel={report.title}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 78,
                  padding: 11,
                  borderRadius: 15,
                  backgroundColor: pressed ? "#F2F0F3" : colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                })}
              >
                {report.images?.[0] ? (
                  <Image source={report.images[0]} style={{ width: 56, height: 56, borderRadius: 11, marginRight: 11 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 56, height: 56, borderRadius: 11, marginRight: 11, backgroundColor: "#EAF3FA", alignItems: "center", justifyContent: "center" }}>
                    <IconSymbol name="doc.text.fill" size={23} color="#5579A6" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, lineHeight: 20 }} numberOfLines={2}>{report.title}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }} numberOfLines={1}>
                    {report.author.name} · {new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(report.lastUpdated))}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </View>

        {joinedClubs.length > 0 || joinedClubPreview ? (
          <View style={{ marginBottom: 18 }}>
            <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
              <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground }}>入部中の部活動</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>
                {joinedClubPreview ? "入部後の表示イメージです（実際には未入部です）" : "部活動を開くと投稿やメンバーを確認できます"}
              </Text>
            </View>
            {joinedClubs.map((club) => (
              <ClubCard
                key={club.id}
                club={club}
                onPress={() => router.push({ pathname: "/board", params: { category: `club-${club.id}`, view: "threads" } })}
              />
            ))}
            {joinedClubPreview ? (
              <ClubCard
                club={joinedClubPreview}
                previewAsMember
              />
            ) : null}
          </View>
        ) : null}

        <View>
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground }}>部活動を探す</Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 3 }}>
              申請済みの部活は「審査中」、未申請の部活は「入部申請する」と表示されます
            </Text>
          </View>
          {discoverClubs.map((club) => <ClubCard key={club.id} club={club} onPress={() => setSelectedClub(club)} />)}
        </View>
      </ScrollView>

      {/* 部活動詳細モーダル */}
      {selectedClub && (
        <Modal
          visible={!!selectedClub}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedClub(null)}
        >
          <ClubDetailModal
            club={selectedClub}
            archiveThreads={archiveThreads}
            onClose={() => setSelectedClub(null)}
            onApply={handleApply}
            onLeave={handleLeave}
            onUpdateClub={handleUpdateClub}
          />
        </Modal>
      )}

      {/* 新規部活動作成モーダル（管理者限定） */}
      {userIsAdmin && (
        <AddClubModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddClub}
        />
      )}
    </ScreenContainer>
  );
}
