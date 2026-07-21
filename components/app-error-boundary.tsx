import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { logger } from "@/lib/_core/logger";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

/** Keeps an unexpected render error from leaving the app on a blank screen. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error("Unhandled application error", {
      error,
      componentStack: info.componentStack,
    });
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View
        accessibilityRole="alert"
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFF8F0",
          padding: 32,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "800", color: "#2D2D2D", textAlign: "center" }}>
          画面を表示できませんでした
        </Text>
        <Text
          style={{
            marginTop: 12,
            fontSize: 14,
            lineHeight: 21,
            color: "#6B6B6B",
            textAlign: "center",
          }}
        >
          一時的な問題が発生しました。もう一度お試しください。
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={this.retry}
          style={({ pressed }) => ({
            marginTop: 24,
            minWidth: 160,
            borderRadius: 14,
            backgroundColor: "#E8A0BF",
            paddingHorizontal: 24,
            paddingVertical: 14,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700", textAlign: "center" }}>
            再試行
          </Text>
        </Pressable>
      </View>
    );
  }
}
