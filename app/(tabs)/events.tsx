import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  EVENTS,
  CURRENT_USER,
  DEFAULT_AVATAR,
  getMemberById,
  type Event,
} from "@/constants/mock-data";
import { GOURMET_GENRES } from "@/constants/event-options";
import { useAuthContext } from "@/lib/auth-context";
import { useClubs } from "@/lib/club-store";
import { isAdminRole } from "@/lib/access-control";
import {
  canViewerAccessClubContent,
  getClubViewerAccess,
  resolveViewerMemberId,
} from "@/lib/club-viewer-access";
import { getAllEvents } from "@/lib/event-store";
import { isDiscordRecruitmentOpen } from "@/lib/event-recruitment-channel";
import {
  DEFAULT_EVENT_SORT_ORDER,
  filterAndSortEvents,
  type EventSortOrder,
  type EventTypeFilter,
} from "@/lib/event-filters";
import { getConfirmedRecruitParticipantCount, getEventParticipationStatus } from "@/lib/event-participation";
import {
  toggleEventFavoriteWithNotifications,
  useEventFavorites,
} from "@/lib/event-favorites-store";
import { formatEventArea, TOKYO_EVENT_AREAS } from "@/lib/event-location";
import { displayEventTitle } from "@/lib/event-title";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { EventImage } from "@/components/event-image";
import {
  MemberRankBadge,
  MemberRoleBadge,
  stripRankFromName,
} from "@/components/member-rank-badge";
import { useFocusEffect, useRouter } from "expo-router";
import { useState, useCallback, useMemo } from "react";
import * as Api from "@/lib/_core/api";
import {
  FlatList,
  Pressable,
  Text,
  View,
  RefreshControl,
  Modal,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";

const TYPE_FILTERS = [
  { key: "all", label: "すべて" },
  { key: "official", label: "公式" },
  { key: "gourmet", label: "グルメ会" },
  { key: "club", label: "部活動" },
] as const;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const BUDGET_VALUES = Array.from({ length: 300 }, (_, index) =>
  String((index + 1) * 1000),
);

function BudgetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={{
          flex: 1,
          height: 46,
          borderRadius: 11,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 13, color: colors.foreground }}>
          {value === "none" ? label : `${Number(value).toLocaleString()}円`}
        </Text>
        <IconSymbol name="chevron.down" size={15} color={colors.muted} />
      </Pressable>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 18,
                fontWeight: "900",
                color: colors.foreground,
              }}
            >
              {label}
            </Text>
            <Pressable onPress={() => setVisible(false)}>
              <Text style={{ color: "#9C4F73", fontWeight: "800" }}>
                閉じる
              </Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          >
            <Pressable
              onPress={() => {
                onChange("none");
                setVisible(false);
              }}
              style={{
                paddingVertical: 14,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 15, color: colors.foreground }}>
                {label}
              </Text>
            </Pressable>
            {options.map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  onChange(option);
                  setVisible(false);
                }}
                style={{
                  paddingVertical: 13,
                  borderBottomWidth: 0.5,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 15, color: colors.foreground }}>
                  {Number(option).toLocaleString()}円
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function formatCalendarValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCalendarValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function CalendarDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  const selectedDate = parseCalendarValue(value);
  const [visible, setVisible] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(
    () => selectedDate ?? new Date(),
  );

  const openCalendar = () => {
    setDisplayMonth(selectedDate ?? new Date());
    setVisible(true);
  };

  const calendarDays = useMemo(() => {
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - firstWeekday + 1;
      return day >= 1 && day <= daysInMonth ? new Date(year, month, day) : null;
    });
  }, [displayMonth]);

  return (
    <>
      <Pressable
        onPress={openCalendar}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          flex: 1,
          minWidth: 0,
          height: 46,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#D2D2D6",
          backgroundColor: "#FAFAFB",
          paddingHorizontal: 13,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{ fontSize: 14, color: value ? colors.foreground : "#777" }}
        >
          {value || "未選択"}
        </Text>
        <IconSymbol name="calendar" size={18} color="#777" />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          onPress={() => setVisible(false)}
          style={{
            flex: 1,
            backgroundColor: "#00000055",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={{
              width: "100%",
              maxWidth: 360,
              backgroundColor: colors.surface,
              borderRadius: 22,
              padding: 18,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 18,
              }}
            >
              <Pressable
                accessibilityLabel="前の月"
                onPress={() =>
                  setDisplayMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() - 1,
                        1,
                      ),
                  )
                }
                style={{
                  width: 38,
                  height: 38,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 19,
                  backgroundColor: "#F3F3F6",
                }}
              >
                <IconSymbol
                  name="chevron.left"
                  size={20}
                  color={colors.foreground}
                />
              </Pressable>
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "800",
                    color: colors.foreground,
                  }}
                >
                  {displayMonth.getFullYear()}年 {displayMonth.getMonth() + 1}月
                </Text>
              </View>
              <Pressable
                accessibilityLabel="次の月"
                onPress={() =>
                  setDisplayMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() + 1,
                        1,
                      ),
                  )
                }
                style={{
                  width: 38,
                  height: 38,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 19,
                  backgroundColor: "#F3F3F6",
                }}
              >
                <IconSymbol
                  name="chevron.right"
                  size={20}
                  color={colors.foreground}
                />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {WEEKDAYS.map((day, index) => (
                <Text
                  key={day}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: "700",
                    color:
                      index === 0
                        ? "#D97FA8"
                        : index === 6
                          ? "#6E9EC0"
                          : colors.muted,
                  }}
                >
                  {day}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {calendarDays.map((date, index) => {
                const dateValue = date ? formatCalendarValue(date) : "";
                const selected = Boolean(date && dateValue === value);
                return (
                  <View
                    key={`${dateValue}-${index}`}
                    style={{
                      width: `${100 / 7}%`,
                      alignItems: "center",
                      paddingVertical: 3,
                    }}
                  >
                    {date ? (
                      <Pressable
                        accessibilityLabel={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`}
                        onPress={() => {
                          onChange(dateValue);
                          setVisible(false);
                        }}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: selected ? "#5D5C74" : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: selected ? "800" : "500",
                            color: selected ? "#FFF" : colors.foreground,
                          }}
                        >
                          {date.getDate()}
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={{ width: 36, height: 36 }} />
                    )}
                  </View>
                );
              })}
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 12,
              }}
            >
              {value && (
                <Pressable
                  onPress={() => {
                    onChange("");
                    setVisible(false);
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 9 }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: colors.muted,
                    }}
                  >
                    選択を解除
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setVisible(false)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 10,
                  backgroundColor: "#F0F0F4",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: colors.foreground,
                  }}
                >
                  閉じる
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function StatusBadge({ status, participantsFinalizedAt, discordRecruitment = false }: { status: Event["status"]; participantsFinalizedAt?: string; discordRecruitment?: boolean }) {
  const config = {
    open: discordRecruitment ? { bg: "#EFE9FA", color: "#604C8C", label: "Discord受付" } : { bg: "#34C75920", color: "#34C759", label: "募集中" },
    full: { bg: "#FF950020", color: "#FF9500", label: participantsFinalizedAt ? "募集終了" : "満席" },
    ended: { bg: "#8E8E9320", color: "#8E8E93", label: "終了" },
  };
  const c = config[status];
  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color: c.color }}>
        {c.label}
      </Text>
    </View>
  );
}

function EventCard({
  event,
  onPress,
  isFavorite,
  onToggleFavorite,
  locked = false,
  clubName,
}: {
  event: Event;
  onPress: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  locked?: boolean;
  clubName?: string;
}) {
  const colors = useColors();
  const organizer = getMemberById(event.organizerProfileId ?? event.createdBy);
  const confirmedCount = getConfirmedRecruitParticipantCount(event);
  const participationStatus =
    event.viewerParticipationStatus === "cancel_requested"
      ? "confirmed"
      : (event.viewerParticipationStatus ??
        getEventParticipationStatus(
          event,
          event.viewerMemberId ?? CURRENT_USER.id,
        ));
  const isConfirmed = participationStatus === "confirmed";
  const isApplied = participationStatus === "applied";
  const remainingCapacity = Math.max(event.capacity - confirmedCount, 0);
  const reservationCapacity = event.reservationCapacity ?? event.capacity + 1;
  const locationLabel = formatEventArea(
    event.prefecture,
    event.tokyoArea,
    event.location,
  );
  const isPast = Date.parse(`${event.date}T23:59:59`) < Date.now();
  const cardMuted = locked || isPast;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ];
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return `${months[d.getMonth()]}/${d.getDate()}(${days[d.getDay()]})`;
  };

  return (
    <Pressable
      onPress={onPress}
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: colors.surface,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: "row",
        height: 158,
        opacity: cardMuted ? 0.56 : 1,
      }}
    >
      <View
        style={{
          width: 142,
          height: 158,
          alignSelf: "stretch",
          overflow: "hidden",
        }}
      >
        <EventImage
          event={event}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        />
        {event.eventType === "official" ? (
          <View
            style={{
              position: "absolute",
              left: 7,
              top: 7,
              width: 54,
              height: 36,
              borderRadius: 10,
              backgroundColor: "#FFFFFFF5",
              overflow: "hidden",
              borderWidth: 1.5,
              borderColor: "#E8A0BF",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 4,
            }}
          >
            <Image
              source={require("@/assets/images/irotas-logo-square.png")}
              style={{ width: 54, height: 54, marginTop: -9 }}
              contentFit="cover"
              accessibilityLabel="IROTAS公式"
            />
          </View>
        ) : event.eventType === "club" ? (
          <View
            style={{
              position: "absolute",
              left: 7,
              top: 7,
              borderRadius: 9,
              backgroundColor: "#FFFFFFF2",
              paddingHorizontal: 8,
              paddingVertical: 5,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "900", color: "#4E6756" }}>
              {clubName ?? "部活動イベント"}
            </Text>
          </View>
        ) : null}
        {locked ? (
          <View
            style={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(40,40,40,0.42)",
            }}
          >
            <IconSymbol name="lock.fill" size={28} color="#FFF" />
            <Text
              style={{
                color: "#FFF",
                fontSize: 11,
                fontWeight: "900",
                marginTop: 5,
              }}
            >
              部員限定
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, paddingHorizontal: 11, paddingVertical: 9 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 5,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: "900",
              color: isPast ? "#8E8E93" : colors.foreground,
            }}
          >
            {formatDate(event.date)}
            {locked ? "" : ` ${event.time}`}
          </Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <StatusBadge status={isPast ? "ended" : event.status} participantsFinalizedAt={event.participantsFinalizedAt} discordRecruitment={isDiscordRecruitmentOpen(event)} />
            {isConfirmed ? (
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "900",
                  color: "#FFF",
                  backgroundColor: "#D94C55",
                  borderRadius: 7,
                  paddingHorizontal: 7,
                  paddingVertical: 4,
                }}
              >
                参加確定
              </Text>
            ) : null}
          </View>
        </View>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 14,
            lineHeight: 19,
            fontWeight: "900",
            color: colors.foreground,
          }}
        >
          {displayEventTitle(event.title)}
        </Text>
        {locked ? (
          <Text
            style={{
              fontSize: 11,
              lineHeight: 17,
              fontWeight: "700",
              color: colors.muted,
              marginTop: 8,
            }}
          >
            入部後に日時・場所・参加状況などの詳細を確認できます。
          </Text>
        ) : null}
        {!locked ? (
          <>
            {event.restaurantName && event.restaurantName !== event.title ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  lineHeight: 16,
                  fontWeight: "700",
                  color: colors.foreground,
                  marginTop: 3,
                }}
              >
                {event.restaurantName}
              </Text>
            ) : null}
            <Text
              numberOfLines={1}
              style={{
                fontSize: 10,
                lineHeight: 15,
                color: colors.muted,
                marginTop: 2,
              }}
            >
              {locationLabel}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 5,
              }}
            >
              <Text
                style={{ fontSize: 10, fontWeight: "900", color: "#34A853" }}
              >
                {event.discordRecruitmentClosedAt ? "Discordでの募集は終了" : isDiscordRecruitmentOpen(event) ? "参加者はDiscordで確定" : event.capacityMode ? `募集人数 ${event.capacityMode === "undecided" ? "未定" : "上限なし"} ${event.status === "open" ? "募集中" : ""}` : `${remainingCapacity}名/${reservationCapacity === 0 ? "未定" : `${reservationCapacity}名`} ${event.status === "open" ? "募集中" : ""}`}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 5,
                marginTop: 5,
              }}
            >
              {event.eventType === "official" && event.selectionMethod ? (
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "700",
                    color: colors.muted,
                  }}
                >
                  {event.selectionMethod === "lottery" ? "抽選" : "先着順"}
                </Text>
              ) : null}
              {isApplied ? (
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "900",
                    color: "#3E78A1",
                    backgroundColor: "#E8F2FA",
                    borderRadius: 7,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                  }}
                >
                  申込中
                </Text>
              ) : null}
            </View>
          </>
        ) : null}
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}
        >
          {!locked ? (
            <>
              <Image
                source={event.organizerAvatar ?? organizer?.avatar ?? DEFAULT_AVATAR}
                style={{ width: 18, height: 18, borderRadius: 9 }}
                contentFit="cover"
              />
              <Text
                style={{
                  marginLeft: 5,
                  fontSize: 10,
                  fontWeight: "700",
                  color: colors.muted,
                }}
                numberOfLines={1}
              >
                {stripRankFromName(event.organizerName ?? organizer?.name ?? "メンバー")}
              </Text>
              {event.organizerRank ? <MemberRankBadge rank={event.organizerRank} name={event.organizerName} compact /> : null}
              <MemberRoleBadge name={event.organizerName} role={event.organizerAccessRole} compact />
              {organizer ? (
                <NewMemberMark member={organizer} size={11} />
              ) : null}
            </>
          ) : null}
          <View style={{ flex: 1 }} />
          {!locked ? (
            <Pressable
              onPress={(pressEvent) => {
                pressEvent.stopPropagation?.();
                onToggleFavorite();
              }}
              accessibilityLabel={
                isFavorite ? "お気に入りから削除" : "お気に入りに追加"
              }
              hitSlop={8}
              style={{ paddingHorizontal: 4, paddingVertical: 2 }}
            >
              <IconSymbol
                name={isFavorite ? "heart.fill" : "heart"}
                size={20}
                color={isFavorite ? "#D85B86" : colors.muted}
              />
            </Pressable>
          ) : (
            <Text
              style={{ fontSize: 9, fontWeight: "800", color: colors.muted }}
            >
              入部すると詳細を表示
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function EventsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [eventType, setEventType] = useState<EventTypeFilter>("all");
  // 新規作成したイベントも、募集前・満席などの状態に関係なく一覧で見つけられる。
  const [openOnly, setOpenOnly] = useState(false);
  const [hostedByMe, setHostedByMe] = useState(false);
  const [appliedOnly, setAppliedOnly] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [joinedClubOnly, setJoinedClubOnly] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<EventSortOrder>(
    DEFAULT_EVENT_SORT_ORDER,
  );
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [migrationNoticeVisible, setMigrationNoticeVisible] = useState(false);
  const [detailSearchVisible, setDetailSearchVisible] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState("none");
  const [budgetMax, setBudgetMax] = useState("none");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventsLoadFailed, setEventsLoadFailed] = useState(false);
  const favoriteEventIds = useEventFavorites();
  const effectiveFavoriteEventIds = useMemo(
    () => [
      ...new Set([
        ...favoriteEventIds,
        ...allEvents
          .filter((event) => event.isFavorite)
          .map((event) => event.id),
      ]),
    ],
    [allEvents, favoriteEventIds],
  );
  const { user: authUser } = useAuthContext();
  const clubs = useClubs();
  // Hydration before the authenticated profile arrives must not hide the create affordance.
  // The create screen/API still requires an authenticated member before saving.
  const canCreateEvent = true;
  const viewerMemberId = resolveViewerMemberId(
    authUser?.memberId,
    Boolean(authUser),
    CURRENT_USER.id,
  );
  const userIsAdmin = isAdminRole(authUser?.role, authUser?.accessRole);
  const canAccessClubEvent = useCallback(
    (clubId?: string) => {
      const club = clubs.find((candidate) => candidate.id === clubId);
      return Boolean(
        club &&
        canViewerAccessClubContent(
          club,
          authUser?.memberId,
          CURRENT_USER.id,
          userIsAdmin,
        ),
      );
    },
    [authUser?.memberId, clubs, userIsAdmin],
  );

  const refreshEvents = useCallback(async () => {
    if (!authUser) {
      return;
    }
    try {
      const { events: databaseEvents } = await Api.getEventsWithDeletedImportedIds();
      const importedById = new Map(getAllEvents(EVENTS).map((event) => [event.id, event]));
      setAllEvents([
        ...databaseEvents.map((event) => {
          const imported = importedById.get(event.id);
          return imported ? { ...event, organizerProfileId: imported.organizerProfileId || event.organizerProfileId, organizerName: imported.organizerName || event.organizerName, organizerAvatar: imported.organizerAvatar || event.organizerAvatar, organizerRank: imported.organizerRank || event.organizerRank } : event;
        }),
      ]);
      setEventsLoadFailed(false);
    } catch {
      setEventsLoadFailed(true);
    } finally {
      setEventsLoaded(true);
    }
  }, [authUser]);

  useFocusEffect(
    useCallback(() => {
      void refreshEvents();
    }, [refreshEvents]),
  );
  const filteredEvents = useMemo(
    () =>
      filterAndSortEvents(allEvents, {
        area: "all",
        eventType,
        openOnly,
        startDate,
        endDate,
        sortOrder,
        hostedByMemberId: hostedByMe ? viewerMemberId : undefined,
        participatingMemberId:
          appliedOnly || confirmedOnly ? viewerMemberId : undefined,
        participationStatuses: [
          appliedOnly ? ("applied" as const) : null,
          confirmedOnly ? ("confirmed" as const) : null,
        ].filter((value): value is "applied" | "confirmed" => value !== null),
        favoriteOnly,
        favoriteEventIds: effectiveFavoriteEventIds,
        genres: selectedGenres,
        budgetMin: budgetMin === "none" ? undefined : Number(budgetMin),
        budgetMax: budgetMax === "none" ? undefined : Number(budgetMax),
        areas: selectedAreas,
        keyword,
        joinedClubOnly: eventType === "club" && joinedClubOnly,
        joinedClubIds: clubs
          .filter(
            (club) =>
              getClubViewerAccess(club, authUser?.memberId, CURRENT_USER.id)
                .isMember,
          )
          .map((club) => club.id),
      }),
    [
      allEvents,
      eventType,
      openOnly,
      startDate,
      endDate,
      sortOrder,
      hostedByMe,
      appliedOnly,
      confirmedOnly,
      favoriteOnly,
      effectiveFavoriteEventIds,
      selectedGenres,
      budgetMin,
      budgetMax,
      selectedAreas,
      keyword,
      joinedClubOnly,
      clubs,
      authUser?.memberId,
      viewerMemberId,
    ],
  );
  // 公式イベントの開催済み分は通常のイベント一覧には表示しない。管理画面・DBには残す。
  const visibleEvents = useMemo(() => filteredEvents.filter((event) =>
    event.eventType !== "official" || Date.parse(`${event.date}T23:59:59`) >= Date.now(),
  ), [filteredEvents]);
  const firstPastEventIndex = useMemo(
    () => visibleEvents.findIndex((event) => Date.parse(`${event.date}T23:59:59`) < Date.now()),
    [visibleEvents],
  );

  const eventTypeLabel =
    eventType === "official"
      ? "公式イベント"
      : eventType === "gourmet"
        ? "グルメ会"
        : eventType === "club"
          ? "部活動イベント"
          : "すべてのイベント";
  const detailFilterCount =
    selectedGenres.length +
    selectedAreas.length +
    (budgetMin !== "none" ? 1 : 0) +
    (budgetMax !== "none" ? 1 : 0) +
    (keyword.trim() ? 1 : 0) +
    (favoriteOnly ? 1 : 0);

  const resetSearchConditions = useCallback(() => {
    setEventType("all");
    setOpenOnly(false);
    setHostedByMe(false);
    setAppliedOnly(false);
    setConfirmedOnly(false);
    setJoinedClubOnly(false);
    setFavoriteOnly(false);
    setSortOrder(DEFAULT_EVENT_SORT_ORDER);
    setSelectedGenres([]);
    setBudgetMin("none");
    setBudgetMax("none");
    setSelectedAreas([]);
    setKeyword("");
    setStartDate("");
    setEndDate("");
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshEvents();
    setRefreshing(false);
  }, [refreshEvents]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: colors.background,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            fontWeight: "800",
            color: colors.foreground,
            letterSpacing: -0.5,
          }}
        >
          イベント
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="イベントの移行について"
          onPress={() => setMigrationNoticeVisible(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 8 }}
        >
          <IconSymbol name="info.circle.fill" size={19} color="#C05B88" />
          <Text style={{ color: "#C05B88", fontSize: 13, fontWeight: "700" }}>イベントの移行について</Text>
        </Pressable>
      </View>

      <FlatList
        data={visibleEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View>
            {index === firstPastEventIndex ? (
              <View
                style={{
                  marginHorizontal: 16,
                  marginTop: 18,
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "900",
                    color: colors.foreground,
                  }}
                >
                  過去イベント
                </Text>
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border,
                    marginTop: 9,
                  }}
                />
              </View>
            ) : null}
            <EventCard
              event={item}
              isFavorite={item.isFavorite ?? favoriteEventIds.includes(item.id)}
              onToggleFavorite={() => {
                const favorite =
                  item.isFavorite ?? favoriteEventIds.includes(item.id);
                if (item.viewerMemberId) {
                  setAllEvents((current) =>
                    current.map((event) =>
                      event.id === item.id
                        ? { ...event, isFavorite: !favorite }
                        : event,
                    ),
                  );
                  void Api.setEventFavorite(item.id, !favorite).catch(
                    (error) => {
                      setAllEvents((current) =>
                        current.map((event) =>
                          event.id === item.id
                            ? { ...event, isFavorite: favorite }
                            : event,
                        ),
                      );
                      Alert.alert(
                        "更新できませんでした",
                        error instanceof Error
                          ? error.message
                          : "もう一度お試しください。",
                      );
                    },
                  );
                } else {
                  void toggleEventFavoriteWithNotifications(
                    item,
                    CURRENT_USER.id,
                  );
                }
              }}
              locked={Boolean(
                item.lockedClubEvent ||
                (item.eventType === "club" && !canAccessClubEvent(item.clubId)),
              )}
              clubName={clubs.find((club) => club.id === item.clubId)?.name}
              onPress={() => {
                const club = clubs.find(
                  (candidate) => candidate.id === item.clubId,
                );
                if (
                  item.lockedClubEvent ||
                  (item.eventType === "club" &&
                    !canAccessClubEvent(item.clubId))
                ) {
                  Alert.alert(
                    "部員限定イベント",
                    `${club?.name ?? "この部活動"}に入部すると、詳細の確認と参加申込ができます。`,
                  );
                  return;
                }
                router.push({
                  pathname: "/event-detail",
                  params: { id: item.id },
                });
              }}
            />
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#E8A0BF"
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 92 }}
        ListHeaderComponent={
          <View
            style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}
          >
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  backgroundColor: "#F0F0F4",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {TYPE_FILTERS.map((filter, index) => {
                  const selected = eventType === filter.key;
                  return (
                    <Pressable
                      key={filter.key}
                      onPress={() => {
                        setEventType(filter.key);
                        if (filter.key !== "club") setJoinedClubOnly(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        flex: 1,
                        minHeight: 48,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: selected ? "#5D5C74" : "transparent",
                        borderLeftWidth: index > 0 ? 1 : 0,
                        borderLeftColor: selected ? "transparent" : "#E0E0E5",
                        paddingHorizontal: 4,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: selected ? "#FFF" : "#17172D",
                        }}
                      >
                        {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                onPress={() => setSortMenuVisible(true)}
                accessibilityLabel="並び順を変更"
                style={{
                  width: 96,
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#F0F0F4",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#D2D2D6",
                }}
              >
                <Text style={{ fontSize: 14, color: "#333", marginRight: 5 }}>
                  {sortOrder === "date" ? "開催日順" : "新着順"}
                </Text>
                <IconSymbol name="chevron.down" size={17} color="#666" />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 5, marginBottom: 14 }}>
              {[
                {
                  label: "空席あり",
                  value: openOnly,
                  toggle: () => setOpenOnly((current) => !current),
                },
                {
                  label: "幹事",
                  value: hostedByMe,
                  toggle: () => setHostedByMe((current) => !current),
                },
                {
                  label: "参加申込中",
                  value: appliedOnly,
                  toggle: () => setAppliedOnly((current) => !current),
                },
                {
                  label: "参加確定",
                  value: confirmedOnly,
                  toggle: () => setConfirmedOnly((current) => !current),
                },
              ].map((filter) => (
                <Pressable
                  key={filter.label}
                  onPress={filter.toggle}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: filter.value }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: 19,
                      height: 19,
                      borderRadius: 4,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: filter.value ? "#5D5C74" : "#E4E4E7",
                      marginRight: 4,
                    }}
                  >
                    {filter.value && (
                      <IconSymbol name="checkmark" size={13} color="#FFF" />
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: colors.foreground,
                    }}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {eventType === "club" ? (
              <Pressable
                onPress={() => setJoinedClubOnly((current) => !current)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: joinedClubOnly }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: -5,
                  marginBottom: 14,
                }}
              >
                <View
                  style={{
                    width: 19,
                    height: 19,
                    borderRadius: 4,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: joinedClubOnly ? "#5D5C74" : "#E4E4E7",
                    marginRight: 6,
                  }}
                >
                  {joinedClubOnly && (
                    <IconSymbol name="checkmark" size={13} color="#FFF" />
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: colors.foreground,
                  }}
                >
                  参加中の部活動
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => setDetailSearchVisible(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 11,
                borderWidth: 1,
                borderColor: "#D2D2D6",
                backgroundColor: "#FAFAFB",
                paddingVertical: 11,
                marginBottom: 16,
              }}
            >
              <IconSymbol
                name="line.3.horizontal.decrease.circle"
                size={18}
                color="#5D5C74"
              />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "800",
                  color: "#5D5C74",
                  marginLeft: 7,
                }}
              >
                詳細検索
                {detailFilterCount ? `（${detailFilterCount}件指定）` : ""}
              </Text>
            </Pressable>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottomWidth: 1,
                borderBottomColor: "#EAE6D8",
                paddingBottom: 10,
              }}
            >
              <Text
                style={{ flex: 1, fontSize: 13, color: colors.muted }}
                numberOfLines={1}
              >
                表示内容:{" "}
                <Text style={{ fontWeight: "800", color: colors.foreground }}>
                  {eventTypeLabel}{" "}
                  {sortOrder === "date" ? "開催日順" : "新着順"}
                </Text>
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "800",
                  color: colors.foreground,
                  marginLeft: 10,
                }}
              >
                {eventsLoaded ? `全${visibleEvents.length}件` : "読込中"}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <IconSymbol name="calendar" size={48} color={colors.border} />
            <Text style={{ fontSize: 15, color: colors.muted, marginTop: 12 }}>
              {eventsLoadFailed ? "イベントを読み込めませんでした。画面を下に引いて再読み込みしてください。" : eventsLoaded ? "イベントがありません" : "イベントを読み込んでいます"}
            </Text>
            {hostedByMe ? (
              <Text
                style={{
                  maxWidth: 300,
                  textAlign: "center",
                  fontSize: 13,
                  lineHeight: 20,
                  color: colors.muted,
                  marginTop: 10,
                }}
              >
                新規でイベントを企画する場合は、右下の＋ボタンから募集ができます。
              </Text>
            ) : null}
          </View>
        }
      />

      {canCreateEvent ? (
        <Pressable
          onPress={() => router.push("/create-event")}
          style={{
            position: "absolute",
            right: 20,
            bottom: 108,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#18171A",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.22,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <IconSymbol name="plus" size={27} color="#FFF" />
        </Pressable>
      ) : null}

      <Modal visible={migrationNoticeVisible} transparent animationType="fade" onRequestClose={() => setMigrationNoticeVisible(false)}>
        <Pressable onPress={() => setMigrationNoticeVisible(false)} style={{ flex: 1, backgroundColor: "#0006", justifyContent: "center", paddingHorizontal: 24 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.background, borderRadius: 18, padding: 22, maxHeight: "85%" }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 12 }}>イベントの移行について</Text>
            <ScrollView showsVerticalScrollIndicator>
              <Text style={{ fontSize: 14, lineHeight: 23, color: colors.foreground }}>IRO+は、これまで利用していたDiscordから本アプリへ移行します。{"\n"}まずは、9/13よりWeb版を公開します。 初期はスマホのブラウザからご利用いただき、今後順次アプリへ移行する予定です。</Text>
              <Text style={{ fontSize: 14, lineHeight: 23, color: colors.foreground, marginTop: 16 }}>■ データ移行について{"\n"}Discord内の投稿・イベントなどは、順次アプリへ移行中です。{"\n"}※移行後も、Discordは年内まで閲覧可能です。</Text>
              <Text style={{ fontSize: 14, lineHeight: 23, color: colors.foreground, marginTop: 16 }}>■ イベント募集について{"\n"}<Text style={{ fontWeight: "800" }}>9/12以前</Text>に既にDiscordで募集を開始していたイベントは、引き続きDiscord内で募集・参加者の確定を行います。{"\n"}<Text style={{ fontWeight: "800" }}>9/13以降</Text>に新規作成するイベントはアプリ側で募集を行ってください。</Text>
            </ScrollView>
            <Pressable onPress={() => setMigrationNoticeVisible(false)} style={{ alignSelf: "flex-end", marginTop: 20, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ color: "#C05B88", fontWeight: "800" }}>閉じる</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={sortMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuVisible(false)}
      >
        <Pressable
          onPress={() => setSortMenuVisible(false)}
          style={{
            flex: 1,
            backgroundColor: "#0005",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 330,
              backgroundColor: colors.surface,
              borderRadius: 18,
              padding: 10,
            }}
          >
            {(["date", "newest"] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => {
                  setSortOrder(value);
                  setSortMenuVisible(false);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 15,
                  borderRadius: 12,
                  backgroundColor:
                    sortOrder === value ? "#F0E7EC" : "transparent",
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontWeight: "700",
                    color: colors.foreground,
                  }}
                >
                  {value === "date" ? "開催日順" : "新着順"}
                </Text>
                {sortOrder === value ? (
                  <IconSymbol name="checkmark" size={18} color="#9C4F73" />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={detailSearchVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailSearchVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 19,
                fontWeight: "900",
                color: colors.foreground,
              }}
            >
              イベント詳細検索
            </Text>
            <Pressable
              onPress={resetSearchConditions}
              style={{ marginRight: 15 }}
            >
              <Text style={{ color: colors.muted, fontWeight: "700" }}>
                リセット
              </Text>
            </Pressable>
            <Pressable onPress={() => setDetailSearchVisible(false)}>
              <Text style={{ color: "#9C4F73", fontWeight: "800" }}>
                結果を表示
              </Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: colors.foreground,
                marginBottom: 10,
              }}
            >
              開催期間
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
                marginBottom: 24,
              }}
            >
              <CalendarDateField
                value={startDate}
                onChange={setStartDate}
                label="開始日"
              />
              <Text style={{ fontSize: 19, color: colors.foreground }}>〜</Text>
              <CalendarDateField
                value={endDate}
                onChange={setEndDate}
                label="終了日"
              />
            </View>
            <Pressable
              onPress={() => setFavoriteOnly((current) => !current)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: favoriteOnly }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                marginBottom: 20,
                borderRadius: 12,
                backgroundColor: favoriteOnly ? "#FCEAF2" : colors.surface,
                borderWidth: 1,
                borderColor: favoriteOnly ? "#D85B86" : colors.border,
              }}
            >
              <IconSymbol
                name={favoriteOnly ? "heart.fill" : "heart"}
                size={20}
                color={favoriteOnly ? "#D85B86" : colors.muted}
              />
              <Text
                style={{
                  flex: 1,
                  marginLeft: 9,
                  fontSize: 14,
                  fontWeight: "800",
                  color: colors.foreground,
                }}
              >
                お気に入りだけ表示
              </Text>
              {favoriteOnly ? (
                <IconSymbol name="checkmark" size={17} color="#D85B86" />
              ) : null}
            </Pressable>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: colors.foreground,
                marginBottom: 10,
              }}
            >
              自由ワード
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 12,
                marginBottom: 24,
              }}
            >
              <IconSymbol
                name="magnifyingglass"
                size={18}
                color={colors.muted}
              />
              <TextInput
                value={keyword}
                onChangeText={setKeyword}
                placeholder="店名・イベント名・住所・ジャンル"
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: colors.foreground,
                  paddingVertical: 12,
                  marginLeft: 7,
                }}
              />
              {keyword ? (
                <Pressable onPress={() => setKeyword("")}>
                  <IconSymbol name="xmark" size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>

            <View
              pointerEvents="none"
              style={{
                opacity: 0.52,
                backgroundColor: "#E3E3E6",
                borderRadius: 14,
                padding: 12,
              }}
            >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: colors.foreground,
                }}
              >
                エリア
              </Text>
              <Pressable
                disabled={!selectedAreas.length}
                onPress={() => setSelectedAreas([])}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: selectedAreas.length ? "#9C4F73" : colors.border,
                  }}
                >
                  選択解除
                </Text>
              </Pressable>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 7,
                marginBottom: 24,
              }}
            >
              {TOKYO_EVENT_AREAS.map((area) => {
                const value = `tokyo:${area.key}`;
                const selected = selectedAreas.includes(value);
                return (
                  <Pressable
                    key={area.key}
                    onPress={() =>
                      setSelectedAreas((current) =>
                        selected
                          ? current.filter((item) => item !== value)
                          : [...current, value],
                      )
                    }
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 15,
                      backgroundColor: selected ? "#E9D4DE" : colors.surface,
                      borderWidth: 1,
                      borderColor: selected ? "#9C4F73" : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: selected ? "#9C4F73" : colors.foreground,
                      }}
                    >
                      {area.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: colors.foreground,
                }}
              >
                グルメジャンル
              </Text>
              <Pressable
                disabled={!selectedGenres.length}
                onPress={() => setSelectedGenres([])}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: selectedGenres.length ? "#9C4F73" : colors.border,
                  }}
                >
                  選択解除
                </Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {GOURMET_GENRES.map((genre) => {
                const selected = selectedGenres.includes(genre);
                return (
                  <Pressable
                    key={genre}
                    onPress={() =>
                      setSelectedGenres((current) =>
                        selected
                          ? current.filter((item) => item !== genre)
                          : [...current, genre],
                      )
                    }
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 18,
                      backgroundColor: selected ? "#5D5C74" : colors.surface,
                      borderWidth: 1,
                      borderColor: selected ? "#5D5C74" : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: selected ? "#FFF" : colors.foreground,
                      }}
                    >
                      {genre}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 26,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: colors.foreground,
                }}
              >
                予算
              </Text>
              <Pressable
                disabled={budgetMin === "none" && budgetMax === "none"}
                onPress={() => {
                  setBudgetMin("none");
                  setBudgetMax("none");
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color:
                      budgetMin !== "none" || budgetMax !== "none"
                        ? "#9C4F73"
                        : colors.border,
                  }}
                >
                  選択解除
                </Text>
              </Pressable>
            </View>
            <Text
              style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}
            >
              1,000円単位で下限・上限を指定できます
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <BudgetSelect
                label="下限なし"
                value={budgetMin}
                options={BUDGET_VALUES}
                onChange={setBudgetMin}
              />
              <Text style={{ color: colors.muted }}>〜</Text>
              <BudgetSelect
                label="上限なし"
                value={budgetMax}
                options={BUDGET_VALUES}
                onChange={setBudgetMax}
              />
            </View>
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 24,
                  borderRadius: 14,
                  backgroundColor: "rgba(71, 71, 76, 0.88)",
                }}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: "800",
                    textAlign: "center",
                    lineHeight: 21,
                  }}
                >
                  以下機能は現在準備中のためご利用いただけません
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
