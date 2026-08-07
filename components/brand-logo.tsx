import { Image } from "expo-image";
import { StyleSheet, View, type ViewStyle } from "react-native";

type BrandLogoProps = {
  width?: number;
  style?: ViewStyle;
  compact?: boolean;
};

/** Official IROTAS logo supplied by the project owner. */
export function BrandLogo({ width = 210, style, compact = false }: BrandLogoProps) {
  const height = compact ? width * 0.32 : width * 0.48;
  // The supplied square artwork has generous whitespace around the centered logo.
  // Keep a little padding around the artwork so letters never clip in narrow headers.
  const artworkSize = width * 1.85;

  return (
    <View style={[styles.frame, { width, height }, style]}>
      <Image
        source={require("@/assets/images/irotas-logo-square.png")}
        style={{
          position: "absolute",
          width: artworkSize,
          height: artworkSize,
          left: -width * 0.43,
          top: -width * 0.72,
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
