// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "calendar": "event",
  "map.fill": "map",
  "bubble.left.and.bubble.right.fill": "forum",
  "person.fill": "person",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "bell.fill": "notifications",
  "plus.circle.fill": "add-circle",
  "plus": "add",
  "heart.fill": "favorite",
  "heart": "favorite-border",
  "bubble.left.fill": "chat-bubble",
  "magnifyingglass": "search",
  "line.3.horizontal.decrease.circle": "filter-list",
  "star.fill": "star",
  "mappin.and.ellipse": "place",
  "phone.fill": "phone",
  "arrow.left": "arrow-back",
  "xmark": "close",
  "ellipsis": "more-horiz",
  "photo.fill": "photo",
  "camera.fill": "camera-alt",
  "gift.fill": "card-giftcard",
  "ticket.fill": "confirmation-number",
  "crown.fill": "workspace-premium",
  "gearshape.fill": "settings",
  "rectangle.portrait.and.arrow.right": "logout",
  "sparkles": "auto-awesome",
  "location.fill": "my-location",
  "pin.fill": "push-pin",
  "clock.fill": "schedule",
  "person.2.fill": "group",
  "megaphone.fill": "campaign",
  "music.note": "music-note",
  "trophy.fill": "emoji-events",
  "bookmark.fill": "bookmark",
  "square.and.arrow.up": "share",
  // Chat & messaging
  "message.fill": "message",
  "bubble.right.fill": "chat",
  "lock.fill": "lock",
  "envelope.fill": "email",
  // Admin & management
  "shield.fill": "admin-panel-settings",
  "doc.on.doc": "content-copy",
  "doc.fill": "description",
  "doc.text.fill": "article",
  "square.and.arrow.down": "file-download",
  "square.and.arrow.up.fill": "file-upload",
  // Club activities
  "figure.walk": "directions-walk",
  "sportscourt.fill": "sports",
  "person.3.fill": "groups",
  // Profile
  "pencil": "edit",
  "info.circle.fill": "info",
  "number": "tag",
  // Events
  "calendar.badge.plus": "event-available",
  "person.badge.plus": "person-add",
  "checkmark.circle.fill": "check-circle",
  "checkmark": "check",
  "exclamationmark.circle.fill": "error",
  // App settings & notifications
  "at": "alternate-email",
  "calendar.badge.clock": "event-note",
  "iphone.radiowaves.left.and.right": "vibration",
  "speaker.wave.2.fill": "volume-up",
  "textformat.size": "format-size",
  "moon.fill": "dark-mode",
  "eye.fill": "visibility",
  "bell.slash.fill": "notifications-off",
  "trash": "delete-outline",
  "trash.fill": "delete",
  "person.fill.checkmark": "how-to-reg",
  "arrow.up.circle.fill": "upgrade",
  "arrow.up.doc.fill": "upload-file",
  // Radio
  "radio.fill": "radio",
  "play.fill": "play-arrow",
  "pause.fill": "pause",
  "stop.fill": "stop",
  "forward.fill": "fast-forward",
  "backward.fill": "fast-rewind",
  "speaker.slash.fill": "volume-off",
  "waveform": "graphic-eq",
  "headphones": "headphones",
  // Misc
  "chevron.up": "expand-less",
  "chevron.down": "expand-more",
  "doc.badge.plus": "note-add",
  "person.crop.circle.badge.checkmark": "verified-user",
  "hand.raised.fill": "back-hand",
  "link": "link",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
