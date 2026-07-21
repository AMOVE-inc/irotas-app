import { Image } from "expo-image";
import { StyleSheet, View, type ViewStyle } from "react-native";

type BrandLogoProps = {
  width?: number;
  style?: ViewStyle;
  compact?: boolean;
};

/** Official IROTAS logo supplied by the project owner. */
export function BrandLogo({ width = 210, style, compact = false }: BrandLogoProps) {
  const height = compact ? width * 0.34 : width * 0.594;

  return (
    <View style={[styles.frame, { width, height }, style]}>
      <Image
        source={require("@/assets/images/irotas-brand-logo.webp")}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        accessibilityLabel="IROTAS Private Community"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
  },
});
