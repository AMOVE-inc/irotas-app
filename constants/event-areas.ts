export const EVENT_AREA_GROUPS = [
  { region: "関東", value: "region:kanto", prefectures: ["東京都", "神奈川県", "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県"] },
  { region: "関西", value: "region:kansai", prefectures: ["大阪府", "京都府", "兵庫県", "奈良県", "滋賀県", "和歌山県"] },
  { region: "北海道・東北", value: "region:tohoku", prefectures: ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { region: "甲信越・北陸", value: "region:hokuriku", prefectures: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県"] },
  { region: "東海", value: "region:tokai", prefectures: ["岐阜県", "静岡県", "愛知県", "三重県"] },
  { region: "中国", value: "region:chugoku", prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"] },
  { region: "四国", value: "region:shikoku", prefectures: ["徳島県", "香川県", "愛媛県", "高知県"] },
  { region: "九州・沖縄", value: "region:kyushu", prefectures: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] },
] as const;

export const PREFECTURE_TO_REGION = Object.fromEntries(
  EVENT_AREA_GROUPS.flatMap((group) => group.prefectures.map((prefecture) => [prefecture, group.value])),
) as Record<string, string>;
