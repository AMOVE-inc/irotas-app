// Mock data for IRO＋ app development

export type MemberRank = "regular" | "silver" | "gold" | "platinum";
export type UserRole = "member" | "admin";

export interface Member {
  id: string;
  name: string;
  avatar: number;
  rank: MemberRank;
  points: number; // 累計ポイント
  level: number; // 後方互換用（pointsから自動計算）
  branch: "kanto" | "kansai";
  generation: number; // 何期生
  bio: string; // 自己紹介文
  interests: string[]; // 好きなジャンル
  role: UserRole;
  joinedAt: string;
  gender?: "male" | "female" | "other" | "unset"; // 性別（分析用）
}

// --- ポイント制ランクシステム ---

export const POINT_ACTIONS = {
  eventJoin: { points: 10, label: "イベント参加" },
  boardPost: { points: 5, label: "掲示板投稿" },
  comment: { points: 2, label: "コメント投稿" },
  clubActivity: { points: 3, label: "部活動参加" },
  restaurantRegister: { points: 8, label: "店舗登録" },
  eventOrganize: { points: 15, label: "イベント幹事" },
} as const;

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
  title: string;
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
  eventType: "official" | "gourmet";
  status: "open" | "full" | "ended";
  createdBy: string; // admin member id
  chatId?: string; // private chat id
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
  recruitCapacity?: number;
  recruitAttendees?: number;
  recruitParticipants?: string[]; // 承認済み参加者 member ids
  recruitApplicants?: string[]; // 参加申請中 member ids
  chatId?: string; // private chat id
  eventDate?: string; // 開催日（今日のイベント表示用）
  images?: string[]; // 投稿添付画像 URLs
  mealReport?: {
    restaurantName: string;
    prefecture: string;
    budget?: string;
    recommendedMenu?: string;
    rating: number;
    comment?: string;
    googleMapUrl: string;
  };
}

export interface BoardComment {
  id: string;
  threadId: string;
  author: Member;
  content: string;
  createdAt: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: "event" | "board" | "club" | "rank";
  sourceId: string; // event id or thread id or club id
  participants: string[]; // member ids
  createdBy: string;
  lastMessage?: string;
  lastMessageAt?: string;
  requiredRank?: MemberRank; // ランクチャット: このランク以上のメンバーが参加可能
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  imageUri?: string;
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
  memberIds: string[];
  applicantIds: string[]; // 入部申請中のメンバーID
  chatId?: string;
  icon: string;
  createdByAdmin: boolean; // 管理者のみ作成可能
  events: ClubEvent[]; // 部活動イベント（部員が企画可能）
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
  },
  {
    id: "u3", name: "たくみ",
    avatar: DEFAULT_AVATAR,
    rank: "silver", points: 180, level: 7, branch: "kansai", generation: 2,
    bio: "大阪在住のラーメン好き。関西の美味しいお店を開拓中です。",
    interests: ["ラーメン", "たこ焼き", "お好み焼き"],
    role: "member", joinedAt: "2024-07-01", gender: "male",
  },
  {
    id: "u4", name: "ゆうき",
    avatar: DEFAULT_AVATAR,
    rank: "gold", points: 530, level: 11, branch: "kanto", generation: 1,
    bio: "銀座のお寿司屋さん巡りが週末の楽しみ。ワインも好きです。",
    interests: ["寿司", "ワイン", "フレンチ"],
    role: "member", joinedAt: "2024-05-01", gender: "male",
  },
  {
    id: "u5", name: "あおい",
    avatar: DEFAULT_AVATAR,
    rank: "regular", points: 45, level: 3, branch: "kansai", generation: 3,
    bio: "京都のカフェ巡りが好きです。最近IRO＋に入会しました！",
    interests: ["カフェ", "和食", "スイーツ"],
    role: "member", joinedAt: "2025-01-15", gender: "female",
  },
  {
    id: "u6", name: "りょう",
    avatar: DEFAULT_AVATAR,
    rank: "gold", points: 510, level: 10, branch: "kanto", generation: 1,
    bio: "居酒屋とバーが好き。IRO＋のイベント企画もよくやっています。",
    interests: ["居酒屋", "バー", "クラフトビール"],
    role: "member", joinedAt: "2024-04-20", gender: "male",
  },
  {
    id: "u7", name: "みさき",
    avatar: DEFAULT_AVATAR,
    rank: "silver", points: 150, level: 6, branch: "kansai", generation: 2,
    bio: "大阪で料理教室に通っています。手作り料理の写真もよく投稿します。",
    interests: ["和食", "イタリアン", "パン"],
    role: "member", joinedAt: "2024-08-01", gender: "female",
  },
  {
    id: "u8", name: "けんた",
    avatar: DEFAULT_AVATAR,
    rank: "regular", points: 20, level: 2, branch: "kanto", generation: 4,
    bio: "新メンバーです。よろしくお願いします！",
    interests: [],
    role: "member", joinedAt: "2026-02-01", gender: "male",
  },
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
    images: ["https://images.unsplash.com/photo-1544025162-d76694265947?w=400"],
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
    id: "e1", title: "第3回 関東支部交流会",
    description: "関東支部メンバーの交流を深める食事会です。今回は恵比寿の隠れ家イタリアンで開催！",
    date: today, time: "18:30", location: "恵比寿 リストランテ・ベッラ",
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400",
    capacity: 20, attendees: 14, participants: ["u1", "u2", "u4", "u6"],
    price: "¥5,000",
    rankPrices: { regular: "¥5,000", silver: "¥4,500", gold: "¥4,000", platinum: "¥3,500" },
    category: "kanto", eventType: "official", status: "open",
    createdBy: "u1", chatId: "chat1",
  },
  {
    id: "e2", title: "IRO＋ 2周年記念パーティー",
    description: "IRO＋設立2周年を記念した特別パーティー！全国のメンバーが集結します。",
    date: "2026-04-26", time: "17:00", location: "六本木 グランドホール",
    image: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400",
    capacity: 80, attendees: 52, participants: ["u1", "u2", "u3", "u4", "u5", "u6"],
    price: "¥8,000",
    rankPrices: { regular: "¥8,000", silver: "¥7,000", gold: "¥6,000", platinum: "¥5,000" },
    category: "all", eventType: "official", status: "open",
    createdBy: "u1", chatId: "chat2",
  },
  {
    id: "e3", title: "関西グルメツアー in 道頓堀",
    description: "大阪の名店を巡るグルメツアー。食い倒れの街を一緒に楽しみましょう！",
    date: "2026-04-19", time: "11:00", location: "道頓堀周辺",
    image: "https://images.unsplash.com/photo-1590559899731-a382839e5549?w=400",
    capacity: 15, attendees: 15, participants: ["u3", "u5", "u7"],
    price: "¥3,000",
    rankPrices: { regular: "¥3,000", silver: "¥2,500", gold: "¥2,000", platinum: "¥1,500" },
    category: "kansai", eventType: "gourmet", status: "full",
    createdBy: "u1",
  },
  {
    id: "e4", title: "グルメ選手権 2026春",
    description: "メンバーが推薦する最高の一品を決める投票イベント！",
    date: "2026-05-10", time: "14:00", location: "オンライン",
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
    capacity: 100, attendees: 28, participants: ["u1", "u2", "u3"],
    price: "無料", category: "all", eventType: "official", status: "open",
    createdBy: "u1",
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
    id: "t1", title: "渋谷でおすすめの焼肉屋さん教えてください！",
    author: MEMBERS[3], category: "gourmet-advice", commentCount: 15,
    lastUpdated: "2026-03-23T14:00:00",
    preview: "今度渋谷で食事会をするのですが、おすすめの焼肉屋さんがあれば教えてください...",
    isRecruiting: false,
  },
  {
    id: "t2", title: "大阪の隠れ家イタリアンを発見！",
    author: MEMBERS[2], category: "kansai-branch", commentCount: 8,
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
    mealReport: {
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
    id: "t4", title: "東飲みしたい人集まれ！🍻",
    author: MEMBERS[5], category: "kanto-branch", commentCount: 30,
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
    id: "t7", title: "IRO＋コミュニティからのお知らせ",
    author: MEMBERS[0], category: "announcement", commentCount: 3,
    lastUpdated: "2026-03-24T09:00:00",
    preview: "今月のコミュニティ運営とイベントについてお知らせします。",
    isRecruiting: false,
  },
  {
    id: "t8", title: "はじめまして！かずまです",
    author: MEMBERS[0], category: "free-chat", commentCount: 7,
    lastUpdated: "2026-03-24T08:30:00",
    preview: "美味しいものを囲んで、みなさんと楽しく交流できたらうれしいです！",
    isRecruiting: false,
  },
  {
    id: "t9", title: "今月の部活動レポート",
    author: MEMBERS[0], category: "club-all", commentCount: 9,
    lastUpdated: "2026-03-24T07:30:00",
    preview: "ラーメン部とワイン部の活動写真をまとめました。次回の参加もお待ちしています！",
    isRecruiting: false,
  },
];

export const BOARD_COMMENTS: BoardComment[] = [
  { id: "bc1", threadId: "t1", author: MEMBERS[0], content: "焼肉罪と罰がおすすめです！A5ランクの和牛が最高ですよ。", createdAt: "2026-03-23T14:30:00" },
  { id: "bc2", threadId: "t1", author: MEMBERS[1], content: "渋谷なら「叙々苑」も間違いないですよ。", createdAt: "2026-03-23T15:00:00" },
  { id: "bc3", threadId: "t1", author: MEMBERS[5], content: "最近できた「焼肉キング」も良かったです！", createdAt: "2026-03-23T16:00:00" },
  { id: "bc4", threadId: "t4", author: MEMBERS[0], content: "参加します！楽しみにしてます🍻", createdAt: "2026-03-23T19:30:00" },
  { id: "bc5", threadId: "t4", author: MEMBERS[1], content: "私も行きたいです！", createdAt: "2026-03-23T20:00:00" },
];

export const CHAT_ROOMS: ChatRoom[] = [
  {
    id: "chat1", name: "第3回 関東支部交流会", type: "event", sourceId: "e1",
    participants: ["u1", "u2", "u4", "u6"], createdBy: "u1",
    lastMessage: "楽しみにしてます！", lastMessageAt: "2026-03-23T10:00:00",
  },
  {
    id: "chat2", name: "IRO＋ 2周年記念パーティー", type: "event", sourceId: "e2",
    participants: ["u1", "u2", "u3", "u4", "u5", "u6"], createdBy: "u1",
    lastMessage: "ドレスコードはありますか？", lastMessageAt: "2026-03-22T18:00:00",
  },
  {
    id: "chat3", name: "東飲みしたい人集まれ！", type: "board", sourceId: "t4",
    participants: ["u6", "u1", "u2", "u4"], createdBy: "u6",
    lastMessage: "場所は新宿でどうですか？", lastMessageAt: "2026-03-23T20:30:00",
  },
  {
    id: "chat4", name: "関西グルメ同好会 次回集まり", type: "board", sourceId: "t6",
    participants: ["u7", "u3", "u5"], createdBy: "u7",
    lastMessage: "心斎橋集合でいいですか？", lastMessageAt: "2026-03-23T11:00:00",
  },
  // ランク別チャットルーム
  {
    id: "rank-regular", name: "レギュラーメンバールーム",
    type: "rank", sourceId: "rank-regular",
    participants: ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"],
    createdBy: "system",
    requiredRank: "regular",
    lastMessage: "IRO＋全会員が参加できるルームです。", lastMessageAt: "2026-03-20T10:00:00",
  },
  {
    id: "rank-silver", name: "シルバー以上ルーム",
    type: "rank", sourceId: "rank-silver",
    participants: ["u1", "u2", "u3", "u4", "u6", "u7"],
    createdBy: "system",
    requiredRank: "silver",
    lastMessage: "シルバー以上の会員さんのルームです。", lastMessageAt: "2026-03-21T10:00:00",
  },
  {
    id: "rank-gold", name: "ゴールド以上ルーム",
    type: "rank", sourceId: "rank-gold",
    participants: ["u1", "u2", "u4", "u6"],
    createdBy: "system",
    requiredRank: "gold",
    lastMessage: "ゴールド以上の会員さんのルームです。", lastMessageAt: "2026-03-22T10:00:00",
  },
  {
    id: "rank-platinum", name: "プラチナルーム",
    type: "rank", sourceId: "rank-platinum",
    participants: ["u2"],
    createdBy: "system",
    requiredRank: "platinum",
    lastMessage: "プラチナ会員さんのルームです。", lastMessageAt: "2026-03-23T10:00:00",
  },
];

export const CHAT_MESSAGES: ChatMessage[] = [
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
    id: "club1", name: "ラーメン部", description: "全国のラーメンを食べ歩く部活。月回の活動あり。",
    leaderId: "u3", memberIds: ["u3", "u1", "u4", "u8"], applicantIds: [], icon: "🍜", createdByAdmin: true,
    events: [
      {
        id: "ce1", title: "渋谷ラーメン巡り", description: "渋谷エリアの名店を巡ります。",
        date: "2026-04-20", location: "渋谷区", organizerId: "u3",
        applicantIds: ["u1"], approvedIds: [], maxParticipants: 6,
      },
    ],
  },
  {
    id: "club2", name: "ワイン部", description: "ワインの知識を深めながら楽しむ部活。テイスティング会も開催。",
    leaderId: "u2", memberIds: ["u2", "u4", "u6"], applicantIds: ["u8"], icon: "🍷", createdByAdmin: true,
    events: [],
  },
  {
    id: "club3", name: "スイーツ部", description: "話題のスイーツやカフェを巡る部活。",
    leaderId: "u5", memberIds: ["u5", "u7", "u1"], applicantIds: [], icon: "🍰", createdByAdmin: true,
    events: [],
  },
  {
    id: "club4", name: "料理部", description: "みんなで料理を作って楽しむ部活。月２回の料理会を開催。",
    leaderId: "u7", memberIds: ["u7", "u2", "u5"], applicantIds: [], icon: "👨‍🍳", createdByAdmin: true,
    events: [],
  },
];

export const COUPONS: Coupon[] = [
  {
    id: "c1", title: "焼肉 罪と罰 10%OFF",
    description: "IRO＋会員限定！お会計から10%割引",
    discount: "10%OFF", expiresAt: "2026-06-30", code: "IROPLUS2026", requiredRank: "regular",
  },
  {
    id: "c2", title: "鮨 静龍苑 ドリンク1杯無料",
    description: "シルバー会員以上限定。お好きなドリンク1杯サービス",
    discount: "ドリンク1杯無料", expiresAt: "2026-05-31", code: "IROSILVER2026", requiredRank: "silver",
  },
  {
    id: "c3", title: "ゴールド限定 コース10%OFF",
    description: "ゴールド会員以上限定の特別割引",
    discount: "コース10%OFF", expiresAt: "2026-08-31", code: "IROGOLD2026", requiredRank: "gold",
  },
  {
    id: "c4", title: "プラチナ限定 特別コース招待",
    description: "プラチナ会員限定の特別コースにご招待",
    discount: "特別コース", expiresAt: "2026-12-31", code: "IROPLAT2026", requiredRank: "platinum",
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
  platinum: "#E5E4E2",
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
  { key: "announcement", label: "運営アナウンス", group: "all", createdByAdmin: true },
  { key: "meal-report", label: "今日のごちそうさま報告", group: "all", createdByAdmin: true },
  { key: "gourmet-advice", label: "教えてグルメ相談室", group: "all", createdByAdmin: true },
  { key: "free-chat", label: "フリーチャット", group: "all", createdByAdmin: true },
  { key: "kanto-branch", label: "関東", group: "area", createdByAdmin: true },
  { key: "kansai-branch", label: "関西", group: "area", createdByAdmin: true },
  { key: "club-all", label: "全体活動報告", group: "club", createdByAdmin: true },
  ...CLUBS.map((club) => ({
    key: `club-${club.id}`,
    label: club.name,
    group: "club" as const,
    createdByAdmin: true,
  })),
];

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
