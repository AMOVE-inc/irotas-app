import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { EVENTS, CURRENT_USER, isAdmin, type Event } from "@/constants/mock-data";
import { getAllEvents } from "@/lib/event-store";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState, useCallback } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  RefreshControl,
} from "react-native";

const TABS = [
  { key: "all", label: "すべて" },
  { key: "kanto", label: "関東" },
  { key: "kansai", label: "関西" },
] as const;

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
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <Image
        source={event.image}
        style={{ width: "100%", height: 160 }}
        contentFit="cover"
        transition={300}
      />
      <View style={{ padding: 14 }}>
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
  const [refreshing, setRefreshing] = useState(false);
  const userIsAdmin = isAdmin(CURRENT_USER);

  const allEvents = getAllEvents(EVENTS);
  const filteredEvents = allEvents.filter(
    (e) => activeTab === "all" || e.category === activeTab || e.category === "all",
  );

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
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground }}>
          イベント
        </Text>
        {userIsAdmin && (
          <Pressable
            onPress={() => router.push("/create-event")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#E8A0BF",
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

      {/* Segment Control */}
      <View
        style={{
          flexDirection: "row",
          marginHorizontal: 16,
          marginVertical: 12,
          backgroundColor: colors.surface,
          borderRadius: 10,
          padding: 3,
        }}
      >
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: activeTab === tab.key ? colors.background : "transparent",
              alignItems: "center",
              ...(activeTab === tab.key
                ? {
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 2,
                  }
                : {}),
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: activeTab === tab.key ? "700" : "500",
                color: activeTab === tab.key ? colors.foreground : colors.muted,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
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
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 20 }}
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
