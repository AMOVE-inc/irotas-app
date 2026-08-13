import { MEMBERS, type BoardComment, type BoardThread, type Member } from "./mock-data";

const operator: Member = {
  id: "discord-operator", name: "IRO+運営", avatar: MEMBERS[0].avatar,
  rank: "platinum", points: 0, level: 1, branch: "kanto", generation: 1, bio: "",
  interests: [], role: "operator", joinedAt: "2024-01-01",
};

function member(id: string, name: string): Member {
  return { id, name, avatar: MEMBERS[0].avatar, rank: "regular", points: 0, level: 1, branch: "kanto", generation: 1, bio: "", interests: [], role: "member", joinedAt: "2024-01-01" };
}

function hearts(count: number): Record<string, string[]> | undefined {
  return count ? { "❤️": Array.from({ length: count }, (_, index) => `discord-heart-${index + 1}`) } : undefined;
}

const discordImage = (channel: string, attachment: string, filename: string) =>
  `https://cdn.discordapp.com/attachments/${channel}/${attachment}/${filename}`;

const threads: BoardThread[] = [
  {
    id: "imported-contest-1531090130834559107", title: "第23回 立ち飲み屋", author: operator,
    category: "gourmet-contest", commentCount: 6, lastUpdated: "2026-08-09T13:43:33.001Z",
    preview: "ガード下の名店から、おしゃれなセンベロバルまで。イチオシの立ち飲み屋を募集しました。",
    isRecruiting: false,
    gourmetContest: { commentDeadline: "2026-08-08", prizeTitle: "IRO+イベントクーポン 3,000円分", prizeDescription: "Discordから移行した過去大会", prizeExpiresAt: "2026-08-08", archived: true, winnerName: "サら" },
  },
  {
    id: "imported-contest-1525867759475621908", title: "第22回 No.1 オムライス選手権", author: operator,
    category: "gourmet-contest", commentCount: 4, lastUpdated: "2026-07-13T16:17:05.185Z",
    preview: "王道の薄皮たまごから、とろけるドレスドオムライスまで。イチオシのオムライスを募集しました。",
    isRecruiting: false,
    images: [discordImage("1525867759475621908", "1525867760091926599", "11.png")],
    gourmetContest: { commentDeadline: "2026-07-25", prizeTitle: "IRO+イベントクーポン 3,000円分", prizeDescription: "Discordから移行した過去大会", prizeExpiresAt: "2026-07-25", archived: true, winnerName: "こーすけ【SILVER】" },
  },
];

const comments: BoardComment[] = [
  {
    id: "1533834816905023518", threadId: threads[0].id, author: member("971320405342171166", "サら"), createdAt: "2026-08-03T13:51:57.623Z",
    content: "鶏皮煮込み、酒粕おでん、大人のたまごどうふ\nつねまつ久蔵商店（月島）\n日本酒はもちろん、おつまみも豊富。ちょい飲みにも1軒目にもおすすめです。",
    images: [discordImage("1531090130834559107", "1533834817052082176", "IMG_4354.png"), discordImage("1531090130834559107", "1533834817404272872", "IMG_4353.png")], reactions: hearts(2),
  },
  {
    id: "1535652075474649130", threadId: threads[0].id, author: member("1522253038994063410", "りか"), createdAt: "2026-08-08T14:13:05.829Z",
    content: "牡蠣の燻製、茄子、ムール貝の酒蒸し\nオステリア ダ アダ 銀座\nリーズナブルにヴェネチア本場の料理とワインを楽しめます。",
    images: [discordImage("1531090130834559107", "1535652129002491955", "IMG_1576.png"), discordImage("1531090130834559107", "1535652129518133368", "IMG_1575.png"), discordImage("1531090130834559107", "1535652129828634694", "IMG_1572.jpg")],
  },
  { id: "1535825030058086441", threadId: threads[0].id, author: member("789786995970015242", "たけまる【運営】"), createdAt: "2026-08-09T01:40:21.415Z", content: "こんなおしゃれな立ち飲み屋が！池袋の小島もおすすめです。", images: [discordImage("1531090130834559107", "1535825987873275964", "640x640_rect_ead9f652996439c3fa4d6e6b5d087627.jpg"), discordImage("1531090130834559107", "1535825988204761332", "2026-08-09_104229.png")] },
  { id: "1535905247208411156", threadId: threads[0].id, author: member("1522253038994063410", "りか"), createdAt: "2026-08-09T06:59:06.674Z", content: "ぜひ！池袋の小島も気になります。" },
  { id: "1535911461581492294", threadId: threads[0].id, author: member("789786995970015242", "たけまる【運営】"), createdAt: "2026-08-09T07:23:48.296Z", content: "行ってみます！" },
  { id: "1536007027560808470", threadId: threads[0].id, author: member("971320405342171166", "サら"), createdAt: "2026-08-09T13:43:33.001Z", content: "とてもおすすめのお店なので、興味のある皆さまとご一緒できると嬉しいです。" },
  {
    id: "1526189170639507466", threadId: threads[1].id, author: member("1458658308004249632", "shio"), createdAt: "2026-07-13T11:30:53.504Z",
    content: "新宿特製オムライス／珈琲西武\nふわとろ卵と、ぎっしり詰まったご飯でボリューム満点。昭和レトロな店内も素敵です。",
    images: [discordImage("1525867759475621908", "1526189170278793387", "IMG_5630.jpg")], reactions: hearts(2),
  },
  {
    id: "1526220527163670638", threadId: threads[1].id, author: member("1059373969590984764", "天ぷら（てつや）"), createdAt: "2026-07-13T13:35:29.482Z",
    content: "全部のせオムライス／オムの細道\nお子さまランチのような夢が詰まったオムライス。オムハヤシやチーズオムライスも絶品です。",
    images: [discordImage("1525867759475621908", "1526220526920536184", "20260405_132709.jpg")], reactions: hearts(4),
  },
  {
    id: "1526260324305604618", threadId: threads[1].id, author: member("1452174899438288918", "Hazuki"), createdAt: "2026-07-13T16:13:37.860Z",
    content: "Kichikichiオムライス／ザ・洋食屋 キチ・キチ\n目の前でオムレツを割って仕上げてくれる演出が特徴的で、特別感のある体験でした。",
    images: [discordImage("1525867759475621908", "1526260325203181660", "IMG_7688.jpg"), discordImage("1525867759475621908", "1526260326176395505", "IMG_7689.jpg"), discordImage("1525867759475621908", "1526260326624923851", "IMG_7712.jpg")],
  },
  { id: "1526260324305604618-reply", threadId: threads[1].id, author: member("1119606639763390545", "Non【IRO+代表】"), createdAt: "2026-07-13T16:17:05.185Z", content: "調理パフォーマンスも含めて印象に残るオムライスです。" },
];

export const SEEDED_GOURMET_CONTESTS = threads.map((thread) => ({
  thread,
  comments: comments.filter((comment) => comment.threadId === thread.id),
}));
