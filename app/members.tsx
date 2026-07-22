import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { MEMBERS, CURRENT_USER, RANK_COLORS, RANK_LABELS } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

export default function MembersScreen() {
  const colors = useColors();
  const router = useRouter();
  const [searchText, setSearchText] = useState("");

  const filteredMembers = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return MEMBERS;
    return MEMBERS.filter((member) => member.name.toLowerCase().includes(query) || member.id.toLowerCase().includes(query));
  }, [searchText]);

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
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.foreground }}>
          メンバー検索
        </Text>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="名前または会員IDで検索"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, marginLeft: 8, fontSize: 14, color: colors.foreground }}
          />
        </View>
      </View>

      {/* Member list */}
      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const rankColor = RANK_COLORS[item.rank];
          const isMe = item.id === CURRENT_USER.id;
          return (
            <Pressable
              onPress={() => router.push({ pathname: "/member-profile", params: { id: item.id } })}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border,
                backgroundColor: pressed ? colors.surface : "transparent",
              })}
            >
              <View style={{ position: "relative" }}>
                <Image
                  source={item.avatar}
                  style={{ width: 48, height: 48, borderRadius: 24 }}
                  contentFit="cover"
                />
                <View
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    backgroundColor: rankColor,
                    borderRadius: 8,
                    width: 16,
                    height: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1.5,
                    borderColor: colors.background,
                  }}
                >
                  <IconSymbol name="crown.fill" size={8} color="#FFF" />
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                    {item.name}
                  </Text>
                  {isMe && (
                    <View
                      style={{
                        backgroundColor: "#E8A0BF20",
                        borderRadius: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#E8A0BF" }}>自分</Text>
                    </View>
                  )}
                  <View
                    style={{
                      backgroundColor: rankColor + "20",
                      borderRadius: 8,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "700", color: rankColor }}>
                      {RANK_LABELS[item.rank]}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  ID: {item.id} · {item.generation}期生
                </Text>
                {item.bio && (
                  <Text
                    style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {item.bio}
                  </Text>
                )}
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </Pressable>
          );
        }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <IconSymbol name="person.2.fill" size={40} color={colors.border} />
            <Text style={{ fontSize: 15, color: colors.muted, marginTop: 12 }}>
              メンバーが見つかりません
            </Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}
