import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { MemberRankBadge, MemberRoleBadge, stripRankFromName } from "@/components/member-rank-badge";
import { MentionSuggestions, MentionText } from "@/components/mention-ui";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  BOARD_THREADS,
  BOARD_CATEGORIES,
  BOARD_HOME_ORDER,
  BOARD_COMMENTS,
  CURRENT_USER,
  MEMBERS,
  CLUBS,
  type BoardThread,
  type BoardComment,
  type BoardImage,
  type BoardCategory,
  type BoardPoll,
  type Club,
  type Member,
} from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { createBoardChat } from "@/lib/chat-store";
import { canManageBoardCategories, canManageGourmetContests, isOperatorRole } from "@/lib/access-control";
import { canViewerAccessClubContent, getClubViewerAccess, resolveViewerMemberId } from "@/lib/club-viewer-access";
import { GOURMET_ADVICE_BUDGETS, isGoogleMapsUrl, MEAL_BUDGETS } from "@/lib/meal-report";
import { communityRestaurantFromMealReport, registerCommunityRestaurant } from "@/lib/gourmet-map-community";
import { formatMealReportArea, resolveRestaurantLocation } from "@/lib/restaurant-location";
import { XpRewardPopup } from "@/components/xp-reward-popup";
import { awardXp, type XpReward } from "@/lib/xp-store";
import { POINT_ACTIONS } from "@/constants/mock-data";
import { submitClubApplication as submitClubApplicationToStore, useClubs } from "@/lib/club-store";
import { getMentionGroups, getMentionQuery, getMentionedMemberIds, insertMention } from "@/lib/mentions";
import { sendClubApplicationNotification, sendMentionNotification } from "@/lib/notifications";
import { type TextSelection } from "@/lib/text-formatting";
import { toggleReactionMember } from "@/lib/chat-reactions";
import { awardContestWinnerOnce, buildContestEntryContent, createContestAwardComment, getContestWinner, isContestCommentingOpen, isContestEntryValid } from "@/lib/gourmet-contest";
import { loadImportedGourmetContests } from "@/lib/gourmet-contest-import";
import { parseDiscordBoardArchive } from "@/lib/discord-board-import";
import * as Api from "@/lib/_core/api";
import { boardCommentData, boardThreadData, sharedCommentToBoardComment, sharedThreadToBoardThread } from "@/lib/shared-board-content";
import { loadCommentReactions, loadThreadReactions, saveCommentReactions, saveThreadReactions } from "@/lib/board-reactions";
import { applyBoardThreadEdits, loadBoardThreadEdits, saveBoardThreadEdit } from "@/lib/board-thread-edits";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Alert,
  ActivityIndicator,
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
import { boardActivityForThread, recordHomeActivity } from "@/lib/home-activity-store";
import { GOURMET_GENRES } from "@/constants/event-options";
import { boardPollResult, finalizeBoardPollOnce, isBoardPollOpen, loadBoardPoll, voteBoardPoll } from "@/lib/board-polls";
import { addInAppNotification } from "@/lib/in-app-notifications-store";
import { deleteBoardComment, deleteBoardThread, loadBoardCommentEdits, loadDeletedBoardCommentIds, loadDeletedBoardThreadIds, saveBoardCommentEdit } from "@/lib/board-content-store";
import { CalendarField } from "@/components/calendar-field";
import { getBoardRecruitmentStatus, isClubSelfIntroduction, isRecruitmentBoardCategory, isThreadPinned, sortRecruitmentThreads, type BoardRecruitmentStatus } from "@/lib/board-recruitment";
import { memberFromAuthUser } from "@/lib/auth-member";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";

const BOARD_MENTION_GROUPS = getMentionGroups(MEMBERS, CLUBS);
const THREAD_REACTION_EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋", "😛", "🤪", "🤔", "🫡", "😎", "🥳", "😮", "😢", "😭", "😡", "👍", "👎", "👏", "🙌", "🙏", "💪", "👀", "❤️", "🩷", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🔥", "✨", "🎉", "💯", "✅", "❌", "💡", "📌", "🍽️", "🍣", "🍖", "🍜", "🍕", "🍰", "☕", "🍺", "🍷"] as const;
const boardImageSource = (image: BoardImage) => typeof image === "string" ? { uri: image } : image;
const isDurableBoardImage = (uri: string) => /^https:\/\//i.test(uri) || uri.startsWith("/api/event-images/");
async function uploadBoardImages(images?: BoardImage[]) {
  if (!images?.length) return undefined;
  return Promise.all(images.map(async (image) => {
    if (typeof image === "number") return image;
    const uri = typeof image === "string" ? image : image.uri;
    if (isDurableBoardImage(uri)) return image;
    const uploaded = await Api.uploadEventImage(uri);
    return uploaded.imageUrl;
  }));
}
const normalizedAdviceValue = (value: string) => /^(未設定|特になし|なし|未選択)$/i.test(value.trim()) ? "指定なし" : value;

function mealReportImpression(thread: BoardThread): string | undefined {
  const report = thread.mealReport;
  if (!report) return undefined;
  const source = report.comment?.trim() || thread.preview;
  const sourceLines = source.split(/\r?\n/);
  const previewStart = sourceLines.findIndex((line, index) => {
    const trimmed = line.trim();
    const next = sourceLines[index + 1]?.trim() ?? "";
    return (trimmed.includes(report.restaurantName) && /[（(].+[）)]/.test(trimmed) && /(?:★|☆|■予算)/.test(next)) || /^(?:★|☆){3,}/.test(trimmed);
  });
  const lines = previewStart >= 0 ? sourceLines.slice(0, previewStart) : sourceLines;
  const labeledIndex = lines.findIndex((line) => /(?:感想|ひとこと|一言)\s*[：:]/.test(line));
  if (labeledIndex >= 0) {
    const first = lines[labeledIndex].replace(/^.*?(?:感想|ひとこと|一言)\s*[：:]\s*/, "").trim();
    const value = [first, ...lines.slice(labeledIndex + 1)]
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/(?:店名|お店|店舗名|場所|エリア|所在地|評価|おすすめ度|予算|価格帯|おすすめメニュー|メニュー|商品名)\s*[：:]/.test(line))
      .filter((line) => !/^https?:\/\//i.test(line))
      .join("\n")
      .trim();
    if (value) return value;
  }

  const residual = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/(?:店名|お店|店舗名|場所|エリア|所在地|評価|おすすめ度|予算|価格帯|おすすめメニュー|メニュー|商品名)\s*[：:]/.test(line))
    .filter((line) => !/^https?:\/\//i.test(line));
  const value = residual.join("\n").trim();
  if (!value || value === report.restaurantName.trim() || value === thread.title.trim()) return undefined;
  return value;
}

function OperatorOrRankBadge({ member }: { member: typeof CURRENT_USER }) {
  return <><MemberRankBadge rank={member.rank} name={member.name} compact /><MemberRoleBadge name={member.name} role={member.role} compact /></>;
}

function PollCard({ ownerKey, poll }: { ownerKey: string; poll: BoardPoll }) {
  const colors = useColors();
  const [current, setCurrent] = useState(poll);
  const [viewerMemberId, setViewerMemberId] = useState(CURRENT_USER.id);
  const [shared, setShared] = useState(false);
  const open = isBoardPollOpen(current);
  useEffect(() => {
    setShared(false);
    setViewerMemberId(CURRENT_USER.id);
    const [ownerType, ownerId] = ownerKey.split(":", 2) as ["thread" | "comment", string];
    void Api.getSharedBoardPoll(ownerType, ownerId).then((result) => {
      setCurrent(result.poll);
      setViewerMemberId(result.viewerMemberId);
      setShared(true);
    }).catch(() => void loadBoardPoll(ownerKey, poll).then(setCurrent));
  }, [ownerKey, poll]);
  useEffect(() => {
    if (open || shared) return;
    void finalizeBoardPollOnce(ownerKey).then((created) => {
      if (created) addInAppNotification({ targetMemberId: CURRENT_USER.id, type: "poll_result", title: "投票結果が確定しました", body: `${current.question}：${boardPollResult(current)}` });
    });
  }, [current, open, ownerKey, shared]);
  const total = new Set(current.options.flatMap((option) => option.voterIds)).size;
  return <View style={{ marginTop: 12, borderRadius: 14, padding: 13, backgroundColor: "#F7F5FA", borderWidth: 1, borderColor: "#DED8E8" }}><View style={{ flexDirection: "row", alignItems: "center" }}><IconSymbol name="chart.bar.fill" size={17} color="#6D5B85" /><Text style={{ flex: 1, fontSize: 14, fontWeight: "900", color: colors.foreground, marginLeft: 7 }}>{current.question}</Text><View style={{ borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: open ? "#E4F3E8" : "#E8E8EB" }}><Text style={{ fontSize: 10, fontWeight: "900", color: open ? "#277A40" : colors.muted }}>{open ? "投票受付中" : "終了"}</Text></View></View>{current.allowMultiple ? <Text style={{ fontSize: 10, fontWeight: "800", color: "#6D5B85", marginTop: 5 }}>複数回答可</Text> : null}<View style={{ gap: 7, marginTop: 11 }}>{current.options.map((option) => { const selected = option.voterIds.includes(viewerMemberId); const ratio = total ? option.voterIds.length / total : 0; return <Pressable key={option.id} disabled={!open} onPress={() => { const [ownerType, ownerId] = ownerKey.split(":", 2) as ["thread" | "comment", string]; void (shared ? Api.voteSharedBoardPoll(ownerType, ownerId, option.id).then((result) => { setCurrent(result.poll); setViewerMemberId(result.viewerMemberId); }) : voteBoardPoll(ownerKey, current, option.id, viewerMemberId).then(setCurrent)); }} style={{ overflow: "hidden", borderRadius: 10, borderWidth: 1, borderColor: selected ? "#725C8C" : colors.border, backgroundColor: colors.surface }}><View style={{ position: "absolute", inset: 0, width: `${Math.round(ratio * 100)}%`, backgroundColor: selected ? "#E8DDF1" : "#EEEAF2" }} /><View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 11, paddingVertical: 9 }}><Text style={{ flex: 1, fontSize: 13, fontWeight: selected ? "900" : "700", color: colors.foreground }}>{option.text}</Text><Text style={{ fontSize: 12, fontWeight: "900", color: colors.muted }}>{option.voterIds.length}票</Text></View></Pressable>; })}</View><Text style={{ fontSize: 11, color: colors.muted, marginTop: 9 }}>{open ? `期限：${current.deadline} 23:59` : `結果：${boardPollResult(current)}`}</Text></View>;
}

function PollComposer({ enabled, setEnabled, question, setQuestion, options, setOptions, deadline, setDeadline, allowMultiple, setAllowMultiple }: { enabled: boolean; setEnabled: (value: boolean) => void; question: string; setQuestion: (value: string) => void; options: string[]; setOptions: (value: string[]) => void; deadline: string; setDeadline: (value: string) => void; allowMultiple: boolean; setAllowMultiple: (value: boolean) => void }) {
  const colors = useColors();
  return <View><Pressable onPress={() => setEnabled(!enabled)} style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingVertical: 7 }}><IconSymbol name="chart.bar.fill" size={17} color="#6D5B85" /><Text style={{ fontSize: 13, fontWeight: "800", color: "#6D5B85", marginLeft: 6 }}>{enabled ? "投票を取り消す" : "投票を追加"}</Text></Pressable>{enabled ? <View style={{ marginTop: 8, padding: 12, borderRadius: 13, backgroundColor: "#F7F5FA", borderWidth: 1, borderColor: "#DED8E8", gap: 9 }}><TextInput value={question} onChangeText={setQuestion} placeholder="質問を入力" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 9, padding: 10, color: colors.foreground }} />{options.map((option, index) => <View key={index} style={{ flexDirection: "row", alignItems: "center" }}><TextInput value={option} onChangeText={(value) => setOptions(options.map((item, itemIndex) => itemIndex === index ? value : item))} placeholder={`選択肢 ${index + 1}`} placeholderTextColor={colors.muted} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 9, padding: 10, color: colors.foreground }} />{options.length > 2 ? <Pressable onPress={() => setOptions(options.filter((_, itemIndex) => itemIndex !== index))} style={{ padding: 8 }}><IconSymbol name="xmark" size={15} color={colors.error} /></Pressable> : null}</View>)}{options.length < 10 ? <Pressable onPress={() => setOptions([...options, ""])}><Text style={{ fontSize: 12, fontWeight: "800", color: "#6D5B85" }}>＋ 選択肢を追加</Text></Pressable> : null}<View><Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground, marginBottom: 6 }}>投票期限</Text><CalendarField label="投票期限" value={deadline} onChange={setDeadline} /></View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allowMultiple }} onPress={() => setAllowMultiple(!allowMultiple)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}><View style={{ width: 21, height: 21, borderRadius: 5, borderWidth: 1.5, borderColor: allowMultiple ? "#6D5B85" : colors.border, backgroundColor: allowMultiple ? "#6D5B85" : colors.surface, alignItems: "center", justifyContent: "center" }}>{allowMultiple ? <IconSymbol name="checkmark" size={14} color="#FFF" /> : null}</View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginLeft: 8 }}>複数回答を許可する</Text></Pressable></View> : null}</View>;
}

function BoardVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} nativeControls style={{ width: "100%", aspectRatio: 1, borderRadius: 14, backgroundColor: "#111" }} />;
}

function LinkifiedText({ content }: { content: string }) {
  return <MentionText content={content} groups={BOARD_MENTION_GROUPS} />;
}

function RecruitmentStatusBadge({ status }: { status: BoardRecruitmentStatus }) {
  if (status !== "open") return null;
  return <View style={{ marginRight: 9, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#DDF3E3" }}><Text style={{ fontSize: 11, fontWeight: "900", color: "#247A42" }}>募集中</Text></View>;
}


function MealReportContent({ thread, compact = false }: { thread: BoardThread; compact?: boolean }) {
  const colors = useColors();
  const report = thread.mealReport;
  if (!report) return null;
  const impression = mealReportImpression(thread);

  const area = (report.areaDisplay ?? formatMealReportArea(report.prefecture)).replace(/^📍\s*/, "").trim();
  const rating = Math.max(0, Math.min(5, Math.round(report.rating)));
  const hasSummary = Boolean(area || report.budget || rating);

  if (compact) {
    return hasSummary ? (
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 9 }}>
        {area ? <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#F4F1F3" }}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>📍 {area}</Text></View> : null}
        {report.budget ? <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#F4F1F3" }}><Text style={{ fontSize: 12, color: colors.muted }}>予算 {report.budget}</Text></View> : null}
        {rating ? <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#FFF3DF" }}><Text style={{ fontSize: 12, fontWeight: "800", color: "#D88900" }}>★ {rating}</Text></View> : null}
      </View>
    ) : null;
  }

  return (
    <View
      style={{ marginBottom: 16 }}
    >
      {report.postTitle ? <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: "900", color: colors.foreground, marginBottom: 4 }}>{report.postTitle}</Text> : null}
      <Text style={{ fontSize: 16, lineHeight: 22, fontWeight: "800", color: colors.foreground, marginBottom: 9 }}>{report.restaurantName}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {area ? <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>📍 {area}</Text> : null}
        {report.budget ? <Text style={{ fontSize: 13, color: colors.muted }}>予算 {report.budget}</Text> : null}
      </View>
      {rating ? <Text style={{ fontSize: 17, color: "#F5A623", letterSpacing: 2, marginTop: 6 }}>
        {"★".repeat(rating)}{"☆".repeat(5 - rating)}
      </Text> : null}
      {report.recommendedMenu ? (
        <Text style={{ fontSize: 14, color: colors.foreground, marginTop: 9 }}>
          <Text style={{ fontWeight: "800" }}>おすすめメニュー　</Text>{report.recommendedMenu}
        </Text>
      ) : null}
      {impression ? (
        <Text style={{ fontSize: 14, lineHeight: 21, color: colors.foreground, marginTop: 8 }}>
          <Text style={{ fontWeight: "800" }}>感想　</Text>{impression}
        </Text>
      ) : null}
      {(report.googleMapUrl || report.tabelogUrl) ? (
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

function MealReportTimelineCard({ thread, comments = [] }: { thread: BoardThread; comments?: BoardComment[] }) {
  const colors = useColors();
  const report = thread.mealReport;
  if (!report) return null;
  const area = (report.areaDisplay ?? formatMealReportArea(report.prefecture)).replace(/^📍\s*/, "").trim();
  const rating = Math.max(0, Math.min(5, Math.round(report.rating)));
  const impression = mealReportImpression(thread);
  return (
    <View>
      <View>
        <View style={{ minWidth: 0 }}>
          {report.postTitle ? <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, fontWeight: "900", color: colors.foreground }}>{report.postTitle}</Text> : null}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: report.postTitle ? 3 : 0 }}><Text numberOfLines={2} style={{ fontSize: report.postTitle ? 13 : 16, lineHeight: report.postTitle ? 18 : 21, fontWeight: "900", color: colors.foreground }}>{report.restaurantName}</Text>{area ? <Text style={{ fontSize: 11, fontWeight: "700", color: "#5F5960", backgroundColor: "#F4F1F3", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>📍 {area}</Text> : null}</View>
          {rating ? <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}><Text accessibilityLabel={`評価 ${rating} / 5`} style={{ fontSize: 17, letterSpacing: 1, color: "#E29A17" }}>{"⭐️".repeat(rating)}{"☆".repeat(5 - rating)}</Text></View> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
            {report.budget ? <Text style={{ fontSize: 11, fontWeight: "700", color: "#5F5960", backgroundColor: "#F4F1F3", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>{report.budget}</Text> : null}
          </View>
          {impression ? <View style={{ marginTop: 7 }}><Text style={{ fontSize: 13, lineHeight: 19, color: colors.foreground }}>{impression}</Text></View> : null}
        </View>
      </View>
      {thread.images?.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>{thread.images.map((item, index) => <Image key={`${thread.id}-image-${index}`} source={boardImageSource(item)} style={{ width: "32%", aspectRatio: 1, borderRadius: 10, backgroundColor: "#F1EEF0" }} contentFit="cover" />)}</View> : null}
      <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>コメント{comments.length ? ` (${comments.length})` : ""}</Text>
        {comments.slice(-2).map((comment) => <View key={comment.id} style={{ marginTop: 7 }}><Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted }}>{stripRankFromName(comment.author.name)}</Text><Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 18, color: colors.foreground, marginTop: 1 }}>{comment.content}</Text></View>)}
        {!comments.length ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 5 }}>まだコメントはありません</Text> : null}
      </View>
    </View>
  );
}

function GourmetAdviceContent({ thread, compact = false }: { thread: BoardThread; compact?: boolean }) {
  const colors = useColors();
  const advice = thread.gourmetAdvice;
  if (!advice) return null;
  const genres = (advice.genres?.length ? advice.genres : ["指定なし"]).map((genre) => genre === "指定しない" ? "指定なし" : genre);
  return (
    <View style={{ backgroundColor: "#FFF9EA", borderRadius: 12, padding: compact ? 10 : 14, marginBottom: compact ? 8 : 16, borderWidth: 1, borderColor: "#F0DDA8" }}>
      {[{ label: "料理ジャンル", value: genres.join("・") }, { label: "エリア", value: normalizedAdviceValue(advice.area) }, { label: "利用シーン", value: normalizedAdviceValue(advice.scene) }, { label: "予算", value: normalizedAdviceValue(advice.budget) }].map((item) => (
        <View key={item.label} style={{ flexDirection: "row", marginBottom: 5 }}><Text style={{ width: 74, fontSize: 12, fontWeight: "900", color: "#9A6A12" }}>{item.label}</Text><Text style={{ flex: 1, fontSize: 13, color: colors.foreground }} numberOfLines={compact ? 1 : undefined}>{item.value}</Text></View>
      ))}
      {!compact ? <View style={{ flexDirection: "row", marginTop: 7 }}><Text style={{ width: 74, fontSize: 12, fontWeight: "900", color: "#9A6A12" }}>一言</Text><Text style={{ flex: 1, fontSize: 13, lineHeight: 20, color: colors.foreground }}>{advice.comment?.trim() || thread.preview}</Text></View> : null}
    </View>
  );
}

function SelfIntroductionContent({ thread, compact = false }: { thread: BoardThread; compact?: boolean }) {
  const colors = useColors();
  const introduction = thread.selfIntroduction;
  if (!introduction) return null;
  return (
    <View style={{ backgroundColor: colors.surface, padding: 0, marginBottom: compact ? 8 : 16 }}>
      <MentionText content={introduction.introduction} groups={BOARD_MENTION_GROUPS} />
      {!compact && introduction.wantToTry ? <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}><Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground, marginBottom: 5 }}>IRO+でやってみたいこと</Text><MentionText content={introduction.wantToTry} groups={BOARD_MENTION_GROUPS} /></View> : null}
    </View>
  );
}

/** 自己紹介は掲示板のスレッドではなく、会話の流れとして表示する。 */
function SelfIntroductionMessage({ thread }: { thread: BoardThread }) {
  const colors = useColors();
  const router = useRouter();
  const timeAgo = (() => {
    const elapsed = Date.now() - Date.parse(thread.lastUpdated);
    if (elapsed < 3_600_000) return "たった今";
    if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}時間前`;
    return `${Math.floor(elapsed / 86_400_000)}日前`;
  })();
  return <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, marginBottom: 14 }}>
    <Pressable onPress={() => router.push({ pathname: "/member-profile", params: { id: thread.author.id, legacyName: thread.author.name } })} accessibilityLabel={`${stripRankFromName(thread.author.name)}のプロフィールを表示`}>
      <Image source={thread.author.avatar} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" />
    </Pressable>
    <View style={{ flex: 1, maxWidth: "82%", marginLeft: 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>{stripRankFromName(thread.author.name)}</Text>
        <NewMemberMark member={thread.author} size={12} />
        <OperatorOrRankBadge member={thread.author} />
      </View>
      <View style={{ alignSelf: "flex-start", backgroundColor: "#ECECEF", borderWidth: 1, borderColor: "#D4D4D8", borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 13, paddingVertical: 10 }}>
        <SelfIntroductionContent thread={thread} />
      </View>
      <Text style={{ fontSize: 10, color: colors.muted, marginTop: 3, marginLeft: 3 }}>{timeAgo}</Text>
    </View>
  </View>;
}

function ThreadCard({ thread, onPress, onEdit, onDelete, onPin, onChangeRecruitment, unreadCount = 0, mentionCount = 0, showMenu = true, comments = [] }: { thread: BoardThread; onPress: () => void; onEdit?: () => void; onDelete?: () => void; onPin?: () => void; onChangeRecruitment?: () => void; unreadCount?: number; mentionCount?: number; showMenu?: boolean; comments?: BoardComment[] }) {
  const colors = useColors();
  const router = useRouter();
  const isParticipant = thread.recruitParticipants?.includes(CURRENT_USER.id);
  const [cardReactions, setCardReactions] = useState(thread.reactions ?? {});
  const cardEmoji = thread.selfIntroduction ? "🎉" : thread.mealReport ? "❤️" : null;
  const contestOpen = thread.gourmetContest ? isContestCommentingOpen(thread) : false;
  const clubSelfIntroduction = isClubSelfIntroduction(thread);
  const recruitmentManaged = isRecruitmentBoardCategory(thread.category) && !clubSelfIntroduction;
  const recruitmentStatus = getBoardRecruitmentStatus(thread);
  const pinned = isThreadPinned(thread);
  const visuallyClosed = (thread.gourmetContest && !contestOpen) || (recruitmentManaged && recruitmentStatus === "closed");
  useEffect(() => { void loadThreadReactions(thread.id, thread.reactions).then(setCardReactions); }, [thread.id, thread.reactions]);
  const toggleCardReaction = () => {
    if (!cardEmoji) return;
    const next = toggleReactionMember(cardReactions, cardEmoji, CURRENT_USER.id);
    setCardReactions(next); void saveThreadReactions(thread.id, next);
  };
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
        backgroundColor: visuallyClosed ? "#F1F1F3" : colors.surface,
        borderRadius: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        padding: 14,
        borderWidth: 1,
        borderColor: visuallyClosed ? "#D2D2D6" : "#E1E1E4",
        opacity: visuallyClosed ? 0.72 : 1,
      }}
    >
      {thread.category === "meal-report" && unreadCount > 0 ? <View style={{ position: "absolute", top: 10, left: 10, zIndex: 2, backgroundColor: "#3478C7", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 }}><Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>NEW</Text></View> : null}
      {/* Author */}
      <Pressable
        onPress={() => router.push({ pathname: "/member-profile", params: { id: thread.author.id, legacyName: thread.author.name } })}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
      >
        {pinned ? <View style={{ marginRight: 7, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#FFF2C7" }}><Text style={{ fontSize: 11, fontWeight: "900", color: "#8A6512" }}>📌 固定</Text></View> : null}
        {recruitmentManaged ? <RecruitmentStatusBadge status={recruitmentStatus} /> : thread.gourmetContest ? <View style={{ marginRight: 9, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: contestOpen ? "#DDF3E3" : "#DADADD" }}><Text style={{ fontSize: 11, fontWeight: "900", color: contestOpen ? "#247A42" : "#66666B" }}>{contestOpen ? "開催中" : "開催終了"}</Text></View> : null}
        <Image
          source={thread.author.avatar}
          style={{ width: 30, height: 30, borderRadius: 15 }}
          contentFit="cover"
        />
        <View style={{ marginLeft: 8, flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
              {stripRankFromName(thread.author.name)}
            </Text>
            <NewMemberMark member={thread.author} size={13} />
            <OperatorOrRankBadge member={thread.author} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>{timeAgo(thread.lastUpdated)}</Text>
          {showMenu ? <Pressable
              accessibilityLabel="投稿メニュー"
              onPress={(e) => {
                e.stopPropagation?.();
                Alert.alert(thread.title, "操作を選択してください", [
                  ...(onEdit ? [{ text: "投稿を編集", onPress: onEdit }] : []),
                  ...(onDelete ? [{ text: "投稿を削除", style: "destructive" as const, onPress: onDelete }] : []),
                  { text: "リンクをコピー", onPress: () => { void Clipboard.setStringAsync(`https://irotas-app-20260721.k1998915n.chatgpt.site/board?category=${encodeURIComponent(thread.category)}&view=threads&thread=${encodeURIComponent(thread.id)}`); } },
                  { text: "キャンセル", style: "cancel" },
                ]);
              }}
              style={{ padding: 4 }}
            >
              <IconSymbol name="ellipsis" size={16} color={colors.muted} />
            </Pressable> : null}
        </View>
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          {!thread.selfIntroduction && !thread.mealReport ? <Text
            style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}
            numberOfLines={2}
          >
            {thread.title}
          </Text> : null}
          {/* Preview */}
          {thread.mealReport ? (
            <MealReportTimelineCard thread={thread} comments={comments} />
          ) : thread.gourmetAdvice ? (
            null
          ) : thread.selfIntroduction ? (
            <SelfIntroductionContent thread={thread} compact />
          ) : (
            <Text style={{ marginBottom: 8 }} numberOfLines={2}><MentionText content={thread.preview} groups={BOARD_MENTION_GROUPS} /></Text>
          )}
        </View>
        {rightPreviewImage ? (
          <Image
            source={boardImageSource(rightPreviewImage)}
            style={{ width: 72, height: 72, borderRadius: 9, marginLeft: 10 }}
            contentFit="cover"
          />
        ) : null}
      </View>

      {/* Images */}
      {!thread.mealReport && !rightPreviewImage && thread.images && thread.images.length > 0 && (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          {thread.images.slice(0, 3).map((uri, i) => (
            <View key={i} style={{ position: "relative" }}>
              <Image
              source={boardImageSource(uri)}
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
      {thread.isRecruiting && !recruitmentManaged && (
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
          {cardEmoji ? <Pressable onPress={(event) => { event.stopPropagation?.(); toggleCardReaction(); }} accessibilityLabel={`${cardEmoji}スタンプ`} style={{ flexDirection: "row", alignItems: "center", marginRight: 11, borderRadius: 13, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: (cardReactions[cardEmoji] ?? []).includes(CURRENT_USER.id) ? "#F4E5EE" : "#F3F1F3" }}><Text style={{ fontSize: 15 }}>{cardEmoji}</Text>{(cardReactions[cardEmoji]?.length ?? 0) > 0 ? <Text style={{ fontSize: 10, fontWeight: "800", color: colors.muted, marginLeft: 3 }}>{cardReactions[cardEmoji].length}</Text> : null}</Pressable> : null}
          <IconSymbol name="bubble.left.fill" size={14} color={colors.muted} />
          <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>
            {thread.commentCount}件のコメント
          </Text>
          {mentionCount > 0 ? <Text style={{ fontSize: 12, fontWeight: "900", color: "#ED4245", marginLeft: 8 }}>メンション {mentionCount}件</Text> : unreadCount > 0 ? <Text style={{ fontSize: 12, fontWeight: "900", color: "#3478C7", marginLeft: 8 }}>{unreadCount}件の新規</Text> : null}
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
                      {stripRankFromName(comment.author.name)}
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
  initialComments = [],
  onClose,
  onEditThread,
  onChangeRecruitment,
  canRegisterEvent = true,
  applicationClub,
  canModerateAll = false,
}: {
  thread: BoardThread;
  initialComments?: BoardComment[];
  onClose: () => void;
  onEditThread?: () => void;
  onChangeRecruitment?: () => void;
  canRegisterEvent?: boolean;
  applicationClub?: Club;
  canModerateAll?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: authUser } = useAuthContext();
  const viewerMemberId = resolveViewerMemberId(authUser?.memberId, Boolean(authUser), CURRENT_USER.id);
  const viewerMember = memberFromAuthUser(authUser);
  const [commentText, setCommentText] = useState("");
  const [contestRestaurant, setContestRestaurant] = useState("");
  const [contestMenu, setContestMenu] = useState("");
  const [contestPitch, setContestPitch] = useState("");
  const [contestReferenceUrl, setContestReferenceUrl] = useState("");
  const [contestImages, setContestImages] = useState<string[]>([]);
  const [showContestComposer, setShowContestComposer] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [commentSelection, setCommentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [commentPollEnabled, setCommentPollEnabled] = useState(false);
  const [commentPollQuestion, setCommentPollQuestion] = useState("");
  const [commentPollOptions, setCommentPollOptions] = useState(["", ""]);
  const [commentPollDeadline, setCommentPollDeadline] = useState("");
  const [commentPollAllowMultiple, setCommentPollAllowMultiple] = useState(false);
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const [showCommentAttachments, setShowCommentAttachments] = useState(false);
  const commentInputRef = useRef<TextInput>(null);
  const mentionGroups = useMemo(() => BOARD_MENTION_GROUPS, []);
  const [comments, setComments] = useState<BoardComment[]>(
    [...BOARD_COMMENTS.filter((c) => c.threadId === thread.id), ...initialComments],
  );
  const [threadReactions, setThreadReactions] = useState(thread.reactions ?? {});
  const [showThreadEmojiPicker, setShowThreadEmojiPicker] = useState(false);
  const [commentEmojiPickerId, setCommentEmojiPickerId] = useState<string | null>(null);
  const [contestWinnerName, setContestWinnerName] = useState<string | null>(null);
  const [reactionsHydrated, setReactionsHydrated] = useState(false);
  const contestFinalizedRef = useRef(false);
  const [chatRoomId, setChatRoomId] = useState<string | null>(thread.chatId ?? null);
  const [showSelectMembers, setShowSelectMembers] = useState(false);
  const [recruitCapacity, setRecruitCapacity] = useState<number | undefined>(thread.recruitCapacity);
  const [showCapacityEdit, setShowCapacityEdit] = useState(false);
  const [capacityInput, setCapacityInput] = useState(String(thread.recruitCapacity ?? ""));
  const [showClubApplication, setShowClubApplication] = useState(false);
  const [clubWantsToDo, setClubWantsToDo] = useState("");
  const [clubLeaderMessage, setClubLeaderMessage] = useState("");
  const persistedThread = thread.shared || thread.id.startsWith("discord-board-");

  const isAuthor = thread.author.id === viewerMemberId;
  const isParticipant = (thread.recruitParticipants ?? []).includes(viewerMemberId);
  const isContest = Boolean(thread.gourmetContest);
  const clubSelfIntroduction = isClubSelfIntroduction(thread);
  const recruitmentManaged = isRecruitmentBoardCategory(thread.category) && !clubSelfIntroduction;
  const recruitmentStatus = getBoardRecruitmentStatus(thread);
  const pollAllowed = !["introduction", "meal-report", "gourmet-contest", "gourmet-advice"].includes(thread.category);
  const contestCommentingOpen = isContest ? isContestCommentingOpen(thread) : true;
  const contestReferenceUrlValid = !contestReferenceUrl.trim() || /^https?:\/\/\S+$/i.test(contestReferenceUrl.trim());
  const contestFormValid = isContestEntryValid({ restaurant: contestRestaurant, menu: contestMenu, pitch: contestPitch, referenceUrl: contestReferenceUrl });
  const commentPollValid = !commentPollEnabled || (commentPollQuestion.trim().length > 0 && commentPollOptions.filter((option) => option.trim()).length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(commentPollDeadline));
  const applicationAccess = applicationClub
    ? getClubViewerAccess(applicationClub, authUser?.memberId, CURRENT_USER.id)
    : null;
  const clubApplicationPending = Boolean(applicationAccess?.hasApplied);
  const clubApplicationMember = Boolean(applicationAccess?.isMember);

  const submitClubApplication = async () => {
    if (!applicationClub || !clubWantsToDo.trim() || !clubLeaderMessage.trim()) return;
    try {
      await submitClubApplicationToStore(applicationClub.id, clubWantsToDo.trim(), clubLeaderMessage.trim());
      sendClubApplicationNotification(applicationClub.name, CURRENT_USER.name, applicationClub.leaderId, applicationClub.id);
      setShowClubApplication(false);
      Alert.alert("申請を送信しました", "部長の承認後、部員限定の掲示板を閲覧できます。");
    } catch (error) {
      Alert.alert("申請できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
    }
  };

  useEffect(() => {
    const sourceComments = [...BOARD_COMMENTS.filter((comment) => comment.threadId === thread.id), ...initialComments];
    void Promise.all([
      loadThreadReactions(thread.id, thread.reactions),
      loadCommentReactions(sourceComments),
    ]).then(([savedThreadReactions, savedComments]) => {
      setThreadReactions(savedThreadReactions);
      void Promise.all([loadBoardCommentEdits(), loadDeletedBoardCommentIds()]).then(([edits, deletedIds]) => setComments(savedComments.filter((comment) => !deletedIds.includes(comment.id)).map((comment) => edits[comment.id] ? { ...comment, content: edits[comment.id] } : comment)));
      setReactionsHydrated(true);
    });
  // Rehydrate when a direct-linked Discord thread finishes loading its archive comments.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, initialComments.length]);

  useEffect(() => {
    if (!persistedThread) return;
    let active = true;
    void Api.getSharedBoardContent(thread.category).then((result) => {
      if (!active) return;
      const shared = result.comments
        .filter((comment) => comment.threadId === thread.id && comment.data.archiveShadow !== true)
        .map((comment) => sharedCommentToBoardComment(comment, CURRENT_USER.id));
      setComments((current) => {
        const sharedIds = new Set(shared.map((comment) => comment.id));
        return [...current.filter((comment) => !comment.shared && !sharedIds.has(comment.id)), ...shared];
      });
    }).catch(() => {
      // 移行済み本文は表示を続け、共有コメントだけ次回再取得する。
    });
    return () => { active = false; };
  }, [persistedThread, thread.category, thread.id]);

  useEffect(() => {
    if (!reactionsHydrated || !thread.gourmetContest || thread.gourmetContest.archived || contestCommentingOpen) return;
    if (contestFinalizedRef.current) return;
    const winner = getContestWinner(comments);
    if (!winner) return;
    contestFinalizedRef.current = true;
    setContestWinnerName(winner.author.name);
    const awardComment = createContestAwardComment(thread, winner);
    if (awardComment) {
      setComments((current) => current.some((comment) => comment.id === awardComment.id) ? current : [...current, awardComment]);
      void awardContestWinnerOnce(thread, winner);
    }
  }, [comments, contestCommentingOpen, reactionsHydrated, thread]);

  const handleComment = async () => {
    if (!contestCommentingOpen) return;
    if (isContest && !contestFormValid) return;
    const content = isContest
      ? buildContestEntryContent({ restaurant: contestRestaurant, menu: contestMenu, pitch: contestPitch, referenceUrl: contestReferenceUrl })
      : commentText.trim();
    if (isContest ? !contestRestaurant.trim() || !contestMenu.trim() || !contestPitch.trim() : (!content && !commentPollEnabled) || !commentPollValid) return;
    let newComment: BoardComment = {
      id: `bc_new_${Date.now()}`,
      threadId: thread.id,
      author: viewerMember,
      content,
      createdAt: new Date().toISOString(),
      images: isContest && contestImages.length ? contestImages : commentImages.length ? commentImages : undefined,
      poll: pollAllowed && commentPollEnabled ? { question: commentPollQuestion.trim(), deadline: commentPollDeadline, allowMultiple: commentPollAllowMultiple, options: commentPollOptions.filter((option) => option.trim()).map((option, index) => ({ id: `option_${index + 1}`, text: option.trim(), voterIds: [] })) } : undefined,
    };
    if (persistedThread) {
      try {
        if (!thread.shared) await Api.ensureSharedImportedBoardThread(thread.id);
        newComment = { ...newComment, images: await uploadBoardImages(newComment.images) };
        const saved = await Api.createSharedBoardComment(thread.id, { content, data: boardCommentData(newComment) });
        newComment = { ...newComment, id: saved.id, createdAt: saved.createdAt, shared: true };
      } catch (error) {
        Alert.alert("コメントを送信できませんでした", error instanceof Error ? error.message : "通信環境を確認して、もう一度お試しください。");
        return;
      }
    }
    setComments([...comments, newComment]);
    if (thread.category === "gourmet-contest") void recordHomeActivity({ id: `comment:${newComment.id}`, kind: "contest_comment", title: `${thread.title}にコメントが追加されました`, description: content, createdAt: newComment.createdAt, route: "/board", params: { category: "gourmet-contest", view: "threads" } });
    setCommentText("");
    setCommentImages([]);
    setShowCommentAttachments(false);
    setContestRestaurant("");
    setContestMenu("");
    setContestPitch("");
    setContestReferenceUrl("");
    setContestImages([]);
    setShowContestComposer(false);
    setCommentSelection({ start: 0, end: 0 });
    setMentionQuery(null);
    setCommentPollEnabled(false); setCommentPollQuestion(""); setCommentPollOptions(["", ""]); setCommentPollDeadline(""); setCommentPollAllowMultiple(false);
    const preview = content.length > 50 ? `${content.slice(0, 50)}...` : content;
    for (const memberId of getMentionedMemberIds(content, MEMBERS, mentionGroups).filter((id) => id !== CURRENT_USER.id)) {
      const member = MEMBERS.find((item) => item.id === memberId);
      if (member) void sendMentionNotification(member.name, viewerMember.name, thread.title || "自己紹介", preview);
    }
  };

  const handlePickContestImages = async () => {
    if (contestImages.length >= 5) return;
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
      selectionLimit: 5 - contestImages.length,
    });
    if (!result.canceled) setContestImages((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 5));
  };

  const handlePickCommentImages = async () => {
    if (commentImages.length >= 5) return;
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") return Alert.alert("権限が必要です", "写真ライブラリへのアクセスを許可してください");
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, quality: 0.8, selectionLimit: 5 - commentImages.length });
    if (!result.canceled) setCommentImages((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 5));
    setShowCommentAttachments(false);
  };

  const handleSaveCommentEdit = async (commentId: string) => {
    if (!editingCommentText.trim()) return;
    const target = comments.find((comment) => comment.id === commentId);
    if (target?.shared) {
      try {
        await Api.updateSharedBoardComment(commentId, { content: editingCommentText.trim(), data: boardCommentData(target) });
      } catch (error) {
        Alert.alert("保存できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
        return;
      }
    }
    setComments((current) => current.map((comment) => comment.id === commentId ? { ...comment, content: editingCommentText.trim() } : comment));
    if (!target?.shared) void saveBoardCommentEdit(commentId, editingCommentText.trim());
    setEditingCommentId(null);
    setEditingCommentText("");
  };

  const handleDeleteComment = (commentId: string) => Alert.alert("コメントを削除しますか？", "削除後は元に戻せません。", [{ text: "キャンセル", style: "cancel" }, { text: "削除", style: "destructive", onPress: () => {
    const target = comments.find((comment) => comment.id === commentId);
    const remove = () => setComments((current) => current.filter((comment) => comment.id !== commentId));
    if (target?.shared) void Api.deleteSharedBoardComment(commentId).then(remove).catch((error) => Alert.alert("削除できませんでした", error instanceof Error ? error.message : "もう一度お試しください。"));
    else { remove(); void deleteBoardComment(commentId); }
  } }]);

  const handleThreadReaction = (emoji: string) => {
    setThreadReactions((current) => {
      const next = toggleReactionMember(current, emoji, CURRENT_USER.id);
      if (thread.shared) void Api.setSharedBoardReaction({ targetType: "thread", targetId: thread.id, emoji }, next[emoji]?.includes(CURRENT_USER.id) ?? false).catch(() => setThreadReactions(current));
      else void saveThreadReactions(thread.id, next);
      return next;
    });
  };

  const handleCommentHeart = (commentId: string) => {
    setComments((current) => current.map((comment) => {
      if (comment.id !== commentId) return comment;
      const reactions = toggleReactionMember(comment.reactions, "❤️", CURRENT_USER.id);
      if (comment.shared) void Api.setSharedBoardReaction({ targetType: "comment", targetId: comment.id, emoji: "❤️" }, reactions["❤️"]?.includes(CURRENT_USER.id) ?? false);
      else void saveCommentReactions(comment.id, reactions);
      return { ...comment, reactions };
    }));
  };
  const handleCommentReaction = (commentId: string, emoji: string) => {
    setComments((current) => current.map((comment) => {
      if (comment.id !== commentId) return comment;
      const reactions = toggleReactionMember(comment.reactions, emoji, CURRENT_USER.id);
      if (comment.shared) void Api.setSharedBoardReaction({ targetType: "comment", targetId: comment.id, emoji }, reactions[emoji]?.includes(CURRENT_USER.id) ?? false);
      else void saveCommentReactions(comment.id, reactions);
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
        {onEditThread ? <Pressable onPress={onEditThread} style={{ paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ fontSize: 13, fontWeight: "800", color: "#C97813" }}>編集</Text></Pressable> : null}
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
            {isThreadPinned(thread) ? <View style={{ marginRight: 7, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#FFF2C7" }}><Text style={{ fontSize: 11, fontWeight: "900", color: "#8A6512" }}>📌 固定</Text></View> : null}
            {recruitmentManaged ? <RecruitmentStatusBadge status={recruitmentStatus} /> : null}
            <Image
              source={thread.author.avatar}
              style={{ width: 36, height: 36, borderRadius: 18 }}
              contentFit="cover"
            />
            <View style={{ marginLeft: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                  {stripRankFromName(thread.author.name)}
                </Text>
                <NewMemberMark member={thread.author} size={13} />
                <OperatorOrRankBadge member={thread.author} />
              </View>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                {thread.author.generation > 0 ? `${thread.author.generation}期生` : "期設定なし"}
              </Text>
            </View>
          </View>

          {thread.mealReport ? (
            <MealReportContent thread={thread} />
          ) : thread.gourmetAdvice ? (
            <GourmetAdviceContent thread={thread} />
          ) : thread.selfIntroduction ? (
            <SelfIntroductionContent thread={thread} />
          ) : thread.gourmetContest ? (
            <View style={{ marginBottom: 16 }}><LinkifiedText content={thread.preview} /></View>
          ) : (
            <View style={{ marginBottom: 16 }}><MentionText content={thread.preview} groups={mentionGroups} /></View>
          )}

          {recruitmentManaged && canRegisterEvent ? <Pressable onPress={() => {
            onClose();
            router.push({ pathname: "/create-event", params: { sourceThreadId: thread.id, sourceTitle: thread.title, sourceDescription: thread.preview, sourceCategory: thread.category } });
          }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 46, borderRadius: 13, backgroundColor: "#18171A", marginBottom: 16 }}><IconSymbol name="calendar.badge.plus" size={18} color="#FFF" /><Text style={{ marginLeft: 8, color: "#FFF", fontSize: 14, fontWeight: "900" }}>イベントとして登録</Text></Pressable> : null}

          {applicationClub ? <Pressable disabled={clubApplicationPending || clubApplicationMember} onPress={() => setShowClubApplication(true)} style={{ minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 18, backgroundColor: clubApplicationMember ? "#DCEEDF" : clubApplicationPending ? "#E7E7EA" : "#5579A6" }}><Text style={{ fontSize: 15, fontWeight: "900", color: clubApplicationMember ? "#2F7541" : clubApplicationPending ? colors.muted : "#FFF" }}>{clubApplicationMember ? "入部済み" : clubApplicationPending ? "入部承認待ち" : "入部申請を送る"}</Text></Pressable> : null}

          {thread.poll ? <PollCard ownerKey={`thread:${thread.id}`} poll={thread.poll} /> : null}

          {thread.gourmetContest ? (
            <View style={{ backgroundColor: "#FFF8E8", borderRadius: 16, borderWidth: 1.5, borderColor: "#E9C56D", padding: 16, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ fontSize: 15, fontWeight: "900", color: "#7A5200" }}>開催概要</Text><View style={{ backgroundColor: contestCommentingOpen ? "#DFF4E6" : "#ECECEF", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ fontSize: 11, fontWeight: "900", color: contestCommentingOpen ? "#247A42" : colors.muted }}>{contestCommentingOpen ? "コメント募集中" : "募集終了"}</Text></View></View>
              <View style={{ marginTop: 12, gap: 10 }}>
                <View><Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted }}>コメント募集期間</Text><Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, marginTop: 3 }}>〜 {thread.gourmetContest.commentDeadline} 23:59</Text></View>
                <View><Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted }}>優勝景品</Text><Text style={{ fontSize: 17, fontWeight: "900", color: "#C97813", marginTop: 3 }}>{thread.gourmetContest.prizePoints ? `IRO+ポイント ${thread.gourmetContest.prizePoints}pt` : thread.gourmetContest.prizeTitle ?? "過去大会の景品"}</Text></View>
              </View>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 12 }}>締切時点で❤️が最も多い投稿を自動表彰し、優勝者へIRO+ポイントを付与します。</Text>
              {thread.gourmetContest.archived ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 7 }}>Discordから移行した終了済み大会です。</Text> : null}
              {thread.gourmetContest.winnerName ? <Text style={{ fontSize: 13, fontWeight: "900", color: "#C97813", marginTop: 9 }}>優勝：{thread.gourmetContest.winnerName}さん</Text> : contestWinnerName ? <Text style={{ fontSize: 13, fontWeight: "900", color: "#C97813", marginTop: 9 }}>優勝：{contestWinnerName}さん（ポイント付与済み）</Text> : null}
            </View>
          ) : null}

          {!thread.mealReport && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
              {(thread.selfIntroduction ? ["🎉"] : Array.from(new Set(["❤️", ...Object.keys(threadReactions)]))).map((emoji) => {
                const memberIds = threadReactions[emoji] ?? [];
                const selected = memberIds.includes(CURRENT_USER.id);
                return <Pressable key={emoji} onPress={() => handleThreadReaction(emoji)} accessibilityLabel={`${emoji}スタンプ`} style={{ flexDirection: "row", alignItems: "center", backgroundColor: selected ? "#F0E7F7" : colors.surface, borderWidth: 1, borderColor: selected ? "#7D6A92" : colors.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ fontSize: 17 }}>{emoji}</Text>{memberIds.length > 0 ? <Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted, marginLeft: 4 }}>{memberIds.length}</Text> : null}</Pressable>;
              })}
              <Pressable accessibilityLabel="別の絵文字を追加" onPress={() => setShowThreadEmojiPicker((current) => !current)} style={{ width: 34, height: 31, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}><IconSymbol name="plus" size={16} color={colors.muted} /></Pressable>
              {showThreadEmojiPicker ? <View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 7, paddingTop: 3 }}>{THREAD_REACTION_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => { handleThreadReaction(emoji); setShowThreadEmojiPicker(false); }} style={{ width: 38, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F1F3" }}><Text style={{ fontSize: 19 }}>{emoji}</Text></Pressable>)}</View> : null}
            </View>
          )}

          {/* 画像 */}
          {thread.images && thread.images.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {thread.images.map((uri, i) => (
                <Image
                  key={i}
                  source={boardImageSource(uri)}
                  style={isContest ? { width: "100%", aspectRatio: 1, borderRadius: 14, backgroundColor: colors.surface } : { width: 100, height: 100, borderRadius: 10 }}
                  contentFit={isContest ? "contain" : "cover"}
                />
              ))}
            </View>
          )}
          {thread.videos?.map((uri) => <View key={uri} style={{ marginBottom: 20 }}><BoardVideo uri={uri} /></View>)}
          {thread.mealReport ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
            {Array.from(new Set(["❤️", ...Object.keys(threadReactions)])).map((emoji) => {
              const memberIds = threadReactions[emoji] ?? [];
              const selected = memberIds.includes(CURRENT_USER.id);
              return <Pressable key={emoji} onPress={() => handleThreadReaction(emoji)} accessibilityLabel={`${emoji}スタンプ`} style={{ flexDirection: "row", alignItems: "center", backgroundColor: selected ? "#F0E7F7" : colors.surface, borderWidth: 1, borderColor: selected ? "#7D6A92" : colors.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ fontSize: 17 }}>{emoji}</Text>{memberIds.length > 0 ? <Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted, marginLeft: 4 }}>{memberIds.length}</Text> : null}</Pressable>;
            })}
            <Pressable accessibilityLabel="別の絵文字を追加" onPress={() => setShowThreadEmojiPicker((current) => !current)} style={{ width: 34, height: 31, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}><IconSymbol name="plus" size={16} color={colors.muted} /></Pressable>
            {showThreadEmojiPicker ? <View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 7, paddingTop: 3 }}>{THREAD_REACTION_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => { handleThreadReaction(emoji); setShowThreadEmojiPicker(false); }} style={{ width: 38, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F1F3" }}><Text style={{ fontSize: 19 }}>{emoji}</Text></Pressable>)}</View> : null}
          </View> : null}

          {/* 募集中バナー（投稿者向け：チャット作成ボタン付き） */}
          {thread.isRecruiting && !recruitmentManaged && (
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
            {comments.map((comment) => {
              const isOwnComment = comment.author.id === viewerMemberId || stripRankFromName(comment.author.name) === stripRankFromName(viewerMember.name);
              return <Pressable key={comment.id} disabled={!isOwnComment && !canModerateAll} onLongPress={() => Alert.alert("コメント", "操作を選択してください", [
                { text: "投稿を編集", onPress: () => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); } },
                { text: "投稿を削除", style: "destructive", onPress: () => handleDeleteComment(comment.id) },
                { text: "キャンセル", style: "cancel" },
              ])} delayLongPress={350} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <Image
                    source={comment.author.avatar}
                    style={{ width: 24, height: 24, borderRadius: 12 }}
                    contentFit="cover"
                  />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginLeft: 8 }}>
                    {stripRankFromName(comment.author.name)}
                  </Text>
                  <OperatorOrRankBadge member={comment.author} />
                  <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 8 }}>
                    {timeAgo(comment.createdAt)}
                  </Text>
                </View>
                {editingCommentId === comment.id ? <View style={{ marginLeft: 32, gap: 7 }}><TextInput value={editingCommentText} onChangeText={setEditingCommentText} multiline autoFocus style={{ minHeight: 90, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: colors.foreground }} /><View style={{ flexDirection: "row", gap: 8 }}><Pressable onPress={() => handleSaveCommentEdit(comment.id)} style={{ backgroundColor: "#3478C7", borderRadius: 8, paddingHorizontal: 13, paddingVertical: 7 }}><Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>保存</Text></Pressable><Pressable onPress={() => handleDeleteComment(comment.id)} style={{ backgroundColor: "#FCE7E7", borderRadius: 8, paddingHorizontal: 13, paddingVertical: 7 }}><Text style={{ color: colors.error, fontSize: 12, fontWeight: "800" }}>削除</Text></Pressable><Pressable onPress={() => setEditingCommentId(null)} style={{ paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ color: colors.muted, fontSize: 12 }}>キャンセル</Text></Pressable></View></View> : <View style={{ marginLeft: 32 }}>{isContest ? (comment.isSystem ? <MentionText content={comment.content} groups={mentionGroups} /> : <LinkifiedText content={comment.content} />) : <MentionText content={comment.content} groups={mentionGroups} />}</View>}
                {comment.poll ? <View style={{ marginLeft: 32 }}><PollCard ownerKey={`comment:${comment.id}`} poll={comment.poll} /></View> : null}
                {comment.images?.length ? (
                  <View style={{ marginLeft: 32, marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                    {comment.images.map((uri, index) => <Image key={`${comment.id}-image-${index}`} source={boardImageSource(uri)} style={{ width: 104, height: 104, borderRadius: 10, backgroundColor: colors.surface }} contentFit="cover" />)}
                  </View>
                ) : null}
                {comment.videos?.length ? <View style={{ marginLeft: 32, marginTop: 8, gap: 8 }}>{comment.videos.map((uri) => <BoardVideo key={uri} uri={uri} />)}</View> : null}
                {isContest && !comment.isSystem ? <Pressable onPress={() => handleCommentHeart(comment.id)} disabled={!contestCommentingOpen} style={{ marginLeft: 32, marginTop: 7, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: (comment.reactions?.["❤️"] ?? []).includes(CURRENT_USER.id) ? "#FFE4EA" : colors.surface, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontSize: 15 }}>❤️</Text><Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted, marginLeft: 4 }}>{comment.reactions?.["❤️"]?.length ?? 0}</Text></Pressable> : null}
                {!comment.isSystem && !isContest ? <View style={{ marginLeft: 32, marginTop: 7, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{Array.from(new Set(["👏", ...Object.keys(comment.reactions ?? {})])).map((emoji) => { const ids = comment.reactions?.[emoji] ?? []; return <Pressable key={emoji} onPress={() => handleCommentReaction(comment.id, emoji)} style={{ flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: ids.includes(CURRENT_USER.id) ? "#F0E7F7" : colors.surface, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontSize: 15 }}>{emoji}</Text>{ids.length ? <Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted, marginLeft: 4 }}>{ids.length}</Text> : null}</Pressable>; })}<Pressable accessibilityLabel="別の絵文字を追加" onPress={() => setCommentEmojiPickerId((current) => current === comment.id ? null : comment.id)} style={{ width: 31, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}><IconSymbol name="plus" size={14} color={colors.muted} /></Pressable>{commentEmojiPickerId === comment.id ? <View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 7, paddingTop: 3 }}>{THREAD_REACTION_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => { handleCommentReaction(comment.id, emoji); setCommentEmojiPickerId(null); }} style={{ width: 38, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F1F3" }}><Text style={{ fontSize: 19 }}>{emoji}</Text></Pressable>)}</View> : null}</View> : null}
              </Pressable>;
            })}
          </View>
        </ScrollView>

        {/* Comment input */}
        {contestCommentingOpen ? <View style={{ backgroundColor: colors.background, borderTopWidth: 0.5, borderTopColor: colors.border }}>
          {isContest ? <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom, 10) : 10 }}>
            <Pressable accessibilityLabel="選手権に投稿する" onPress={() => setShowContestComposer(true)} style={{ backgroundColor: "#D45470", borderRadius: 13, paddingVertical: 13, alignItems: "center" }}><Text style={{ fontSize: 15, fontWeight: "900", color: "#FFF" }}>選手権に投稿する</Text></Pressable>
          </View> : <>
          {mentionQuery !== null ? <MentionSuggestions query={mentionQuery} groups={mentionGroups} members={MEMBERS.filter((member) => member.id !== CURRENT_USER.id)} onSelect={handleCommentMention} /> : null}
          <Text style={{ fontSize: 11, color: colors.muted, paddingHorizontal: 16, paddingTop: 6 }}>@を入力して個人・グループをメンション</Text>
          {showCommentAttachments ? <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 9 }}><Pressable onPress={() => void handlePickCommentImages()} style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, backgroundColor: "#5865F218", paddingHorizontal: 14, paddingVertical: 10 }}><IconSymbol name="photo.fill" size={17} color="#5865F2" /><Text style={{ color: "#5865F2", fontWeight: "800", marginLeft: 7 }}>写真</Text></Pressable>{pollAllowed ? <Pressable onPress={() => { setCommentPollEnabled(true); setShowCommentAttachments(false); }} style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, backgroundColor: "#5865F218", paddingHorizontal: 14, paddingVertical: 10 }}><IconSymbol name="chart.bar.fill" size={17} color="#5865F2" /><Text style={{ color: "#5865F2", fontWeight: "800", marginLeft: 7 }}>投票</Text></Pressable> : null}</View> : null}
          {commentImages.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 9 }}>{commentImages.map((uri, index) => <Pressable key={`${uri}-${index}`} onPress={() => setCommentImages((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Image source={{ uri }} style={{ width: 64, height: 64, borderRadius: 9 }} contentFit="cover" /></Pressable>)}</ScrollView> : null}
          {pollAllowed ? <View style={{ paddingHorizontal: 16 }}><PollComposer enabled={commentPollEnabled} setEnabled={setCommentPollEnabled} question={commentPollQuestion} setQuestion={setCommentPollQuestion} options={commentPollOptions} setOptions={setCommentPollOptions} deadline={commentPollDeadline} setDeadline={setCommentPollDeadline} allowMultiple={commentPollAllowMultiple} setAllowMultiple={setCommentPollAllowMultiple} /></View> : null}
          <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom, 10) : 10,
          }}
        >
          <Pressable accessibilityLabel="写真または投票を追加" onPress={() => setShowCommentAttachments((value) => !value)} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#5865F218", marginRight: 8 }}><IconSymbol name="plus" size={20} color="#5865F2" /></Pressable>
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
            <IconSymbol name="paperplane.fill" size={24} color={(commentText.trim() || (commentPollEnabled && commentPollValid)) ? "#E8A0BF" : colors.muted} />
          </Pressable>
          </View>
          </>}
        </View> : <View style={{ padding: 14, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}><Text style={{ textAlign: "center", fontSize: 13, fontWeight: "700", color: colors.muted }}>コメント募集は終了しました</Text></View>}
      </KeyboardAvoidingView>

      <Modal visible={showContestComposer} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowContestComposer(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable onPress={() => setShowContestComposer(false)} style={{ paddingVertical: 5, paddingRight: 12 }}><Text style={{ fontSize: 14, color: colors.muted }}>キャンセル</Text></Pressable>
            <Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>選手権に投稿する</Text>
            <View style={{ width: 70 }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 13 }}>
            <Text style={{ fontSize: 12, color: colors.muted }}><Text style={{ color: "#D45470", fontWeight: "900" }}>*</Text> は必須項目です</Text>
            <View><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 6 }}>店名 / 場所 <Text style={{ color: "#D45470" }}>*</Text></Text><TextInput value={contestRestaurant} onChangeText={setContestRestaurant} placeholder="例：〇〇食堂 / 恵比寿" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border }} /></View>
            <View><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 6 }}>メニュー / 商品名 <Text style={{ color: "#D45470" }}>*</Text></Text><TextInput value={contestMenu} onChangeText={setContestMenu} placeholder="例：季節のコース" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border }} /></View>
            <View><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 6 }}>推しポイント（一言でOK） <Text style={{ color: "#D45470" }}>*</Text></Text><TextInput value={contestPitch} onChangeText={setContestPitch} placeholder="おすすめの理由を入力" placeholderTextColor={colors.muted} multiline style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, minHeight: 88, textAlignVertical: "top", fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border }} /></View>
            <View><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 6 }}>参考URL（食べログ・GoogleMapなど） <Text style={{ fontSize: 11, color: colors.muted }}>任意</Text></Text><TextInput value={contestReferenceUrl} onChangeText={setContestReferenceUrl} placeholder="https://..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: contestReferenceUrlValid ? colors.border : "#D45470" }} />{!contestReferenceUrlValid ? <Text style={{ color: "#D45470", fontSize: 11, marginTop: 5 }}>http:// または https:// から始まるURLを入力してください</Text> : null}</View>
            <View><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>写真 <Text style={{ fontSize: 11, color: colors.muted }}>任意・最大5枚</Text></Text><Text style={{ fontSize: 11, color: colors.muted }}>{contestImages.length}/5</Text></View><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{contestImages.map((uri, index) => <View key={`${uri}-${index}`}><Image source={{ uri }} style={{ width: 82, height: 82, borderRadius: 10 }} contentFit="cover" /><Pressable accessibilityLabel={`写真${index + 1}を削除`} onPress={() => setContestImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ position: "absolute", right: -5, top: -5, width: 22, height: 22, borderRadius: 11, backgroundColor: "#333", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#FFF", fontSize: 13, fontWeight: "900" }}>×</Text></Pressable></View>)}{contestImages.length < 5 ? <Pressable accessibilityLabel="写真を追加" onPress={handlePickContestImages} style={{ width: 82, height: 82, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><IconSymbol name="photo.on.rectangle.angled" size={22} color={colors.muted} /><Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>写真を追加</Text></Pressable> : null}</View></View>
            <Pressable accessibilityLabel="選手権の投稿を送信" onPress={handleComment} disabled={!contestFormValid || !commentPollValid} style={{ marginTop: 5, backgroundColor: contestFormValid && commentPollValid ? "#D45470" : colors.border, borderRadius: 13, paddingVertical: 14, alignItems: "center" }}><Text style={{ fontSize: 15, fontWeight: "900", color: "#FFF" }}>投稿する</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* メンバー選択モーダル */}
      <SelectMembersModal
        visible={showSelectMembers}
        thread={thread}
        commenters={comments}
        onClose={() => setShowSelectMembers(false)}
        onCreateChat={handleCreateChat}
      />
      <Modal visible={showClubApplication} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowClubApplication(false)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}><Pressable onPress={() => setShowClubApplication(false)}><Text style={{ color: colors.muted }}>キャンセル</Text></Pressable><Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "900", color: colors.foreground }}>{applicationClub?.name} 入部申請</Text><View style={{ width: 64 }} /></View><ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}><View><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 7 }}>部活動でやってみたいこと <Text style={{ color: colors.error }}>*</Text></Text><TextInput value={clubWantsToDo} onChangeText={setClubWantsToDo} multiline placeholder="参加後に挑戦したいことを入力" placeholderTextColor={colors.muted} style={{ minHeight: 110, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.foreground, textAlignVertical: "top" }} /></View><View><Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 7 }}>部長へのメッセージ <Text style={{ color: colors.error }}>*</Text></Text><TextInput value={clubLeaderMessage} onChangeText={setClubLeaderMessage} multiline placeholder="自己紹介や入部への意気込みを入力" placeholderTextColor={colors.muted} style={{ minHeight: 110, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.foreground, textAlignVertical: "top" }} /></View><Pressable disabled={!clubWantsToDo.trim() || !clubLeaderMessage.trim()} onPress={submitClubApplication} style={{ minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: clubWantsToDo.trim() && clubLeaderMessage.trim() ? "#5579A6" : colors.border }}><Text style={{ color: "#FFF", fontSize: 15, fontWeight: "900" }}>申請を送信する</Text></Pressable></ScrollView></KeyboardAvoidingView></Modal>
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
  onDelete,
}: {
  thread: BoardThread;
  onClose: () => void;
  onSave: (updated: BoardThread) => void;
  onDelete: () => void | Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(thread.title);
  const [content, setContent] = useState(thread.preview);
  const [mealRestaurantName, setMealRestaurantName] = useState(thread.mealReport?.restaurantName ?? "");
  const [mealArea, setMealArea] = useState(thread.mealReport?.areaDisplay ?? thread.mealReport?.prefecture ?? "");
  const [mealBudget, setMealBudget] = useState(thread.mealReport?.budget ?? "");
  const [mealRecommendedMenu, setMealRecommendedMenu] = useState(thread.mealReport?.recommendedMenu ?? "");
  const [mealRating, setMealRating] = useState(thread.mealReport?.rating ?? 0);
  const [mealGoogleMapUrl, setMealGoogleMapUrl] = useState(thread.mealReport?.googleMapUrl ?? "");
  const [mealTabelogUrl, setMealTabelogUrl] = useState(thread.mealReport?.tabelogUrl ?? "");
  const [adviceGenres, setAdviceGenres] = useState<string[]>(thread.gourmetAdvice?.genres ?? ["指定なし"]);
  const [adviceArea, setAdviceArea] = useState(thread.gourmetAdvice?.area ?? "指定なし");
  const [adviceScene, setAdviceScene] = useState(thread.gourmetAdvice?.scene ?? "指定なし");
  const [adviceBudget, setAdviceBudget] = useState(thread.gourmetAdvice?.budget ?? "指定なし");
  const [introductionText, setIntroductionText] = useState(thread.selfIntroduction?.introduction ?? thread.preview);
  const [wantToTry, setWantToTry] = useState(thread.selfIntroduction?.wantToTry ?? "");
  const [contentSelection, setContentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const contentInputRef = useRef<TextInput>(null);
  const [images, setImages] = useState<BoardImage[]>(thread.images ?? []);
  const [contestDeadline, setContestDeadline] = useState(thread.gourmetContest?.commentDeadline ?? "");
  const [contestPrizePoints, setContestPrizePoints] = useState(String(thread.gourmetContest?.prizePoints ?? ""));
  const [contestPrizeTitle, setContestPrizeTitle] = useState(thread.gourmetContest?.prizeTitle ?? "");
  const [recruitmentStatus, setRecruitmentStatus] = useState<BoardRecruitmentStatus>(getBoardRecruitmentStatus(thread));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    if (!title.trim() || (thread.selfIntroduction ? !introductionText.trim() : !content.trim())) return;
    const savedContent = thread.selfIntroduction ? introductionText.trim() : content.trim();
    onSave({
      ...thread,
      title: title.trim(),
      preview: savedContent,
      mealReport: thread.mealReport ? { ...thread.mealReport, postTitle: title.trim() || undefined, restaurantName: mealRestaurantName.trim(), areaDisplay: mealArea.trim() || undefined, prefecture: mealArea.trim() || thread.mealReport.prefecture, budget: mealBudget.trim() || undefined, recommendedMenu: mealRecommendedMenu.trim() || undefined, rating: mealRating, comment: savedContent, googleMapUrl: mealGoogleMapUrl.trim() || undefined, tabelogUrl: mealTabelogUrl.trim() || undefined } : undefined,
      gourmetAdvice: thread.gourmetAdvice ? { ...thread.gourmetAdvice, theme: title.trim(), genres: adviceGenres, area: adviceArea.trim() || "指定なし", scene: adviceScene.trim() || "指定なし", budget: adviceBudget.trim() || "指定なし", comment: savedContent } : undefined,
      recruitmentStatus: isRecruitmentBoardCategory(thread.category) && !isClubSelfIntroduction(thread) ? recruitmentStatus : thread.recruitmentStatus,
      isRecruiting: isRecruitmentBoardCategory(thread.category) && !isClubSelfIntroduction(thread) ? recruitmentStatus === "open" : thread.isRecruiting,
      selfIntroduction: thread.selfIntroduction ? { introduction: introductionText.trim(), wantToTry: wantToTry.trim() || undefined } : undefined,
      images: images.length > 0 ? images : undefined,
      gourmetContest: thread.gourmetContest ? {
        ...thread.gourmetContest,
        commentDeadline: contestDeadline,
        prizePoints: Number(contestPrizePoints) || thread.gourmetContest.prizePoints,
        prizeTitle: contestPrizeTitle.trim() || thread.gourmetContest.prizeTitle,
      } : undefined,
      lastUpdated: thread.lastUpdated,
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
                color: title.trim() && (thread.selfIntroduction ? introductionText.trim() : content.trim()) ? "#E8A0BF" : colors.muted,
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
            {!thread.selfIntroduction ? <View>
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
            </View> : null}

            {thread.mealReport ? <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>ごちそうさま報告</Text>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>店名</Text><TextInput value={mealRestaurantName} onChangeText={setMealRestaurantName} placeholder="店名" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>エリア</Text><TextInput value={mealArea} onChangeText={setMealArea} placeholder="例：銀座" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>予算</Text><TextInput value={mealBudget} onChangeText={setMealBudget} placeholder="例：¥5,000〜¥7,999" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>おすすめメニュー</Text><TextInput value={mealRecommendedMenu} onChangeText={setMealRecommendedMenu} placeholder="おすすめメニュー" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 7 }}>評価</Text><View style={{ flexDirection: "row", gap: 8 }}>{[1, 2, 3, 4, 5].map((star) => <Pressable key={star} onPress={() => setMealRating(star)} style={{ padding: 2 }}><IconSymbol name="star.fill" size={28} color={star <= mealRating ? "#F5A623" : colors.border} /></Pressable>)}</View></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>Google Mapのリンク</Text><TextInput value={mealGoogleMapUrl} onChangeText={setMealGoogleMapUrl} placeholder="https://maps.app.goo.gl/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>食べログのリンク</Text><TextInput value={mealTabelogUrl} onChangeText={setMealTabelogUrl} placeholder="https://tabelog.com/..." placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} /></View>
            </View> : null}

            {isRecruitmentBoardCategory(thread.category) && !isClubSelfIntroduction(thread) ? <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, padding: 13, backgroundColor: "#F6FAF7", borderWidth: 1, borderColor: "#D8EADA" }}><View><Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>募集中ステータスをオンにする</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>オンの投稿だけ一覧に「募集中」と表示されます。</Text></View><Pressable onPress={() => setRecruitmentStatus((current) => current === "open" ? "none" : "open")} accessibilityRole="switch" accessibilityState={{ checked: recruitmentStatus === "open" }} style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: recruitmentStatus === "open" ? "#34C759" : "#C7C7CC", position: "relative" }}><View style={{ position: "absolute", top: 3, left: recruitmentStatus === "open" ? 23 : 3, width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFF" }} /></Pressable></View> : null}

            {thread.gourmetContest ? <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>大会設定</Text>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>コメント募集締切</Text><TextInput value={contestDeadline} onChangeText={setContestDeadline} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
              {thread.gourmetContest.archived ? (
                <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>景品内容</Text><TextInput value={contestPrizeTitle} onChangeText={setContestPrizeTitle} placeholder="例：イベントクーポン500円分" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
              ) : (
                <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>景品（IRO+ポイント）</Text><TextInput value={contestPrizePoints} onChangeText={(value) => setContestPrizePoints(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="例：500" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
              )}
            </View> : null}

            {thread.gourmetAdvice ? <View style={{ gap: 12 }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>相談内容</Text><View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 7 }}>料理カテゴリ</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{["指定なし", ...GOURMET_GENRES].map((genre) => { const selected = adviceGenres.includes(genre); return <Pressable key={genre} onPress={() => setAdviceGenres((current) => { if (genre === "指定なし") return ["指定なし"]; const next = current.filter((item) => item !== "指定なし" && item !== genre); return selected ? (next.length ? next : ["指定なし"]) : [...next, genre]; })} style={{ borderRadius: 17, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: selected ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selected ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#FFF" : colors.foreground }}>{genre}</Text></Pressable>; })}</View></View><View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>エリア</Text><TextInput value={adviceArea} onChangeText={setAdviceArea} placeholder="例：渋谷、都内" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} /></View><View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>利用シーン</Text><TextInput value={adviceScene} onChangeText={setAdviceScene} placeholder="例：デート、友人との食事" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} /></View><View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>予算</Text><TextInput value={adviceBudget} onChangeText={setAdviceBudget} placeholder="例：5,000〜8,000円" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground }} /></View></View> : null}

            {/* 本文 */}
            {thread.selfIntroduction ? <View style={{ gap: 14 }}><View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>自己紹介文 <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={introductionText} onChangeText={setIntroductionText} multiline textAlignVertical="top" placeholder="お名前、好きなグルメ、活動エリアなどを入力" placeholderTextColor={colors.muted} style={{ minHeight: 150, backgroundColor: colors.surface, borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 21, color: colors.foreground }} /></View><View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>IRO＋でやってみたいこと</Text><TextInput value={wantToTry} onChangeText={setWantToTry} multiline textAlignVertical="top" placeholder="参加したいイベント、企画したいことなど" placeholderTextColor={colors.muted} style={{ minHeight: 100, backgroundColor: colors.surface, borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 21, color: colors.foreground }} /></View></View> : <View>
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
            </View>}

            {/* 写真 */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
                写真（最大10枚）
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {images.map((uri, i) => (
                  <View key={i} style={{ position: "relative" }}>
                    <Image
                      source={boardImageSource(uri)}
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
                {images.length < 10 && (
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
            <Pressable
              onPress={() => setConfirmingDelete(true)}
              style={{ marginTop: 8, borderRadius: 12, paddingVertical: 13, alignItems: "center", borderWidth: 1, borderColor: colors.error }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.error }}>投稿を削除</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
        {confirmingDelete ? <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(20,18,24,0.46)", alignItems: "center", justifyContent: "center", padding: 22 }}><View style={{ width: "100%", maxWidth: 390, borderRadius: 18, padding: 20, backgroundColor: colors.background }}><Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>投稿を削除しますか？</Text><Text style={{ marginTop: 8, fontSize: 13, lineHeight: 20, color: colors.muted }}>削除した投稿は一覧に表示されなくなります。</Text><View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}><Pressable onPress={() => setConfirmingDelete(false)} style={{ flex: 1, borderRadius: 11, paddingVertical: 13, alignItems: "center", backgroundColor: colors.surface }}><Text style={{ fontWeight: "800", color: colors.foreground }}>キャンセル</Text></Pressable><Pressable onPress={async () => { setConfirmingDelete(false); await onDelete(); }} style={{ flex: 1, borderRadius: 11, paddingVertical: 13, alignItems: "center", backgroundColor: colors.error }}><Text style={{ fontWeight: "900", color: "#FFF" }}>削除する</Text></Pressable></View></View></View> : null}
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
  author,
}: {
  visible: boolean;
  onClose: () => void;
  category: string;
  categories: BoardCategory[];
  onAdd: (thread: BoardThread) => Promise<BoardThread> | BoardThread;
  canManage: boolean;
  author: Member;
}) {
  const colors = useColors();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const contentInputRef = useRef<TextInput>(null);
  const [contentSelection, setContentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [introductionText, setIntroductionText] = useState("");
  const [wantToTry, setWantToTry] = useState("");
  const [introductionSelection, setIntroductionSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [wantToTrySelection, setWantToTrySelection] = useState<TextSelection>({ start: 0, end: 0 });
  const introductionInputRef = useRef<TextInput>(null);
  const wantToTryInputRef = useRef<TextInput>(null);
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [capacity, setCapacity] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [mealTitle, setMealTitle] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [budget, setBudget] = useState("");
  const [recommendedMenu, setRecommendedMenu] = useState("");
  const [rating, setRating] = useState(0);
  const [mealComment, setMealComment] = useState("");
  const [googleMapUrl, setGoogleMapUrl] = useState("");
  const [tabelogUrl, setTabelogUrl] = useState("");
  const [areaDisplay, setAreaDisplay] = useState("");
  const [adviceTheme, setAdviceTheme] = useState("");
  const [adviceGenres, setAdviceGenres] = useState<string[]>(["指定なし"]);
  const [adviceArea, setAdviceArea] = useState("指定なし");
  const [adviceScene, setAdviceScene] = useState("指定なし");
  const [adviceBudget, setAdviceBudget] = useState("指定なし");
  const [adviceComment, setAdviceComment] = useState("");
  const [contestDeadline, setContestDeadline] = useState("");
  const [contestPrizePoints, setContestPrizePoints] = useState("500");
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDeadline, setPollDeadline] = useState("");
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [formError, setFormError] = useState("");
  const [optionModal, setOptionModal] = useState<"budget" | "advice-budget" | null>(null);
  const isMealReport = category === "meal-report";
  const isGourmetAdvice = category === "gourmet-advice";
  const isIntroduction = category === "introduction";
  const isGourmetContest = category === "gourmet-contest";
  const hasManagedRecruitmentStatus = isRecruitmentBoardCategory(category);
  const pollAllowed = !["introduction", "meal-report", "gourmet-contest", "gourmet-advice"].includes(category);
  const googleMapUrlValid = !googleMapUrl.trim() || isGoogleMapsUrl(googleMapUrl);
  const tabelogUrlValid = !tabelogUrl.trim() || /^https?:\/\/(?:www\.)?tabelog\.com\//i.test(tabelogUrl.trim());
  const mealReportValid =
    restaurantName.trim().length > 0 &&
    areaDisplay.trim().length > 0 &&
    rating > 0 &&
    googleMapUrlValid &&
    tabelogUrlValid;
  const adviceValid = adviceTheme.trim().length > 0 && adviceGenres.length > 0 && adviceArea.trim().length > 0 && adviceScene.trim().length > 0 && adviceBudget.length > 0 && adviceComment.trim().length > 0;
  const contestValid = title.trim().length > 0 && content.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(contestDeadline) && Number(contestPrizePoints) > 0;
  const pollValid = !pollAllowed || !pollEnabled || (pollQuestion.trim().length > 0 && pollOptions.filter((option) => option.trim()).length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(pollDeadline));
  const contentValid = isMealReport ? mealReportValid : isGourmetAdvice ? adviceValid : isIntroduction ? introductionText.trim().length > 0 : isGourmetContest ? contestValid : title.trim().length > 0 && content.trim().length > 0;
  const canSubmit = contentValid && pollValid;

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

  const detectMealReportArea = async () => {
    if (!isMealReport || !restaurantName.trim() || (!googleMapUrl.trim() && !tabelogUrl.trim())) return prefecture ? { area: prefecture, areaDisplay } : null;
    const result = await resolveRestaurantLocation({ restaurantName: restaurantName.trim(), googleMapsUrl: googleMapUrl.trim(), tabelogUrl: tabelogUrl.trim() });
    if (!result) return prefecture ? { area: prefecture, areaDisplay } : null;
    setPrefecture(result.area);
    setAreaDisplay((current) => current.trim() ? current : result.areaDisplay);
    setFormError("");
    return result;
  };

  const handleCreate = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
    if (!pollValid) {
      setFormError("投票の質問・選択肢2つ以上・期限（YYYY-MM-DD）を入力してください。");
      return;
    }
    if (isMealReport && !mealReportValid) {
      setFormError("店名・エリア・評価を入力し、入力したURLが正しいか確認してください。");
      return;
    }
    if (isGourmetAdvice && !adviceValid) {
      setFormError("タイトル・料理カテゴリ・エリア・利用シーン・予算・一言をすべて入力してください。");
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
      setFormError("タイトル・内容・コメント締切・景品ポイントをすべて入力してください。日付はYYYY-MM-DD形式です。");
      return;
    }
    if (!isMealReport && !isGourmetAdvice && !isIntroduction && !isGourmetContest && (!title.trim() || !content.trim())) return;
    const detectedLocation = isMealReport ? await detectMealReportArea() : null;
    const resolvedAreaDisplay = areaDisplay.trim() || detectedLocation?.areaDisplay || "";
    const resolvedArea = isMealReport ? (detectedLocation?.area || prefecture || resolvedAreaDisplay) : prefecture;
    const normalizedComment = mealComment.trim();
    const normalizedMenu = recommendedMenu.trim();
    let newThread: BoardThread = {
      id: `t_new_${Date.now()}`,
      title: isMealReport ? (mealTitle.trim() || restaurantName.trim()) : isGourmetAdvice ? adviceTheme.trim() : isIntroduction ? "自己紹介" : title.trim(),
      author,
      category: category as BoardThread["category"],
      commentCount: 0,
      lastUpdated: new Date().toISOString(),
      preview: isMealReport
        ? normalizedComment || normalizedMenu || `${resolvedArea}でいただきました。`
        : isGourmetAdvice ? adviceComment.trim() : isIntroduction ? introductionText.trim() : content.trim(),
      isRecruiting: hasManagedRecruitmentStatus ? !(category.startsWith("club-club-") && /自己紹介/.test(title.trim())) : isMealReport || isGourmetAdvice || isIntroduction || isGourmetContest ? false : isRecruiting,
      recruitmentStatus: hasManagedRecruitmentStatus ? (category.startsWith("club-club-") && /自己紹介/.test(title.trim()) ? "none" : "open") : undefined,
      isPinned: category.startsWith("club-club-") && /自己紹介/.test(title.trim()) ? true : undefined,
      recruitCapacity: !hasManagedRecruitmentStatus && !isMealReport && !isGourmetAdvice && !isIntroduction && !isGourmetContest && isRecruiting ? parseInt(capacity || "10", 10) : undefined,
      recruitAttendees: 0,
      recruitParticipants: [],
      recruitApplicants: [],
      images: images.length > 0 ? images : undefined,
      mealReport: isMealReport
        ? {
            postTitle: mealTitle.trim() || undefined,
            restaurantName: restaurantName.trim(),
            prefecture: resolvedArea,
            areaDisplay: resolvedAreaDisplay || undefined,
            budget: budget || undefined,
            recommendedMenu: normalizedMenu || undefined,
            rating,
            comment: normalizedComment || undefined,
            googleMapUrl: googleMapUrl.trim() || undefined,
            tabelogUrl: tabelogUrl.trim() || undefined,
          }
        : undefined,
      gourmetAdvice: isGourmetAdvice ? { theme: adviceTheme.trim(), genres: adviceGenres, area: adviceArea.trim(), scene: adviceScene.trim(), budget: adviceBudget, comment: adviceComment.trim() } : undefined,
      selfIntroduction: isIntroduction ? { introduction: introductionText.trim(), wantToTry: wantToTry.trim() || undefined } : undefined,
      gourmetContest: isGourmetContest ? { commentDeadline: contestDeadline, prizePoints: Number(contestPrizePoints) } : undefined,
      poll: pollAllowed && pollEnabled ? {
        question: pollQuestion.trim(),
        deadline: pollDeadline,
        allowMultiple: pollAllowMultiple,
        options: pollOptions.filter((option) => option.trim()).map((option, index) => ({ id: `option_${index + 1}`, text: option.trim(), voterIds: [] })),
      } : undefined,
    };
    if (newThread.images?.length) {
      try {
        newThread = { ...newThread, images: await uploadBoardImages(newThread.images) };
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "画像を保存できませんでした。もう一度お試しください。");
        return;
      }
    }
    let savedThread: BoardThread;
    try {
      savedThread = await onAdd(newThread);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "投稿を保存できませんでした。もう一度お試しください。");
      return;
    }
    const homeActivity = boardActivityForThread(savedThread);
    if (homeActivity) void recordHomeActivity(homeActivity);
    if (!isMealReport && !isGourmetAdvice) {
      const mentionContent = isIntroduction ? `${introductionText} ${wantToTry}` : content;
      const preview = mentionContent.length > 50 ? `${mentionContent.slice(0, 50)}...` : mentionContent;
      const boardName = categories.find((item) => item.key === category)?.label ?? "掲示板";
      for (const memberId of getMentionedMemberIds(mentionContent, MEMBERS, BOARD_MENTION_GROUPS).filter((id) => id !== CURRENT_USER.id)) {
        const member = MEMBERS.find((item) => item.id === memberId);
        if (member) void sendMentionNotification(member.name, author.name, boardName, preview);
      }
    }
    onClose();
    setTitle("");
    setContent("");
    setMentionQuery(null);
    setContentSelection({ start: 0, end: 0 });
    setIntroductionText(""); setWantToTry("");
    setIntroductionSelection({ start: 0, end: 0 }); setWantToTrySelection({ start: 0, end: 0 });
    setIsRecruiting(false);
    setCapacity("");
    setImages([]);
    setRestaurantName("");
    setMealTitle("");
    setPrefecture("");
    setBudget("");
    setRecommendedMenu("");
    setRating(0);
    setMealComment("");
    setGoogleMapUrl("");
    setTabelogUrl("");
    setAreaDisplay("");
    setAdviceTheme(""); setAdviceGenres(["指定なし"]); setAdviceArea("指定なし"); setAdviceScene("指定なし"); setAdviceBudget("指定なし"); setAdviceComment("");
    setContestDeadline(""); setContestPrizePoints("500");
    setPollEnabled(false); setPollQuestion(""); setPollOptions(["", ""]); setPollDeadline(""); setPollAllowMultiple(false);
    setFormError("");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
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
          <Pressable onPress={handleCreate} disabled={!canSubmit || isSubmitting}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: canSubmit && !isSubmitting ? "#E8A0BF" : colors.muted,
              }}
            >
              {isSubmitting ? "投稿中…" : "投稿"}
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
                  エリア <Text style={{ color: colors.error }}>必須</Text>
                </Text>
                <TextInput value={areaDisplay} onChangeText={(value) => { setAreaDisplay(value); setFormError(""); }} placeholder="例：恵比寿" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} />
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>予算</Text>
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
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>おすすめメニュー</Text>
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
                <Text style={{ fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 7 }}>※星4以上かつGoogle Mapリンクがある場合は、IRO+のグルメマップに自動登録されます</Text>
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>タイトル</Text>
                <TextInput value={mealTitle} onChangeText={setMealTitle} placeholder="例：また行きたい、感動の一皿" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} />
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>感想</Text>
                <TextInput
                  value={mealComment}
                  onChangeText={setMealComment}
                  placeholder="料理やお店の雰囲気など、感想を自由に入力"
                  placeholderTextColor={colors.muted}
                  multiline
                  textAlignVertical="top"
                  style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, minHeight: 90 }}
                />
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>
                  Google Mapのリンク
                </Text>
                <TextInput
                  value={googleMapUrl}
                  onChangeText={setGoogleMapUrl}
                  placeholder="https://maps.app.goo.gl/..."
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  onBlur={() => { void detectMealReportArea(); }}
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
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>食べログのリンク</Text>
                <TextInput
                  value={tabelogUrl}
                  onChangeText={setTabelogUrl}
                  placeholder="https://tabelog.com/..."
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  onBlur={() => { void detectMealReportArea(); }}
                  style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground, borderWidth: tabelogUrl.length > 0 && !/^https?:\/\/(?:www\.)?tabelog\.com\//i.test(tabelogUrl.trim()) ? 1 : 0, borderColor: colors.error }}
                />
                {tabelogUrl.length > 0 && !/^https?:\/\/(?:www\.)?tabelog\.com\//i.test(tabelogUrl.trim()) ? <Text style={{ fontSize: 12, color: colors.error, marginTop: 5 }}>食べログのURLを入力してください</Text> : null}
              </View>

              {formError ? <Text style={{ fontSize: 13, color: colors.error }}>{formError}</Text> : null}
            </View>
          ) : isGourmetAdvice ? (
            <View style={{ gap: 16, marginBottom: 16 }}>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>タイトル <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={adviceTheme} onChangeText={setAdviceTheme} placeholder="例：誕生日プレートが可愛いお店" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
              <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 7 }}>料理カテゴリ <Text style={{ color: colors.error }}>複数選択可</Text></Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{["指定なし", ...GOURMET_GENRES].map((genre) => { const selected = adviceGenres.includes(genre); return <Pressable key={genre} onPress={() => setAdviceGenres((current) => { if (genre === "指定なし") return ["指定なし"]; const withoutDefault = current.filter((item) => item !== "指定なし" && item !== "指定しない"); return selected ? (withoutDefault.filter((item) => item !== genre).length ? withoutDefault.filter((item) => item !== genre) : ["指定なし"]) : [...withoutDefault, genre]; })} style={{ borderRadius: 17, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: selected ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selected ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#FFF" : colors.foreground }}>{genre}</Text></Pressable>; })}</View></View>
              <View><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>エリア <Text style={{ color: colors.error }}>必須</Text></Text><Pressable onPress={() => setAdviceArea("指定なし")}><Text style={{ fontSize: 12, fontWeight: "800", color: "#8C6276" }}>指定なし</Text></Pressable></View><TextInput value={adviceArea} onFocus={() => { if (adviceArea === "指定なし") setAdviceArea(""); }} onChangeText={setAdviceArea} placeholder="例：都内、渋谷周辺" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
              <View><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>利用シーン <Text style={{ color: colors.error }}>必須</Text></Text><Pressable onPress={() => setAdviceScene("指定なし")}><Text style={{ fontSize: 12, fontWeight: "800", color: "#8C6276" }}>指定なし</Text></Pressable></View><TextInput value={adviceScene} onFocus={() => { if (adviceScene === "指定なし") setAdviceScene(""); }} onChangeText={setAdviceScene} placeholder="例：お誕生日ディナー" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
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
              {mentionQuery !== null ? <MentionSuggestions query={mentionQuery} groups={BOARD_MENTION_GROUPS} members={MEMBERS.filter((member) => member.id !== CURRENT_USER.id)} onSelect={(label) => { setContent((current) => { const next = insertMention(current, label); setContentSelection({ start: next.length, end: next.length }); return next; }); setMentionQuery(null); contentInputRef.current?.focus(); }} /> : null}
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: mentionQuery === null ? -10 : 6, marginBottom: 16 }}>@を入力して個人・グループをメンション</Text>
              {isGourmetContest ? <View style={{ gap: 14, marginBottom: 16 }}>
                <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>運営メンバーだけが選手権スレを作成できます。締切後、最も❤️が多い投稿を自動表彰し、景品ポイントを付与します。</Text>
                <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>コメント募集締切 <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={contestDeadline} onChangeText={setContestDeadline} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
                <View><Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>景品（IRO+ポイント） <Text style={{ color: colors.error }}>必須</Text></Text><TextInput value={contestPrizePoints} onChangeText={(value) => setContestPrizePoints(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="例：500" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.foreground }} /></View>
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
              {images.length < 10 && (
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

          {pollAllowed ? <View style={{ marginBottom: 16 }}>
            <PollComposer
              enabled={pollEnabled}
              setEnabled={setPollEnabled}
              question={pollQuestion}
              setQuestion={setPollQuestion}
              options={pollOptions}
              setOptions={setPollOptions}
              deadline={pollDeadline}
              setDeadline={setPollDeadline}
              allowMultiple={pollAllowMultiple}
              setAllowMultiple={setPollAllowMultiple}
            />
            {pollEnabled && !pollValid ? <Text style={{ fontSize: 12, color: colors.error, marginTop: 6 }}>質問・選択肢2つ以上・期限を入力してください</Text> : null}
          </View> : null}

          {hasManagedRecruitmentStatus ? <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EEF7F0", borderRadius: 12, padding: 13, marginBottom: 16, borderWidth: 1, borderColor: "#CFE7D5" }}><RecruitmentStatusBadge status="open" /><Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: "#356845" }}>新規投稿は「募集中」で公開されます。投稿後に長押しすると「募集中・募集終了・なし」から変更できます。</Text></View> : !isMealReport && !isGourmetAdvice && !isIntroduction && !isGourmetContest ? (
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
  const { compose, category: categoryParam, view, thread: threadParam, fromHome, fromProfile } = useLocalSearchParams<{ compose?: string; category?: string; view?: string; thread?: string; fromHome?: string; fromProfile?: string }>();
  const { user: authUser } = useAuthContext();
  const userIsAdmin = canManageBoardCategories(authUser?.role, authUser?.accessRole);
  const userCanModerateAll = isOperatorRole(authUser?.role, authUser?.accessRole);
  const userCanManageContests = canManageGourmetContests(authUser?.role, authUser?.accessRole);
  const userCanModerateRecruitment = isOperatorRole(authUser?.role, authUser?.accessRole);
  const clubs = useClubs();
  const [categories, setCategories] = useState<BoardCategory[]>(BOARD_CATEGORIES);
  const [activeGroup, setActiveGroup] = useState<BoardCategory["group"]>("all");
  const [activeCategory, setActiveCategory] = useState<string>(BOARD_CATEGORIES[0].key);
  const [refreshing, setRefreshing] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [sharedLoading, setSharedLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<BoardThread | null>(null);
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [xpReward, setXpReward] = useState<XpReward | null>(null);

  const [dynamicThreads, setDynamicThreads] = useState<BoardThread[]>([]);
  const [importedComments, setImportedComments] = useState<Record<string, BoardComment[]>>({});
  const [threadReadCounts, setThreadReadCounts] = useState<Record<string, number>>({});
  const [editedThreads, setEditedThreads] = useState<Record<string, BoardThread>>({});
  const [deletedThreadIds, setDeletedThreadIds] = useState<string[]>([]);
  const [editingThread, setEditingThread] = useState<BoardThread | null>(null);
  const isThreadView = view === "threads" && Boolean(categoryParam);
  const isClubIndexView = view === "clubs";
  const viewerMemberId = resolveViewerMemberId(authUser?.memberId, Boolean(authUser), CURRENT_USER.id);
  const viewerMember = memberFromAuthUser(authUser);
  const boardReadKey = `irotas_board_thread_reads_v1:${viewerMemberId}`;
  useEffect(() => { void AsyncStorage.getItem(boardReadKey).then((raw) => setThreadReadCounts(raw ? JSON.parse(raw) : {})).catch(() => setThreadReadCounts({})); }, [boardReadKey]);
  const markThreadRead = useCallback((threadId: string) => {
    const count = (importedComments[threadId] ?? []).length;
    setThreadReadCounts((current) => {
      const next = { ...current, [threadId]: count };
      void AsyncStorage.setItem(boardReadKey, JSON.stringify(next));
      return next;
    });
  }, [boardReadKey, importedComments]);

  const canAccessCategory = useCallback((category: BoardCategory) => {
    if (category.group !== "club" || userIsAdmin) return true;
    if (category.key === "club-all" || category.key === "club-introduction") return true;
    const club = clubs.find((item) => `club-${item.id}` === category.key);
    return Boolean(club && canViewerAccessClubContent(
      club,
      authUser?.memberId,
      CURRENT_USER.id,
      userIsAdmin,
    ));
  }, [authUser?.memberId, clubs, userIsAdmin]);

  useEffect(() => {
    if (isClubIndexView) router.replace("/clubs");
  }, [isClubIndexView, router]);

  // 自己紹介は通常チャットと同じ操作・未読・リアクション UI に統一する。
  useEffect(() => {
    if (isThreadView && categoryParam === "introduction") {
      router.replace({ pathname: "/chat", params: { id: "board-introduction", unreadCount: "0" } });
    }
  }, [categoryParam, isThreadView, router]);

  useEffect(() => {
    void loadImportedGourmetContests().then((items) => {
      setDynamicThreads((current) => {
        const withoutImports = current.filter((thread) => !thread.id.startsWith("imported-contest-"));
        return [...items.map((item) => item.thread), ...withoutImports];
      });
      setImportedComments((current) => ({
        ...current,
        ...Object.fromEntries(items.map((item) => [item.thread.id, item.comments])),
      }));
    });
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([Api.getBoardArchive("all"), Api.getMemberDirectory().catch(() => [])]).then(([rawArchive, directory]) => {
      if (!active) return;
      const archive = parseDiscordBoardArchive(rawArchive, directory);
      setDynamicThreads((current) => {
        const withoutDiscordArchive = current.filter((thread) => !thread.id.startsWith("discord-board-"));
        return [...archive.threads, ...withoutDiscordArchive];
      });
      setImportedComments((current) => ({ ...current, ...archive.comments }));
    }).catch(() => {
      // 認証または通信に失敗した場合は、移行済みデータを表示しない（fail closed）。
    }).finally(() => { if (active) setArchiveLoading(false); });
    return () => { active = false; };
  }, []);

  const loadSharedBoardContent = useCallback(async (category?: string) => {
    const result = await Api.getSharedBoardContent(category);
    const commentsByThread = result.comments
      .map((comment) => sharedCommentToBoardComment(comment, CURRENT_USER.id))
      .reduce<Record<string, BoardComment[]>>((groups, comment) => {
        (groups[comment.threadId] ??= []).push(comment);
        return groups;
      }, {});
    const visibleRecords = result.threads.filter((thread) => thread.data.archiveShadow !== true);
    const threads = visibleRecords.map((thread) => ({
      ...sharedThreadToBoardThread(thread, CURRENT_USER.id),
      commentCount: commentsByThread[thread.id]?.length ?? 0,
    }));
    setDynamicThreads((current) => {
      const incomingIds = new Set(threads.map((thread) => thread.id));
      const retained = category
        ? current.filter((thread) => !(thread.shared && thread.category === category && !incomingIds.has(thread.id)))
        : current.filter((thread) => !thread.shared || thread.category.startsWith("club-club-"));
      return [...threads, ...retained.filter((thread) => !incomingIds.has(thread.id))];
    });
    setImportedComments((current) => ({
      ...current,
      ...Object.fromEntries(visibleRecords.map((thread) => [thread.id, commentsByThread[thread.id] ?? []])),
    }));
  }, []);

  useEffect(() => {
    void loadSharedBoardContent().catch(() => {
      // 既存の移行データは表示を続け、共有DBの再取得は更新操作時に再試行する。
    }).finally(() => setSharedLoading(false));
  }, [loadSharedBoardContent]);

  useEffect(() => {
    if (!activeCategory.startsWith("club-club-") || !canAccessCategory(categories.find((item) => item.key === activeCategory) ?? { key: activeCategory, label: "部活動", group: "club", createdByAdmin: true })) return;
    void loadSharedBoardContent(activeCategory).catch(() => {
      // 非部員・通信失敗時は共有投稿を表示しない。
    });
  }, [activeCategory, canAccessCategory, categories, loadSharedBoardContent]);

  useEffect(() => {
    void loadBoardThreadEdits().then(setEditedThreads);
    void loadDeletedBoardThreadIds().then(setDeletedThreadIds);
  }, []);

  useEffect(() => {
    setCategories((current) => [
      ...current.filter((category) => category.group !== "club"),
      { key: "club-introduction", label: "部活動紹介・入部申請", group: "club", createdByAdmin: true },
      { key: "club-all", label: "活動報告", group: "club", createdByAdmin: true },
      ...clubs.map((club) => ({ key: `club-${club.id}`, label: club.name, group: "club" as const, createdByAdmin: true })),
    ]);
  }, [clubs]);

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
  }, [canAccessCategory, categories, categoryParam, isThreadView, router]);
  const allThreads = useMemo(
    () => applyBoardThreadEdits(authUser ? dynamicThreads : [...dynamicThreads, ...BOARD_THREADS], editedThreads).filter((thread) => !deletedThreadIds.includes(thread.id)),
    [authUser, dynamicThreads, editedThreads, deletedThreadIds],
  );
  const boardLoading = Boolean(authUser) && (archiveLoading || sharedLoading);
  const filteredThreads = activeCategory === "meal-report"
    ? allThreads.filter((thread) => thread.category === activeCategory).sort((a, b) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated))
    : sortRecruitmentThreads(allThreads.filter((t) => t.category === activeCategory));
  const clubForThread = (thread: BoardThread) => clubs.find((club) => `club-${club.id}` === thread.category);
  const canChangeRecruitment = (thread: BoardThread) => {
    const club = clubForThread(thread);
    const viewerIsLeader = Boolean(club && getClubViewerAccess(club, authUser?.memberId, CURRENT_USER.id).isLeader);
    return isRecruitmentBoardCategory(thread.category) && !isClubSelfIntroduction(thread) && (thread.author.id === viewerMemberId || userCanModerateRecruitment || viewerIsLeader);
  };
  const canPinThread = (thread: BoardThread) => thread.category.startsWith("club-club-") && !isClubSelfIntroduction(thread) && (thread.author.id === viewerMemberId || Boolean(clubForThread(thread) && getClubViewerAccess(clubForThread(thread)!, authUser?.memberId, CURRENT_USER.id).isLeader) || userCanModerateRecruitment);
  const updateThreadManagement = async (thread: BoardThread, changes: Pick<BoardThread, "isRecruiting" | "isPinned" | "recruitmentStatus">) => {
    const updated = { ...thread, ...changes, lastUpdated: thread.lastUpdated };
    if (thread.shared) {
      try {
        await Api.updateSharedBoardThread(thread.id, { status: changes.recruitmentStatus ?? "none", pinned: Boolean(changes.isPinned), data: boardThreadData(updated) });
      } catch (error) {
        Alert.alert("保存できませんでした", error instanceof Error ? error.message : "通信環境を確認して、もう一度お試しください。");
        return;
      }
    }
    setEditedThreads((current) => ({ ...current, [updated.id]: updated }));
    setSelectedThread((current) => current?.id === updated.id ? updated : current);
    if (!thread.shared) void saveBoardThreadEdit(updated).catch(() => Alert.alert("保存できませんでした", "通信環境を確認して、もう一度お試しください。"));
  };
  const deleteThread = async (thread: BoardThread) => {
    try {
      if (thread.shared) await Api.deleteSharedBoardThread(thread.id);
      try { await deleteBoardThread(thread.id); } catch { /* shared deletion is authoritative */ }
      setDeletedThreadIds((current) => current.includes(thread.id) ? current : [...current, thread.id]);
      if (selectedThread?.id === thread.id) setSelectedThread(null);
      router.setParams({ thread: "" });
      Alert.alert("投稿を削除しました");
    } catch (error) {
      Alert.alert("削除できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
    }
  };
  const promptRecruitmentStatus = (thread: BoardThread) => {
    if (!canChangeRecruitment(thread) && !canPinThread(thread)) return;
    Alert.alert("投稿の管理", "変更する項目を選択してください。", [
      ...(canPinThread(thread) ? [{ text: isThreadPinned(thread) ? "固定表示を解除" : "一番上に固定", onPress: () => updateThreadManagement(thread, { isRecruiting: thread.isRecruiting, isPinned: !isThreadPinned(thread), recruitmentStatus: getBoardRecruitmentStatus(thread) }) }] : []),
      ...(canChangeRecruitment(thread) ? [
        { text: "募集中にする", onPress: () => updateThreadManagement(thread, { isRecruiting: true, isPinned: thread.isPinned, recruitmentStatus: "open" }) },
        { text: "募集終了にする", onPress: () => updateThreadManagement(thread, { isRecruiting: false, isPinned: thread.isPinned, recruitmentStatus: "closed" }) },
        { text: "ステータスなし", onPress: () => updateThreadManagement(thread, { isRecruiting: false, isPinned: thread.isPinned, recruitmentStatus: "none" }) },
      ] : []),
      { text: "キャンセル", style: "cancel" },
    ] as any);
  };
  useEffect(() => {
    if (!threadParam) return;
    const linkedThread = allThreads.find((item) => item.id === threadParam);
    if (linkedThread) setSelectedThread(linkedThread);
  }, [threadParam, allThreads]);
  const visibleCategories = categories
    .filter((category) => category.group === (isClubIndexView ? "club" : "all") && canAccessCategory(category))
    .sort((a, b) => {
      if (activeGroup !== "club") return 0;
      if (a.key === "club-introduction") return -1;
      if (b.key === "club-introduction") return 1;
      if (a.key === "club-all") return -1;
      if (b.key === "club-all") return 1;
      const aClub = clubs.find((club) => `club-${club.id}` === a.key);
      const bClub = clubs.find((club) => `club-${club.id}` === b.key);
      const aJoined = Boolean(aClub && getClubViewerAccess(aClub, authUser?.memberId, CURRENT_USER.id).isMember);
      const bJoined = Boolean(bClub && getClubViewerAccess(bClub, authUser?.memberId, CURRENT_USER.id).isMember);
      return Number(bJoined) - Number(aJoined);
    });
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
      "gourmet-map": { icon: "map.fill", description: "みんなの厳選グルメを地図と一覧で探す", accent: "#D56791" },
      "club-introduction": { icon: "person.badge.plus", description: "部活動を見つけて部長へ入部申請", accent: "#5579A6" },
      "club-all": { icon: "calendar", description: "各部活動の活動レポートをまとめて確認", accent: "#4E8F65" },
    };
    return presentations[category.key] ?? { icon: "bubble.left.and.bubble.right.fill", description: "掲示板カテゴリ", accent: "#A7C7E7" };
  };
  const applicationClubForThread = (thread: BoardThread) => thread.category === "club-introduction"
    ? clubs.find((club) => thread.title.includes(club.name) || thread.author.id === club.leaderId)
    : undefined;

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

  const handleOpenCategory = (category: BoardCategory) => {
    if (category.key === "introduction") {
      router.push({ pathname: "/chat", params: { id: "board-introduction", unreadCount: "0" } });
      return;
    }
    if (category.key === "gourmet-map") {
      router.push("/gourmet-map" as any);
      return;
    }
    if (category.group === "club" && category.key !== "club-all" && category.key !== "club-introduction" && !canAccessCategory(category)) {
      router.push("/clubs");
      return;
    }
    router.push({ pathname: "/board", params: { category: category.key, view: "threads" } });
  };

  const activeCategoryLabel = categories.find((category) => category.key === activeCategory)?.label ?? "掲示板";
  const renderCategoryRow = (cat: BoardCategory) => {
    const presentation = categoryPresentation(cat);
    return (
      <Pressable
        key={cat.key}
        onPress={() => handleOpenCategory(cat)}
        style={{ flexDirection: "row", alignItems: "center", minHeight: 62, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${presentation.accent}20`, alignItems: "center", justifyContent: "center" }}><IconSymbol name={presentation.icon as any} size={21} color={presentation.accent} /></View>
        <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>{cat.label}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>{presentation.description}</Text></View>
        <View style={{ backgroundColor: "#3478C7", borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3, marginRight: 8 }}><Text style={{ fontSize: 10, fontWeight: "900", color: "#FFFFFF" }}>新着</Text></View>
        <IconSymbol name="chevron.right" size={17} color={colors.muted} />
      </Pressable>
    );
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
        {isThreadView || isClubIndexView ? (
          <Pressable accessibilityLabel={fromProfile === "1" ? "マイページへ戻る" : fromHome === "1" ? "ホームへ戻る" : "掲示板トップへ戻る"} onPress={() => fromProfile === "1" ? router.replace("/profile" as any) : fromHome === "1" ? router.replace("/(tabs)" as any) : router.replace("/board")} style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingVertical: 4 }}>
            <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
            <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: 20, fontWeight: "800", color: colors.foreground }}>
              {isClubIndexView ? "部活動" : activeCategoryLabel}
            </Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, letterSpacing: -0.5 }}>
            掲示板
          </Text>
        )}
      </View>

      {!isThreadView && !isClubIndexView ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 92, gap: 8, backgroundColor: "#FBFDFF" }}>
        {BOARD_HOME_ORDER.map((categoryKey) => {
          if (categoryKey === "club") {
            return (
              <Pressable key="club" onPress={() => router.push("/clubs")} style={{ flexDirection: "row", alignItems: "center", minHeight: 62, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#5579A620", alignItems: "center", justifyContent: "center" }}><IconSymbol name="person.3.fill" size={21} color="#5579A6" /></View>
                <View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>部活動</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>活動報告・入部中の部活動・部活動を探す</Text></View>
                <IconSymbol name="chevron.right" size={17} color={colors.muted} />
              </Pressable>
            );
          }
          const category = visibleCategories.find((item) => item.key === categoryKey);
          return category ? renderCategoryRow(category) : null;
        })}
      </ScrollView> : null}

      {isClubIndexView ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.muted }}>部活動ページを開いています…</Text></View> : null}

      {isThreadView && boardLoading ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color="#E8A0BF" /><Text style={{ marginTop: 12, color: colors.muted }}>掲示板を読み込んでいます…</Text></View> : null}

      {isThreadView && !boardLoading ? <FlatList
        data={filteredThreads}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          activeCategory === "introduction" ? <SelfIntroductionMessage thread={item} /> : (() => {
            const comments = importedComments[item.id] ?? [];
            const unreadComments = comments.slice(threadReadCounts[item.id] ?? 0).filter((comment) => comment.author.id !== viewerMemberId);
            const mentionCount = unreadComments.filter((comment) => comment.content.includes(`@${viewerMember.name}`) || /@(全員|everyone|here)/i.test(comment.content)).length;
            return <ThreadCard
            thread={item}
            comments={comments}
            showMenu={item.category !== "introduction"}
            unreadCount={unreadComments.length}
            mentionCount={mentionCount}
            onPress={() => { markThreadRead(item.id); setSelectedThread(item); router.setParams({ thread: item.id }); }}
            onEdit={item.author.id === viewerMemberId || userCanModerateAll ? () => setEditingThread(item) : undefined}
            onDelete={item.author.id === viewerMemberId || userCanModerateAll ? () => Alert.alert("投稿を削除しますか？", "削除後は元に戻せません。", [{ text: "キャンセル", style: "cancel" }, { text: "削除", style: "destructive", onPress: () => { void deleteThread(item); } }]) : undefined}
            onPin={canPinThread(item) || userCanModerateAll ? () => { void updateThreadManagement(item, { isRecruiting: item.isRecruiting, recruitmentStatus: item.recruitmentStatus, isPinned: !item.isPinned }); } : undefined}
            onChangeRecruitment={canChangeRecruitment(item) || canPinThread(item) ? () => promptRecruitmentStatus(item) : undefined}
          />;
          })()
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8A0BF" />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 14, paddingBottom: activeCategory === "introduction" ? 28 : 92 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <IconSymbol name="bubble.left.and.bubble.right.fill" size={48} color={colors.border} />
            <Text style={{ fontSize: 16, color: colors.muted, marginTop: 12 }}>
              このカテゴリにはまだ投稿がありません
            </Text>
          </View>
        }
      /> : null}

      {isThreadView && activeCategory !== "introduction" && activeCategory !== "gourmet-map" && (activeCategory !== "gourmet-contest" || userCanManageContests) ? (
        <Pressable
          accessibilityLabel={`${categories.find((category) => category.key === activeCategory)?.label ?? "掲示板"}に投稿`}
          onPress={() => setShowCreateThread(true)}
          style={{ position: "absolute", right: 20, bottom: 92, width: 56, height: 56, borderRadius: 28, backgroundColor: "#18171A", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 6 }}
        >
          <IconSymbol name="plus" size={27} color="#FFF" />
        </Pressable>
      ) : null}

      {/* Thread Detail Modal */}
      <Modal
        visible={!!selectedThread}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setSelectedThread(null);
          if (fromHome === "1") router.replace("/(tabs)" as any);
          else router.setParams({ thread: "" });
        }}
      >
        {selectedThread && (
          <ThreadDetailModal
            thread={selectedThread}
            initialComments={importedComments[selectedThread.id] ?? []}
            onClose={() => {
              setSelectedThread(null);
              if (fromHome === "1") router.replace("/(tabs)" as any);
              else router.setParams({ thread: "" });
            }}
            onEditThread={selectedThread.author.id === viewerMemberId || userCanModerateAll ? () => { setEditingThread(selectedThread); setSelectedThread(null); router.setParams({ thread: "" }); } : undefined}
            onChangeRecruitment={canChangeRecruitment(selectedThread) || canPinThread(selectedThread) ? () => promptRecruitmentStatus(selectedThread) : undefined}
            canRegisterEvent={selectedThread.author.id === viewerMemberId}
            applicationClub={applicationClubForThread(selectedThread)}
            canModerateAll={userCanModerateAll}
          />
        )}
      </Modal>

      {/* Create Thread Modal - 全員投稿可能 */}
      <CreateThreadModal
        visible={showCreateThread}
        onClose={() => {
          setShowCreateThread(false);
          if (fromHome === "1") router.replace("/(tabs)" as any);
        }}
        category={activeCategory}
        categories={categories}
        canManage={userCanManageContests}
        author={viewerMember}
        onAdd={async (thread) => {
          const saved = await Api.createSharedBoardThread({
            category: thread.category,
            title: thread.title,
            content: thread.preview,
            status: thread.recruitmentStatus ?? (thread.isRecruiting ? "open" : "none"),
            data: boardThreadData(thread),
          });
          const sharedThread = { ...thread, id: saved.id, lastUpdated: saved.createdAt, shared: true };
          setDynamicThreads((prev) => [sharedThread, ...prev]);
          setImportedComments((current) => ({ ...current, [sharedThread.id]: [] }));
          const xpAction = thread.category === "meal-report" ? POINT_ACTIONS.mealReportPost : POINT_ACTIONS.boardPost;
          if (!isOperatorRole(authUser?.role, authUser?.accessRole)) {
            void awardXp(authUser?.xp ?? CURRENT_USER.points, xpAction.points, xpAction.label, () => Api.awardSharedXp(thread.category === "meal-report" ? "meal_report_post" : "board_post", saved.id)).then(setXpReward).catch(() => {
              Alert.alert("投稿しました", "XPの反映に時間がかかっています。マイページを再読み込みしてください。");
            });
          }
          const submission = communityRestaurantFromMealReport(thread);
          if (submission) {
            void registerCommunityRestaurant(submission).catch(() => {
              Alert.alert("投稿は完了しました", "グルメマップへの自動登録のみ失敗しました。運営が後ほど確認します。");
            });
          }
          return sharedThread;
        }}
      />

      {/* Edit Thread Modal - 投稿者本人のみ */}
      {editingThread && (
        <EditThreadModal
          thread={editingThread}
          onClose={() => setEditingThread(null)}
          onSave={(updated) => {
            if (updated.shared) {
              void Api.updateSharedBoardThread(updated.id, { title: updated.title, content: updated.preview, status: updated.recruitmentStatus ?? (updated.isRecruiting ? "open" : "none"), pinned: Boolean(updated.isPinned), data: boardThreadData(updated) }).then(() => {
                setEditedThreads((prev) => ({ ...prev, [updated.id]: updated }));
                setEditingThread(null);
              }).catch((error) => Alert.alert("保存できませんでした", error instanceof Error ? error.message : "もう一度お試しください。"));
              return;
            }
            setEditedThreads((prev) => ({ ...prev, [updated.id]: updated }));
            void saveBoardThreadEdit(updated).catch(() => {
              Alert.alert("保存できませんでした", "通信環境を確認して、もう一度お試しください。");
            });
            setEditingThread(null);
          }}
          onDelete={async () => {
            const deletingId = editingThread.id;
            try {
              if (editingThread.shared) await Api.deleteSharedBoardThread(deletingId);
              try { await deleteBoardThread(deletingId); } catch { /* server deletion already succeeded */ }
              setDeletedThreadIds((current) => current.includes(deletingId) ? current : [...current, deletingId]);
              setSelectedThread(null);
              setEditingThread(null);
              router.setParams({ thread: "" });
              Alert.alert("投稿を削除しました");
            } catch (error) {
              Alert.alert("削除できませんでした", error instanceof Error ? error.message : "もう一度お試しください。");
            }
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
      <XpRewardPopup reward={xpReward} onClose={() => setXpReward(null)} />
    </ScreenContainer>
  );
}
