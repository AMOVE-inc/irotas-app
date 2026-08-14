import { MEMBERS, type BoardComment, type BoardThread, type Member } from "./mock-data";
import c23Img4354 from "../assets/images/discord-contests/23-IMG_4354.png";
import c23Img4353 from "../assets/images/discord-contests/23-IMG_4353.png";
import c23Img1576 from "../assets/images/discord-contests/23-IMG_1576.png";
import c23Img1575 from "../assets/images/discord-contests/23-IMG_1575.png";
import c23Img1572 from "../assets/images/discord-contests/23-IMG_1572.jpg";
import c23Rect from "../assets/images/discord-contests/23-640x640_rect_ead9f652996439c3fa4d6e6b5d087627.jpg";
import c23Screenshot from "../assets/images/discord-contests/23-2026-08-09_104229.png";
import c22Cover from "../assets/images/discord-contests/22-11.png";
import c22Img5630 from "../assets/images/discord-contests/22-IMG_5630.jpg";
import c22Tetsuya from "../assets/images/discord-contests/22-20260405_132709.jpg";
import c22Img7688 from "../assets/images/discord-contests/22-IMG_7688.jpg";
import c22Img7689 from "../assets/images/discord-contests/22-IMG_7689.jpg";
import c22Img7712 from "../assets/images/discord-contests/22-IMG_7712.jpg";
import c22Img7713 from "../assets/images/discord-contests/22-IMG_7713.jpg";
import c22Img7715 from "../assets/images/discord-contests/22-IMG_7715.jpg";
import c22Img7678 from "../assets/images/discord-contests/22-IMG_7678.jpg";
import c22Img7680 from "../assets/images/discord-contests/22-IMG_7680.jpg";
import c22Natchan from "../assets/images/discord-contests/22-IMG_1076.jpg";
import c22Nori from "../assets/images/discord-contests/22-IMG_3416_Original.jpg";
import c22Kosuke1 from "../assets/images/discord-contests/22-8FAC9787-7AB5-444C-9B4F-C98799461932.png";
import c22Kosuke2 from "../assets/images/discord-contests/22-5E27904F-9850-4F28-B7CD-129BE7CF3D19.png";
import c24Cover from "../assets/images/discord-contests/24-cover.png";
import c24Manaka from "../assets/images/discord-contests/24-IMG_7907.jpg";

const operator: Member = { id: "discord-operator", name: "IRO+運営", avatar: MEMBERS[0].avatar, rank: "platinum", points: 0, level: 1, branch: "kanto", generation: 1, bio: "", interests: [], role: "operator", joinedAt: "2024-01-01" };
const member = (id: string, name: string): Member => ({ id, name, avatar: MEMBERS[0].avatar, rank: "regular", points: 0, level: 1, branch: "kanto", generation: 1, bio: "", interests: [], role: "member", joinedAt: "2024-01-01" });
const hearts = (count: number): Record<string, string[]> | undefined => count ? { "❤️": Array.from({ length: count }, (_, index) => `discord-heart-${index + 1}`) } : undefined;

const assets = {
  c23sara: [c23Img4354, c23Img4353],
  c23rika: [c23Img1576, c23Img1575, c23Img1572],
  c23takemaru: [c23Rect, c23Screenshot],
  c22cover: c22Cover,
  c22shio: [c22Img5630],
  c22tetsuya: [c22Tetsuya],
  c22hazuki: [c22Img7688, c22Img7689, c22Img7712, c22Img7713, c22Img7715, c22Img7678, c22Img7680],
  c22natchan: [c22Natchan],
  c22nori: [c22Nori],
  c22kosuke: [c22Kosuke1, c22Kosuke2],
};

const importedRichThreads: BoardThread[] = [
  { id: "imported-contest-1531090130834559107", title: "第23回 立ち飲み屋", author: operator, category: "gourmet-contest", commentCount: 7, lastUpdated: "2026-08-09T13:43:33.001Z", preview: String.raw`\ 第23回！グルメ選手権開催 /

今回のテーマは…

立ち飲み屋

ガード下の味わい深い名店から、一串入魂の焼き鳥店、サクッと立ち寄れるおしゃれなセンベロバルまで！
「仕事帰りに一杯だけ…のつもりが居心地が良すぎる！」「安くて美味いあてとキリッと冷えたレモンサワーが最高！」
そんなあなたのイチオシ立ち飲み屋を教えてください！`, isRecruiting: false, gourmetContest: { commentDeadline: "2026-08-08", prizeTitle: "IRO+イベントクーポン 3,000円分", prizeDescription: "Discordから移行した過去大会", prizeExpiresAt: "2026-08-08", archived: true, winnerName: "サら" } },
  { id: "imported-contest-1525867759475621908", title: "第22回 No.1 オムライス選手権", author: operator, category: "gourmet-contest", commentCount: 10, lastUpdated: "2026-08-09T01:56:00.000Z", preview: String.raw`\ 第22回！グルメ選手権開催 /

今回のテーマは…

No.1 オムライス選手権

昔ながらの洋食屋さんの王道薄皮たまご、カフェで出会うとろ〜り半熟ドレスドオムライス、濃厚なデミグラスソースやホワイトソースがかかった絶品まで！
「スプーンを入れた瞬間にとろけ出すたまごがたまらない…！」「ケチャップライスの香ばしさとバターのコクが最高！」`, isRecruiting: false, images: [assets.c22cover], gourmetContest: { commentDeadline: "2026-07-25", prizeTitle: "IRO+イベントクーポン 3,000円分", prizeDescription: "Discordから移行した過去大会", prizeExpiresAt: "2026-07-25", archived: true, winnerName: "こーすけ【🥈SILVER 】" } },
];

const archivedContestHistory = [
  [21, "No.1ジビエ決定戦", "2026-07-11", "八木下修平/八木下農園"],
  [20, "最強のタイ料理", "2026-07-04", "Momoko【🥇GOLD 】"],
  [19, "ピザNo.1", "2026-06-12", "Hono🎭舞台鑑賞部長【🥇GOLD 】"],
  [18, "最強かき氷", "2026-05-30", "のんた🐭ディズニー部長【💎PLATINUM 】"],
  [17, "カレーNo.1選手権", "2026-05-16", "ななみ【🥇GOLD 】"],
  [16, "パン飲みNo.1選手権", "2026-05-02", "mana【🥈SILVER 】"],
  [15, "カジュアル焼き鳥選手権（1万以下）", "2026-04-18", "たけまる【運営】"],
  [14, "うどん No.1決定戦", "2026-04-04"],
  [13, "コンビニおにぎり頂上決戦", "2026-03-28"],
  [12, "サイゼリヤNo.1メニュー", "2026-03-21"],
  [11, "至福の焼肉", "2026-03-14"],
  [10, "推しカフェ", "2026-03-07"],
  [9, "最強の〆", "2026-02-28"],
  [8, "最高の朝食", "2026-02-21"],
  [7, "究極の旨辛グルメ", "2026-02-14"],
  [6, "冬の海鮮", "2026-02-07"],
  [5, "実は教えたくない地元の名店", "2026-01-31"],
  [4, "愛しのビストロ", "2026-01-24"],
  [3, "最強のコンビニスイーツ", "2026-01-23"],
  [2, "自分へのご褒美ごはん", "2025-08-31"],
  [1, "初デートにぴったりなお店", "2025-05-03"],
] as const;

const archivedThreads: BoardThread[] = archivedContestHistory.map(([round, theme, deadline, winnerName]) => ({
  id: `imported-contest-history-${round}`,
  title: `第${round}回 ${theme}`,
  author: operator,
  category: "gourmet-contest",
  commentCount: 0,
  lastUpdated: `${deadline}T23:59:59.000+09:00`,
  preview: `\\ 第${round}回！グルメ選手権開催 /\n\n今回のテーマは…\n\n${theme}`,
  isRecruiting: false,
  gourmetContest: {
    commentDeadline: deadline,
    prizeTitle: "IRO+イベントクーポン 3,000円分",
    prizeDescription: "Discordから移行した過去大会",
    prizeExpiresAt: deadline,
    archived: true,
    winnerName,
  },
}));

const contest24: BoardThread = {
  id: "imported-contest-1535828863127654410",
  title: "第24回 麻辣湯",
  author: operator,
  category: "gourmet-contest",
  commentCount: 1,
  lastUpdated: "2026-08-12T12:28:00.000+09:00",
  preview: `\\ 第24回！グルメ選手権開催 /

今回のテーマは…

麻辣湯

ピリッと痺れる花椒の辛さと、奥深い薬膳スープの旨味がクセになる！
「自分好みのトッピングを攻めたい！」「辛いのに箸が止まらない…！」
そんなあなたのイチオシ麻辣湯を教えてください！

話題のお店はもちろん、テイクアウトや自宅で作るアレンジ麻辣湯も大歓迎！`,
  isRecruiting: false,
  images: [c24Cover],
  gourmetContest: {
    commentDeadline: "2026-08-22",
    prizePoints: 3000,
  },
};

const comments: BoardComment[] = [
  { id: "1536327351992979516", threadId: contest24.id, author: member("discord-manaka", "🌸まなか🌸【🥈SILVER 】"), createdAt: "2026-08-10T19:56:00.000+09:00", content: `メニュー・トッピング
キクラゲ、レタス、ほうれん草、パクチー等
麺は板春雨が個人的にイチオシです
とうもろこし麺というラーメンみたいな麺が男性人気高い印象です

店名
串串香 麻辣湯 池袋店
https://tabelog.com/tokyo/A1305/A130501/13175047/

推しポイント
①癖のないスープが美味しすぎる
薬膳感があまりなく、万人受けする味だと思います〜！
麻辣湯食べたことない人にもオススメです

②コスパ最強すぎる
頼みすぎたかもと思っても1,500円いかなかった気がします
加えて、麺のおかわりが1回まで無料です！！種類を変えることもできます`, images: [c24Manaka], reactions: hearts(6) },
  { id: "1533834816905023518", threadId: importedRichThreads[0].id, author: member("971320405342171166", "サら"), createdAt: "2026-08-03T13:51:57.623Z", content: `鶏皮煮込み、酒粕おでん、大人のたまごどうふ
つねまつ久蔵商店@月島
https://tabelog.com/tokyo/A1313/A131302/13192007/
月島の人気立ち飲み店で、平日も早い時間から賑わっています！けやきの木のカウンターが店内中央に鎮座しており、とてもかっこいいです。
日本酒はもちろん、おつまみのラインナップも豊富なので、ちょい飲みはもちろん、1軒目利用もおすすめしたいです！
島根を中心とした日本酒がメインのお店ですが、ビールがまた美味しいので、ビール好きの方もたのしめると思います`, images: assets.c23sara, reactions: hearts(2) },
  { id: "1535652075474649130", threadId: importedRichThreads[0].id, author: member("1522253038994063410", "りか"), createdAt: "2026-08-08T14:13:05.829Z", content: `1.牡蠣の燻製、茄子、ムール　　　貝の酒蒸し
2.オステリア ダ アダ 銀座
東京都中央区銀座6-4-3 GICROS 4F
https://tabelog.com/tokyo/A1301/A130101/13240885/
3.リーズナブルにサクッとヴェネチア本場の料理とワインが楽します
昼飲みでパスタなしだと2000円以内でコスパ良かったです！
奥にテーブル席もあるので立ち飲み以外でも◎`, images: assets.c23rika },
  { id: "1535825030058086441", threadId: importedRichThreads[0].id, author: member("789786995970015242", "たけまる【運営】"), createdAt: "2026-08-09T01:40:21.415Z", content: "@りか こんなおしゃれな立ち飲み屋が！！！" },
  { id: "1535825987730800722", threadId: importedRichThreads[0].id, author: member("789786995970015242", "たけまる【運営】"), createdAt: "2026-08-09T01:44:00.000Z", content: `おすすめのメニュー・おつまみ：豚キムチ
店名・場所：池袋・小島 https://tabelog.com/tokyo/A1305/A130501/13115528/
推しポイント（一言でOK！）：おじいちゃんおばあちゃんでやってる、古くから池袋で愛されている立ち飲み屋。
近くにばんぱいやもありますが、こちらで時間をつぶして0次会することが多いです。`, images: assets.c23takemaru },
  { id: "1535905247208411156", threadId: importedRichThreads[0].id, author: member("1522253038994063410", "りか"), createdAt: "2026-08-09T06:59:06.674Z", content: "@たけまる【運営】 ぜひ！！\n池袋の小島も気になります" },
  { id: "1535911461581492294", threadId: importedRichThreads[0].id, author: member("789786995970015242", "たけまる【運営】"), createdAt: "2026-08-09T07:23:48.296Z", content: "いってみまーす！！！！！" },
  { id: "1536007027560808470", threadId: importedRichThreads[0].id, author: member("971320405342171166", "サら"), createdAt: "2026-08-09T13:43:33.001Z", content: "わ〜ありがとうございますとってもおすすめのお店なので、ご興味のある方がいらっしゃれば皆さまとご一緒できますと嬉しいです、、" },
  { id: "1526189170639507466", threadId: importedRichThreads[1].id, author: member("1458658308004249632", "shio"), createdAt: "2026-07-13T11:30:53.504Z", content: `1 新宿特製オムライス
2 珈琲西武
3 ふわとろ卵好きにはたまらないオムライスでした
卵のとろっとした食感と、ぎっしり詰まったご飯でボリュームも満点

昭和レトロな雰囲気の店内も素敵で、ゆっくり過ごせるのも魅力
人気店なので並ぶこともありますが、店内は広めで回転率も良かったです`, images: assets.c22shio, reactions: hearts(2) },
  { id: "1526220527163670638", threadId: importedRichThreads[1].id, author: member("1059373969590984764", "天ぷら(てつや【🥇GOLD 】"), createdAt: "2026-07-13T13:35:29.482Z", content: `1 .全部のせオムライス
2 .オムの細道

推しポイント,お子さまランチのような夢が詰まったオムライス

完全予約制で毎日満席です。オムハヤシやチーズオムライスも絶品`, images: assets.c22tetsuya, reactions: hearts(4) },
  { id: "1526260324305604618", threadId: importedRichThreads[1].id, author: member("1452174899438288918", "Hazuki"), createdAt: "2026-07-13T16:13:37.860Z", content: `Kichikichiオムライス,ザ・洋食屋　キチ・キチ,https://s.tabelog.com/kyoto/A2601/A260301/26000226/調理パフォーマンスが人気な京都の有名洋食屋さんのオムライスです,
数年前に当日席で伺ったのですが、今は完全予約制のようです…！
10人分のご飯を一度にフライパンで調理する迫力に加え、目の前でオムレツを割って仕上げてくれる演出が特徴的です
特別感のある体験としてとても印象に残っています
(画質粗々ですみせん、、)`, images: assets.c22hazuki },
  { id: "1526260324305604618-reply", threadId: importedRichThreads[1].id, author: member("1119606639763390545", "Non【IRO+代表】"), createdAt: "2026-07-14T05:18:00.000Z", content: "うわーここ5年以上前から保存してたけどまだ行けてない 😂" },
  { id: "1526260324305604618-hazuki-reply", threadId: importedRichThreads[1].id, author: member("1452174899438288918", "Hazuki"), createdAt: "2026-07-14T11:09:00.000Z", content: `こっち来てからだと関西のお店は中々行く機会ないですよね 😭
3年半くらい前に行ったのですが、今インスタ見たら当時よりめっちゃグローバルな感じになってました笑笑
https://www.instagram.com/kichikichi_omurice?igsh=YWhmZjJjOXZ6N3ll` },
  { id: "1526919355445674034", threadId: importedRichThreads[1].id, author: member("discord-natchan", "Natchan"), createdAt: "2026-07-15T11:52:00.000Z", content: `1.オムライス 🍳
2.喫茶 YOU
YOU 03-6226-0482
東京都中央区銀座4-13-17 高野ビル １F
https://tabelog.com/tokyo/A1301/A130101/13002318/
3.百名店にも選ばれているレトロな喫茶です‼︎
行列で並ぶ事が多いですが、ふわふわでトロトロなオムライスが特徴的です！(語彙力 😅 )
お店の雰囲気に合わせて、クリームソーダを飲む方が多いです 🥤`, images: assets.c22natchan, reactions: { "🥚": Array.from({ length: 5 }, (_, index) => `discord-egg-natchan-${index + 1}`), "❤️": ["discord-heart-natchan-1", "discord-heart-natchan-2"] } },
  { id: "1526940616712392704", threadId: importedRichThreads[1].id, author: member("discord-nori", "nori🏃ランニング部長【💎PLATINUM 】"), createdAt: "2026-07-15T13:16:00.000Z", content: `ふわふわオムライス,
リトル プール コーヒー,
https://tabelog.com/tokyo/A1306/A130602/13196008/
数年行っていませんが、表参道で安く美味しいオムライスが食べられるので、よく通っていました。写真はありませんが、とろとろも美味しいです 😋,`, images: assets.c22nori, reactions: hearts(3) },
  { id: "1527393694981030101", threadId: importedRichThreads[1].id, author: member("discord-kosuke", "こーすけ【🥈SILVER 】"), createdAt: "2026-07-16T19:17:00.000Z", content: `ドルフィンオムライス,
フランキー アンド トリニティー,
https://tabelog.com/tokyo/A1319/A131903/13046008/
ぷるふわぱっかーんオムライス！,
最近行けてないですがめっちゃ美味しいです！
卓にケチャップ置いてあるのも地味に嬉しい。
営業時間短いのがネック。。`, images: assets.c22kosuke, reactions: { "🥚": Array.from({ length: 10 }, (_, index) => `discord-egg-kosuke-${index + 1}`) } },
  { id: "discord-yuuki-omurice", threadId: importedRichThreads[1].id, author: member("discord-yuuki", "ゆうき🐬"), createdAt: "2026-07-20T08:59:00.000Z", content: `1.オムライス
2.資生堂パーラー
3.つるんとキレイな卵とバターの香りで食べると幸せになれる王道オムライスです！
付け合わせのらっきょと食べるのも味変になり美味しいです ☺️
写真がないのですが調べればすぐ出ると思います、、！
https://s.tabelog.com/tokyo/A1301/A130101/13004938/`, reactions: hearts(1) },
  { id: "discord-omurice-result", threadId: importedRichThreads[1].id, author: operator, createdAt: "2026-08-09T01:56:00.000Z", content: `🎉 結果発表 🎉
「No.1 オムライス」、見事一位に選ばれたのは...
@こーすけ【🥈SILVER 】 さん！おめでとうございます 👏
景品として【IRO+イベントクーポン 3,000円分】をプレゼントさせていただきます！ 🎫 ✨
ぜひ次回のグルメ選手権もご参加お待ちしております！` },
];

const threads = [contest24, ...importedRichThreads, ...archivedThreads];

export const SEEDED_GOURMET_CONTESTS = threads.map((thread) => ({ thread, comments: comments.filter((comment) => comment.threadId === thread.id) }));
