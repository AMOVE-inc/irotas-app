// Mock data for IRO＋ app development

export type MemberRank = "regular" | "silver" | "gold" | "platinum";
export type UserRole = "member" | "operator" | "admin";

export interface Member {
  id: string;
  name: string;
  avatar: number;
  rank: MemberRank;
  points: number; // XP（旧・累計ポイント）
  level: number; // 後方互換用（pointsから自動計算）
  branch: "kanto" | "kansai";
  generation: number; // 何期生
  bio: string; // 自己紹介文
  interests: string[]; // 好きなジャンル
  role: UserRole;
  joinedAt: string;
  gender?: "male" | "female" | "other" | "unset"; // 性別（分析用）
  birthDate?: string;
  showAge?: boolean;
  hometown?: string;
  residence?: string;
  occupation?: string;
  hobbies?: string;
  favoriteCuisines?: string[];
  favoriteAlcohol?: string;
  dislikedFoods?: string;
  allergies?: string;
  drinkingLevel?: string;
  instagramUrl?: string;
  favoriteRestaurants?: string;
  desiredRestaurants?: string;
  googleLocalGuideLevel?: string;
  participationCount?: number;
  organizerCount?: number;
  followerCount?: number;
  followingCount?: number;
}

// --- XP制ランクシステム ---

export const POINT_ACTIONS = {
  eventCreate: { points: 5, label: "イベントの新規作成" },
  eventJoin: { points: 10, label: "イベント参加" },
  boardPost: { points: 5, label: "掲示板投稿" },
  comment: { points: 2, label: "コメント投稿" },
  clubActivity: { points: 3, label: "部活動参加" },
  mealReportPost: { points: 8, label: "ごちそうさま報告投稿" },
  eventOrganize: { points: 20, label: "イベント幹事（開催完了時）" },
} as const;

export function getOrganizerPointAdjustment(outcome: "completed" | "cancelled"): number {
  return outcome === "completed" ? POINT_ACTIONS.eventOrganize.points : -POINT_ACTIONS.eventOrganize.points;
}

export const RANK_THRESHOLDS_POINTS = [
  { rank: "regular" as MemberRank, minPoints: 0, label: "レギュラー" },
  { rank: "silver" as MemberRank, minPoints: 100, label: "シルバー" },
  { rank: "gold" as MemberRank, minPoints: 500, label: "ゴールド" },
  { rank: "platinum" as MemberRank, minPoints: 1000, label: "プラチナ" },
];

export function getRankFromPoints(points: number): MemberRank {
  if (points >= 1000) return "platinum";
  if (points >= 500) return "gold";
  if (points >= 100) return "silver";
  return "regular";
}

export function getNextRankInfo(points: number): { nextRank: MemberRank; pointsNeeded: number; progress: number } | null {
  if (points >= 1000) return null; // プラチナは最高ランク
  const thresholds = [100, 500, 1000];
  const ranks: MemberRank[] = ["silver", "gold", "platinum"];
  const currentThresholds = [0, 100, 500, 1000];
  for (let i = 0; i < thresholds.length; i++) {
    if (points < thresholds[i]) {
      const prevThreshold = currentThresholds[i];
      const nextThreshold = thresholds[i];
      const progress = (points - prevThreshold) / (nextThreshold - prevThreshold);
      return {
        nextRank: ranks[i],
        pointsNeeded: nextThreshold - points,
        progress: Math.min(Math.max(progress, 0), 1),
      };
    }
  }
  return null;
}

export interface TimelinePost {
  id: string;
  author: Member;
  content: string;
  images: string[];
  likes: number;
  comments: number;
  liked: boolean;
  createdAt: string;
}

export interface Event {
  id: string;
  createdAt?: string;
  title: string;
  restaurantName?: string;
  description: string;
  date: string;
  time: string;
  location: string;
  image: string;
  capacity: number;
  attendees: number;
  participants: string[]; // member ids
  price: string; // デフォルト料金（ランク別未設定の場合に使用）
  rankPrices?: {
    regular?: string;
    silver?: string;
    gold?: string;
    platinum?: string;
  };
  category: "all" | "kanto" | "kansai";
  eventType: "official" | "gourmet" | "club";
  clubId?: string;
  status: "open" | "full" | "ended";
  createdBy: string; // admin member id
  chatId?: string; // private chat id
  applicationDeadline?: string; // 募集期日
  cancellationPolicy?: string; // イベント個別のキャンセルポリシー
  selectionMethod?: "first_come" | "lottery";
  applicantIds?: string[];
  reservationCapacity?: number;
  companionIds?: string[];
  externalUrl?: string;
  publicNotes?: string;
  privateMemo?: string;
  genres?: string[];
  prefecture?: string;
  tokyoArea?: string;
  tabelogUrl?: string;
  googleMapsUrl?: string;
  participantsFinalizedAt?: string;
  cancellationRequests?: Array<{
    memberId: string;
    requestedAt: string;
    contactedOrganizer: boolean;
    policyConfirmed: boolean;
    status: "pending" | "approved" | "rejected";
  }>;
  priceMin?: number;
  /** 本番APIが返す、閲覧者に固有の状態。端末内モックとの互換用に任意。 */
  viewerMemberId?: string;
  viewerParticipationStatus?: "applied" | "confirmed" | "cancel_requested" | null;
  isFavorite?: boolean;
  isOrganizer?: boolean;
  priceMax?: number;
}

export interface Restaurant {
  id: string;
  name: string;
  genre: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  image: string;
  registeredBy: Member;
  phone?: string;
  description?: string;
  placeId?: string;
  googleMapsUrl?: string;
  price?: string;
  sourceList?: string;
  sourceCategories?: string[];
  importedAt?: string;
  sourceType?: "csv" | "meal_report";
  sourceThreadId?: string;
  sourceThreadTitle?: string;
  memberRating?: number;
}

export type BoardImage = string | number | {
  uri: string;
  width?: number;
  height?: number;
  scale?: number;
};

export interface BoardPoll {
  question: string;
  options: Array<{ id: string; text: string; voterIds: string[] }>;
  deadline: string;
  allowMultiple?: boolean;
}

export interface BoardThread {
  id: string;
  title: string;
  author: Member;
  category: string;
  commentCount: number;
  lastUpdated: string;
  preview: string;
  isRecruiting: boolean; // 参加者募集中かどうか
  recruitmentStatus?: "open" | "closed" | "none"; // 掲示板上の募集ステータス（旧データはisRecruitingから補完）
  isPinned?: boolean; // 一覧上部へ固定（部活の自己紹介は常に固定）
  recruitCapacity?: number;
  recruitAttendees?: number;
  recruitParticipants?: string[]; // 承認済み参加者 member ids
  recruitApplicants?: string[]; // 参加申請中 member ids
  chatId?: string; // private chat id
  eventDate?: string; // 開催日（今日のイベント表示用）
  images?: BoardImage[]; // 投稿添付画像 URLs / bundled assets
  videos?: string[]; // Discord移行投稿などの添付動画 URLs
  mealReport?: {
    postTitle?: string;
    restaurantName: string;
    prefecture: string;
    areaDisplay?: string;
    budget?: string;
    recommendedMenu?: string;
    rating: number;
    comment?: string;
    googleMapUrl?: string;
    tabelogUrl?: string;
  };
  gourmetAdvice?: {
    theme: string;
    genres?: string[];
    area: string;
    scene: string;
    budget: string;
    comment: string;
  };
  selfIntroduction?: {
    introduction: string;
    wantToTry?: string;
    favoriteRestaurants?: string;
    desiredRestaurants?: string;
  };
  reactions?: Record<string, string[]>;
  poll?: BoardPoll;
  gourmetContest?: {
    commentDeadline: string;
    /** 優勝者へ自動付与するイロタスポイント。新規大会では必須。 */
    prizePoints?: number;
    /** 以下はDiscordから移行した旧クーポン大会との互換用。 */
    prizeTitle?: string;
    prizeDescription?: string;
    prizeExpiresAt?: string;
    /** 過去データ移行済みの大会。自動集計・クーポン再配布の対象外。 */
    archived?: boolean;
    winnerName?: string;
  };
}

export interface BoardComment {
  id: string;
  threadId: string;
  author: Member;
  content: string;
  createdAt: string;
  images?: BoardImage[];
  videos?: string[];
  reactions?: Record<string, string[]>;
  poll?: BoardPoll;
  /** 締切後の結果発表など、運営が自動投稿したコメント。 */
  isSystem?: boolean;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: "event" | "board" | "club" | "rank" | "dm" | "group";
  sourceId: string; // event id or thread id or club id
  participants: string[]; // member ids
  createdBy: string;
  lastMessage?: string;
  lastMessageAt?: string;
  requiredRank?: MemberRank; // ランクチャット: このランクのメンバーのみ参加可能
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  imageUri?: string;
  attachmentUrls?: string[];
  externalMessageId?: string;
  externalAuthorName?: string;
  reactions?: Record<string, string[]>; // emoji -> member ids（通知なしリアクション）
  createdAt: string;
}

export interface Coupon {
  id: string;
  title: string;
  description: string;
  discount: string;
  expiresAt: string;
  code: string;
  requiredRank: MemberRank;
  usageType: "single" | "multiple";
  status?: "active" | "ended";
  imageUrl?: string;
  recipientIds?: string[];
  sourceContestId?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface ClubEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  organizerId: string; // 企画者（部員）
  applicantIds: string[]; // 参加希望者
  approvedIds: string[]; // 承認済み参加者
  chatId?: string; // プライベートチャットID
  maxParticipants: number;
}

export interface Club {
  id: string;
  name: string;
  description: string;
  leaderId: string; // 部長（運営が任命）
  leaderName?: string;
  memberIds: string[];
  applicantIds: string[]; // 入部申請中のメンバーID
  applications: ClubApplication[];
  chatId?: string;
  icon: string;
  createdByAdmin: boolean; // 管理者のみ作成可能
  events: ClubEvent[]; // 部活動イベント（部員が企画可能）
  /** サーバーで判定した現在のログイン会員の所属状態 */
  viewerMembershipStatus?: "approved" | "pending" | "on_hold" | "rejected" | "left" | null;
  /** 現在のログイン会員が部長か */
  viewerIsLeader?: boolean;
  /** 管理者・部長として申請を審査できるか */
  canReviewApplications?: boolean;
  /** 現在のログイン会員の公開会員ID */
  viewerMemberId?: string | null;
}

export interface ClubApplication {
  memberId: string;
  wantsToDo: string;
  messageToLeader: string;
  status: "pending" | "on_hold";
  appliedAt: string;
}

export interface BoardCategory {
  key: string;
  label: string;
  group: "all" | "area" | "club";
  createdByAdmin: boolean;
}

export interface RankBenefit {
  rank: MemberRank;
  benefits: string[];
}

// --- Mock Data ---

/** Shared avatar shown until a member uploads their own profile image. */
export const DEFAULT_AVATAR =
  process.env.NODE_ENV === "test" ? 1 : require("../assets/images/icon.png");

export const CURRENT_USER: Member = {
  id: "u1",
  name: "かずま",
  avatar: DEFAULT_AVATAR,
  rank: "gold",
  points: 620,
  level: 12,
  branch: "kanto",
  generation: 1,
  bio: "IRO＋運営メンバーです。東京在住で焼肉とラーメンが大好き！皆さんと美味しいお店を共有したいです。",
  interests: ["焼肉", "ラーメン", "居酒屋"],
  role: "admin",
  joinedAt: "2024-04-01",
  gender: "male",
  birthDate: "1992-05-18", showAge: true, hometown: "東京都", residence: "東京都",
  occupation: "コミュニティ運営", hobbies: "食べ歩き、旅行、サウナ",
  favoriteCuisines: ["焼肉", "ラーメン", "居酒屋"], favoriteAlcohol: "ワイン、日本酒",
  dislikedFoods: "パクチー", allergies: "なし", drinkingLevel: "飲める",
  instagramUrl: "https://www.instagram.com/irotas_community_official",
  participationCount: 28, organizerCount: 12, followerCount: 86, followingCount: 74,
};

export const MEMBERS: Member[] = [
  CURRENT_USER,
  {
    id: "u2", name: "さくら",
    avatar: DEFAULT_AVATAR,
    rank: "platinum", points: 1050, level: 18, branch: "kanto", generation: 1,
    bio: "小べ歩きが趣味です。特にフレンチとイタリアンが好き。IRO＋のイベントには毎回参加しています！",
    interests: ["フレンチ", "イタリアン", "ワイン"],
    role: "member", joinedAt: "2024-04-15", gender: "female",
    showAge: true, birthDate: "1994-08-12", hometown: "神奈川県", residence: "東京都", occupation: "広報", hobbies: "美術館巡り、旅行", favoriteCuisines: ["フレンチ", "イタリアン"], favoriteAlcohol: "ワイン", drinkingLevel: "少しだけ飲める", participationCount: 35, organizerCount: 3, followerCount: 104, followingCount: 82,
  },
  {
    id: "u3", name: "たくみ",
    avatar: DEFAULT_AVATAR,
    rank: "silver", points: 180, level: 7, branch: "kansai", generation: 2,
    bio: "大阪在住のラーメン好き。関西の美味しいお店を開拓中です。",
    interests: ["ラーメン", "たこ焼き", "お好み焼き"],
    role: "member", joinedAt: "2024-07-01", gender: "male",
    showAge: true, birthDate: "1990-11-03", hometown: "大阪府", residence: "大阪府", occupation: "営業", hobbies: "サッカー観戦", favoriteCuisines: ["ラーメン", "お好み焼き・たこ焼き"], favoriteAlcohol: "ビール", drinkingLevel: "飲める", participationCount: 14, organizerCount: 2, followerCount: 53, followingCount: 61,
  },
  {
    id: "u4", name: "ゆうき",
    avatar: DEFAULT_AVATAR,
    rank: "gold", points: 530, level: 11, branch: "kanto", generation: 1,
    bio: "銀座のお寿司屋さん巡りが週末の楽しみ。ワインも好きです。",
    interests: ["寿司", "ワイン", "フレンチ"],
    role: "member", joinedAt: "2024-05-01", gender: "male",
    hometown: "千葉県", residence: "東京都", occupation: "ITエンジニア", hobbies: "映画、カメラ", favoriteCuisines: ["寿司", "フレンチ"], favoriteAlcohol: "ワイン", drinkingLevel: "日による", participationCount: 24, organizerCount: 5, followerCount: 78, followingCount: 69,
  },
  {
    id: "u5", name: "あおい",
    avatar: DEFAULT_AVATAR,
    rank: "regular", points: 45, level: 3, branch: "kansai", generation: 3,
    bio: "京都のカフェ巡りが好きです。最近IRO＋に入会しました！",
    interests: ["カフェ", "和食", "スイーツ"],
    role: "member", joinedAt: "2025-01-15", gender: "female",
    hometown: "京都府", residence: "京都府", occupation: "デザイナー", hobbies: "カフェ巡り、読書", favoriteCuisines: ["日本料理", "カフェ・喫茶店", "スイーツ"], drinkingLevel: "全く飲めない", participationCount: 6, organizerCount: 0, followerCount: 37, followingCount: 42,
  },
  {
    id: "u6", name: "りょう",
    avatar: DEFAULT_AVATAR,
    rank: "gold", points: 510, level: 10, branch: "kanto", generation: 1,
    bio: "居酒屋とバーが好き。IRO＋のイベント企画もよくやっています。",
    interests: ["居酒屋", "バー", "クラフトビール"],
    role: "member", joinedAt: "2024-04-20", gender: "male",
    hometown: "埼玉県", residence: "東京都", occupation: "企画", hobbies: "音楽、キャンプ", favoriteCuisines: ["居酒屋", "バー"], favoriteAlcohol: "クラフトビール", drinkingLevel: "たくさん飲める", participationCount: 26, organizerCount: 9, followerCount: 91, followingCount: 77,
  },
  {
    id: "u7", name: "みさき",
    avatar: DEFAULT_AVATAR,
    rank: "silver", points: 150, level: 6, branch: "kansai", generation: 2,
    bio: "大阪で料理教室に通っています。手作り料理の写真もよく投稿します。",
    interests: ["和食", "イタリアン", "パン"],
    role: "member", joinedAt: "2024-08-01", gender: "female",
    hometown: "兵庫県", residence: "大阪府", occupation: "料理講師", hobbies: "パン作り、ヨガ", favoriteCuisines: ["日本料理", "イタリアン"], favoriteAlcohol: "スパークリングワイン", drinkingLevel: "少しだけ飲める", participationCount: 17, organizerCount: 4, followerCount: 66, followingCount: 58,
  },
  {
    id: "u8", name: "けんた",
    avatar: DEFAULT_AVATAR,
    rank: "regular", points: 20, level: 2, branch: "kanto", generation: 4,
    bio: "新メンバーです。よろしくお願いします！",
    interests: [],
    role: "member", joinedAt: "2026-07-10", gender: "male",
  },
];

/** 相互承認済みの友達関係。ペアの向きに関係なく友達として扱う。 */
export const FRIENDSHIPS: readonly (readonly [string, string])[] = [
  ["u1", "u2"],
  ["u1", "u3"],
  ["u1", "u4"],
  ["u1", "u6"],
  ["u2", "u4"],
  ["u2", "u6"],
  ["u3", "u5"],
  ["u3", "u7"],
  ["u5", "u7"],
];

export const ANNOUNCEMENTS: Announcement[] = [
  { id: "a1", title: "IRO＋ 2周年記念イベント開催決定！", content: "2026年4月に2周年記念パーティーを開催します。詳細は近日公開！", createdAt: "2026-03-20" },
  { id: "a2", title: "新メンバー限定キャンペーン実施中", content: "3月中に入会された方に特別クーポンをプレゼント！", createdAt: "2026-03-15" },
  { id: "a3", title: "関西支部イベント年間予定を公開しました", content: "2026年度の関西支部イベントスケジュールをご確認ください。", createdAt: "2026-03-10" },
];

export const TIMELINE_POSTS: TimelinePost[] = [
  {
    id: "p1", author: MEMBERS[1],
    content: "昨日行った渋谷の焼肉屋さんが最高でした！A5ランクの和牛が口の中でとろけました🥩✨",
    images: [
      "https://images.unsplash.com/photo-1544025162-d76694265947?w=400",
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400",
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
    ],
    likes: 24, comments: 8, liked: false, createdAt: "2026-03-23T18:30:00",
  },
  {
    id: "p2", author: MEMBERS[3],
    content: "今日のランチは銀座のお寿司屋さん。ネタが新鮮で大満足でした🍣",
    images: ["https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400"],
    likes: 18, comments: 5, liked: true, createdAt: "2026-03-23T12:00:00",
  },
  {
    id: "p3", author: MEMBERS[2],
    content: "大阪の新しいラーメン屋さんを開拓！濃厚な豚骨スープが絶品でした🍜",
    images: ["https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400"],
    likes: 31, comments: 12, liked: false, createdAt: "2026-03-22T20:15:00",
  },
  {
    id: "p4", author: MEMBERS[4],
    content: "京都の隠れ家カフェでまったり☕ 抹茶パフェが絶品でした。",
    images: ["https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400"],
    likes: 15, comments: 3, liked: false, createdAt: "2026-03-22T15:00:00",
  },
  {
    id: "p5", author: MEMBERS[5],
    content: "先週のIRO＋ウェルカムパーティー、最高に楽しかった！新メンバーの皆さんよろしくお願いします🎉",
    images: [], likes: 42, comments: 15, liked: true, createdAt: "2026-03-21T22:00:00",
  },
];

const today = new Date().toISOString().split("T")[0]; // 今日の日付

export const EVENTS: Event[] = [
  {
    id: "e1", createdAt: "2026-03-20T10:00:00+09:00", title: "第3回 関東支部交流会",
    description: "関東支部メンバーの交流を深める食事会です。今回は恵比寿の隠れ家イタリアンで開催！",
    date: today, time: "18:30", location: "恵比寿 リストランテ・ベッラ", prefecture: "東京都",
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400",
    capacity: 20, attendees: 14, participants: ["u1", "u2", "u4", "u6"],
    price: "¥5,000", priceMin: 5000, priceMax: 5000, genres: ["イタリアン"],
    rankPrices: { regular: "¥5,000", silver: "¥4,500", gold: "¥4,000", platinum: "¥3,500" },
    category: "kanto", eventType: "official", status: "open",
    createdBy: "u1", chatId: "chat1",
  },
  {
    id: "e2", createdAt: "2026-03-18T12:00:00+09:00", title: "IRO＋ 2周年記念パーティー",
    description: "IRO＋設立2周年を記念した特別パーティー！全国のメンバーが集結します。",
    date: "2026-04-26", time: "17:00", location: "六本木 グランドホール", prefecture: "東京都",
    image: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400",
    capacity: 80, attendees: 52, participants: ["u1", "u2", "u3", "u4", "u5", "u6"],
    price: "¥8,000", priceMin: 8000, priceMax: 8000, genres: ["洋食", "フレンチ"],
    rankPrices: { regular: "¥8,000", silver: "¥7,000", gold: "¥6,000", platinum: "¥5,000" },
    category: "all", eventType: "official", status: "open",
    createdBy: "u1", chatId: "chat2",
  },
  {
    id: "e3", createdAt: "2026-03-22T09:00:00+09:00", title: "関西グルメツアー in 道頓堀",
    description: "大阪の名店を巡るグルメツアー。食い倒れの街を一緒に楽しみましょう！",
    date: "2026-04-19", time: "11:00", location: "道頓堀周辺", prefecture: "大阪府",
    image: "https://images.unsplash.com/photo-1590559899731-a382839e5549?w=400",
    capacity: 6, attendees: 6, participants: ["u3", "u5", "u7"], applicantIds: ["u3", "u5", "u7", "u2", "u4", "u6"],
    price: "¥3,000", priceMin: 3000, priceMax: 3000, genres: ["お好み焼き・たこ焼き", "居酒屋"],
    rankPrices: { regular: "¥3,000", silver: "¥2,500", gold: "¥2,000", platinum: "¥1,500" },
    category: "kansai", eventType: "gourmet", status: "full",
    createdBy: "u1",
  },
  {
    id: "e4", createdAt: "2026-03-16T14:00:00+09:00", title: "グルメ選手権 2026春",
    description: "メンバーが推薦する最高の一品を決める投票イベント！",
    date: "2026-05-10", time: "14:00", location: "オンライン",
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
    capacity: 100, attendees: 28, participants: ["u1", "u2", "u3"],
    price: "無料", priceMin: 0, priceMax: 0, genres: ["日本料理", "洋食", "中華料理"], category: "all", eventType: "official", status: "open",
    createdBy: "u1",
  },
  {
    id: "e5", createdAt: "2026-07-21T10:00:00+09:00", title: "恵比寿で楽しむ夏のビストロ会",
    restaurantName: "BISTRO IRO", description: "気軽なビストロ料理を囲む少人数のグルメ会です。参加申込は幹事の承認後に確定します。",
    date: "2026-08-15", time: "18:30", location: "東京都渋谷区恵比寿", prefecture: "東京都",
    image: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=400", capacity: 8, attendees: 3,
    participants: ["u6", "u4", "u1"], applicantIds: ["u6", "u4", "u1"], price: "¥6,000", priceMin: 6000, priceMax: 6000,
    genres: ["フレンチ", "洋食"], category: "kanto", eventType: "gourmet", status: "open", createdBy: "u6",
    cancellationPolicy: "参加者自身でのキャンセル操作はできません。必ず幹事へ連絡してください。",
  },
  {
    id: "e6", createdAt: "2026-08-14T12:00:00+09:00", title: "ワイン部 テイスティング交流会",
    restaurantName: "Wine Salon IRO", description: "ワイン部員限定のテイスティング交流会です。初心者の方も歓迎します。",
    date: "2026-09-12", time: "18:00", location: "東京都港区西麻布", prefecture: "東京都",
    image: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400", capacity: 12, attendees: 5,
    participants: ["u1", "u2", "u4", "u6"], applicantIds: ["u1", "u2", "u4", "u6"], price: "¥5,000", priceMin: 5000, priceMax: 5000,
    genres: ["ワインバー"], category: "kanto", eventType: "club", clubId: "club-wine", status: "open", createdBy: "u1",
    cancellationPolicy: "参加者自身でのキャンセル操作はできません。必ず幹事へ連絡してください。",
  },
  {
    id: "e7", createdAt: "2026-08-17T09:00:00+09:00", title: "銀座で楽しむ少人数の鮨会",
    restaurantName: "鮨 IRO", description: "初参加・おひとり参加も歓迎の少人数グルメ会です。カウンターで旬の握りを楽しみましょう。",
    date: "2026-09-20", time: "18:30", location: "東京都中央区銀座", prefecture: "東京都", tokyoArea: "銀座・有楽町・日比谷",
    image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600", capacity: 6, attendees: 2,
    participants: ["u2"], applicantIds: ["u2"], price: "¥8,000", priceMin: 8000, priceMax: 8000,
    genres: ["寿司", "和食"], category: "kanto", eventType: "gourmet", status: "open", createdBy: "u2",
    applicationDeadline: "2026-09-13", selectionMethod: "first_come",
  },
];

export const RESTAURANTS: Restaurant[] = [
  {
    id: "r1", name: "焼肉 罪と罰", genre: "焼肉",
    address: "東京都渋谷区道玄坂1-2-3", latitude: 35.6580, longitude: 139.6994,
    rating: 4.8, reviewCount: 12,
    image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400",
    registeredBy: MEMBERS[0], phone: "03-1234-5678",
    description: "A5ランクの和牛を堪能できる隠れ家焼肉店。予約必須の人気店。",
  },
  {
    id: "r2", name: "鮨 静龍苑", genre: "寿司",
    address: "東京都港区六本木3-4-5", latitude: 35.6627, longitude: 139.7312,
    rating: 4.9, reviewCount: 8,
    image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400",
    registeredBy: MEMBERS[1], phone: "03-2345-6789",
    description: "ミシュラン星付きの本格江戸前寿司。カウンター席がおすすめ。",
  },
  {
    id: "r3", name: "一心不乱", genre: "ラーメン",
    address: "東京都新宿区歌舞伎町1-5-6", latitude: 35.6938, longitude: 139.7034,
    rating: 4.5, reviewCount: 20,
    image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400",
    registeredBy: MEMBERS[3], phone: "03-3456-7890",
    description: "濃厚豚骨スープが自慢のラーメン店。深夜営業あり。",
  },
  {
    id: "r4", name: "野毛みかん", genre: "居酒屋",
    address: "神奈川県横浜市中区野毛町2-3-4", latitude: 35.4437, longitude: 139.6316,
    rating: 4.6, reviewCount: 15,
    image: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=400",
    registeredBy: MEMBERS[5], phone: "045-123-4567",
    description: "野毛の名物居酒屋。新鮮な魚介と日本酒のペアリングが最高。",
  },
  {
    id: "r5", name: "とだか", genre: "創作料理",
    address: "東京都品川区東五反田1-7-8", latitude: 35.6261, longitude: 139.7234,
    rating: 4.7, reviewCount: 10,
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
    registeredBy: MEMBERS[0], phone: "03-4567-8901",
    description: "予約困難な人気創作料理店。おまかせコースが絶品。",
  },
  {
    id: "r6", name: "道頓堀 たこ焼き太郎", genre: "たこ焼き",
    address: "大阪府大阪市中央区道頓堀1-8-9", latitude: 34.6687, longitude: 135.5013,
    rating: 4.3, reviewCount: 25,
    image: "https://images.unsplash.com/photo-1590559899731-a382839e5549?w=400",
    registeredBy: MEMBERS[2], phone: "06-1234-5678",
    description: "外はカリカリ、中はトロトロの本場たこ焼き。",
  },
];

export const BOARD_THREADS: BoardThread[] = [
  {
    id: "t10", title: "自己紹介",
    author: MEMBERS[7], category: "introduction", commentCount: 2,
    lastUpdated: "2026-07-20T12:00:00",
    preview: "東京を中心に食べ歩きを始めたばかりです。皆さんよろしくお願いします。",
    isRecruiting: false,
    selfIntroduction: { introduction: "東京を中心に食べ歩きを始めたばかりです。皆さんよろしくお願いします。", wantToTry: "気になるお店を一緒に開拓するグルメ会を企画してみたいです。" },
    reactions: { "👏": ["u1", "u2"], "😊": ["u4"] },
  },
  {
    id: "t1", title: "渋谷でおすすめの焼肉屋さん教えてください！",
    author: MEMBERS[3], category: "gourmet-advice", commentCount: 15,
    lastUpdated: "2026-03-23T14:00:00",
    preview: "今度渋谷で食事会をするのですが、おすすめの焼肉屋さんがあれば教えてください...",
    isRecruiting: false,
    gourmetAdvice: { theme: "渋谷でおすすめの焼肉屋さん", genres: ["焼肉"], area: "渋谷", scene: "友人との食事会", budget: "8,000〜10,000円", comment: "今度渋谷で食事会をするので、おすすめの焼肉屋さんを教えてください！" },
  },
  {
    id: "t2", title: "大阪の隠れ家イタリアンを発見！",
    author: MEMBERS[2], category: "free-chat", commentCount: 8,
    lastUpdated: "2026-03-22T20:30:00",
    preview: "心斎橋の路地裏にあるイタリアンが最高でした。パスタが本場の味...",
    isRecruiting: false,
  },
  {
    id: "t3", title: "今日のごちそうさま🍽️ 銀座のフレンチ",
    author: MEMBERS[1], category: "meal-report", commentCount: 22,
    lastUpdated: "2026-03-23T21:00:00",
    preview: "銀座の新しいフレンチレストランに行ってきました。コース料理が素晴らしかった...",
    isRecruiting: false,
    images: ["https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=500"],
    mealReport: {
      postTitle: "特別な日にまた行きたい一軒",
      restaurantName: "銀座の新しいフレンチレストラン",
      prefecture: "東京都",
      budget: "10,000〜20,000円",
      recommendedMenu: "シェフのおまかせコース",
      rating: 5,
      comment: "コース料理が素晴らしく、特別な日におすすめです。",
      googleMapUrl: "https://www.google.com/maps/search/?api=1&query=銀座+フレンチ",
    },
  },
  {
    id: "t11", title: "夏のひんやりグルメ選手権",
    author: MEMBERS[0], category: "gourmet-contest", commentCount: 3,
    lastUpdated: "2026-07-21T10:00:00+09:00",
    preview: "この夏におすすめしたい、ひんやりグルメをコメントで教えてください。写真やお店の情報も歓迎です。",
    isRecruiting: false,
    gourmetContest: {
      commentDeadline: "2026-07-31",
      prizePoints: 500,
    },
  },
  {
    id: "t4", title: "東飲みしたい人集まれ！🍻",
    author: MEMBERS[5], category: "free-chat", commentCount: 30,
    lastUpdated: "2026-03-23T19:00:00",
    preview: "来週末に東京で飲み会を企画しています。参加したい方はコメントください！",
    isRecruiting: true, recruitCapacity: 12, recruitAttendees: 8,
    recruitParticipants: ["u6", "u1", "u2", "u4"],
    eventDate: today, chatId: "chat3",
  },
  {
    id: "t5", title: "おしえてグルメ相談室：記念日ディナー",
    author: MEMBERS[4], category: "gourmet-advice", commentCount: 12,
    lastUpdated: "2026-03-21T16:00:00",
    preview: "来月の記念日に特別なディナーを予約したいのですが、おすすめはありますか？",
    isRecruiting: false,
    gourmetAdvice: { theme: "誕生日プレートが可愛いお店", genres: ["フレンチ", "イタリアン"], area: "都内", scene: "お誕生日ディナー", budget: "6,000〜8,000円", comment: "友人のお誕生日をサプライズでお祝いしたく、おすすめのお店をご存知の方は教えてください！" },
  },
  {
    id: "t6", title: "関西グルメ同好会 次回集まり🍜",
    author: MEMBERS[6], category: "club-club1", commentCount: 5,
    lastUpdated: "2026-03-23T10:00:00",
    preview: "次回の関西グルメ同好会の集まりを企画中です！参加希望の方はぜひ。",
    isRecruiting: true, recruitCapacity: 10, recruitAttendees: 4,
    recruitParticipants: ["u7", "u3", "u5"],
    eventDate: "2026-03-30", chatId: "chat4",
  },
  {
    id: "t8", title: "はじめまして！かずまです",
    author: MEMBERS[0], category: "free-chat", commentCount: 7,
    lastUpdated: "2026-03-24T08:30:00",
    preview: "美味しいものを囲んで、みなさんと楽しく交流できたらうれしいです！",
    isRecruiting: false,
  },
];

export const BOARD_COMMENTS: BoardComment[] = [
  { id: "bc1", threadId: "t1", author: MEMBERS[0], content: "焼肉罪と罰がおすすめです！A5ランクの和牛が最高ですよ。", createdAt: "2026-03-23T14:30:00" },
  { id: "bc2", threadId: "t1", author: MEMBERS[1], content: "渋谷なら「叙々苑」も間違いないですよ。", createdAt: "2026-03-23T15:00:00" },
  { id: "bc3", threadId: "t1", author: MEMBERS[5], content: "最近できた「焼肉キング」も良かったです！", createdAt: "2026-03-23T16:00:00" },
  { id: "bc4", threadId: "t4", author: MEMBERS[0], content: "参加します！楽しみにしてます🍻", createdAt: "2026-03-23T19:30:00" },
  { id: "bc5", threadId: "t4", author: MEMBERS[1], content: "私も行きたいです！", createdAt: "2026-03-23T20:00:00" },
  { id: "bc6", threadId: "t11", author: MEMBERS[1], content: "銀座の桃パフェを推薦します。果肉がたっぷりで夏にぴったりです！", createdAt: "2026-07-21T12:00:00+09:00", reactions: { "❤️": ["u1", "u3", "u4"] } },
  { id: "bc7", threadId: "t11", author: MEMBERS[3], content: "中目黒の冷製トマト麺がおすすめです。さっぱりしていて暑い日に最高です。", createdAt: "2026-07-21T13:00:00+09:00", reactions: { "❤️": ["u2", "u5"] } },
  { id: "bc8", threadId: "t11", author: MEMBERS[5], content: "京都の抹茶かき氷。濃厚な抹茶とふわふわの氷が忘れられません。", createdAt: "2026-07-21T14:00:00+09:00", reactions: { "❤️": ["u7"] } },
];

export const CHAT_ROOMS: ChatRoom[] = [
  {
    id: "board-announcement", name: "運営アナウンス", type: "board", sourceId: "announcement",
    participants: MEMBERS.map((member) => member.id), createdBy: "system",
    lastMessage: "IRO+運営からのお知らせをお届けします。", lastMessageAt: "2026-03-24T09:00:00", unreadCount: 1,
  },
  {
    id: "chat1", name: "第3回 関東支部交流会", type: "event", sourceId: "e1",
    participants: ["u1", "u2", "u4", "u6"], createdBy: "u1",
    lastMessage: "楽しみにしてます！", lastMessageAt: "2026-03-23T10:00:00", unreadCount: 2,
  },
  {
    id: "chat2", name: "IRO＋ 2周年記念パーティー", type: "event", sourceId: "e2",
    participants: ["u1", "u2", "u3", "u4", "u5", "u6"], createdBy: "u1",
    lastMessage: "ドレスコードはありますか？", lastMessageAt: "2026-03-22T18:00:00", unreadCount: 0,
  },
  {
    id: "chat3", name: "東飲みしたい人集まれ！", type: "board", sourceId: "t4",
    participants: ["u6", "u1", "u2", "u4"], createdBy: "u6",
    lastMessage: "場所は新宿でどうですか？", lastMessageAt: "2026-03-23T20:30:00", unreadCount: 4,
  },
  {
    id: "chat4", name: "関西グルメ同好会 次回集まり", type: "board", sourceId: "t6",
    participants: ["u7", "u3", "u5"], createdBy: "u7",
    lastMessage: "心斎橋集合でいいですか？", lastMessageAt: "2026-03-23T11:00:00", unreadCount: 1,
  },
  // ランク別チャットルーム（同じランクの会員だけが参加）
  {
    id: "rank-silver", name: "シルバーメンバールーム",
    type: "rank", sourceId: "rank-silver",
    participants: ["u3", "u7"],
    createdBy: "system",
    requiredRank: "silver",
    lastMessage: "シルバー会員専用のルームです。", lastMessageAt: "2026-03-21T10:00:00", unreadCount: 0,
  },
  {
    id: "rank-gold", name: "ゴールドメンバールーム",
    type: "rank", sourceId: "rank-gold",
    participants: ["u1", "u4", "u6"],
    createdBy: "system",
    requiredRank: "gold",
    lastMessage: "ゴールド会員専用のルームです。", lastMessageAt: "2026-03-22T10:00:00", unreadCount: 3,
  },
  {
    id: "rank-platinum", name: "プラチナルーム",
    type: "rank", sourceId: "rank-platinum",
    participants: ["u2"],
    createdBy: "system",
    requiredRank: "platinum",
    lastMessage: "プラチナ会員専用のルームです。", lastMessageAt: "2026-03-23T10:00:00", unreadCount: 0,
  },
];

export const CHAT_MESSAGES: ChatMessage[] = [
  { id: "ba1", chatId: "board-announcement", senderId: "u1", content: "IRO+運営からのお知らせをお届けします。最新情報はこちらでご確認ください。", createdAt: "2026-03-24T09:00:00" },
  {
    id: "discord-announcement-1536285603661086823",
    chatId: "board-announcement",
    senderId: "u1",
    externalMessageId: "1536285603661086823",
    externalAuthorName: "IRO+運営",
    content: "@everyone\n\n今週のIRO+ News\n\n① 8/29(土) 夏のプレミアムBBQ in 池袋\n先着40名様、残り枠わずかです。\n\n② 9/6(日) 関東支部ランチ交流会 in 麻布十番\n先着22名様を募集中です。\n\n③ 9/9(水) ビアガーデン in 六本木\n先着18名様を募集中です。\n\n＜後日募集予定のイベント＞\n・9/20(日) 関東支部ランチ交流会\n・9/26(土) マグロ解体ショー\n\n④ 第24回グルメ選手権\n今週のテーマは「麻辣湯」。優勝者にはイベント参加クーポンをプレゼントします。",
    createdAt: "2026-08-10T17:10:00+09:00",
  },
  {
    id: "discord-announcement-1534818206664101888",
    chatId: "board-announcement",
    senderId: "u1",
    externalMessageId: "1534818206664101888",
    externalAuthorName: "Non【IRO+代表】",
    content: "@everyone\n\n部活投票の結果発表\n\n以前、部活アイデアを投稿してくれた皆様、投票にご参加いただいた皆様、ありがとうございました。\n\n1位：ゴルフ部\n2位：焼肉部\n3位：麺部\n\nまずはこの3つを正式に部活として立ち上げます。部長任命などの準備が整い次第、近日中に部員募集を開始します。",
    createdAt: "2026-08-06T15:59:00+09:00",
  },
  { id: "m1", chatId: "chat1", senderId: "u1", content: "皆さん、今日の交流会の詳細です。18:30に恵比寿駅西口集合でお願いします！", createdAt: "2026-03-23T08:00:00" },
  { id: "m2", chatId: "chat1", senderId: "u2", content: "了解です！楽しみにしてます✨", createdAt: "2026-03-23T08:30:00" },
  { id: "m3", chatId: "chat1", senderId: "u4", content: "遅れそうな場合は連絡しますね。", createdAt: "2026-03-23T09:00:00" },
  { id: "m4", chatId: "chat1", senderId: "u6", content: "楽しみにしてます！", createdAt: "2026-03-23T10:00:00" },
  { id: "m5", chatId: "chat3", senderId: "u6", content: "来週土曜日の夜はどうですか？", createdAt: "2026-03-23T19:30:00" },
  { id: "m6", chatId: "chat3", senderId: "u1", content: "いいですね！何時くらいがいいですか？", createdAt: "2026-03-23T20:00:00" },
  { id: "m7", chatId: "chat3", senderId: "u2", content: "19時くらいがいいかな。", createdAt: "2026-03-23T20:15:00" },
  { id: "m8", chatId: "chat3", senderId: "u4", content: "場所は新宿でどうですか？", createdAt: "2026-03-23T20:30:00" },
];

export const CLUBS: Club[] = [
  {
    id: "club-disney", name: "ディズニー部", description: "ディズニーが好きなメンバーでパークや作品を楽しむ部活。", leaderId: "u1", memberIds: ["u1", "u2"], applicantIds: [], applications: [], icon: "🐭", createdByAdmin: true, events: [],
  },
  { id: "club-walk", name: "散歩部", description: "街歩きや季節の散策を楽しむ部活。", leaderId: "u1", memberIds: ["u1"], applicantIds: [], applications: [], icon: "🚶", createdByAdmin: true, events: [] },
  { id: "club-travel", name: "旅行部", description: "国内外の旅行情報を交換し、一緒に旅を楽しむ部活。", leaderId: "u1", memberIds: ["u1", "u3"], applicantIds: [], applications: [], icon: "✈️", createdByAdmin: true, events: [] },
  { id: "club-sports-watch", name: "スポーツ観戦部", description: "野球などのスポーツを一緒に観戦する部活。", leaderId: "u1", memberIds: ["u1"], applicantIds: [], applications: [], icon: "⚾️", createdByAdmin: true, events: [] },
  { id: "club-wine", name: "ワイン部", description: "ワインの知識を深めながらテイスティングや食事を楽しむ部活。", leaderId: "u1", memberIds: ["u1", "u2", "u4", "u6"], applicantIds: ["u8"], applications: [{ memberId: "u8", wantsToDo: "初心者向けのワイン会を企画したいです。", messageToLeader: "ワインを楽しく学びながら交流したいです。よろしくお願いします。", status: "pending", appliedAt: "2026-03-24T11:00:00" }], icon: "🍷", createdByAdmin: true, events: [] },
  { id: "club-bread", name: "パン部", description: "話題のベーカリー巡りやパン作りを楽しむ部活。", leaderId: "u1", memberIds: ["u1"], applicantIds: [], applications: [], icon: "🍞", createdByAdmin: true, events: [] },
  { id: "club-sweets", name: "スイーツ部", description: "話題のスイーツやカフェを巡る部活。", leaderId: "u1", memberIds: ["u1", "u5", "u7"], applicantIds: [], applications: [], icon: "🍰", createdByAdmin: true, events: [] },
  { id: "club-cooking-class", name: "料理教室部", description: "みんなで料理を学び、作って楽しむ部活。", leaderId: "u1", memberIds: ["u1", "u7"], applicantIds: [], applications: [], icon: "🍳", createdByAdmin: true, events: [] },
  { id: "club-day-drinking", name: "昼飲み部", description: "休日の昼飲みや明るい時間の食事会を楽しむ部活。", leaderId: "u1", memberIds: ["u1", "u6"], applicantIds: [], applications: [], icon: "🍺", createdByAdmin: true, events: [] },
  { id: "club-theater", name: "舞台鑑賞部", description: "演劇やミュージカルなどの舞台作品を一緒に鑑賞する部活。", leaderId: "u1", memberIds: ["u1"], applicantIds: [], applications: [], icon: "🎭", createdByAdmin: true, events: [] },
  { id: "club-running", name: "ランニング部", description: "無理のないペースでランニングを楽しむ部活。", leaderId: "u1", memberIds: ["u1"], applicantIds: [], applications: [], icon: "🏃", createdByAdmin: true, events: [] },
  { id: "club-sports", name: "スポーツ部", description: "さまざまなスポーツを実際にプレーして楽しむ部活。", leaderId: "u1", memberIds: ["u1"], applicantIds: [], applications: [], icon: "🏀", createdByAdmin: true, events: [] },
];

export const COUPONS: Coupon[] = [
  {
    id: "c1", title: "焼肉 罪と罰 10%OFF",
    description: "IRO＋会員限定！お会計から10%割引", imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=600&fit=crop",
    discount: "10%OFF", expiresAt: "2026-06-30", code: "IROPLUS2026", requiredRank: "regular", usageType: "single",
  },
  {
    id: "c2", title: "鮨 静龍苑 ドリンク1杯無料",
    description: "シルバー会員以上限定。お好きなドリンク1杯サービス", imageUrl: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&h=600&fit=crop",
    discount: "ドリンク1杯無料", expiresAt: "2026-05-31", code: "IROSILVER2026", requiredRank: "silver", usageType: "multiple",
  },
  {
    id: "c3", title: "ゴールド限定 コース10%OFF",
    description: "ゴールド会員以上限定の特別割引", imageUrl: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?w=600&h=600&fit=crop",
    discount: "コース10%OFF", expiresAt: "2026-08-31", code: "IROGOLD2026", requiredRank: "gold", usageType: "single",
  },
  {
    id: "c4", title: "プラチナ限定 特別コース招待",
    description: "プラチナ会員限定の特別コースにご招待", imageUrl: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=600&fit=crop",
    discount: "特別コース", expiresAt: "2026-12-31", code: "IROPLAT2026", requiredRank: "platinum", usageType: "multiple",
  },
];

export const RANK_BENEFITS: RankBenefit[] = [
  {
    rank: "regular",
    benefits: ["コミュニティへの参加", "掲示板の投稿・コメント", "イベントへの参加", "グルメマップの閲覧"],
  },
  {
    rank: "silver",
    benefits: ["シルバー会員限定チャットへの招待", "イベント割引特典（5%OFF）", "会員限定クーポン"],
  },
  {
    rank: "gold",
    benefits: ["ゴールド会員限定チャットへの招待", "イベント割引特典（10%OFF）", "シークレットイベントへの参加券", "プレミアムクーポン"],
  },
  {
    rank: "platinum",
    benefits: ["プラチナ会員限定チャットへの招待", "イベント割引特典（15%OFF）", "VIPイベントへのご招待", "全クーポン利用可能", "グルメコンシェルジュ優先対応"],
  },
];

export const RANK_COLORS: Record<MemberRank, string> = {
  regular: "#8B8B8B",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#171717",
};

export const RANK_LABELS: Record<MemberRank, string> = {
  regular: "レギュラー",
  silver: "シルバー",
  gold: "ゴールド",
  platinum: "プラチナ",
};

export const RANK_ICONS: Record<MemberRank, string> = {
  regular: "🔰",
  silver: "🥈",
  gold: "🥇",
  platinum: "💎",
};

export const RANK_THRESHOLDS = [
  { rank: "regular" as MemberRank, minPoints: 0, label: "0pt以上" },
  { rank: "silver" as MemberRank, minPoints: 100, label: "100pt以上" },
  { rank: "gold" as MemberRank, minPoints: 500, label: "500pt以上" },
  { rank: "platinum" as MemberRank, minPoints: 1000, label: "1,000pt以上" },
];

export const BOARD_CATEGORIES: BoardCategory[] = [
  { key: "introduction", label: "自己紹介", group: "all", createdByAdmin: true },
  { key: "meal-report", label: "今日のごちそうさま報告", group: "all", createdByAdmin: true },
  { key: "gourmet-contest", label: "グルメ選手権", group: "all", createdByAdmin: true },
  { key: "gourmet-advice", label: "教えてグルメ相談室", group: "all", createdByAdmin: true },
  { key: "free-chat", label: "なんでも掲示板", group: "all", createdByAdmin: true },
  { key: "gourmet-map", label: "グルメマップ", group: "all", createdByAdmin: true },
  { key: "club-introduction", label: "部活動紹介・入部申請", group: "club", createdByAdmin: true },
  { key: "club-all", label: "活動報告", group: "club", createdByAdmin: true },
  ...CLUBS.map((club) => ({
    key: `club-${club.id}`,
    label: club.name,
    group: "club" as const,
    createdByAdmin: true,
  })),
];

export const BOARD_HOME_ORDER = [
  "introduction",
  "club",
  "meal-report",
  "gourmet-contest",
  "gourmet-advice",
  "free-chat",
  "gourmet-map",
] as const;

export const GENRES = [
  "焼肉", "寿司", "ラーメン", "居酒屋", "イタリアン", "フレンチ",
  "中華", "カフェ", "和食", "創作料理", "たこ焼き", "その他",
];

// Helper: get member by id
export function getMemberById(id: string): Member | undefined {
  return MEMBERS.find((m) => m.id === id);
}

// Helper: check if user is admin
export function isAdmin(member: Member): boolean {
  return member.role === "admin";
}

// Helper: get today's events (including board recruiting events)
export function getTodayEvents(): { events: Event[]; boardEvents: BoardThread[] } {
  const todayStr = new Date().toISOString().split("T")[0];
  const events = EVENTS.filter((e) => e.date === todayStr);
  const boardEvents = BOARD_THREADS.filter((t) => t.isRecruiting && t.eventDate === todayStr);
  return { events, boardEvents };
}

// Helper: get rank from level
export function getRankFromLevel(level: number): MemberRank {
  // 後方互換: ポイントベースの getRankFromPoints を推奨
  if (level >= 15) return "platinum";
  if (level >= 10) return "gold";
  if (level >= 5) return "silver";
  return "regular";
}
