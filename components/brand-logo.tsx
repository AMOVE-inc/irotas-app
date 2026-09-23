import { AuthenticatedImage as Image } from "@/components/authenticated-image";
import { StyleSheet, View, type ViewStyle } from "react-native";

type BrandLogoProps = {
  width?: number;
  style?: ViewStyle;
  compact?: boolean;
};

/** Official IROTAS logo supplied by the project owner. */
export function BrandLogo({ width = 210, style, compact = false }: BrandLogoProps) {
  const height = compact ? width * 0.44 : width * 0.48;
  // The supplied square artwork has generous whitespace around the centered logo.
  // Compact headers need enough vertical room for both the wordmark and its subtitle.
  const artworkSize = compact ? width * 1.75 : width * 1.85;

  return (
    <View style={[styles.frame, { width, height }, style]}>
      <Image
        source={require("@/assets/images/irotas-logo-square.png")}
        style={{
          position: "absolute",
          width: artworkSize,
          height: artworkSize,
          left: compact ? -width * 0.375 : -width * 0.43,
          top: compact ? -width * 0.675 : -width * 0.72,
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
