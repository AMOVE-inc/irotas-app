import { ScreenContainer } from "@/components/screen-container";
import { NewMemberMark } from "@/components/new-member-mark";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { EVENTS, CURRENT_USER, DEFAULT_AVATAR, getMemberById, type Event } from "@/constants/mock-data";
import { GOURMET_GENRES } from "@/constants/event-options";
import { EVENT_SEARCH_AREA_GROUPS } from "@/constants/event-areas";
import { useAuthContext } from "@/lib/auth-context";
import { getAllEvents } from "@/lib/event-store";
import { DEFAULT_EVENT_SORT_ORDER, filterAndSortEvents, type EventSortOrder, type EventTypeFilter } from "@/lib/event-filters";
import { getEventParticipationStatus } from "@/lib/event-participation";
import { toggleEventFavorite, useEventFavorites } from "@/lib/event-favorites-store";
import { formatEventArea, TOKYO_EVENT_AREAS } from "@/lib/event-location";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useState, useCallback, useMemo } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  RefreshControl,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";

const TYPE_FILTERS = [
  { key: "all", label: "すべて" },
  { key: "official", label: "公式イベント" },
  { key: "gourmet", label: "グルメ会" },
] as const;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const BUDGET_VALUES = Array.from({ length: 300 }, (_, index) => String((index + 1) * 1000));

function BudgetSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return <><Pressable onPress={() => setVisible(true)} style={{ flex: 1, height: 46, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ fontSize: 13, color: colors.foreground }}>{value === "none" ? label : `${Number(value).toLocaleString()}円`}</Text><IconSymbol name="chevron.down" size={15} color={colors.muted} /></Pressable><Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}><View style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 18, fontWeight: "900", color: colors.foreground }}>{label}</Text><Pressable onPress={() => setVisible(false)}><Text style={{ color: "#9C4F73", fontWeight: "800" }}>閉じる</Text></Pressable></View><ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}><Pressable onPress={() => { onChange("none"); setVisible(false); }} style={{ paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ fontSize: 15, color: colors.foreground }}>{label}</Text></Pressable>{options.map((option) => <Pressable key={option} onPress={() => { onChange(option); setVisible(false); }} style={{ paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ fontSize: 15, color: colors.foreground }}>{Number(option).toLocaleString()}円</Text></Pressable>)}</ScrollView></View></Modal></>;
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
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
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
  const [displayMonth, setDisplayMonth] = useState(() => selectedDate ?? new Date());

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
        <Text style={{ fontSize: 14, color: value ? colors.foreground : "#777" }}>
          {value || "未選択"}
        </Text>
        <IconSymbol name="calendar" size={18} color="#777" />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable
          onPress={() => setVisible(false)}
          style={{ flex: 1, backgroundColor: "#00000055", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={{ width: "100%", maxWidth: 360, backgroundColor: colors.surface, borderRadius: 22, padding: 18 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <Pressable
                accessibilityLabel="前の月"
                onPress={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: "#F3F3F6" }}
              >
                <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
              </Pressable>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2 }}>{label}</Text>
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground }}>
                  {displayMonth.getFullYear()}年 {displayMonth.getMonth() + 1}月
                </Text>
              </View>
              <Pressable
                accessibilityLabel="次の月"
                onPress={() => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: "#F3F3F6" }}
              >
                <IconSymbol name="chevron.right" size={20} color={colors.foreground} />
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
                    color: index === 0 ? "#D97FA8" : index === 6 ? "#6E9EC0" : colors.muted,
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
                  <View key={`${dateValue}-${index}`} style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 3 }}>
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
                        <Text style={{ fontSize: 14, fontWeight: selected ? "800" : "500", color: selected ? "#FFF" : colors.foreground }}>
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

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
              {value && (
                <Pressable
                  onPress={() => {
                    onChange("");
                    setVisible(false);
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 9 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.muted }}>選択を解除</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setVisible(false)}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: "#F0F0F4" }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>閉じる</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function StatusBadge({ status }: { status: Event["status"] }) {
  const config = {
    open: { bg: "#34C75920", color: "#34C759", label: "受付中" },
    full: { bg: "#FF950020", color: "#FF9500", label: "満席" },
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
      <Text style={{ fontSize: 11, fontWeight: "700", color: c.color }}>{c.label}</Text>
    </View>
  );
}

function EventCard({ event, onPress, isFavorite, onToggleFavorite }: { event: Event; onPress: () => void; isFavorite: boolean; onToggleFavorite: () => void }) {
  const colors = useColors();
  const organizer = getMemberById(event.createdBy);
  const confirmedCount = new Set([...(event.participants ?? []), ...(event.companionIds ?? [])]).size;
  const participationStatus = getEventParticipationStatus(event, CURRENT_USER.id);
  const isConfirmed = participationStatus === "confirmed";
  const isApplied = participationStatus === "applied";
  const remainingCapacity = Math.max(event.capacity - confirmedCount, 0);
  const reservationCapacity = event.reservationCapacity ?? event.capacity + 1;
  const locationLabel = formatEventArea(event.prefecture, event.tokyoArea, event.location);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
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
        minHeight: 142,
      }}
    >
      <View style={{ width: 142, height: 142 }}><Image source={event.image} style={{ width: 142, height: 142 }} contentFit="cover" transition={300} />{event.eventType === "official" ? <View style={{ position: "absolute", left: 7, top: 7, flexDirection: "row", alignItems: "center", minHeight: 30, borderRadius: 10, backgroundColor: "#FFFFFFF5", paddingHorizontal: 9, borderWidth: 2, borderColor: "#E8A0BF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}><Text style={{ fontSize: 11, fontWeight: "900", color: "#171717", letterSpacing: 0.4 }}>IRO+</Text><Text style={{ marginLeft: 4, fontSize: 10, fontWeight: "900", color: "#C94F84" }}>公式</Text></View> : null}</View>
      <View style={{ flex: 1, paddingHorizontal: 11, paddingVertical: 9 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "900", color: colors.foreground }}>{formatDate(event.date)} {event.time}</Text>
          <View style={{ flexDirection: "row", gap: 4 }}><StatusBadge status={event.status} />{isConfirmed ? <Text style={{ fontSize: 9, fontWeight: "900", color: "#FFF", backgroundColor: "#D94C55", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 }}>参加確定</Text> : null}</View>
        </View>
        <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "900", color: colors.foreground }}>{event.title}</Text>
        {event.restaurantName && event.restaurantName !== event.title ? <Text style={{ fontSize: 11, lineHeight: 16, fontWeight: "700", color: colors.foreground, marginTop: 3 }}>店名：{event.restaurantName}</Text> : null}
        <Text style={{ fontSize: 10, lineHeight: 15, color: colors.muted, marginTop: 2 }}>場所：{locationLabel}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}>
          <Text style={{ fontSize: 10, fontWeight: "900", color: "#34A853" }}>{remainingCapacity}名/{reservationCapacity}名 {event.status === "open" ? "募集中" : ""}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
          {event.selectionMethod ? <Text style={{ fontSize: 9, fontWeight: "700", color: colors.muted }}>{event.selectionMethod === "lottery" ? "抽選" : "先着順"}</Text> : null}
          {isApplied ? <Text style={{ fontSize: 9, fontWeight: "900", color: "#3E78A1", backgroundColor: "#E8F2FA", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>申込中</Text> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}>
          <Image source={event.eventType === "official" ? DEFAULT_AVATAR : (organizer?.avatar ?? DEFAULT_AVATAR)} style={{ width: 18, height: 18, borderRadius: 9 }} contentFit="cover" />
          <Text style={{ marginLeft: 5, fontSize: 10, fontWeight: "700", color: colors.muted }} numberOfLines={1}>{event.eventType === "official" ? "IRO＋運営" : (organizer?.name ?? "メンバー")}</Text>
          {event.eventType !== "official" && organizer ? <NewMemberMark member={organizer} size={11} /> : null}
          <View style={{ flex: 1 }} />
          <Pressable onPress={(pressEvent) => { pressEvent.stopPropagation?.(); onToggleFavorite(); }} accessibilityLabel={isFavorite ? "お気に入りから削除" : "お気に入りに追加"} hitSlop={8} style={{ paddingHorizontal: 4, paddingVertical: 2 }}><IconSymbol name={isFavorite ? "heart.fill" : "heart"} size={20} color={isFavorite ? "#D85B86" : colors.muted} /></Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default function EventsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [eventType, setEventType] = useState<EventTypeFilter>("all");
  const [openOnly, setOpenOnly] = useState(false);
  const [hostedByMe, setHostedByMe] = useState(false);
  const [appliedOnly, setAppliedOnly] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<EventSortOrder>(DEFAULT_EVENT_SORT_ORDER);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [detailSearchVisible, setDetailSearchVisible] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState("none");
  const [budgetMax, setBudgetMax] = useState("none");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [allEvents, setAllEvents] = useState<Event[]>(() => getAllEvents(EVENTS));
  const favoriteEventIds = useEventFavorites();
  const { user: authUser } = useAuthContext();
  const canCreateEvent = Boolean(authUser);

  useFocusEffect(useCallback(() => {
    setAllEvents([...getAllEvents(EVENTS)]);
  }, []));
  const filteredEvents = useMemo(
    () => filterAndSortEvents(allEvents, {
      area: "all",
      eventType,
      openOnly,
      startDate,
      endDate,
      sortOrder,
      hostedByMemberId: hostedByMe ? CURRENT_USER.id : undefined,
      participatingMemberId: appliedOnly || confirmedOnly ? CURRENT_USER.id : undefined,
      participationStatuses: [appliedOnly ? "applied" as const : null, confirmedOnly ? "confirmed" as const : null].filter((value): value is "applied" | "confirmed" => value !== null),
      favoriteOnly,
      favoriteEventIds,
      genres: selectedGenres,
      budgetMin: budgetMin === "none" ? undefined : Number(budgetMin),
      budgetMax: budgetMax === "none" ? undefined : Number(budgetMax),
      areas: selectedAreas,
      keyword,
    }),
    [allEvents, eventType, openOnly, startDate, endDate, sortOrder, hostedByMe, appliedOnly, confirmedOnly, favoriteOnly, favoriteEventIds, selectedGenres, budgetMin, budgetMax, selectedAreas, keyword],
  );

  const eventTypeLabel = eventType === "official"
    ? "公式イベント"
    : eventType === "gourmet"
      ? "グルメ会"
      : "すべてのイベント";
  const detailFilterCount = selectedGenres.length + selectedAreas.length + (budgetMin !== "none" ? 1 : 0) + (budgetMax !== "none" ? 1 : 0) + (keyword.trim() ? 1 : 0) + (favoriteOnly ? 1 : 0);

  const resetSearchConditions = useCallback(() => {
    setEventType("all"); setOpenOnly(false); setHostedByMe(false); setAppliedOnly(false); setConfirmedOnly(false); setFavoriteOnly(false); setSortOrder(DEFAULT_EVENT_SORT_ORDER);
    setSelectedGenres([]); setBudgetMin("none"); setBudgetMax("none"); setSelectedAreas([]); setKeyword(""); setStartDate(""); setEndDate("");
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

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
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, letterSpacing: -0.5 }}>
          イベント
        </Text>
      </View>

      <FlatList
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard event={item} isFavorite={favoriteEventIds.includes(item.id)} onToggleFavorite={() => toggleEventFavorite(item.id)} onPress={() => router.push({ pathname: "/event-detail", params: { id: item.id } })} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8A0BF" />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 92 }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}>
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
                      onPress={() => setEventType(filter.key)}
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
                        style={{ fontSize: 12, fontWeight: "700", color: selected ? "#FFF" : "#17172D" }}
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
                <Text style={{ fontSize: 14, color: "#333", marginRight: 5 }}>{sortOrder === "date" ? "開催日順" : "新着順"}</Text>
                <IconSymbol name="chevron.down" size={17} color="#666" />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>期間</Text>
              <Pressable onPress={resetSearchConditions}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: colors.primary,
                    textDecorationLine: "underline",
                  }}
                >
                  検索条件をリセット
                </Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 14 }}>
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

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
              {[
                { label: "空席あり", value: openOnly, toggle: () => setOpenOnly((current) => !current) },
                { label: "幹事", value: hostedByMe, toggle: () => setHostedByMe((current) => !current) },
                { label: "参加申込中", value: appliedOnly, toggle: () => setAppliedOnly((current) => !current) },
                { label: "参加確定済み", value: confirmedOnly, toggle: () => setConfirmedOnly((current) => !current) },
              ].map((filter) => (
                <Pressable key={filter.label} onPress={filter.toggle} accessibilityRole="checkbox" accessibilityState={{ checked: filter.value }} style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ width: 23, height: 23, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: filter.value ? "#5D5C74" : "#E4E4E7", marginRight: 7 }}>{filter.value && <IconSymbol name="checkmark" size={16} color="#FFF" />}</View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{filter.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable onPress={() => setDetailSearchVisible(true)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "#D2D2D6", backgroundColor: "#FAFAFB", paddingVertical: 11, marginBottom: 16 }}>
              <IconSymbol name="line.3.horizontal.decrease.circle" size={18} color="#5D5C74" />
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#5D5C74", marginLeft: 7 }}>詳細検索{detailFilterCount ? `（${detailFilterCount}件指定）` : ""}</Text>
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
              <Text style={{ flex: 1, fontSize: 13, color: colors.muted }} numberOfLines={1}>
                表示内容: <Text style={{ fontWeight: "800", color: colors.foreground }}>{eventTypeLabel} {sortOrder === "date" ? "開催日順" : "新着順"}</Text>
              </Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, marginLeft: 10 }}>
                全{filteredEvents.length}件
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <IconSymbol name="calendar" size={48} color={colors.border} />
            <Text style={{ fontSize: 15, color: colors.muted, marginTop: 12 }}>
              イベントがありません
            </Text>
            {hostedByMe ? <Text style={{ maxWidth: 300, textAlign: "center", fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 10 }}>新規でイベントを企画する場合は、右下の＋ボタンから募集ができます。</Text> : null}
          </View>
        }
      />

      {canCreateEvent ? <Pressable onPress={() => router.push("/create-event")} style={{ position: "absolute", right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: "#18171A", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 6 }}><IconSymbol name="plus" size={27} color="#FFF" /></Pressable> : null}

      <Modal visible={sortMenuVisible} transparent animationType="fade" onRequestClose={() => setSortMenuVisible(false)}>
        <Pressable onPress={() => setSortMenuVisible(false)} style={{ flex: 1, backgroundColor: "#0005", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ width: "100%", maxWidth: 330, backgroundColor: colors.surface, borderRadius: 18, padding: 10 }}>
            {(["date", "newest"] as const).map((value) => <Pressable key={value} onPress={() => { setSortOrder(value); setSortMenuVisible(false); }} style={{ flexDirection: "row", alignItems: "center", padding: 15, borderRadius: 12, backgroundColor: sortOrder === value ? "#F0E7EC" : "transparent" }}><Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.foreground }}>{value === "date" ? "開催日順" : "新着順"}</Text>{sortOrder === value ? <IconSymbol name="checkmark" size={18} color="#9C4F73" /> : null}</Pressable>)}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={detailSearchVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailSearchVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}><Text style={{ flex: 1, fontSize: 19, fontWeight: "900", color: colors.foreground }}>イベント詳細検索</Text><Pressable onPress={resetSearchConditions} style={{ marginRight: 15 }}><Text style={{ color: colors.muted, fontWeight: "700" }}>リセット</Text></Pressable><Pressable onPress={() => setDetailSearchVisible(false)}><Text style={{ color: "#9C4F73", fontWeight: "800" }}>結果を表示</Text></Pressable></View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Pressable onPress={() => setFavoriteOnly((current) => !current)} accessibilityRole="checkbox" accessibilityState={{ checked: favoriteOnly }} style={{ flexDirection: "row", alignItems: "center", padding: 14, marginBottom: 20, borderRadius: 12, backgroundColor: favoriteOnly ? "#FCEAF2" : colors.surface, borderWidth: 1, borderColor: favoriteOnly ? "#D85B86" : colors.border }}>
              <IconSymbol name={favoriteOnly ? "heart.fill" : "heart"} size={20} color={favoriteOnly ? "#D85B86" : colors.muted} />
              <Text style={{ flex: 1, marginLeft: 9, fontSize: 14, fontWeight: "800", color: colors.foreground }}>お気に入りだけ表示</Text>
              {favoriteOnly ? <IconSymbol name="checkmark" size={17} color="#D85B86" /> : null}
            </Pressable>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, marginBottom: 10 }}>自由ワード</Text>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 24 }}><IconSymbol name="magnifyingglass" size={18} color={colors.muted} /><TextInput value={keyword} onChangeText={setKeyword} placeholder="店名・イベント名・住所・ジャンル" placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 14, color: colors.foreground, paddingVertical: 12, marginLeft: 7 }} />{keyword ? <Pressable onPress={() => setKeyword("")}><IconSymbol name="xmark" size={16} color={colors.muted} /></Pressable> : null}</View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>エリア</Text><Pressable disabled={!selectedAreas.length} onPress={() => setSelectedAreas([])}><Text style={{ fontSize: 12, color: selectedAreas.length ? "#9C4F73" : colors.border }}>選択解除</Text></Pressable></View>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>複数選択できます。東京はエリアまで指定できます</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{EVENT_SEARCH_AREA_GROUPS.map((group) => { const selected = selectedAreas.includes(group.value); return <Pressable key={group.value} onPress={() => setSelectedAreas((current) => selected ? current.filter((item) => item !== group.value) : [...current, group.value])} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: selected ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selected ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "800", color: selected ? "#FFF" : colors.foreground }}>{group.label}</Text></Pressable>; })}</View>
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 16, marginBottom: 8 }}>東京のエリア</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{TOKYO_EVENT_AREAS.map((area) => { const value = `tokyo:${area.key}`; const selected = selectedAreas.includes(value); return <Pressable key={area.key} onPress={() => setSelectedAreas((current) => selected ? current.filter((item) => item !== value) : [...current, value])} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 15, backgroundColor: selected ? "#E9D4DE" : colors.surface, borderWidth: 1, borderColor: selected ? "#9C4F73" : colors.border }}><Text style={{ fontSize: 11, fontWeight: "700", color: selected ? "#9C4F73" : colors.foreground }}>{area.label}</Text></Pressable>; })}</View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>グルメジャンル</Text><Pressable disabled={!selectedGenres.length} onPress={() => setSelectedGenres([])}><Text style={{ fontSize: 12, color: selectedGenres.length ? "#9C4F73" : colors.border }}>選択解除</Text></Pressable></View>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>複数選択できます</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{GOURMET_GENRES.map((genre) => { const selected = selectedGenres.includes(genre); return <Pressable key={genre} onPress={() => setSelectedGenres((current) => selected ? current.filter((item) => item !== genre) : [...current, genre])} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: selected ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selected ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#FFF" : colors.foreground }}>{genre}</Text></Pressable>; })}</View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 12 }}><Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>予算</Text><Pressable disabled={budgetMin === "none" && budgetMax === "none"} onPress={() => { setBudgetMin("none"); setBudgetMax("none"); }}><Text style={{ fontSize: 12, color: budgetMin !== "none" || budgetMax !== "none" ? "#9C4F73" : colors.border }}>選択解除</Text></Pressable></View>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>1,000円単位で下限・上限を指定できます</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><BudgetSelect label="下限なし" value={budgetMin} options={BUDGET_VALUES} onChange={setBudgetMin} /><Text style={{ color: colors.muted }}>〜</Text><BudgetSelect label="上限なし" value={budgetMax} options={BUDGET_VALUES} onChange={setBudgetMax} /></View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
