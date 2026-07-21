import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { EVENTS, CURRENT_USER, type Event } from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { getAllEvents } from "@/lib/event-store";
import { filterAndSortEvents, type EventTypeFilter } from "@/lib/event-filters";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState, useCallback, useMemo } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  RefreshControl,
  Modal,
} from "react-native";

const TABS = [
  { key: "all", label: "全国" },
  { key: "kanto", label: "関東" },
  { key: "kansai", label: "関西" },
] as const;

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
  const router = useRouter();
  const isParticipant = (event.participants ?? []).includes(CURRENT_USER.id);

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
        marginBottom: 14,
        backgroundColor: colors.surface,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#80606F",
        shadowOffset: { width: 0, height: 7 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 3,
      }}
    >
      <Image
        source={event.image}
        style={{ width: "100%", height: 160 }}
        contentFit="cover"
        transition={300}
      />
      <View style={{ padding: 14 }}>
        <Text
          style={{
            alignSelf: "flex-start",
            color: event.eventType === "official" ? "#B75E87" : "#4A86A8",
            backgroundColor: event.eventType === "official" ? "#FCEAF2" : "#EAF5FA",
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
            fontSize: 10,
            fontWeight: "700",
            marginBottom: 7,
          }}
        >
          {event.eventType === "official" ? "公式イベント" : "グルメ会"}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text
            style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, flex: 1, marginRight: 8 }}
            numberOfLines={1}
          >
            {event.title}
          </Text>
          <StatusBadge status={event.status} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <IconSymbol name="clock.fill" size={14} color={colors.muted} />
          <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 5 }}>
            {formatDate(event.date)} {event.time}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <IconSymbol name="mappin.and.ellipse" size={14} color={colors.muted} />
          <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 5 }} numberOfLines={1}>
            {event.location}
          </Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconSymbol name="person.2.fill" size={14} color={colors.muted} />
            <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 5 }}>
              {event.attendees}/{event.capacity}人
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {isParticipant && event.chatId && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  router.push({ pathname: "/chat", params: { id: event.chatId } });
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
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#E8A0BF" }}>
                {event.rankPrices
                  ? (event.rankPrices[CURRENT_USER.rank as "regular" | "silver" | "gold" | "platinum"] ?? event.price)
                  : event.price}
              </Text>
              {event.rankPrices && (
                <Text style={{ fontSize: 10, color: "#E8A0BF", opacity: 0.7 }}>ランク別</Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function EventsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [eventType, setEventType] = useState<EventTypeFilter>("all");
  const [openOnly, setOpenOnly] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const { user: authUser } = useAuthContext();
  const userIsAdmin = authUser?.role === "admin";

  const allEvents = getAllEvents(EVENTS);
  const filteredEvents = useMemo(
    () => filterAndSortEvents(allEvents, {
      area: activeTab as "all" | "kanto" | "kansai",
      eventType,
      openOnly,
      startDate,
      endDate,
    }),
    [allEvents, activeTab, eventType, openOnly, startDate, endDate],
  );

  const eventTypeLabel = eventType === "official"
    ? "公式イベント"
    : eventType === "gourmet"
      ? "グルメ会"
      : "すべてのイベント";
  const areaLabel = activeTab === "kanto" ? "関東" : activeTab === "kansai" ? "関西" : "全国";
  const hasPeriod = Boolean(startDate || endDate);

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
        {userIsAdmin && (
          <Pressable
            onPress={() => router.push("/create-event")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#18171A",
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <IconSymbol name="plus" size={16} color="#FFF" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFF", marginLeft: 4 }}>
              作成
            </Text>
          </Pressable>
        )}
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
        contentContainerStyle={{ paddingBottom: 20 }}
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
              <View
                accessibilityLabel="開催日順"
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
                <Text style={{ fontSize: 14, color: "#333", marginRight: 5 }}>開催日順</Text>
                <IconSymbol name="chevron.down" size={17} color="#666" />
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>期間</Text>
              <Pressable
                disabled={!hasPeriod}
                onPress={() => {
                  setStartDate("");
                  setEndDate("");
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: hasPeriod ? colors.primary : colors.border,
                    textDecorationLine: "underline",
                  }}
                >
                  期間指定を解除
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

            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ width: 42, fontSize: 12, fontWeight: "700", color: colors.muted }}>エリア</Text>
              <View style={{ flex: 1, flexDirection: "row", gap: 7 }}>
                {TABS.map((area) => {
                  const selected = activeTab === area.key;
                  return (
                    <Pressable
                      key={area.key}
                      onPress={() => setActiveTab(area.key)}
                      style={{
                        flex: 1,
                        paddingVertical: 7,
                        alignItems: "center",
                        borderRadius: 9,
                        backgroundColor: selected ? "#E9D4DE" : "#F5F5F7",
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: selected ? "#9C4F73" : "#686873" }}>
                        {area.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              onPress={() => setOpenOnly((current) => !current)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: openOnly }}
              style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginBottom: 18 }}
            >
              <View
                style={{
                  width: 23,
                  height: 23,
                  borderRadius: 5,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: openOnly ? "#5D5C74" : "#E4E4E7",
                  marginRight: 9,
                }}
              >
                {openOnly && <IconSymbol name="checkmark" size={16} color="#FFF" />}
              </View>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>空席あり</Text>
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
                表示内容: <Text style={{ fontWeight: "800", color: colors.foreground }}>{eventTypeLabel}・{areaLabel} 開催日順</Text>
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
    </ScreenContainer>
  );
}
