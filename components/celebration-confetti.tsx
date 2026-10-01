import { useEffect, useMemo, useRef } from "react";
import { Animated, View } from "react-native";

const COLORS = ["#E85D8E", "#F7C948", "#55B6D9", "#67C587", "#8E6BC0"];

/** Lightweight in-app celebration without an additional native dependency. */
export function CelebrationConfetti() {
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => Array.from({ length: 24 }, (_, index) => ({
    index,
    left: 8 + ((index * 37) % 84),
    drift: ((index * 19) % 44) - 22,
    delay: (index % 6) * 55,
    color: COLORS[index % COLORS.length],
  })), []);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 1150, useNativeDriver: true }).start();
  }, [progress]);

  return <View pointerEvents="none" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    {pieces.map((piece) => <Animated.View key={piece.index} style={{
      position: "absolute", left: `${piece.left}%`, top: "44%", width: 8, height: 13,
      borderRadius: 2, backgroundColor: piece.color,
      opacity: progress.interpolate({ inputRange: [0, 0.78, 1], outputRange: [1, 1, 0] }),
      transform: [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, piece.drift] }) },
        { translateY: progress.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, -115 - piece.delay / 8, 155] }) },
        { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${240 + piece.index * 17}deg`] }) },
      ],
    }} />)}
  </View>;
}
