import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  getMemberOnboarding,
  saveMemberOnboardingFollowUp,
  type MemberOnboardingRecord,
} from "@/lib/_core/api";

type Filter = "pending" | "not_sent" | "attention" | "done" | "all";
type FollowUp = MemberOnboardingRecord["followUp"];

const ink = "#25232b";
const muted = "#696773";
const border = "#e8e0e6";

function dateLabel(value: string | null) {
  if (!value) return "未記録";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function statusLabel(record: MemberOnboardingRecord) {
  if (record.linkIssue) return "契約とアカウントの紐付け要確認";
  if (record.loginStatus === "needs_attention") return record.accountStatus ? "アカウント停止・要確認" : "アカウント未作成";
  if (record.loginStatus === "logged_in") return "ログイン済み";
  if (record.loginStatus === "password_set") return "パスワード設定済み・未ログイン";
  if (record.loginStatus === "code_requested") return "認証コード発行済み・未完了";
  return "初回設定未開始";
}

function needsAttention(record: MemberOnboardingRecord) {
  return record.linkIssue || record.loginStatus === "needs_attention";
}

export function AdminOnboardingProgress() {
  const [records, setRecords] = useState<MemberOnboardingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [draft, setDraft] = useState<FollowUp | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getMemberOnboarding();
      setRecords(result.members);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "一覧を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const done = records.filter((record) => record.loginStatus === "logged_in" && !record.linkIssue).length;
  const attention = records.filter(needsAttention).length;
  const pending = records.length - done;
  const notSent = records.filter((record) => (record.loginStatus !== "logged_in" || record.linkIssue) && record.followUp.outreachStatus === "not_sent").length;
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      if (filter === "pending" && record.loginStatus === "logged_in" && !record.linkIssue) return false;
      if (filter === "not_sent" && (record.loginStatus === "logged_in" && !record.linkIssue || record.followUp.outreachStatus !== "not_sent")) return false;
      if (filter === "done" && (record.loginStatus !== "logged_in" || record.linkIssue)) return false;
      if (filter === "attention" && !needsAttention(record)) return false;
      return !normalized || record.billingEmail.toLowerCase().includes(normalized) || (record.displayName ?? "").toLowerCase().includes(normalized);
    }).sort((a, b) => {
      const aDate = a.followUp.nextFollowUpAt ?? "9999-12-31";
      const bDate = b.followUp.nextFollowUpAt ?? "9999-12-31";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.billingEmail.localeCompare(b.billingEmail);
    });
  }, [records, query, filter]);

  async function save(record: MemberOnboardingRecord, next: FollowUp) {
    setSaving(true);
    try {
      await saveMemberOnboardingFollowUp({ billingEmail: record.billingEmail, ...next });
      setRecords((previous) => previous.map((item) => item.billingEmail === record.billingEmail ? { ...item, followUp: next } : item));
      setSelectedEmail(null);
      setDraft(null);
    } catch (cause) {
      Alert.alert("保存できませんでした", cause instanceof Error ? cause.message : "通信状態を確認してください");
    } finally {
      setSaving(false);
    }
  }

  async function copyPendingEmails() {
    const emails = records.filter((record) => record.loginStatus !== "logged_in" || record.linkIssue).map((record) => record.billingEmail);
    if (!emails.length) return;
    await Clipboard.setStringAsync(emails.join("\n"));
    Alert.alert("コピーしました", `未完了・要確認の ${emails.length} 件のメールアドレスをコピーしました。`);
  }

  const smallButton = (label: string, onPress: () => void, active = false) => (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: active ? "#E8A0BF" : "#f6f3f6", marginRight: 6, marginBottom: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#fff" : ink }}>{label}</Text>
    </Pressable>
  );

  return <View style={{ gap: 14 }}>
    <Text style={{ fontSize: 20, fontWeight: "800", color: ink }}>初回ログイン進捗</Text>
    <Text style={{ fontSize: 13, lineHeight: 20, color: muted }}>サブスク有効・猶予中の契約メールをすべて表示します。ログイン完了は実際のログイン記録で判定します。契約と会員の紐付けに問題がある場合も一覧に残します。</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {[["対象契約", records.length], ["ログイン済み", done], ["未完了・要確認", pending], ["案内未記録", notSent], ["紐付け等の要確認", attention]].map(([label, count]) => <View key={label} style={{ minWidth: 125, flexGrow: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: "#fff" }}>
        <Text style={{ color: muted, fontSize: 12 }}>{label}</Text><Text style={{ color: ink, fontSize: 24, fontWeight: "800" }}>{count}</Text>
      </View>)}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {smallButton(`未完了 ${pending}`, () => setFilter("pending"), filter === "pending")}
      {smallButton(`案内未記録 ${notSent}`, () => setFilter("not_sent"), filter === "not_sent")}
      {smallButton(`要確認 ${attention}`, () => setFilter("attention"), filter === "attention")}
      {smallButton(`完了 ${done}`, () => setFilter("done"), filter === "done")}
      {smallButton("すべて", () => setFilter("all"), filter === "all")}
    </View>
    <TextInput value={query} onChangeText={setQuery} placeholder="名前・メールアドレスで検索" autoCapitalize="none" style={{ borderWidth: 1, borderColor: border, borderRadius: 10, padding: 12, color: ink, backgroundColor: "#fff" }} />
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {smallButton("最新状態に更新", () => { void reload(); })}
      {smallButton("未完了者のメールをコピー", () => { void copyPendingEmails(); })}
    </View>
    {loading && <ActivityIndicator color="#E8A0BF" />}
    {!!error && <Text style={{ color: "#bd3848" }}>{error}</Text>}
    {!loading && !error && <Text style={{ color: muted, fontSize: 12 }}>表示 {visible.length} 件 / 対象 {records.length} 件</Text>}
    {!loading && !error && visible.map((record) => {
      const selected = selectedEmail === record.billingEmail;
      const statusColor = record.loginStatus === "logged_in" && !record.linkIssue ? "#237c4d" : needsAttention(record) ? "#be3e48" : "#a35e19";
      return <View key={record.billingEmail} style={{ padding: 14, borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: "#fff", gap: 5 }}>
        <Text style={{ color: ink, fontSize: 16, fontWeight: "700" }}>{record.displayName || "アカウント未作成"}</Text>
        <Text selectable style={{ color: muted, fontSize: 13 }}>{record.billingEmail}</Text>
        <Text style={{ color: statusColor, fontWeight: "700", fontSize: 13 }}>{statusLabel(record)}{record.subscriptionStatus === "grace" ? " · 猶予中" : ""}</Text>
        <Text style={{ color: muted, fontSize: 12 }}>パスワード設定: {dateLabel(record.passwordSetAt)} / 最終ログイン: {dateLabel(record.lastSignedInAt)}</Text>
        {record.codeIssuedAt && record.loginStatus !== "logged_in" && <Text style={{ color: muted, fontSize: 12 }}>認証コード発行: {dateLabel(record.codeIssuedAt)}</Text>}
        <Text style={{ color: muted, fontSize: 12 }}>案内: {record.followUp.outreachStatus === "not_sent" ? "未記録" : record.followUp.outreachStatus === "sent" ? "案内済み" : "フォロー中"} / 次回: {record.followUp.nextFollowUpAt || "未設定"} / 担当: {record.followUp.ownerName || "未設定"}</Text>
        {!!record.followUp.issueNote && <Text style={{ color: muted, fontSize: 12 }}>メモ: {record.followUp.issueNote}</Text>}
        <Pressable onPress={() => { setSelectedEmail(selected ? null : record.billingEmail); setDraft(selected ? null : { ...record.followUp }); }} style={{ marginTop: 5, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#f6eef3", borderRadius: 9 }}>
          <Text style={{ color: "#9b4e72", fontWeight: "700" }}>連絡状況を{selected ? "閉じる" : "記録・編集"}</Text>
        </Pressable>
        {selected && draft && <View style={{ marginTop: 8, gap: 8 }}>
          <Text style={{ color: ink, fontWeight: "700" }}>連絡状況</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {(["not_sent", "sent", "follow_up"] as const).map((status) => smallButton(({ not_sent: "未案内", sent: "案内済み", follow_up: "フォロー中" })[status], () => setDraft({ ...draft, outreachStatus: status, sentAt: status === "not_sent" ? null : draft.sentAt ?? new Date().toISOString(), lastContactAt: status === "follow_up" ? new Date().toISOString() : draft.lastContactAt }), draft.outreachStatus === status))}
          </View>
          <TextInput value={draft.nextFollowUpAt ?? ""} onChangeText={(value) => setDraft({ ...draft, nextFollowUpAt: value || null })} placeholder="次回フォロー日 YYYY-MM-DD" style={{ borderWidth: 1, borderColor: border, borderRadius: 8, padding: 10 }} />
          <TextInput value={draft.ownerName} onChangeText={(value) => setDraft({ ...draft, ownerName: value })} placeholder="担当者" style={{ borderWidth: 1, borderColor: border, borderRadius: 8, padding: 10 }} />
          <TextInput value={draft.issueNote} onChangeText={(value) => setDraft({ ...draft, issueNote: value })} placeholder="連絡結果・確認事項" multiline style={{ borderWidth: 1, borderColor: border, borderRadius: 8, padding: 10, minHeight: 70 }} />
          <Pressable disabled={saving} onPress={() => { void save(record, draft); }} style={{ padding: 12, alignItems: "center", borderRadius: 8, backgroundColor: saving ? "#aaa" : ink }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "保存中…" : "連絡記録を保存"}</Text>
          </Pressable>
        </View>}
      </View>;
    })}
  </View>;
}
