import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { EVENTS, CURRENT_USER, DEFAULT_AVATAR, getMemberById, type Event } from "@/constants/mock-data";
import { EVENT_BUDGET_RANGES, GOURMET_GENRES, type EventBudgetRangeKey } from "@/constants/event-options";
import { EVENT_AREA_GROUPS } from "@/constants/event-areas";
import { useAuthContext } from "@/lib/auth-context";
import { getAllEvents } from "@/lib/event-store";
import { filterAndSortEvents, type EventSortOrder, type EventTypeFilter } from "@/lib/event-filters";
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

function EventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const colors = useColors();
  const organizer = getMemberById(event.createdBy);
  const applicantCount = event.applicantIds?.length ?? event.attendees;
  const confirmedCount = new Set([...(event.participants ?? []), ...(event.companionIds ?? [])]).size;

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
        height: 120,
      }}
    >
      <Image
        source={event.image}
        style={{ width: 120, height: 120 }}
        contentFit="cover"
        transition={300}
      />
      <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
          <Text style={{ color: event.eventType === "official" ? "#B75E87" : "#4A86A8", backgroundColor: event.eventType === "official" ? "#FCEAF2" : "#EAF5FA", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, fontSize: 9, fontWeight: "800" }}>{event.eventType === "official" ? "公式" : "グルメ会"}</Text>
          {event.selectionMethod ? <Text style={{ fontSize: 9, fontWeight: "700", color: colors.muted, marginLeft: 5 }}>{event.selectionMethod === "lottery" ? "抽選" : "先着順"}</Text> : null}
          <View style={{ flex: 1 }} />
          <StatusBadge status={event.status} />
        </View>
        <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: "800", color: colors.foreground }} numberOfLines={1}>{event.title}</Text>
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.foreground, marginTop: 3 }}>{formatDate(event.date)} {event.time}</Text>
        <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }} numberOfLines={1}>{event.location}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}>
          <Text style={{ fontSize: 10, color: colors.muted }}>申込 <Text style={{ fontWeight: "900", color: colors.foreground }}>{applicantCount}</Text></Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginLeft: 7 }}>定員 <Text style={{ fontWeight: "900", color: colors.foreground }}>{event.capacity}</Text></Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginLeft: 7 }}>確定 <Text style={{ fontWeight: "900", color: "#34C759" }}>{confirmedCount}</Text></Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}>
          <Image source={event.eventType === "official" ? DEFAULT_AVATAR : (organizer?.avatar ?? DEFAULT_AVATAR)} style={{ width: 18, height: 18, borderRadius: 9 }} contentFit="cover" />
          <Text style={{ flex: 1, marginLeft: 5, fontSize: 10, fontWeight: "700", color: colors.muted }} numberOfLines={1}>{event.eventType === "official" ? "IRO＋運営" : (organizer?.name ?? "メンバー")}</Text>
          <Text style={{ fontSize: 11, fontWeight: "800", color: "#E8A0BF" }}>{event.rankPrices?.[CURRENT_USER.rank] ?? event.price}</Text>
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
  const [participating, setParticipating] = useState(false);
  const [sortOrder, setSortOrder] = useState<EventSortOrder>("date");
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [detailSearchVisible, setDetailSearchVisible] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [budgetRanges, setBudgetRanges] = useState<EventBudgetRangeKey[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [allEvents, setAllEvents] = useState<Event[]>(() => getAllEvents(EVENTS));
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
      hostedByMemberId: eventType === "gourmet" && hostedByMe ? CURRENT_USER.id : undefined,
      participatingMemberId: participating ? CURRENT_USER.id : undefined,
      genres: selectedGenres,
      budgetRanges: budgetRanges.map((key) => EVENT_BUDGET_RANGES.find((range) => range.key === key)).filter((range) => range && range.key !== "all").map((range) => ({ min: range && "min" in range ? range.min : undefined, max: range && "max" in range ? range.max : undefined })),
      areas: selectedAreas,
      keyword,
    }),
    [allEvents, eventType, openOnly, startDate, endDate, sortOrder, hostedByMe, participating, selectedGenres, budgetRanges, selectedAreas, keyword],
  );

  const eventTypeLabel = eventType === "official"
    ? "公式イベント"
    : eventType === "gourmet"
      ? "グルメ会"
      : "すべてのイベント";
  const detailFilterCount = selectedGenres.length + budgetRanges.length + selectedAreas.length + (keyword.trim() ? 1 : 0);

  const resetSearchConditions = useCallback(() => {
    setEventType("all"); setOpenOnly(false); setHostedByMe(false); setParticipating(false); setSortOrder("date");
    setSelectedGenres([]); setBudgetRanges([]); setSelectedAreas([]); setKeyword(""); setStartDate(""); setEndDate("");
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
          <EventCard event={item} onPress={() => router.push({ pathname: "/event-detail", params: { id: item.id } })} />
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
                ...(eventType === "gourmet" ? [
                  { label: "幹事", value: hostedByMe, toggle: () => setHostedByMe((current) => !current) },
                ] : []),
                ...(eventType !== "all" ? [{ label: "参加予定", value: participating, toggle: () => setParticipating((current) => !current) }] : []),
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
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, marginBottom: 10 }}>自由ワード</Text>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 24 }}><IconSymbol name="magnifyingglass" size={18} color={colors.muted} /><TextInput value={keyword} onChangeText={setKeyword} placeholder="店名・イベント名・住所・ジャンル" placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 14, color: colors.foreground, paddingVertical: 12, marginLeft: 7 }} />{keyword ? <Pressable onPress={() => setKeyword("")}><IconSymbol name="xmark" size={16} color={colors.muted} /></Pressable> : null}</View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>エリア</Text><Pressable disabled={!selectedAreas.length} onPress={() => setSelectedAreas([])}><Text style={{ fontSize: 12, color: selectedAreas.length ? "#9C4F73" : colors.border }}>選択解除</Text></Pressable></View>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>地域・都道府県を複数選択できます</Text>
            {EVENT_AREA_GROUPS.map((group) => <View key={group.value} style={{ marginBottom: 15 }}><Pressable onPress={() => setSelectedAreas((current) => current.includes(group.value) ? current.filter((item) => item !== group.value) : [...current, group.value])} style={{ flexDirection: "row", alignItems: "center", marginBottom: 7 }}><View style={{ width: 21, height: 21, borderRadius: 6, backgroundColor: selectedAreas.includes(group.value) ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selectedAreas.includes(group.value) ? "#5D5C74" : colors.border, alignItems: "center", justifyContent: "center" }}>{selectedAreas.includes(group.value) ? <IconSymbol name="checkmark" size={13} color="#FFF" /> : null}</View><Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "900", color: colors.foreground }}>{group.region}（全体）</Text></Pressable><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{group.prefectures.map((prefecture) => { const value = `pref:${prefecture}`; const selected = selectedAreas.includes(value); return <Pressable key={prefecture} onPress={() => setSelectedAreas((current) => selected ? current.filter((item) => item !== value) : [...current, value])} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 15, backgroundColor: selected ? "#E9D4DE" : colors.surface, borderWidth: 1, borderColor: selected ? "#9C4F73" : colors.border }}><Text style={{ fontSize: 11, fontWeight: "700", color: selected ? "#9C4F73" : colors.foreground }}>{group.region} ＞ {prefecture.replace(/[都府県]$/, "")}</Text></Pressable>; })}</View></View>)}

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>グルメジャンル</Text><Pressable disabled={!selectedGenres.length} onPress={() => setSelectedGenres([])}><Text style={{ fontSize: 12, color: selectedGenres.length ? "#9C4F73" : colors.border }}>選択解除</Text></Pressable></View>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>複数選択できます</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{GOURMET_GENRES.map((genre) => { const selected = selectedGenres.includes(genre); return <Pressable key={genre} onPress={() => setSelectedGenres((current) => selected ? current.filter((item) => item !== genre) : [...current, genre])} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: selected ? "#5D5C74" : colors.surface, borderWidth: 1, borderColor: selected ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#FFF" : colors.foreground }}>{genre}</Text></Pressable>; })}</View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 12 }}><Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>予算</Text><Pressable disabled={!budgetRanges.length} onPress={() => setBudgetRanges([])}><Text style={{ fontSize: 12, color: budgetRanges.length ? "#9C4F73" : colors.border }}>選択解除</Text></Pressable></View>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>複数選択できます</Text>
            <View style={{ gap: 8 }}>{EVENT_BUDGET_RANGES.filter((range) => range.key !== "all").map((range) => { const selected = budgetRanges.includes(range.key); return <Pressable key={range.key} onPress={() => setBudgetRanges((current) => selected ? current.filter((item) => item !== range.key) : [...current, range.key])} style={{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, backgroundColor: selected ? "#F0E7EC" : colors.surface, borderWidth: 1, borderColor: selected ? "#9C4F73" : colors.border }}><Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: colors.foreground }}>{range.label}</Text>{selected ? <IconSymbol name="checkmark.circle.fill" size={20} color="#9C4F73" /> : null}</Pressable>; })}</View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
