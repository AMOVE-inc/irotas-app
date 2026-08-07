import { Image } from "expo-image";
import { StyleSheet, View, type ViewStyle } from "react-native";

type BrandLogoProps = {
  width?: number;
  style?: ViewStyle;
  compact?: boolean;
};

/** Official IROTAS logo supplied by the project owner. */
export function BrandLogo({ width = 210, style, compact = false }: BrandLogoProps) {
  const height = compact ? width * 0.28 : width * 0.46;
  // The supplied square artwork has generous whitespace around the centered logo.
  // Scale and position it inside a clipped frame so the logo stays legible in headers.
  const artworkSize = width * 2.055;

  return (
    <View style={[styles.frame, { width, height }, style]}>
      <Image
        source={require("@/assets/images/irotas-logo-square.png")}
        style={{
          position: "absolute",
          width: artworkSize,
          height: artworkSize,
          left: -width * 0.532,
          top: -width * 0.838,
        }}
        contentFit="fill"
        accessibilityLabel="IRO+ Gourmet Community"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
  },
});
