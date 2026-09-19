import { View } from "react-native";
import { BoardLinkPreviewCard } from "./board-link-preview-card";
import { contentLinkCards } from "@/lib/content-link-cards";
import type { ImportedLinkPreview } from "@/lib/discord-link-preview";

export function ContentLinkCards({ content, existing = [] }: { content: string; existing?: ImportedLinkPreview[] }) {
  const cards = contentLinkCards(content, existing);
  return cards.length ? <View>{cards.map((card) => <BoardLinkPreviewCard key={card.url} preview={card} />)}</View> : null;
}
