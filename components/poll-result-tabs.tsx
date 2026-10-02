import { Pressable, Text, View } from "react-native";

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
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, paddingBottom: 10 }}>
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(option.id)}
            style={{
              maxWidth: "100%",
              flexShrink: 1,
              borderRadius: 14,
              paddingHorizontal: 11,
              paddingVertical: 7,
              backgroundColor: selected ? accentColor : surfaceColor,
              borderWidth: 1,
              borderColor: selected ? accentColor : borderColor,
            }}
          >
            <Text style={{ flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: "800", color: selected ? "#FFF" : foregroundColor }}>
              {option.label} {option.voteCount}票
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
