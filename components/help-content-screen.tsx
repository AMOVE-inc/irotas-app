import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

export type HelpSection = {
  title: string;
  body: string;
};

export function HelpContentScreen({ title, intro, sections }: { title: string; intro: string; sections: HelpSection[] }) {
  const colors = useColors();
  const router = useRouter();

  return (
    <ScreenContainer>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 10 }}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{title}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted, marginBottom: 16 }}>{intro}</Text>
        <View style={{ gap: 12 }}>
          {sections.map((section) => (
            <View
              key={section.title}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, marginBottom: 7 }}>
                {section.title}
              </Text>
              <Text style={{ fontSize: 14, lineHeight: 22, color: colors.foreground }}>{section.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
