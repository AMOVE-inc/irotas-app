import { Pressable, ScrollView, Text } from "react-native";

type PollResultTab = {
  id: string;
  label: string;
  voteCount: number;
};

export function PollResultTabs({
  options,
  selectedId,
  accentColor,
  surfaceColor,
  borderColor,
  foregroundColor,
  onSelect,
}: {
  options: PollResultTab[];
  selectedId?: string;
  accentColor: string;
  surfaceColor: string;
  borderColor: string;
  foregroundColor: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: "row", gap: 7, paddingBottom: 10, paddingRight: 12 }}
    >
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(option.id)}
            style={{
              flexShrink: 0,
              borderRadius: 14,
              paddingHorizontal: 11,
              paddingVertical: 7,
              backgroundColor: selected ? accentColor : surfaceColor,
              borderWidth: 1,
              borderColor: selected ? accentColor : borderColor,
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 17, fontWeight: "800", color: selected ? "#FFF" : foregroundColor }}>
              {option.label} {option.voteCount}票
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
