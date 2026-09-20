import type { MemberOnboardingRecord } from "@/lib/_core/api";

export function isPendingOnboarding(record: MemberOnboardingRecord) {
  return !record.followUp.excludedFromFollowUp && (record.loginStatus !== "logged_in" || record.linkIssue);
}

function csvCell(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  // Excelなどで開いても、会員が入力した名前・メモを数式として実行させない。
  const safe = /^[\s\uFEFF]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvRow(values: (string | number | null | undefined)[]) {
  return values.map(csvCell).join(",");
}

function loginLabel(record: MemberOnboardingRecord) {
  if (record.linkIssue) return "契約とアカウントの紐付け要確認";
  switch (record.loginStatus) {
    case "needs_attention": return record.accountStatus ? "アカウント停止・要確認" : "アカウント未作成";
    case "password_set": return "パスワード設定済み・未ログイン";
    case "code_requested": return "認証コード発行済み・未完了";
    case "not_started": return "初回設定未開始";
    case "logged_in": return "ログイン済み";
  }
}

export function buildPendingOnboardingCsv(records: MemberOnboardingRecord[]) {
  const pending = records.filter(isPendingOnboarding);
  const header = ["契約メールアドレス", "会員番号", "名前", "契約状態", "初回ログイン状況", "認証コード発行日時", "パスワード設定日時", "最終ログイン日時", "連絡状況", "案内日時", "最終連絡日時", "次回フォロー日", "担当者", "連絡メモ"];
  const rows = pending.map((record) => csvRow([
    record.billingEmail,
    record.memberId,
    record.displayName,
    record.subscriptionStatus === "grace" ? "猶予中" : "有効",
    loginLabel(record),
    record.codeIssuedAt,
    record.passwordSetAt,
    record.lastSignedInAt,
    record.followUp.outreachStatus === "not_sent" ? "未案内" : record.followUp.outreachStatus === "sent" ? "案内済み" : "フォロー中",
    record.followUp.sentAt,
    record.followUp.lastContactAt,
    record.followUp.nextFollowUpAt,
    record.followUp.ownerName,
    record.followUp.issueNote,
  ]));
  return { count: pending.length, csv: `\uFEFF${[csvRow(header), ...rows].join("\r\n")}\r\n` };
}
