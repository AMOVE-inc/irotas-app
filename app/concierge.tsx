import { IconSymbol } from "@/components/ui/icon-symbol";
import { RESTAURANTS } from "@/constants/mock-data";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState, useRef, useCallback } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const INITIAL_MESSAGE: Message = {
  id: "m0",
  role: "assistant",
  content:
    "こんにちは！IRO＋グルメコンシェルジュです。\n\nエリアやジャンル、シチュエーションを教えていただければ、AIがおすすめのお店をご提案します。\n\n例えば：\n・「渋谷でおすすめの焼肉屋は？」\n・「デートにぴったりなイタリアンを教えて」\n・「大阪で安くて美味しいお店は？」",
  timestamp: new Date(),
};

// RESTAURANTSデータをAIコンテキスト用にテキスト化
const buildRestaurantContext = () => {
  return RESTAURANTS.map(
    (r) =>
      `${r.name}（${r.genre}）: ${r.address} / 評価${r.rating}（${r.reviewCount}件）/ ${r.description}`,
  ).join("\n");
};

function localConciergeReply(query: string) {
  const normalized = query.toLowerCase();
  const scored = RESTAURANTS.map((restaurant) => {
    const haystack = `${restaurant.name} ${restaurant.genre} ${restaurant.address} ${restaurant.description}`.toLowerCase();
    const terms = normalized.split(/[\s、。,.!?！？]+/).filter((term) => term.length >= 2);
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 3 : 0), 0) + restaurant.rating;
    return { restaurant, score };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
  if (!scored.length) return "条件に合う候補を見つけられませんでした。エリア、料理ジャンル、予算を教えてください。";
  const recommendations = scored.map(({ restaurant }) => `・${restaurant.name}（${restaurant.genre}／${restaurant.address}）\n${restaurant.description}`).join("\n\n");
  return `ご希望から、まずはこちらがおすすめです。\n\n${recommendations}\n\n予算や利用シーンを教えていただければ、さらに絞り込みます。`;
}

function ChatBubble({ message }: { message: Message }) {
  const colors = useColors();
  const isUser = message.role === "user";

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 12,
        paddingHorizontal: 16,
      }}
    >
      {!isUser && (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "#E8A0BF",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 8,
            marginTop: 4,
          }}
        >
          <IconSymbol name="sparkles" size={16} color="#FFF" />
        </View>
      )}
      <View
        style={{
          maxWidth: "75%",
          backgroundColor: isUser ? "#E8A0BF" : colors.surface,
          borderRadius: 18,
          borderBottomRightRadius: isUser ? 4 : 18,
          borderBottomLeftRadius: isUser ? 18 : 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            lineHeight: 22,
            color: isUser ? "#FFF" : colors.foreground,
          }}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

export default function ConciergeScreen() {
  const colors = useColors();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const chatMutation = trpc.concierge.chat.useMutation({
    onSuccess: (data) => {
      const aiMessage: Message = {
        id: `m${Date.now()}`,
        role: "assistant",
        content: data.reply || "申し訳ありません。回答を生成できませんでした。",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    },
    onError: (_error, variables) => {
      const latestQuery = [...variables.messages].reverse().find((message) => message.role === "user")?.content ?? "";
      const fallbackMessage: Message = {
        id: `m${Date.now()}`,
        role: "assistant",
        content: localConciergeReply(latestQuery),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    },
  });

  const sendMessage = useCallback(() => {
    if (!inputText.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      id: `m${Date.now()}`,
      role: "user",
      content: inputText.trim(),
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText("");

    // AIに送るメッセージ履歴（初期メッセージを除く）
    const apiMessages = updatedMessages
      .filter((m) => m.id !== "m0")
      .map((m) => ({ role: m.role, content: m.content }));

    chatMutation.mutate({
      messages: apiMessages,
      restaurantContext: buildRestaurantContext(),
    });
  }, [inputText, messages, chatMutation]);

  const isTyping = chatMutation.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: Platform.OS === "web" ? 16 : 56,
          paddingBottom: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
        </Pressable>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#E8A0BF",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <IconSymbol name="sparkles" size={18} color="#FFF" />
        </View>
        <View>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            グルメコンシェルジュ
          </Text>
          <Text style={{ fontSize: 12, color: "#34C759" }}>
            ● AI搭載
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          isTyping ? (
            <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "#E8A0BF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 8,
                }}
              >
                <IconSymbol name="sparkles" size={16} color="#FFF" />
              </View>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 18,
                  borderBottomLeftRadius: 4,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.muted }}>AIが考えています...</Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Platform.OS === "web" ? 16 : 34,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "flex-end",
              backgroundColor: colors.surface,
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 10,
              minHeight: 44,
              maxHeight: 120,
            }}
          >
            <TextInput
              placeholder="おすすめのお店を聞いてみよう..."
              placeholderTextColor={colors.muted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              returnKeyType="done"
              onSubmitEditing={sendMessage}
              style={{
                flex: 1,
                fontSize: 15,
                color: colors.foreground,
                maxHeight: 100,
              }}
            />
          </View>
          <Pressable
            onPress={sendMessage}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor:
                inputText.trim() && !isTyping ? "#E8A0BF" : colors.surface,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: 8,
              opacity: isTyping ? 0.5 : 1,
            }}
          >
            <IconSymbol
              name="paperplane.fill"
              size={20}
              color={inputText.trim() && !isTyping ? "#FFF" : colors.muted}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
