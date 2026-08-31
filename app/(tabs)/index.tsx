import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { BrandLogo } from "@/components/brand-logo";
import { EventImage } from "@/components/event-image";
import { MemberRankBadge } from "@/components/member-rank-badge";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  ANNOUNCEMENTS,
  RANK_COLORS,
  RANK_LABELS,
  getTodayEvents,
  EVENTS,
  CURRENT_USER,
  DEFAULT_AVATAR,
  type Announcement,
  type Event,
  type BoardThread,
  type TimelinePost,
} from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { getHomeActivities, type HomeActivity, type HomeActivityKind } from "@/lib/home-activity-store";
import { getGiftCampaigns, type GiftCampaign } from "@/lib/gift-campaign-store";
import { getAllEvents } from "@/lib/event-store";
import { createDefaultPreferences, loadMemberAiConsents, loadMemberPreferences, recordActivityEvent, type MemberAiConsents, type MemberPreferences } from "@/lib/ai-data-store";
import { recommendEvents, type RecommendedEvent } from "@/lib/event-recommendation";
import * as Api from "@/lib/_core/api";

// タイムラインコメント型
interface TimelineComment {
  id: string;
  postId: string;
  authorName: string;
  authorAvatar: any;
  text: string;
  createdAt: string;
}

// コメントストア（メモリ内）
const timelineComments: TimelineComment[] = [];

const HOME_CAMPAIGNS = [
  {
    id: "summer-points",
    label: "期間限定",
    title: "夏のイベント参加キャンペーン",
    description: "対象イベントへの参加でイロタスポイントが2倍",
    period: "7/1〜8/31",
    color: "#E8A0BF",
    route: "/events" as const,
  },
  {
    id: "member-coupons",
    label: "会員限定",
    title: "今月のグルメクーポン",
    description: "提携店で使える最新クーポンをチェック",
    period: "7月分公開中",
    color: "#5B9BD5",
    route: "/coupons" as const,
  },
];

function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const slideWidth = screenWidth - 32;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (announcements.length <= 1 || isInteracting) return;

    const timer = setTimeout(() => {
      const nextIndex = (activeIndex + 1) % announcements.length;
      scrollRef.current?.scrollTo({ x: nextIndex * slideWidth, animated: true });
      setActiveIndex(nextIndex);
    }, 4500);

    return () => clearTimeout(timer);
  }, [activeIndex, announcements.length, isInteracting, slideWidth]);

  return (
    <View style={{ marginHorizontal: 16, marginTop: 14, marginBottom: 10 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        snapToInterval={slideWidth}
        decelerationRate="fast"
        scrollEnabled={announcements.length > 1}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setIsInteracting(true)}
        onScrollEndDrag={() => setIsInteracting(false)}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
          setActiveIndex(index);
          setIsInteracting(false);
        }}
      >
        {announcements.map((item) => (
          <Pressable
            key={item.id}
            style={{ width: slideWidth, borderRadius: 18, overflow: "hidden" }}
          >
            <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#F3DCE7" }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <IconSymbol name="megaphone.fill" size={14} color="#E8A0BF" />
                <Text style={{ fontSize: 11, color: "#E8A0BF", fontWeight: "600", marginLeft: 6 }}>
                  お知らせ
                </Text>
              </View>
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 3 }}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={2}>
                {item.content}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 6 }}>
        {announcements.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === activeIndex ? 14 : 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: i === activeIndex ? "#E8A0BF" : colors.border,
              marginHorizontal: 2,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function CampaignSection({ gifts }: { gifts: GiftCampaign[] }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 10 }}>
        <IconSymbol name="gift.fill" size={18} color="#E8A0BF" />
        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, marginLeft: 7 }}>キャンペーン情報</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
        {[...gifts.map((gift) => ({ id: `gift:${gift.id}`, label: "抽選受付中", title: gift.title, description: gift.description, period: `応募期限 ${gift.deadline}`, color: "#D1749B", route: "/gift-campaign" as const })), ...HOME_CAMPAIGNS].map((campaign) => (
          <Pressable key={campaign.id} onPress={() => router.push(campaign.route)} style={{ width: 270, borderRadius: 16, padding: 16, backgroundColor: `${campaign.color}16`, borderWidth: 1, borderColor: `${campaign.color}45` }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: campaign.color, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>{campaign.label}</Text>
              <Text style={{ marginLeft: "auto", fontSize: 11, fontWeight: "700", color: colors.muted }}>{campaign.period}</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>{campaign.title}</Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 5 }}>{campaign.description}</Text>
            <Text style={{ fontSize: 12, fontWeight: "800", color: campaign.color, marginTop: 10 }}>詳しく見る →</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function RecommendedEventsSection({ items, enabled }: { items: RecommendedEvent[]; enabled: boolean }) {
  const colors = useColors(); const router = useRouter();
  if (!enabled) return <Pressable onPress={() => router.push("/ai-settings" as any)} style={{ marginHorizontal: 16, marginBottom: 16, padding: 15, borderRadius: 16, backgroundColor: "#FCEAF2", borderWidth: 1, borderColor: "#F0C7D8", flexDirection: "row", alignItems: "center" }}><View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" }}><IconSymbol name="sparkles" size={20} color="#D65E8D" /></View><View style={{ flex: 1, marginLeft: 11 }}><Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>あなた向けのイベントを表示</Text><Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 3 }}>希望条件を設定すると、参加しやすいイベントがホームに届きます</Text></View><IconSymbol name="chevron.right" size={17} color="#D65E8D" /></Pressable>;
  if (!items.length) return null;
  return <View style={{ marginBottom: 16 }}><View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 10 }}><IconSymbol name="sparkles" size={18} color="#D65E8D" /><Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground, marginLeft: 7 }}>あなたへのおすすめ</Text><Pressable onPress={() => router.push("/ai-settings" as any)} style={{ marginLeft: "auto" }}><Text style={{ fontSize: 11, fontWeight: "800", color: "#D65E8D" }}>条件を変更</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>{items.map(({ event, score, reasons }) => <Pressable key={event.id} onPress={() => { void recordActivityEvent({ userId: CURRENT_USER.id, eventName: "recommendation_clicked", entityType: "recommendation", entityId: event.id }); router.push({ pathname: "/event-detail", params: { id: event.id } }); }} style={{ width: 245, backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}><Image source={event.image} style={{ width: 245, height: 110 }} contentFit="cover" /><View style={{ padding: 12 }}><View style={{ flexDirection: "row", alignItems: "center" }}><Text style={{ fontSize: 10, fontWeight: "900", color: "#B44772", backgroundColor: "#FCEAF2", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>おすすめ度 {score}%</Text><Text style={{ marginLeft: "auto", fontSize: 10, color: colors.muted }}>{event.date.slice(5).replace("-", "/")}</Text></View><Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, fontWeight: "900", color: colors.foreground, marginTop: 8 }}>{event.title}</Text><Text numberOfLines={1} style={{ fontSize: 11, color: "#B44772", marginTop: 6 }}>{reasons.slice(0, 2).join("・")}が一致</Text></View></Pressable>)}</ScrollView></View>;
}

const ACTIVITY_PRESENTATION: Record<HomeActivityKind, { icon: string; label: string; color: string }> = {
  announcement: { icon: "megaphone.fill", label: "運営アナウンス", color: "#D56591" },
  event: { icon: "calendar", label: "新規イベント", color: "#4E88B5" },
  contest_thread: { icon: "trophy.fill", label: "グルメ選手権", color: "#B78920" },
  contest_comment: { icon: "bubble.left.fill", label: "グルメ選手権", color: "#B78920" },
  introduction: { icon: "person.fill", label: "自己紹介", color: "#6A8FB3" },
  meal_report: { icon: "fork.knife", label: "今日のごちそうさま報告", color: "#D56591" },
  gourmet_advice: { icon: "sparkles", label: "教えてグルメ相談室", color: "#8C6DB0" },
  free_chat: { icon: "bubble.left.and.bubble.right.fill", label: "なんでも掲示板", color: "#5F9E8C" },
};

function ActivityCard({ activity }: { activity: HomeActivity }) {
  const colors = useColors();
  const router = useRouter();
  const presentation = ACTIVITY_PRESENTATION[activity.kind];
  const activityImages = activity.images ?? (activity.image ? [activity.image] : []);
  const elapsed = Date.now() - Date.parse(activity.createdAt);
  const timeLabel = elapsed < 3_600_000 ? "たった今" : elapsed < 86_400_000 ? `${Math.floor(elapsed / 3_600_000)}時間前` : `${Math.floor(elapsed / 86_400_000)}日前`;
  return <Pressable onPress={() => router.push({ pathname: activity.route as any, params: { ...activity.params, ...(activity.kind === "meal_report" ? { fromHome: "1" } : {}) } } as any)} style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
    {activity.kind === "meal_report" ? <Image source={activity.authorAvatar ? (typeof activity.authorAvatar === "string" ? { uri: activity.authorAvatar } : activity.authorAvatar) : DEFAULT_AVATAR} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" /> : <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: `${presentation.color}18`, alignItems: "center", justifyContent: "center" }}><IconSymbol name={presentation.icon as any} size={20} color={presentation.color} /></View>}
    <View style={{ flex: 1, marginLeft: 11 }}><View style={{ flexDirection: "row", alignItems: "center" }}>{activity.kind === "meal_report" ? <><Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>{activity.authorName ?? "メンバー"}</Text>{activity.authorRank ? <MemberRankBadge rank={activity.authorRank as keyof typeof RANK_LABELS} compact /> : null}<Text style={{ flex: 1, fontSize: 10, fontWeight: "600", color: colors.muted }}>　{activity.authorMemberTerm ?? ""}</Text></> : <Text style={{ flex: 1, fontSize: 11, fontWeight: "800", color: presentation.color }}>{presentation.label}</Text>}<Text style={{ fontSize: 10, color: colors.muted }}>{timeLabel}</Text></View><Text numberOfLines={2} style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginTop: 3 }}>{activity.title}</Text><Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3 }}>{activity.description}</Text>{activityImages.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 9, overflow: "hidden", borderRadius: 12 }}>{activityImages.slice(0, 4).map((image, index) => <View key={index} style={{ width: activityImages.length === 1 ? "100%" : "49%", height: activityImages.length === 1 ? 190 : 104, position: "relative" }}><Image source={typeof image === "string" ? { uri: image } : image} style={{ width: "100%", height: "100%" }} contentFit="cover" />{index === 3 && activityImages.length > 4 ? <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.42)", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#FFF", fontSize: 20, fontWeight: "900" }}>+{activityImages.length - 4}</Text></View> : null}</View>)}</View> : null}{activity.kind === "meal_report" ? <View style={{ flexDirection: "row", alignItems: "center", marginTop: 9 }}><IconSymbol name="bubble.left.fill" size={15} color={colors.muted} /><Text style={{ marginLeft: 5, fontSize: 11, fontWeight: "700", color: colors.muted }}>{activity.commentCount ?? 0}</Text></View> : null}</View>
    <IconSymbol name="chevron.right" size={15} color={colors.muted} style={{ alignSelf: "center", marginLeft: 5 }} />
  </Pressable>;
}

function TodayEventsSection({
  events,
  boardEvents,
}: {
  events: Event[];
  boardEvents: BoardThread[];
}) {
  const colors = useColors();
  const router = useRouter();
  const hasEvents = events.length > 0 || boardEvents.length > 0;

  if (!hasEvents) return null;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <IconSymbol name="calendar" size={18} color="#E8A0BF" />
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginLeft: 6 }}>
          今日のイベント
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {events.map((event) => (
          <Pressable
            key={event.id}
            onPress={() => router.push({ pathname: "/event-detail", params: { id: event.id } })}
            style={{
              width: 220,
              backgroundColor: colors.surface,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <EventImage event={event} style={{ width: 220, height: 100 }} />
            <View style={{ padding: 10 }}>
              <Text
                style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}
                numberOfLines={1}
              >
                {event.title}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                <IconSymbol name="clock.fill" size={12} color="#E8A0BF" />
                <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 4 }}>
                  {event.time}〜
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconSymbol name="mappin.and.ellipse" size={12} color="#E8A0BF" />
                <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 4 }} numberOfLines={1}>
                  {event.location}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                <View
                  style={{
                    backgroundColor: event.status === "full" ? colors.error + "20" : "#E8A0BF20",
                    borderRadius: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: event.status === "full" ? colors.error : "#E8A0BF",
                    }}
                  >
                    {event.status === "full" ? "満席" : `${event.attendees}/${event.capacity}名`}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        ))}

        {boardEvents.map((thread) => (
          <Pressable
            key={thread.id}
            style={{
              width: 220,
              backgroundColor: colors.surface,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <View style={{ backgroundColor: "#A7C7E720", height: 100, justifyContent: "center", alignItems: "center" }}>
              <IconSymbol name="person.2.fill" size={36} color="#A7C7E7" />
              <Text style={{ fontSize: 11, color: "#A7C7E7", fontWeight: "600", marginTop: 4 }}>
                掲示板イベント
              </Text>
            </View>
            <View style={{ padding: 10 }}>
              <Text
                style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}
                numberOfLines={1}
              >
                {thread.title}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconSymbol name="person.badge.plus" size={12} color="#A7C7E7" />
                <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 4 }}>
                  {thread.recruitAttendees}/{thread.recruitCapacity}名参加中
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function RankBadge({ rank, role }: { rank: string; role?: string }) {
  const elevatedRoleLabel = role === "admin" ? "管理者" : role === "operator" ? "運営メンバー" : null;
  const color = RANK_COLORS[rank as keyof typeof RANK_COLORS] || "#C0C0C0";
  const isPlatinum = rank === "platinum";
  const label = RANK_LABELS[rank as keyof typeof RANK_LABELS] || rank;
  return (
    <View
      style={{
        backgroundColor: elevatedRoleLabel ? "#D93636" : isPlatinum ? "#171717" : color + "20",
        borderColor: elevatedRoleLabel ? "#D93636" : isPlatinum ? "#D4AF37" : color,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 1,
        marginLeft: 6,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: elevatedRoleLabel ? "900" : "700", color: elevatedRoleLabel ? "#FFF" : isPlatinum ? "#D4AF37" : color }}>{elevatedRoleLabel ?? label}</Text>
    </View>
  );
}

// Kept temporarily for compatibility with locally restored legacy timeline posts.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TimelinePostCard({ post }: { post: TimelinePost }) {
  const colors = useColors();
  const router = useRouter();
  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<TimelineComment[]>(
    timelineComments.filter((c) => c.postId === post.id),
  );
  const [commentText, setCommentText] = useState("");
  const [commentCount, setCommentCount] = useState(post.comments);

  const timeAgo = useCallback((dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "たった今";
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    return `${days}日前`;
  }, []);

  const handleSendComment = useCallback(() => {
    if (!commentText.trim()) return;
    const newComment: TimelineComment = {
      id: `tc_${Date.now()}`,
      postId: post.id,
      authorName: CURRENT_USER.name,
      authorAvatar: CURRENT_USER.avatar,
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    };
    timelineComments.push(newComment);
    setComments((prev) => [...prev, newComment]);
    setCommentCount((prev) => prev + 1);
    setCommentText("");
  }, [commentText, post.id]);

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      {/* Author row */}
      <Pressable
        onPress={() => router.push({ pathname: "/member-profile", params: { id: post.author.id } })}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}
      >
        <Image
          source={post.author.avatar}
          style={{ width: 40, height: 40, borderRadius: 20 }}
          contentFit="cover"
        />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
              {post.author.name}
            </Text>
            <NewMemberMark member={post.author} />
            <RankBadge rank={post.author.rank} role={post.author.role} />
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
            {post.author.generation}期生 · {timeAgo(post.createdAt)}
          </Text>
        </View>
      </Pressable>

      {/* Content */}
      <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground, marginBottom: 10 }}>
        {post.content}
      </Text>

      {/* Images */}
      {post.images.length > 0 && (
        <View style={{ borderRadius: 12, overflow: "hidden", marginBottom: 10, flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
          {post.images.slice(0, 4).map((image, index) => (
            <Image
              key={`${image}-${index}`}
              source={image}
              style={{ width: post.images.length === 1 ? "100%" : "49.5%", height: post.images.length === 1 ? 200 : 130 }}
              contentFit="cover"
              transition={300}
            />
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          onPress={() => {
            setLiked(!liked);
            setLikeCount(liked ? likeCount - 1 : likeCount + 1);
          }}
          style={{ flexDirection: "row", alignItems: "center", marginRight: 20 }}
        >
          <IconSymbol
            name={liked ? "heart.fill" : "heart"}
            size={20}
            color={liked ? "#E8A0BF" : colors.muted}
          />
          <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 5 }}>{likeCount}</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowComments(!showComments)}
          style={{ flexDirection: "row", alignItems: "center", marginRight: 20 }}
        >
          <IconSymbol name="bubble.left.fill" size={20} color={showComments ? "#E8A0BF" : colors.muted} />
          <Text style={{ fontSize: 13, color: showComments ? "#E8A0BF" : colors.muted, marginLeft: 5 }}>
            {commentCount}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Share.share({
              message: `IRO＋ | ${post.author.name}さんの投稿\n\n${post.content}`,
              title: "IRO＋の投稿をシェア",
            });
          }}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <IconSymbol name="square.and.arrow.up" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {/* コメントセクション */}
      {showComments && (
        <View style={{ marginTop: 12 }}>
          {/* 既存コメント一覧 */}
          {comments.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              {comments.map((c) => (
                <View key={c.id} style={{ flexDirection: "row", marginBottom: 8 }}>
                  <Image
                    source={c.authorAvatar}
                    style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8, marginTop: 2 }}
                    contentFit="cover"
                  />
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: colors.surface,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginBottom: 2 }}>
                      {c.authorName}
                    </Text>
                    <Text style={{ fontSize: 13, lineHeight: 18, color: colors.foreground }}>
                      {c.text}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 3 }}>
                      {timeAgo(c.createdAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
          {comments.length === 0 && (
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10, textAlign: "center" }}>
              まだコメントはありません
            </Text>
          )}
          {/* コメント入力欄 */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface,
                borderRadius: 24,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <Image
                source={CURRENT_USER.avatar}
                style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }}
                contentFit="cover"
              />
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="コメントを入力..."
                placeholderTextColor={colors.muted}
                style={{ flex: 1, fontSize: 14, color: colors.foreground, paddingVertical: 0 }}
                returnKeyType="send"
                onSubmitEditing={handleSendComment}
                multiline={false}
              />
              <Pressable
                onPress={handleSendComment}
                style={{ marginLeft: 8 }}
              >
                <IconSymbol
                  name="paperplane.fill"
                  size={20}
                  color={commentText.trim() ? "#E8A0BF" : colors.muted}
                />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activities, setActivities] = useState<HomeActivity[]>([]);
  const [giftCampaigns, setGiftCampaigns] = useState<GiftCampaign[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [preferences, setPreferences] = useState<MemberPreferences>(() => createDefaultPreferences({ residence: CURRENT_USER.residence, favoriteCuisines: CURRENT_USER.favoriteCuisines }));
  const [aiConsents, setAiConsents] = useState<MemberAiConsents>({ eventRecommendation: false, memberMatching: false, conciergeHistory: false, anonymousImprovement: false, updatedAt: "" });

  const loadHomeContent = useCallback(() => {
    void Api.getNotifications()
      .then((items) => setUnreadNotificationCount(items.filter((item) => !item.read).length))
      .catch(() => setUnreadNotificationCount(0));
    void Promise.all([Api.getHomeActivities().catch(() => getHomeActivities()), getGiftCampaigns(), loadMemberPreferences(CURRENT_USER.id, { residence: CURRENT_USER.residence, favoriteCuisines: CURRENT_USER.favoriteCuisines }), loadMemberAiConsents(CURRENT_USER.id)]).then(([nextActivities, gifts, nextPreferences, nextConsents]) => {
      setActivities(nextActivities);
      setPreferences(nextPreferences); setAiConsents(nextConsents);
      const today = new Date().toISOString().slice(0, 10);
      setGiftCampaigns(gifts.filter((gift) => gift.status === "open" && gift.deadline >= today).sort((a, b) => a.deadline.localeCompare(b.deadline)));
    });
  }, []);

  useFocusEffect(useCallback(() => { loadHomeContent(); }, [loadHomeContent]));

  const { events: todayEvents, boardEvents: todayBoardEvents } = useMemo(
    () => getTodayEvents(),
    [],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHomeContent();
    setTimeout(() => setRefreshing(false), 500);
  }, [loadHomeContent]);

  const timelineItems = useMemo(() => activities
    .filter((activity) => activity.id.startsWith("event:discord-event-") || activity.id.startsWith("thread:discord-board-") || activity.id.startsWith("comment:discord-"))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 10), [activities]);
  const recommendedEvents = useMemo(() => recommendEvents(getAllEvents(EVENTS), preferences, CURRENT_USER.id), [preferences]);
  useEffect(() => { if (!aiConsents.eventRecommendation) return; recommendedEvents.forEach(({ event }) => { void recordActivityEvent({ userId: CURRENT_USER.id, eventName: "recommendation_shown", entityType: "recommendation", entityId: event.id, dedupeKey: `${CURRENT_USER.id}:recommendation_shown:${event.id}:${new Date().toISOString().slice(0, 10)}` }); }); }, [aiConsents.eventRecommendation, recommendedEvents]);

  const ListHeader = useMemo(
    () => (
      <>
        <AnnouncementBanner announcements={ANNOUNCEMENTS} />
        <CampaignSection gifts={giftCampaigns} />
        <RecommendedEventsSection items={recommendedEvents} enabled={aiConsents.eventRecommendation} />
        <TodayEventsSection events={todayEvents} boardEvents={todayBoardEvents} />
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
            タイムライン
          </Text>
        </View>
      </>
    ),
    [todayEvents, todayBoardEvents, giftCampaigns, recommendedEvents, aiConsents.eventRecommendation, colors],
  );

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
          backgroundColor: colors.background,
        }}
      >
        <BrandLogo width={116} compact />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.push("/search" as any)} accessibilityLabel="アプリ内を検索" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#EEF6FB", alignItems: "center", justifyContent: "center" }}><IconSymbol name="magnifyingglass" size={21} color={colors.foreground} /></Pressable>
          <Pressable onPress={() => router.push("/notifications")} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#EEF6FB", alignItems: "center", justifyContent: "center" }}>
            <IconSymbol name="bell.fill" size={22} color={colors.foreground} />
            {unreadNotificationCount > 0 ? <View style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: "#E34E5F", borderWidth: 2, borderColor: colors.background }}><Text style={{ color: "#FFF", fontSize: 9, fontWeight: "900" }}>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</Text></View> : null}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={timelineItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ActivityCard activity={item} />}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#E8A0BF"
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <Pressable
        onPress={() => router.push({ pathname: "/board", params: { compose: "meal-report", fromHome: "1" } })}
        style={{
          position: "absolute",
          bottom: 20,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#18171A",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#8A5D72",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 5,
        }}
      >
        <IconSymbol name="plus" size={27} color="#FFFFFF" />
      </Pressable>
    </ScreenContainer>
  );
}
