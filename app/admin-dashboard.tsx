import { ScreenContainer } from "@/components/screen-container";
import { AdminOnboardingProgress } from "@/components/admin-onboarding-progress";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { MEMBERS, CURRENT_USER, RANK_LABELS, RANK_COLORS, getRankFromPoints, type Announcement, type Club, type Coupon, type Event, type MemberRank } from "@/constants/mock-data";
import { useAuthContext } from "@/lib/auth-context";
import { isAdminRole } from "@/lib/access-control";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getIrotasPointsBalances,
  getIrotasPointsHistory,
  adjustIrotasPoints,
  getFeeExemptionMembers,
  setFeeExemption,
  type IrotasPointsHistory,
} from "@/lib/irotas-points-store";
import { buildAdminAnalyticsCsv } from "@/lib/admin-analytics-csv";
import {
  getAllPayments,
  updatePaymentStatus,
  clearPaymentCache,
  type PaymentRecord,
  type PaymentStatus,
} from "@/lib/payment-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteSharedAnnouncement, getSharedAnnouncements, saveSharedAnnouncement } from "@/lib/announcement-api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { createCoupon, deleteCoupon, setCouponStatus, updateCoupon, updateCouponUsageType, useCoupons } from "@/lib/coupon-store";
import { sendRankUpgradeWelcome } from "@/lib/chat-store";
import { addClub, refreshClubs, removeClub, updateClub, useClubs } from "@/lib/club-store";
import { sendLeaderAppointmentNotification } from "@/lib/notifications";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { loadImportedGourmetContests, type ImportedGourmetContest } from "@/lib/gourmet-contest-import";
import {
  getMembershipSummary,
  getMemberReconciliationReport,
  getOperatorMembers,
  getSystemMonitoring,
  getAdminAccountDeletionRequests,
  completeAdminAccountDeletion,
  getReviewAccountStatus,
  getNonMemberIdStatus,
  correctNonMemberId,
  configureReviewAccount,
  suspendReviewAccount,
  getBackupReadiness,
  createBackupSnapshot,
  syncSquareSubscriptions,
  getEvents,
  getAdminAnalytics,
  getAdminEventPayments,
  updateOperatorMemberTerm,
  type MembershipSummary,
  type MemberReconciliationReport,
  type OperatorMember,
  type SystemAuditLog,
  type ApplicationErrorLog,
  type AdminAccountDeletionRequest,
  type ReviewAccountStatus,
  type NonMemberIdStatus,
  type BackupReadinessManifest,
  type BackupSnapshot,
  type AdminAnalytics,
  type AdminEventPayment,
} from "@/lib/_core/api";

type PointsHistoryEntry = {
  id: string;
  name: string;
  from: number;
  to: number;
  rank: string;
  at: string;
};

const EMPTY_COUPON: Coupon = { id: "", title: "", description: "", discount: "", expiresAt: "", code: "", requiredRank: "regular", usageType: "single", status: "active" };

function selectJsonFile(label = "DiscordプロフィールJSON"): Promise<{ name: string; text: string }> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") { reject(new Error("Web版の管理画面から実行してください")); return; }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.setAttribute("aria-label", label);
    document.body.appendChild(input);
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { reject(new Error("ファイルが選択されませんでした")); return; }
      resolve({ name: file.name, text: await file.text() });
    };
    input.click();
  });
}

export default function AdminDashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compactTabs = width < 720;
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { user: authUser } = useAuthContext();
  const userIsAdmin = isAdminRole(authUser?.role, authUser?.accessRole);
  const [adminEvents, setAdminEvents] = useState<Event[]>([]);
  const [adminEventsReady, setAdminEventsReady] = useState(false);
  const [adminEventsError, setAdminEventsError] = useState(false);
  const [adminEventsReloadKey, setAdminEventsReloadKey] = useState(0);
  useEffect(() => {
    if (!userIsAdmin) return;
    let active = true;
    setAdminEventsReady(false);
    setAdminEventsError(false);
    void getEvents().then((events) => { if (active) { setAdminEvents(events); setAdminEventsReady(true); } }).catch(() => { if (active) setAdminEventsError(true); });
    return () => { active = false; };
  }, [userIsAdmin, adminEventsReloadKey]);
  const coupons = useCoupons();
  const clubs = useClubs();

  // すべての state を条件分岐の外で定義
  const [activeTab, setActiveTab] = useState<"overview" | "onboarding" | "monitoring" | "backups" | "deletions" | "review" | "operators" | "members" | "mee6" | "events" | "contests" | "clubs" | "payments" | "emails" | "announcements" | "coupons" | "analytics">(tab === "mee6" ? "mee6" : tab === "onboarding" ? "onboarding" : tab === "monitoring" ? "monitoring" : tab === "backups" ? "backups" : tab === "deletions" ? "deletions" : tab === "review" ? "review" : tab === "coupons" ? "coupons" : tab === "contests" ? "contests" : tab === "operators" ? "operators" : "overview");
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [squareEventPayments, setSquareEventPayments] = useState<AdminEventPayment[]>([]);
  const [squarePaymentsError, setSquarePaymentsError] = useState(false);
  const [selectedPaymentEventId, setSelectedPaymentEventId] = useState<string | null>(null);
  useEffect(() => {
    if (!userIsAdmin || activeTab !== "payments") return;
    let active = true;
    void getAdminEventPayments().then(({ payments }) => {
      if (active) { setSquareEventPayments(payments); setSquarePaymentsError(false); }
    }).catch(() => { if (active) setSquarePaymentsError(true); });
    return () => { active = false; };
  }, [userIsAdmin, activeTab]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set(
    MEMBERS.filter((m) => m.role === "admin").map((m) => m.id)
  ));
  const [generationOverrides, setGenerationOverrides] = useState<Record<string, number>>({});
  const [pointsOverrides, setPointsOverrides] = useState<Record<string, number>>({});
  const [rankOverrides, setRankOverrides] = useState<Record<string, string>>({});
  const [pointsHistory, setPointsHistory] = useState<PointsHistoryEntry[]>([]);
  const [irotasBalances, setIrotasBalances] = useState<Record<string, number>>({});
  const [, setIrotasHistory] = useState<IrotasPointsHistory[]>([]);
  const [feeExemptIds, setFeeExemptIds] = useState<Set<string>>(new Set());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [gourmetContests, setGourmetContests] = useState<ImportedGourmetContest[]>([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [couponDraft, setCouponDraft] = useState<Coupon>(EMPTY_COUPON);
  const [newEmail, setNewEmail] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newAccessRole, setNewAccessRole] = useState<"member" | "club_leader" | "operator" | "admin">("member");
  const [squareSyncing, setSquareSyncing] = useState(false);
  const [squareSyncProgress, setSquareSyncProgress] = useState<string | null>(null);
  const [discordProfileImporting, setDiscordProfileImporting] = useState(false);
  const [discordProfileImportResult, setDiscordProfileImportResult] = useState<string | null>(null);
  const [discordLinkEmail, setDiscordLinkEmail] = useState("");
  const [discordLinkUserId, setDiscordLinkUserId] = useState("");
  const [discordLinking, setDiscordLinking] = useState(false);
  const [discordClubImporting, setDiscordClubImporting] = useState(false);
  const [discordClubPayload, setDiscordClubPayload] = useState<string | null>(null);
  const [discordClubPreview, setDiscordClubPreview] = useState<string | null>(null);
  const [discordIdentityImporting, setDiscordIdentityImporting] = useState(false);
  const [discordIdentityPayload, setDiscordIdentityPayload] = useState<string | null>(null);
  const [discordIdentityPreview, setDiscordIdentityPreview] = useState<string | null>(null);
  const [mee6Members, setMee6Members] = useState<{ memberId: string; displayName: string; discordLinked: boolean; mee6Level: number | null; currentLevel: number; importedAt: string | null }[]>([]);
  const [mee6Loading, setMee6Loading] = useState(false);
  const [mee6Importing, setMee6Importing] = useState(false);
  const [mee6ImportResult, setMee6ImportResult] = useState<string | null>(null);
  const [discordEventImporting, setDiscordEventImporting] = useState(false);
  const [discordEventImportResult, setDiscordEventImportResult] = useState<string | null>(null);
  const [discordEventChatImporting, setDiscordEventChatImporting] = useState(false);
  const [discordEventChatImportResult, setDiscordEventChatImportResult] = useState<string | null>(null);
  const [discordEventChatPurging, setDiscordEventChatPurging] = useState(false);
  const [discordEventChatPurgeResult, setDiscordEventChatPurgeResult] = useState<string | null>(null);
  const [discordEventChatPurgePreview, setDiscordEventChatPurgePreview] = useState<{ messages: number; rooms: number } | null>(null);
  const [membershipSummary, setMembershipSummary] = useState<MembershipSummary | null>(null);
  const [memberReconciliation, setMemberReconciliation] = useState<MemberReconciliationReport | null>(null);
  const [membershipSummaryLoading, setMembershipSummaryLoading] = useState(false);
  const [operatorMembers, setOperatorMembers] = useState<OperatorMember[]>([]);
  const [operatorTerms, setOperatorTerms] = useState<Record<number, string>>({});
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const [savingOperatorId, setSavingOperatorId] = useState<number | null>(null);
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>([]);
  const [applicationErrors, setApplicationErrors] = useState<ApplicationErrorLog[]>([]);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [deletionRequests, setDeletionRequests] = useState<AdminAccountDeletionRequest[]>([]);
  const [deletionsLoading, setDeletionsLoading] = useState(false);
  const [completingDeletionId, setCompletingDeletionId] = useState<string | null>(null);
  const [reviewAccount, setReviewAccount] = useState<ReviewAccountStatus | null>(null);
  const [nonMemberId, setNonMemberId] = useState<NonMemberIdStatus | null>(null);
  const [nonMemberIdSaving, setNonMemberIdSaving] = useState(false);
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewPassword, setReviewPassword] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [backupManifest, setBackupManifest] = useState<BackupReadinessManifest | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupSnapshot, setBackupSnapshot] = useState<BackupSnapshot | null>(null);
  const loadMembershipSummary = async () => {
    setMembershipSummaryLoading(true);
    try {
      const [summary, reconciliation] = await Promise.all([
        getMembershipSummary(),
        getMemberReconciliationReport(),
      ]);
      setMembershipSummary(summary);
      setMemberReconciliation(reconciliation);
    } catch {
      setMembershipSummary(null);
      setMemberReconciliation(null);
    } finally {
      setMembershipSummaryLoading(false);
    }
  };
  useEffect(() => {
    if (userIsAdmin && activeTab === "overview") void loadMembershipSummary();
  }, [userIsAdmin, activeTab]);
  const loadMee6Members = async () => {
    setMee6Loading(true);
    try {
      const response = await fetch("/api/admin/mee6-levels", { credentials: "same-origin" });
      const result = await response.json() as { error?: string; members?: typeof mee6Members };
      if (!response.ok) throw new Error(result.error ?? "レベル一覧を読み込めませんでした");
      setMee6Members(result.members ?? []);
    } catch (error) {
      Alert.alert("読み込みエラー", error instanceof Error ? error.message : "レベル一覧を読み込めませんでした");
    } finally { setMee6Loading(false); }
  };
  useEffect(() => { if (userIsAdmin && activeTab === "mee6") void loadMee6Members(); }, [userIsAdmin, activeTab]);
  useEffect(() => { if (userIsAdmin && activeTab === "members") void getNonMemberIdStatus().then(setNonMemberId).catch(() => setNonMemberId(null)); }, [userIsAdmin, activeTab]);
  const loadSystemMonitoring = async () => {
    setMonitoringLoading(true);
    try {
      const result = await getSystemMonitoring();
      setAuditLogs(result.auditLogs);
      setApplicationErrors(result.applicationErrors);
    } catch (error) {
      Alert.alert("読み込みエラー", error instanceof Error ? error.message : "監視情報を読み込めませんでした");
    } finally {
      setMonitoringLoading(false);
    }
  };
  useEffect(() => {
    if (userIsAdmin && activeTab === "monitoring") void loadSystemMonitoring();
  }, [userIsAdmin, activeTab]);
  const loadDeletionRequests = async () => {
    setDeletionsLoading(true);
    try {
      setDeletionRequests(await getAdminAccountDeletionRequests());
    } catch (error) {
      Alert.alert("読み込みエラー", error instanceof Error ? error.message : "削除申請を読み込めませんでした");
    } finally {
      setDeletionsLoading(false);
    }
  };
  useEffect(() => {
    if (userIsAdmin && activeTab === "deletions") void loadDeletionRequests();
  }, [userIsAdmin, activeTab]);
  useEffect(() => {
    if (!userIsAdmin || activeTab !== "review") return;
    getReviewAccountStatus().then((account) => {
      setReviewAccount(account);
      setReviewEmail(account.email ?? "");
    }).catch((error) => Alert.alert("読み込みエラー", error instanceof Error ? error.message : "審査アカウントを確認できませんでした"));
  }, [userIsAdmin, activeTab]);
  const loadBackupReadiness = async () => {
    setBackupLoading(true);
    try {
      const result = await getBackupReadiness();
      setBackupManifest(result.manifest);
    } catch (error) {
      Alert.alert("確認できませんでした", error instanceof Error ? error.message : "時間をおいて再度お試しください");
    } finally {
      setBackupLoading(false);
    }
  };
  const createProductionBackup = async () => {
    setBackupLoading(true);
    try {
      const snapshot = await createBackupSnapshot();
      setBackupSnapshot(snapshot);
      await loadBackupReadiness();
      Alert.alert("バックアップ完了", `スナップショットを限定保管先へ保存しました。\nSHA-256: ${snapshot.sha256.slice(0, 16)}…`);
    } catch (error) {
      Alert.alert("バックアップできませんでした", error instanceof Error ? error.message : "時間をおいて再度お試しください");
    } finally {
      setBackupLoading(false);
    }
  };
  useEffect(() => {
    if (userIsAdmin && activeTab === "backups") void loadBackupReadiness();
  }, [userIsAdmin, activeTab]);
  useEffect(() => {
    if (!userIsAdmin || activeTab !== "operators") return;
    setOperatorsLoading(true);
    getOperatorMembers()
      .then((operators) => {
        setOperatorMembers(operators);
        setOperatorTerms(Object.fromEntries(operators.map((operator) => [
          operator.userId,
          operator.memberTerm?.match(/\d+/)?.[0] ?? "",
        ])));
      })
      .catch((error) => {
        Alert.alert("読み込みエラー", error instanceof Error ? error.message : "運営メンバーを読み込めませんでした");
      })
      .finally(() => setOperatorsLoading(false));
  }, [userIsAdmin, activeTab]);
  const { data: allowedEmails, refetch: refetchEmails, isLoading: emailsLoading } = trpc.allowedEmails.list.useQuery(
    undefined,
    { enabled: userIsAdmin && activeTab === "emails" },
  );
  const addEmailMutation = trpc.allowedEmails.add.useMutation({
    onSuccess: () => {
      setNewEmail("");
      setNewNote("");
      setNewAccessRole("member");
      refetchEmails();
      Alert.alert("登録完了", `${newEmail} を承認メンバーに追加しました`);
    },
    onError: (e) => Alert.alert("エラー", e.message),
  });
  const removeEmailMutation = trpc.allowedEmails.remove.useMutation({
    onSuccess: () => refetchEmails(),
    onError: (e) => Alert.alert("エラー", e.message),
  });
  const setAccessRoleMutation = trpc.allowedEmails.setAccessRole.useMutation({
    onSuccess: () => refetchEmails(),
    onError: (e) => Alert.alert("エラー", e.message),
  });

  const openCouponCreate = () => { setEditingCouponId(null); setCouponDraft({ ...EMPTY_COUPON, id: `coupon_${Date.now()}` }); setShowCouponModal(true); };
  const openCouponEdit = (coupon: Coupon) => { setEditingCouponId(coupon.id); setCouponDraft({ ...coupon, status: coupon.status ?? "active" }); setShowCouponModal(true); };
  const saveCoupon = async () => {
    if (!couponDraft.title.trim() || !couponDraft.discount.trim() || !couponDraft.expiresAt.trim() || !couponDraft.code.trim()) { Alert.alert("入力内容を確認", "タイトル・特典内容・有効期限・コードは必須です。"); return; }
    try {
      if (editingCouponId) await updateCoupon(couponDraft);
      else await createCoupon(couponDraft);
      setShowCouponModal(false);
      Alert.alert(editingCouponId ? "更新完了" : "作成完了", editingCouponId ? "クーポンを更新しました。" : "クーポンを作成しました。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "もう一度お試しください。";
      if (Platform.OS === "web") window.alert(`保存できませんでした: ${message}`);
      else Alert.alert("保存できませんでした", message);
    }
  };
  const confirmDeleteCoupon = (coupon: Coupon) => {
    const remove = () => { void deleteCoupon(coupon.id).catch((error) => {
      const message = error instanceof Error ? error.message : "もう一度お試しください。";
      if (Platform.OS === "web") window.alert(`削除できませんでした: ${message}`);
      else Alert.alert("削除できませんでした", message);
    }); };
    if (Platform.OS === "web") {
      if (window.confirm(`${coupon.title}を削除しますか？`)) remove();
    } else {
      Alert.alert("クーポンを削除", `${coupon.title}を削除しますか？`, [{ text: "キャンセル", style: "cancel" }, { text: "削除", style: "destructive", onPress: remove }]);
    }
  };
  const pickCouponImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("権限が必要です", "画像を選ぶには写真ライブラリへのアクセスを許可してください。"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setCouponDraft((current) => ({ ...current, imageUrl: result.assets[0].uri }));
  };

  // useMemo も条件分岐の外で定義
  const stats = useMemo(() => {
    const rankCounts = { regular: 0, silver: 0, gold: 0, platinum: 0 };
    for (const m of MEMBERS) {
      rankCounts[m.rank] = (rankCounts[m.rank] ?? 0) + 1;
    }
    const openEvents = adminEvents.filter((e) => e.status === "open").length;
    const fullEvents = adminEvents.filter((e) => e.status === "full").length;
    const totalParticipants = adminEvents.reduce((sum, e) => sum + e.attendees, 0);
    const activeClubs = clubs.length;
    return { rankCounts, openEvents, fullEvents, totalParticipants, activeClubs };
  }, [clubs.length, adminEvents]);

  useEffect(() => {
    if (!userIsAdmin) return;
    AsyncStorage.getItem("generation_overrides").then((val) => {
      if (val) setGenerationOverrides(JSON.parse(val));
    });
    AsyncStorage.getItem("points_overrides").then((val) => {
      if (val) setPointsOverrides(JSON.parse(val));
    });
    AsyncStorage.getItem("rank_overrides").then((val) => {
      if (val) setRankOverrides(JSON.parse(val));
    });
    AsyncStorage.getItem("points_history").then((val) => {
      if (val) setPointsHistory(JSON.parse(val));
    });
    void (async () => {
      const cachedRaw = await AsyncStorage.getItem("custom_announcements");
      const cached = cachedRaw ? JSON.parse(cachedRaw) as Announcement[] : [];
      try {
        const shared = await getSharedAnnouncements();
        if (shared.length) {
          setAnnouncements(shared);
          await AsyncStorage.setItem("custom_announcements", JSON.stringify(shared));
        } else if (cached.length) {
          await Promise.all(cached.map(saveSharedAnnouncement));
          setAnnouncements(cached);
        } else {
          setAnnouncements([]);
        }
      } catch {
        setAnnouncements(cached);
      }
    })();
    // イロタスポイント・会費免除を読み込む
    getIrotasPointsBalances().then(setIrotasBalances);
    getIrotasPointsHistory().then(setIrotasHistory);
    getFeeExemptionMembers().then(setFeeExemptIds);
    // 支払い状況を読み込む
    getAllPayments().then(setPaymentRecords);
    loadImportedGourmetContests().then(setGourmetContests);
  }, [userIsAdmin]);

  if (!userIsAdmin) {
    return (
      <ScreenContainer className="p-6">
        <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 40 }}>
          管理者のみアクセスできます
        </Text>
      </ScreenContainer>
    );
  }

  const handleEditPoints = (memberId: string, memberName: string, currentPoints: number) => {
    Alert.prompt(
      "ポイントを調整",
      `${memberName}のポイントを入力してください`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "保存",
          onPress: async (value: string | undefined) => {
            const num = parseInt(value ?? "", 10);
            if (isNaN(num) || num < 0) {
              Alert.alert("エラー", "0以上の数字を入力してください");
              return;
            }
            const newRank = getRankFromPoints(num);
            const updatedPoints = { ...pointsOverrides, [memberId]: num };
            const updatedRanks = { ...rankOverrides, [memberId]: newRank };
            setPointsOverrides(updatedPoints);
            setRankOverrides(updatedRanks);
            await AsyncStorage.setItem("points_overrides", JSON.stringify(updatedPoints));
            await AsyncStorage.setItem("rank_overrides", JSON.stringify(updatedRanks));
            // ポイント履歴を追加
            const historyEntry: PointsHistoryEntry = {
              id: memberId,
              name: memberName,
              from: currentPoints,
              to: num,
              rank: RANK_LABELS[newRank as keyof typeof RANK_LABELS] ?? newRank,
              at: new Date().toLocaleString("ja-JP"),
            };
            const updatedHistory = [historyEntry, ...pointsHistory].slice(0, 100);
            setPointsHistory(updatedHistory);
            await AsyncStorage.setItem("points_history", JSON.stringify(updatedHistory));
            // ランク昇格メッセージ
            const prevRank = getRankFromPoints(currentPoints);
            const rankOrder = ["regular", "silver", "gold", "platinum"];
            if (rankOrder.indexOf(newRank) > rankOrder.indexOf(prevRank)) {
              await sendRankUpgradeWelcome(memberId, memberName, newRank);
            }
            const rankMsg = prevRank !== newRank
              ? `\nランクが${RANK_LABELS[prevRank as keyof typeof RANK_LABELS]}→${RANK_LABELS[newRank as keyof typeof RANK_LABELS]}に変わりました`
              : "";
            Alert.alert("変更完了", `${memberName}のポイントを${num}ptに変更しました${rankMsg}`);
          },
        },
      ],
      "plain-text",
      String(pointsOverrides[memberId] ?? currentPoints),
      "number-pad"
    );
  };

  const handleEditGeneration = (memberId: string, memberName: string, currentGen: number) => {
    Alert.prompt(
      "期生を変更",
      `${memberName}の期生を入力してください`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "保存",
          onPress: async (value: string | undefined) => {
            const num = parseInt(value ?? "", 10);
            if (isNaN(num) || num < 1) {
              Alert.alert("エラー", "1以上の数字を入力してください");
              return;
            }
            const updated = { ...generationOverrides, [memberId]: num };
            setGenerationOverrides(updated);
            await AsyncStorage.setItem("generation_overrides", JSON.stringify(updated));
            Alert.alert("変更完了", `${memberName}を${num}期生に変更しました`);
          },
        },
      ],
      "plain-text",
      String(generationOverrides[memberId] ?? currentGen),
      "number-pad"
    );
  };

  const toggleAdminRole = async (memberId: string, memberName: string) => {
    const isCurrentlyAdmin = adminIds.has(memberId);
    // 自分自身の権限は変更不可
    if (memberId === CURRENT_USER.id) {
      Alert.alert("変更不可", "自分自身の権限は変更できません。");
      return;
    }
    const action = isCurrentlyAdmin ? "管理者権限を削除" : "管理者に任命";
    Alert.alert(
      `${memberName}を${action}しますか？`,
      isCurrentlyAdmin
        ? `${memberName}の管理者権限を削除し、一般会員に変更します。`
        : `${memberName}に管理者権限を付与します。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: action,
          style: isCurrentlyAdmin ? "destructive" : "default",
          onPress: async () => {
            const newAdminIds = new Set(adminIds);
            if (isCurrentlyAdmin) {
              newAdminIds.delete(memberId);
            } else {
              newAdminIds.add(memberId);
            }
            setAdminIds(newAdminIds);
            await AsyncStorage.setItem("admin_member_ids", JSON.stringify([...newAdminIds]));
            Alert.alert("変更完了", `${memberName}を${action}しました。`);
          },
        },
      ]
    );
  };

  // イロタスポイントを付与する
  const handleGrantIrotasPoints = (memberId: string, memberName: string) => {
    const current = irotasBalances[memberId] ?? 0;
    Alert.prompt(
      "イロタスポイントを付与",
      `${memberName}に付与するイロタスポイント数を入力（現在: ${current}pt）`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "付与",
          onPress: async (value: string | undefined) => {
            const num = parseInt(value ?? "", 10);
            if (isNaN(num) || num <= 0) {
              Alert.alert("エラー", "1以上の整数を入力してください");
              return;
            }
            const newBalance = await adjustIrotasPoints(memberId, memberName, num, "管理者からの付与");
            setIrotasBalances((prev) => ({ ...prev, [memberId]: newBalance }));
            const updated = await getIrotasPointsHistory();
            setIrotasHistory(updated);
            Alert.alert("付与完了", `${memberName}に${num}ptを付与しました。\n残高: ${newBalance}pt`);
          },
        },
      ],
      "plain-text",
      "",
      "number-pad"
    );
  };

  // 会費免除を切り替える
  const toggleFeeExemption = (memberId: string, memberName: string) => {
    const isCurrentlyExempt = feeExemptIds.has(memberId);
    const action = isCurrentlyExempt ? "会費免除を解除" : "会費免除を付与";
    Alert.alert(
      `${memberName}の会費免除`,
      isCurrentlyExempt
        ? `${memberName}の会費免除を解除しますか？`
        : `${memberName}に会費免除を付与しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: action,
          style: isCurrentlyExempt ? "destructive" : "default",
          onPress: async () => {
            await setFeeExemption(memberId, !isCurrentlyExempt);
            const updated = await getFeeExemptionMembers();
            setFeeExemptIds(new Set(updated));
            Alert.alert("変更完了", `${memberName}の会費免除を${action}しました。`);
          },
        },
      ]
    );
  };

  // お知らせの作成・編集
  const handleSaveAnnouncement = async (title: string, content: string, _type: string) => {
    const nextAnnouncement: Announcement = editingAnnouncement
      ? { ...editingAnnouncement, title, content }
      : {
          id: `ann_${Date.now()}`,
          title,
          content,
          createdAt: new Date().toISOString().split("T")[0],
        };
    const updated = editingAnnouncement
      ? announcements.map((announcement) => announcement.id === editingAnnouncement.id ? nextAnnouncement : announcement)
      : [nextAnnouncement, ...announcements];
    try {
      await saveSharedAnnouncement(nextAnnouncement);
      setAnnouncements(updated);
      await AsyncStorage.setItem("custom_announcements", JSON.stringify(updated));
      setEditingAnnouncement(null);
    } catch (error) {
      Alert.alert("保存できませんでした", error instanceof Error ? error.message : "通信状況を確認してもう一度お試しください。");
    }
  };

  // お知らせ削除
  const handleDeleteAnnouncement = async (id: string) => {
    const previous = announcements;
    const updated = previous.filter((announcement) => announcement.id !== id);
    // 操作直後に一覧から取り除き、二重タップも防ぐ。通信に失敗したときだけ元に戻す。
    setAnnouncements(updated);
    try {
      await deleteSharedAnnouncement(id);
      await AsyncStorage.setItem("custom_announcements", JSON.stringify(updated));
    } catch (error) {
      setAnnouncements(previous);
      Alert.alert("削除できませんでした", error instanceof Error ? error.message : "通信状況を確認してもう一度お試しください。");
    }
  };

  const handleAddEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      Alert.alert("入力エラー", "有効なメールアドレスを入力してください");
      return;
    }
    addEmailMutation.mutate({ email: trimmed, note: newNote.trim() || undefined, accessRole: newAccessRole });
  };

  const handleRemoveEmail = (id: number, email: string) => {
    Alert.alert(
      "削除確認",
      `${email} を承認リストから削除しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        { text: "削除", style: "destructive", onPress: () => removeEmailMutation.mutate({ id }) },
      ]
    );
  };

  const saveOperatorTerm = async (operator: OperatorMember) => {
    const raw = operatorTerms[operator.userId]?.trim() ?? "";
    if (raw && (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 99)) {
      Alert.alert("入力内容を確認", "期は1〜99の半角数字で入力してください。");
      return;
    }
    setSavingOperatorId(operator.userId);
    try {
      const updated = await updateOperatorMemberTerm(
        operator.userId,
        raw ? `第${Number(raw)}期` : null,
      );
      setOperatorMembers((current) => current.map((item) => item.userId === updated.userId ? updated : item));
      Alert.alert("保存しました", `${updated.displayName}さんを${updated.memberTerm ?? "期設定なし"}に設定しました。`);
    } catch (error) {
      Alert.alert("保存できませんでした", error instanceof Error ? error.message : "通信状況を確認してください");
    } finally {
      setSavingOperatorId(null);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, marginLeft: 12 }}>
          管理者ダッシュボード
        </Text>
        <View
          style={{
            marginLeft: 10,
            backgroundColor: "#E8A0BF20",
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#E8A0BF" }}>ADMIN</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal={!compactTabs}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: "row",
          flexWrap: compactTabs ? "wrap" : "nowrap",
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 8,
        }}
        style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border, flexGrow: 0, maxHeight: compactTabs ? 190 : undefined }}
      >
        {(["overview", "onboarding", "monitoring", "backups", "deletions", "review", "operators", "members", "mee6", "events", "contests", "clubs", "payments", "emails", "announcements", "coupons", "analytics"] as const).map((tab) => {
          const labels = { overview: "概要", onboarding: "初回ログイン", monitoring: "監視ログ", backups: "バックアップ", deletions: "退会申請", review: "審査アカウント", operators: "運営メンバー", members: "会員", mee6: "Mee6レベル", events: "イベント", contests: "グルメ選手権", clubs: "部活動", payments: "支払管理", emails: "承認メール", announcements: "お知らせ", coupons: "クーポン", analytics: "分析" };
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                paddingHorizontal: compactTabs ? 12 : 16,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: activeTab === tab ? "#E8A0BF" : colors.surface,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: activeTab === tab ? "#FFF" : colors.foreground,
                }}
              >
                {labels[tab]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {activeTab === "onboarding" && <AdminOnboardingProgress />}
        {activeTab === "backups" && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>バックアップ準備状況</Text>
            <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 6 }}>個人情報を表示せず、復元後の照合に必要なDB・画像の集計値だけを確認します。この画面から本番データを削除・復元することはありません。</Text>
            {backupLoading ? <ActivityIndicator color="#E8A0BF" style={{ marginVertical: 28 }} /> : backupManifest ? (
              <>
                <View style={{ backgroundColor: "#E8F7EC", borderRadius: 12, padding: 12, marginTop: 14 }}>
                  <Text style={{ color: "#237A3B", fontWeight: "800" }}>集計成功・個人情報なし</Text>
                  <Text style={{ color: colors.foreground, fontSize: 12, marginTop: 5 }}>スキーマ {backupManifest.schemaVersion} ／ DB {Object.values(backupManifest.d1.tableCounts).reduce((sum, count) => sum + count, 0).toLocaleString()}件</Text>
                  <Text style={{ color: colors.foreground, fontSize: 12, marginTop: 3 }}>画像 {backupManifest.r2.objectCount.toLocaleString()}件 ／ {(backupManifest.r2.totalBytes / 1024 / 1024).toFixed(1)} MB</Text>
                  <Text style={{ color: colors.muted, fontSize: 10, marginTop: 5 }}>集計日時 {new Date(backupManifest.createdAt).toLocaleString("ja-JP")}</Text>
                </View>
                <Pressable onPress={async () => { await Clipboard.setStringAsync(JSON.stringify(backupManifest, null, 2)); Alert.alert("コピーしました", "個人情報を含まない照合用マニフェストをコピーしました。"); }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: "#5A7FA8", alignItems: "center", justifyContent: "center", marginTop: 14 }}>
                  <Text style={{ color: "#FFF", fontWeight: "800" }}>照合用マニフェストをコピー</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable disabled={backupLoading} onPress={() => void loadBackupReadiness()} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginTop: 10 }}>
              <Text style={{ color: colors.foreground, fontWeight: "700" }}>準備状況を再集計</Text>
            </Pressable>
            <Pressable disabled={backupLoading} onPress={() => void createProductionBackup()} style={{ minHeight: 48, borderRadius: 12, backgroundColor: backupLoading ? colors.border : "#D65E8D", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
              <Text style={{ color: "#FFF", fontWeight: "800" }}>開始直前DBバックアップを取得</Text>
            </Pressable>
            {backupSnapshot ? <Text style={{ fontSize: 10, lineHeight: 16, color: colors.muted, marginTop: 8 }}>最新スナップショット: {new Date(backupSnapshot.createdAt).toLocaleString("ja-JP")} ／ {(backupSnapshot.byteSize / 1024 / 1024).toFixed(1)} MB ／ SHA-256 {backupSnapshot.sha256.slice(0, 16)}…</Text> : null}
            <Text style={{ fontSize: 11, lineHeight: 18, color: colors.muted, marginTop: 14 }}>実バックアップは個人情報を画面へ表示せず、private R2の限定保管先へ保存します。復元テストは本番とは別の一時D1・R2で行います。</Text>
          </View>
        )}
        {activeTab === "overview" && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>データ更新状況</Text>
            <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 10 }}>グルメマップ：2026年8月1日更新</Text>
            <Text style={{ fontSize: 13, color: colors.foreground, marginTop: 6 }}>Discord移行：2026年8月29日 17:25（日本時間）</Text>
            <Text style={{ fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 8 }}>CSV取り込みは管理者だけに表示されます。更新時刻はこの管理画面で確認できます。</Text>
          </View>
        )}
        {activeTab === "overview" && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Discord部活所属の照合</Text>
            <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 6 }}>Discord IDが一致する現役会員の現在のロールを正として所属を復元します。未申請・退部・却下の状態でも、現在Discordにロールがある所属は承認済みに戻します。</Text>
            {discordClubPreview ? <Text style={{ fontSize: 12, lineHeight: 19, color: colors.foreground, marginTop: 10 }}>{discordClubPreview}</Text> : null}
            <Pressable disabled={discordClubImporting} onPress={async () => {
              setDiscordClubImporting(true);
              setDiscordClubPayload(null);
              setDiscordClubPreview(null);
              try {
                const selected = await selectJsonFile("Discord部活所属JSON");
                const payload = JSON.stringify(JSON.parse(selected.text));
                const response = await fetch("/api/admin/discord-club-import/preview", { method: "POST", headers: { "content-type": "application/json" }, body: payload });
                const result = await response.json() as { error?: string; sourceMemberCount?: number; sourceMembershipCount?: number; matchedMemberCount?: number; missingCount?: number; conflictCount?: number; unmatchedDiscordIds?: string[]; inactiveDiscordIds?: string[] };
                if (!response.ok) throw new Error(result.error ?? "照合に失敗しました");
                setDiscordClubPayload(payload);
                setDiscordClubPreview(`移行元 ${result.sourceMemberCount ?? 0}名・${result.sourceMembershipCount ?? 0}所属／会員一致 ${result.matchedMemberCount ?? 0}名／未反映 ${result.missingCount ?? 0}件／既存状態との衝突 ${result.conflictCount ?? 0}件／ID未一致 ${result.unmatchedDiscordIds?.length ?? 0}名／休止会員 ${result.inactiveDiscordIds?.length ?? 0}名${result.unmatchedDiscordIds?.length ? `\nID未一致（本人確認用）: ${result.unmatchedDiscordIds.join("、")}` : ""}`);
              } catch (error) {
                if (error instanceof Error && error.message !== "ファイルが選択されませんでした") Alert.alert("照合エラー", error.message);
              } finally { setDiscordClubImporting(false); }
            }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: discordClubImporting ? colors.border : "#5865F2", alignItems: "center", justifyContent: "center", marginTop: 14 }}>
              <Text style={{ color: "#FFF", fontWeight: "800" }}>{discordClubImporting ? "照合中…" : "所属JSONを選択して照合"}</Text>
            </Pressable>
            {discordClubPayload ? <Pressable disabled={discordClubImporting} onPress={async () => {
              setDiscordClubImporting(true);
              try {
                const response = await fetch("/api/admin/discord-club-import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: discordClubPayload });
                const result = await response.json() as { error?: string; stagedCount?: number; insertedCount?: number; restoredCount?: number; conflictCount?: number; unmatchedDiscordIds?: string[] };
                if (!response.ok) throw new Error(result.error ?? "反映に失敗しました");
                const summary = `所属情報を保管 ${result.stagedCount ?? 0}件／新規追加 ${result.insertedCount ?? 0}件／既存状態から復元 ${result.restoredCount ?? 0}件／本人確認待ち ${result.unmatchedDiscordIds?.length ?? 0}名`;
                setDiscordClubPreview(summary);
                setDiscordClubPayload(null);
                await refreshClubs();
                Alert.alert("部活所属の反映完了", summary);
              } catch (error) { Alert.alert("反映エラー", error instanceof Error ? error.message : "もう一度お試しください"); }
              finally { setDiscordClubImporting(false); }
            }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: discordClubImporting ? colors.border : "#237A3B", alignItems: "center", justifyContent: "center", marginTop: 10 }}><Text style={{ color: "#FFF", fontWeight: "800" }}>所属情報を保管・復元</Text></Pressable> : null}
          </View>
        )}
        {activeTab === "overview" && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>未連携Discord本人の照合</Text>
            <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 6 }}>部活申請フォームの表示名・会員期・生年月日を本番会員プロフィールと照合します。1名に確定できない行がある場合は反映しません。</Text>
            {discordIdentityPreview ? <Text style={{ fontSize: 12, lineHeight: 19, color: colors.foreground, marginTop: 10 }}>{discordIdentityPreview}</Text> : null}
            <Pressable disabled={discordIdentityImporting} onPress={async () => {
              setDiscordIdentityImporting(true); setDiscordIdentityPayload(null); setDiscordIdentityPreview(null);
              try {
                const selected = await selectJsonFile("Discord本人照合JSON");
                const payload = JSON.stringify(JSON.parse(selected.text));
                const response = await fetch("/api/admin/discord-identity-link/preview", { method: "POST", headers: { "content-type": "application/json" }, body: payload });
                const result = await response.json() as { error?: string; requestedCount?: number; matchedCount?: number;
                  matches?: { discordUsername: string; memberDisplayName: string; memberId: string }[];
                  unresolved?: { discordUsername: string; reason: string }[] };
                if (!response.ok) throw new Error(result.error ?? "本人照合に失敗しました");
                const matched = result.matches?.map((item) => `${item.discordUsername} → ${item.memberDisplayName}（${item.memberId}）`).join("\n") ?? "";
                const unresolved = result.unresolved?.map((item) => `${item.discordUsername}（${item.reason === "ambiguous" ? "候補が複数" : "一致なし"}）`).join("、") ?? "";
                setDiscordIdentityPayload((result.matchedCount ?? 0) === (result.requestedCount ?? -1) ? payload : null);
                setDiscordIdentityPreview(`対象 ${result.requestedCount ?? 0}名／一意に一致 ${result.matchedCount ?? 0}名${matched ? `\n${matched}` : ""}${unresolved ? `\n未確定: ${unresolved}` : ""}`);
              } catch (error) {
                if (error instanceof SyntaxError) Alert.alert("読込エラー", "JSONファイルの形式を確認してください。");
                else if (error instanceof Error && error.message !== "ファイルが選択されませんでした") Alert.alert("照合エラー", error.message);
              } finally { setDiscordIdentityImporting(false); }
            }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: discordIdentityImporting ? colors.border : "#5865F2", alignItems: "center", justifyContent: "center", marginTop: 14 }}>
              <Text style={{ color: "#FFF", fontWeight: "800" }}>{discordIdentityImporting ? "照合中…" : "本人照合JSONを選択"}</Text>
            </Pressable>
            {discordIdentityPayload ? <Pressable disabled={discordIdentityImporting} onPress={async () => {
              setDiscordIdentityImporting(true);
              try {
                const response = await fetch("/api/admin/discord-identity-link/commit", { method: "POST", headers: { "content-type": "application/json" }, body: discordIdentityPayload });
                const result = await response.json() as { error?: string; linkedCount?: number; membershipsInserted?: number };
                if (!response.ok) throw new Error(result.error ?? "本人連携に失敗しました");
                const summary = `Discord本人連携 ${result.linkedCount ?? 0}名／部活所属の追加 ${result.membershipsInserted ?? 0}件`;
                setDiscordIdentityPreview(summary); setDiscordIdentityPayload(null);
                await refreshClubs(); await loadMembershipSummary(); Alert.alert("本人連携が完了しました", summary);
              } catch (error) { Alert.alert("反映エラー", error instanceof Error ? error.message : "もう一度お試しください"); }
              finally { setDiscordIdentityImporting(false); }
            }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: discordIdentityImporting ? colors.border : "#237A3B", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
              <Text style={{ color: "#FFF", fontWeight: "800" }}>8名の本人連携を確定</Text>
            </Pressable> : null}
          </View>
        )}
        {activeTab === "overview" && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Discordプロフィール差分取込</Text>
            <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 6 }}>既存会員とDiscord IDが一致する人だけ、表示名・画像・自己紹介・ランク・期・ロール・参加日を更新します。</Text>
            {discordProfileImportResult ? <Text style={{ fontSize: 12, fontWeight: "700", color: "#237A3B", marginTop: 10 }}>{discordProfileImportResult}</Text> : null}
            <Pressable disabled={discordProfileImporting} onPress={async () => {
              setDiscordProfileImporting(true);
              setDiscordProfileImportResult(null);
              try {
                const selected = await selectJsonFile();
                const payload = JSON.parse(selected.text);
                const response = await fetch("/api/admin/discord-profile-import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
                const result = await response.json() as { error?: string; matchedCount?: number; unmatchedCount?: number };
                if (!response.ok) throw new Error(result.error ?? "取込に失敗しました");
                const summary = `反映 ${result.matchedCount ?? 0}名／未一致 ${result.unmatchedCount ?? 0}名`;
                setDiscordProfileImportResult(summary);
                Alert.alert("取込完了", summary);
                await loadMembershipSummary();
              } catch (error) {
                if (error instanceof SyntaxError) Alert.alert("読込エラー", "JSONファイルの形式を確認してください。");
                else if (error instanceof Error && error.message !== "ファイルが選択されませんでした") Alert.alert("取込エラー", error.message);
              } finally { setDiscordProfileImporting(false); }
            }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: discordProfileImporting ? colors.border : "#5865F2", alignItems: "center", justifyContent: "center", marginTop: 14 }}>
              {discordProfileImporting ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontWeight: "800" }}>DiscordプロフィールJSONを選択して反映</Text>}
            </Pressable>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginTop: 20 }}>未連携の会員を個別に紐付け</Text>
            <Text style={{ fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 5 }}>本人確認済みの会員メールとDiscordユーザーIDを指定します。Discordの自己紹介から名前・画像を取得し、既存のアプリプロフィール項目は保持します。</Text>
            <TextInput
              accessibilityLabel="会員メールアドレス"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="会員メールアドレス"
              placeholderTextColor={colors.muted}
              value={discordLinkEmail}
              onChangeText={setDiscordLinkEmail}
              style={{ minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.foreground, paddingHorizontal: 12, marginTop: 10 }}
            />
            <TextInput
              accessibilityLabel="DiscordユーザーID"
              autoCapitalize="none"
              keyboardType="number-pad"
              placeholder="DiscordユーザーID（17〜20桁）"
              placeholderTextColor={colors.muted}
              value={discordLinkUserId}
              onChangeText={setDiscordLinkUserId}
              style={{ minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.foreground, paddingHorizontal: 12, marginTop: 8 }}
            />
            <Pressable disabled={discordLinking} onPress={async () => {
              const email = discordLinkEmail.trim().toLowerCase();
              const discordUserId = discordLinkUserId.trim();
              if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{17,20}$/.test(discordUserId)) {
                Alert.alert("入力を確認してください", "会員メールアドレスとDiscordユーザーIDを確認してください。");
                return;
              }
              setDiscordLinking(true);
              try {
                const response = await fetch("/api/admin/discord-profile-import/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, discordUserId, confirmation: `LINK_DISCORD_${discordUserId}` }) });
                const result = await response.json() as { error?: string };
                if (!response.ok) throw new Error(result.error ?? "本人連携に失敗しました");
                setDiscordProfileImportResult("1名のDiscordプロフィールを連携しました");
                setDiscordLinkEmail(""); setDiscordLinkUserId("");
                await loadMembershipSummary();
                Alert.alert("本人連携が完了しました", "Discordの名前とアイコンを反映しました。");
              } catch (error) { Alert.alert("連携エラー", error instanceof Error ? error.message : "もう一度お試しください"); }
              finally { setDiscordLinking(false); }
            }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: discordLinking ? colors.border : "#237A3B", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
              {discordLinking ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontWeight: "800" }}>本人確認済みとして連携</Text>}
            </Pressable>
          </View>
        )}
        {activeTab === "review" && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>ストア審査用アカウント</Text>
            <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 6 }}>一般会員権限だけを持つ専用アカウントです。Square本番会員には登録せず、会員検索・集計から除外します。個人用パスワードは使わないでください。</Text>
            {reviewAccount?.configured && (
              <View style={{ backgroundColor: reviewAccount.active ? "#E8F7EC" : "#F1F2F4", borderRadius: 12, padding: 12, marginTop: 14 }}>
                <Text style={{ color: reviewAccount.active ? "#237A3B" : colors.muted, fontWeight: "800" }}>{reviewAccount.active ? "審査利用可能" : "停止中"}</Text>
                <Text style={{ color: colors.foreground, marginTop: 4 }}>{reviewAccount.email}</Text>
              </View>
            )}
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 16, marginBottom: 6 }}>審査専用メールアドレス</Text>
            <TextInput value={reviewEmail} onChangeText={setReviewEmail} autoCapitalize="none" keyboardType="email-address" placeholder="review@example.com" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, color: colors.foreground }} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 14, marginBottom: 6 }}>一時パスワード（英字・数字を含む12文字以上）</Text>
            <TextInput value={reviewPassword} onChangeText={setReviewPassword} secureTextEntry placeholder="保存後は再表示されません" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, color: colors.foreground }} />
            <Pressable disabled={reviewSaving} onPress={async () => {
              setReviewSaving(true);
              try {
                const account = await configureReviewAccount({ email: reviewEmail, displayName: "App Review Member", password: reviewPassword });
                setReviewAccount(account);
                setReviewPassword("");
                Alert.alert("設定完了", "審査用アカウントを有効化しました。パスワードは安全な方法で審査メモへ転記してください。");
              } catch (error) {
                Alert.alert("設定できませんでした", error instanceof Error ? error.message : "入力内容を確認してください");
              } finally { setReviewSaving(false); }
            }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: reviewSaving ? colors.border : "#E8A0BF", alignItems: "center", justifyContent: "center", marginTop: 16 }}>
              {reviewSaving ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontWeight: "800" }}>審査アカウントを設定・更新</Text>}
            </Pressable>
            {reviewAccount?.active && <Pressable onPress={() => Alert.alert("審査アカウントを停止しますか？", "全セッションを失効し、ログインできない状態にします。", [{ text: "キャンセル", style: "cancel" }, { text: "停止", style: "destructive", onPress: async () => { try { setReviewAccount(await suspendReviewAccount()); Alert.alert("停止しました"); } catch (error) { Alert.alert("停止できませんでした", error instanceof Error ? error.message : "再度お試しください"); } } }])} style={{ alignItems: "center", padding: 14, marginTop: 8 }}><Text style={{ color: "#B42318", fontWeight: "700" }}>審査アカウントを停止</Text></Pressable>}
          </View>
        )}
        {activeTab === "deletions" && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>退会・アカウント削除申請</Text>
                <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 }}>完了するとログインを停止し、プロフィール等の個人情報を匿名化します。Square契約の停止は別途確認してください。</Text>
              </View>
              <Pressable onPress={() => void loadDeletionRequests()} style={{ borderRadius: 12, backgroundColor: "#E8A0BF", paddingHorizontal: 13, paddingVertical: 9 }}>
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>更新</Text>
              </Pressable>
            </View>
            {deletionsLoading ? <ActivityIndicator color="#E8A0BF" style={{ marginVertical: 28 }} /> : deletionRequests.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: "center", marginVertical: 40 }}>削除申請はありません。</Text>
            ) : deletionRequests.map((item) => (
              <View key={item.id} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: item.status === "pending" ? "#E8A0BF" : colors.border, padding: 14, marginBottom: 10, opacity: item.status === "pending" ? 1 : 0.65 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: colors.foreground }}>{item.displayName}</Text>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: item.status === "pending" ? "#B42318" : colors.muted }}>{item.status === "pending" ? "処理待ち" : item.status === "completed" ? "完了" : "取消済み"}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 5 }}>{item.publicMemberId ?? `内部ID ${item.memberId}`}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>申請：{new Date(item.requestedAt).toLocaleString("ja-JP")} ／ 期限：{new Date(item.scheduledFor).toLocaleDateString("ja-JP")}</Text>
                {item.status === "pending" && (
                  <Pressable
                    disabled={completingDeletionId === item.id}
                    onPress={() => Alert.alert(
                      "削除・匿名化を完了しますか？",
                      "この操作は元に戻せません。Squareサブスクリプションの停止状況も別途確認してください。",
                      [
                        { text: "キャンセル", style: "cancel" },
                        { text: "匿名化して完了", style: "destructive", onPress: async () => {
                          setCompletingDeletionId(item.id);
                          try {
                            await completeAdminAccountDeletion(item.id);
                            await loadDeletionRequests();
                            Alert.alert("完了", "ログインを停止し、個人情報を匿名化しました。");
                          } catch (error) {
                            Alert.alert("処理できませんでした", error instanceof Error ? error.message : "時間をおいて再度お試しください");
                          } finally {
                            setCompletingDeletionId(null);
                          }
                        } },
                      ],
                    )}
                    style={{ minHeight: 46, borderRadius: 12, backgroundColor: completingDeletionId === item.id ? colors.border : "#B42318", alignItems: "center", justifyContent: "center", marginTop: 12 }}
                  >
                    {completingDeletionId === item.id ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "800" }}>削除・匿名化を完了</Text>}
                  </Pressable>
                )}
              </View>
            ))}
          </>
        )}
        {activeTab === "monitoring" && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>監査ログ・エラー監視</Text>
                <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 }}>管理者のみ閲覧できます。パスワード・決済情報・送信本文は記録しません。</Text>
              </View>
              <Pressable onPress={() => void loadSystemMonitoring()} style={{ borderRadius: 12, backgroundColor: "#E8A0BF", paddingHorizontal: 13, paddingVertical: 9 }}>
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>更新</Text>
              </Pressable>
            </View>
            {monitoringLoading ? <ActivityIndicator color="#E8A0BF" style={{ marginVertical: 28 }} /> : (
              <>
                <View style={{ backgroundColor: applicationErrors.length ? "#FDECEC" : "#E8F7EC", borderRadius: 14, padding: 14, marginBottom: 18 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: applicationErrors.length ? "#B42318" : "#237A3B" }}>
                    {applicationErrors.length ? `未処理エラー記録 ${applicationErrors.length}件` : "未処理エラー記録はありません"}
                  </Text>
                  <Text style={{ fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 4 }}>直近100件を表示します。問い合わせ時は確認IDで照合できます。</Text>
                </View>
                {applicationErrors.length > 0 && <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, marginBottom: 8 }}>アプリケーションエラー</Text>}
                {applicationErrors.map((entry) => (
                  <View key={entry.id} style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: "#F1C7C7", padding: 12, marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: "#B42318" }}>{entry.method} {entry.path}</Text>
                    <Text style={{ fontSize: 12, color: colors.foreground, marginTop: 4 }}>{entry.error_name}: {entry.error_message}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 6 }}>確認ID {entry.request_id} ・ {new Date(entry.created_at).toLocaleString("ja-JP")}</Text>
                  </View>
                ))}
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, marginTop: 10, marginBottom: 8 }}>重要操作の監査ログ</Text>
                {auditLogs.length === 0 ? <Text style={{ color: colors.muted }}>監査ログはありません。</Text> : auditLogs.map((entry) => (
                  <View key={entry.id} style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>{entry.action}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{entry.actor_name ?? `ユーザー ${entry.actor_user_id ?? "システム"}`} ・ {entry.entity_type}{entry.entity_id ? ` / ${entry.entity_id}` : ""}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>{new Date(entry.created_at).toLocaleString("ja-JP")}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}
        {activeTab === "overview" && (
          <>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 16,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                Square会員状態の同期
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 6, marginBottom: 12 }}>
                Squareのサブスク状態だけを照合します。カード番号・支払額などの決済情報は取得・表示しません。
              </Text>
              {membershipSummaryLoading ? (
                <ActivityIndicator color="#E8A0BF" style={{ marginVertical: 8 }} />
              ) : membershipSummary ? (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {[
                      ["有効", membershipSummary.active, "#237A3B", "#E6F6EA"],
                      ["猶予中", membershipSummary.grace, "#9A6700", "#FFF4D6"],
                      ["停止", membershipSummary.suspended, "#B42318", "#FDECEC"],
                      ["確認待ち", membershipSummary.pending, "#586174", "#F1F2F4"],
                    ].map(([label, value, color, background]) => (
                      <View key={String(label)} style={{ width: "48%", borderRadius: 10, backgroundColor: String(background), paddingHorizontal: 12, paddingVertical: 10 }}>
                        <Text style={{ fontSize: 11, color: String(color), fontWeight: "700" }}>{label}</Text>
                        <Text style={{ fontSize: 22, color: String(color), fontWeight: "900", marginTop: 2 }}>{Number(value).toLocaleString()}件</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 9 }}>
                    Square紐づけ済み {membershipSummary.total.toLocaleString()}件／未紐づけ {membershipSummary.missingSubscription.toLocaleString()}件{"\n"}
                    自動通知 {membershipSummary.webhookEvents.toLocaleString()}件（エラー {membershipSummary.webhookFailures.toLocaleString()}件）
                  </Text>
                  {membershipSummary.lastVerifiedAt ? (
                    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>
                      最終一括確認：{new Date(membershipSummary.lastVerifiedAt).toLocaleString("ja-JP")}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <Pressable
                disabled={squareSyncing}
                onPress={async () => {
                  setSquareSyncing(true);
                  setSquareSyncProgress("Squareと照合を開始しています…");
                  try {
                    let offset = 0;
                    let scanned = 0;
                    let updated = 0;
                    let failed = 0;
                    let total = 0;
                    for (let batch = 0; batch < 100; batch += 1) {
                      const result = await syncSquareSubscriptions(offset);
                      scanned += result.scanned;
                      updated += result.updated;
                      failed += result.failed;
                      total = result.total;
                      setSquareSyncProgress(`${Math.min(scanned, total)} / ${total}件を確認中`);
                      if (!result.hasMore) break;
                      if (result.nextOffset <= offset) throw new Error("同期位置を更新できませんでした");
                      offset = result.nextOffset;
                    }
                    Alert.alert(
                      "同期完了",
                      `${scanned}件を確認し、登録済み会員${updated}件を更新しました。${failed ? `\n確認できなかったもの: ${failed}件` : ""}`,
                    );
                    await loadMembershipSummary();
                  } catch (error) {
                    Alert.alert(
                      "同期できませんでした",
                      error instanceof Error ? error.message : "時間をおいて再度お試しください。",
                    );
                  } finally {
                    setSquareSyncing(false);
                    setSquareSyncProgress(null);
                  }
                }}
                style={{
                  minHeight: 48,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: squareSyncing ? colors.border : "#E8A0BF",
                }}
              >
                {squareSyncing ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "700" }}>
                    Squareと今すぐ同期
                  </Text>
                )}
              </Pressable>
              {squareSyncProgress && (
                <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 8 }}>
                  {squareSyncProgress}
                </Text>
              )}
            </View>

            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>会員突合レポート</Text>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 5, marginBottom: 12 }}>
                Square・Discord・会員DBの紐づけ状況を集計しています。メールアドレス・Discord ID・決済情報は表示しません。
              </Text>
              {membershipSummaryLoading ? <ActivityIndicator color="#E8A0BF" /> : memberReconciliation ? (
                <>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {[
                      ["有効会員", memberReconciliation.activeMembers],
                      ["Discord紐づけ", memberReconciliation.discordLinkedMembers],
                      ["Square紐づけ", memberReconciliation.linkedSubscriptions],
                      ["要確認", memberReconciliation.blockingIssueCount],
                    ].map(([label, value]) => (
                      <View key={String(label)} style={{ width: "48%", borderRadius: 10, backgroundColor: label === "要確認" && Number(value) > 0 ? "#FFF4D6" : colors.background, padding: 11 }}>
                        <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "700" }}>{label}</Text>
                        <Text style={{ fontSize: 21, color: label === "要確認" && Number(value) > 0 ? "#9A6700" : colors.foreground, fontWeight: "900", marginTop: 2 }}>{Number(value).toLocaleString()}件</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontSize: 11, lineHeight: 18, color: colors.muted, marginTop: 10 }}>
                    Discord未紐づけ {memberReconciliation.discordMissingMembers.toLocaleString()}件／Square未紐づけ {memberReconciliation.unlinkedSubscriptions.toLocaleString()}件{"\n"}
                    一般会員でサブスク未紐づけ {memberReconciliation.membersWithoutSubscription.toLocaleString()}件／重複グループ {(
                      memberReconciliation.duplicateEmailGroups + memberReconciliation.duplicateDiscordIdGroups + memberReconciliation.duplicateMemberIdGroups + memberReconciliation.duplicateSquareCustomerIdGroups + memberReconciliation.duplicateSquareSubscriptionIdGroups
                    ).toLocaleString()}件
                  </Text>
                  {memberReconciliation.lastImport ? (
                    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 5 }}>
                      最終移行：{memberReconciliation.lastImport.status}・{memberReconciliation.lastImport.importedCount.toLocaleString()}件
                      {memberReconciliation.lastImport.completedAt ? `（${new Date(memberReconciliation.lastImport.completedAt).toLocaleString("ja-JP")}）` : ""}
                    </Text>
                  ) : null}
                </>
              ) : <Text style={{ color: colors.muted, fontSize: 12 }}>集計情報を読み込めませんでした。</Text>}
            </View>

            {/* KPIカード */}
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              主要指標
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
              {[
                { label: "総会員数", value: MEMBERS.length, icon: "person.2.fill", color: "#E8A0BF" },
                { label: "開催中イベント", value: stats.openEvents, icon: "calendar", color: "#A7C7E7" },
                { label: "募集終了イベント", value: stats.fullEvents, icon: "person.fill.checkmark", color: "#FF9500" },
                { label: "延べ参加者", value: stats.totalParticipants, icon: "chart.bar.fill", color: "#34C759" },
                { label: "部活動数", value: stats.activeClubs, icon: "person.3.fill", color: "#AF52DE" },
              ].map((kpi) => (
                <View
                  key={kpi.label}
                  style={{
                    flex: 1,
                    minWidth: "45%",
                    backgroundColor: colors.surface,
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: kpi.color + "20",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    <IconSymbol name={kpi.icon as any} size={20} color={kpi.color} />
                  </View>
                  <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground }}>{kpi.value}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{kpi.label}</Text>
                </View>
              ))}
            </View>

            {/* ランク分布 */}
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              ランク分布
            </Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 20 }}>
              {(["platinum", "gold", "silver", "regular"] as const).map((rank) => {
                const count = stats.rankCounts[rank] ?? 0;
                const pct = MEMBERS.length > 0 ? count / MEMBERS.length : 0;
                return (
                  <View key={rank} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: RANK_COLORS[rank] }}>
                        {RANK_LABELS[rank]}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.muted }}>{count}名</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                      <View
                        style={{
                          height: 6,
                          width: `${pct * 100}%`,
                          backgroundColor: RANK_COLORS[rank],
                          borderRadius: 3,
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* ポイント変更履歴（直近10件） */}
            {pointsHistory.length > 0 && (
              <>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
                  ポイント変更履歴（直近）
                </Text>
                <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 20 }}>
                  {pointsHistory.slice(0, 10).map((entry, i) => (
                    <View
                      key={i}
                      style={{
                        paddingVertical: 8,
                        borderBottomWidth: i < Math.min(pointsHistory.length, 10) - 1 ? 0.5 : 0,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                          {entry.name}
                        </Text>
                        <Text style={{ fontSize: 13, color: entry.to > entry.from ? "#34C759" : "#FF3B30", fontWeight: "700" }}>
                          {entry.from}pt → {entry.to}pt
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{entry.rank}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{entry.at}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {activeTab === "operators" && (
          <>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>
              運営メンバー管理
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 6, marginBottom: 14 }}>
              運営メンバーの「第X期」を設定します。この画面と保存機能は管理者だけが利用できます。運営メンバーには会員ランクとXPは表示されません。
            </Text>
            {operatorsLoading ? (
              <ActivityIndicator color="#E8A0BF" style={{ marginVertical: 24 }} />
            ) : operatorMembers.length === 0 ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 18 }}>
                <Text style={{ color: colors.muted, textAlign: "center" }}>運営メンバーが登録されていません。</Text>
              </View>
            ) : operatorMembers.map((operator) => (
              <View
                key={operator.userId}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{operator.displayName}</Text>
                      <View style={{ borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "#FDE7E7" }}>
                        <Text style={{ fontSize: 10, fontWeight: "900", color: "#C92A2A" }}>運営メンバー</Text>
                      </View>
                    </View>
                    {operator.memberId ? <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>会員ID {operator.memberId}</Text> : null}
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>{operator.memberTerm ?? "期設定なし"}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>第</Text>
                  <TextInput
                    value={operatorTerms[operator.userId] ?? ""}
                    onChangeText={(value) => setOperatorTerms((current) => ({
                      ...current,
                      [operator.userId]: value.replace(/[^0-9]/g, "").slice(0, 2),
                    }))}
                    keyboardType="number-pad"
                    placeholder="例：2"
                    placeholderTextColor={colors.muted}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      fontSize: 15,
                      color: colors.foreground,
                    }}
                  />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>期</Text>
                  <Pressable
                    disabled={savingOperatorId === operator.userId}
                    onPress={() => void saveOperatorTerm(operator)}
                    style={({ pressed }) => ({
                      minWidth: 72,
                      alignItems: "center",
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: "#E8A0BF",
                      opacity: pressed || savingOperatorId === operator.userId ? 0.6 : 1,
                    })}
                  >
                    {savingOperatorId === operator.userId ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFF" }}>保存</Text>}
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => setOperatorTerms((current) => ({ ...current, [operator.userId]: "" }))}
                  style={{ alignSelf: "flex-start", marginTop: 8, paddingVertical: 3 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted }}>期設定を外す</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {activeTab === "mee6" && (
          <View style={{ padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>会員レベル（上位順）</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Mee6から移行したXPにアプリ内の活動で得たXPを加算した現在のレベルです。未照合は「未取込」とし、Discord IDのない会員を0扱いしません。取込済み {mee6Members.filter((member) => member.mee6Level !== null).length}／{mee6Members.length}名。</Text>
            {mee6ImportResult ? <Text style={{ color: "#237A3B", marginTop: 8 }}>{mee6ImportResult}</Text> : null}
            <Pressable disabled={mee6Importing} onPress={async () => {
              setMee6Importing(true);
              try {
                const response = await fetch("/api/admin/mee6-levels/import-identified-snapshot", { method: "POST" });
                const result = await response.json() as { error?: string; importedCount?: number; unmatchedDiscordIds?: string[] };
                if (!response.ok) throw new Error(result.error ?? "取込に失敗しました");
                setMee6ImportResult(`Discord IDを照合できた772件のうち ${result.importedCount ?? 0}名を反映／アプリ未登録 ${result.unmatchedDiscordIds?.length ?? 0}件`);
                await loadMee6Members();
              } catch (error) { Alert.alert("Mee6取込エラー", error instanceof Error ? error.message : "取込に失敗しました"); }
              finally { setMee6Importing(false); }
            }} style={{ backgroundColor: "#237A3B", padding: 13, borderRadius: 10, alignItems: "center", marginTop: 12 }}>
              <Text style={{ color: "#FFF", fontWeight: "800" }}>照合済み772件を反映</Text>
            </Pressable>
            <Pressable disabled={mee6Importing} onPress={async () => {
              setMee6Importing(true);
              try {
                const selected = await selectJsonFile("Mee6順位表JSON");
                const payload = JSON.parse(selected.text);
                const response = await fetch("/api/admin/mee6-levels/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
                const result = await response.json() as { error?: string; importedCount?: number; unmatchedDiscordIds?: string[] };
                if (!response.ok) throw new Error(result.error ?? "取込に失敗しました");
                setMee6ImportResult(`${result.importedCount ?? 0}名反映／Discord ID未一致 ${result.unmatchedDiscordIds?.length ?? 0}件`);
                await loadMee6Members();
              } catch (error) {
                if (error instanceof Error && error.message !== "ファイルが選択されませんでした") Alert.alert("Mee6取込エラー", error.message);
              } finally { setMee6Importing(false); }
            }} style={{ backgroundColor: "#5865F2", padding: 13, borderRadius: 10, alignItems: "center", marginTop: 12 }}>
              <Text style={{ color: "#FFF", fontWeight: "800" }}>{mee6Importing ? "取込中…" : "Mee6順位表JSONを選択して反映"}</Text>
            </Pressable>
            <Pressable onPress={() => void loadMee6Members()} style={{ padding: 11, alignItems: "center" }}><Text style={{ color: "#5865F2" }}>一覧を更新</Text></Pressable>
            {mee6Loading ? <ActivityIndicator color="#5865F2" /> : mee6Members.map((member, index) => (
              <View key={member.memberId} style={{ flexDirection: "row", paddingVertical: 8, borderTopWidth: 0.5, borderColor: colors.border, alignItems: "center" }}>
                <Text style={{ width: 40, color: colors.muted }}>{index + 1}位</Text>
                <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: "700" }}>{member.displayName}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{member.memberId}{!member.discordLinked ? "・Discord未連携" : ""}</Text></View>
                <View style={{ alignItems: "flex-end" }}><Text style={{ color: member.mee6Level === null ? colors.muted : "#5865F2", fontWeight: "800" }}>{member.mee6Level === null ? "未取込" : `Lv.${member.currentLevel}`}</Text>{member.mee6Level !== null ? <Text style={{ color: colors.muted, fontSize: 10 }}>移行時 Lv.{member.mee6Level}</Text> : null}</View>
              </View>
            ))}
          </View>
        )}
        {activeTab === "members" && (
          <>
            {nonMemberId && <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Non代表の会員ID</Text>
              <Text style={{ marginTop: 6, color: colors.muted }}>{nonMemberId.name}：{nonMemberId.currentId ?? "未設定"}</Text>
              {nonMemberId.currentId === "IRO-TEST-001" && nonMemberId.nextId ? <Pressable disabled={nonMemberIdSaving} onPress={async () => { setNonMemberIdSaving(true); try { const corrected = await correctNonMemberId(); setNonMemberId(corrected); Alert.alert("会員IDを修正しました", `${corrected.name}：${corrected.currentId}`); } catch (error) { Alert.alert("修正できませんでした", error instanceof Error ? error.message : "もう一度お試しください"); } finally { setNonMemberIdSaving(false); } }} style={{ backgroundColor: "#5865F2", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 10, opacity: nonMemberIdSaving ? 0.6 : 1 }}><Text style={{ color: "#FFF", fontWeight: "800" }}>{nonMemberIdSaving ? "修正中…" : `${nonMemberId.nextId}に修正`}</Text></Pressable> : null}
            </View>}
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              会員一覧 ({MEMBERS.length}名)
            </Text>
            {MEMBERS.map((member) => {
              const isMemberAdmin = adminIds.has(member.id);
              const isSelf = member.id === CURRENT_USER.id;
              const currentPts = pointsOverrides[member.id] ?? member.points;
              const currentRank = (rankOverrides[member.id] ?? member.rank) as keyof typeof RANK_LABELS;
              return (
                <View
                  key={member.id}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Pressable
                    onPress={() => router.push({ pathname: "/member-profile", params: { id: member.id } })}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: RANK_COLORS[currentRank] + "20",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                        overflow: "hidden",
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>{member.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                          {member.name}
                        </Text>
                        {isMemberAdmin && (
                          <View
                            style={{
                              backgroundColor: "#E8A0BF20",
                              borderRadius: 6,
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              marginLeft: 6,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: "700", color: "#E8A0BF" }}>管理者</Text>
                          </View>
                        )}
                        {isSelf && (
                          <Text style={{ fontSize: 10, color: colors.muted, marginLeft: 6 }}>（自分）</Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                        {member.branch} / {generationOverrides[member.id] ?? member.generation}期生 / {currentPts}pt
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: RANK_COLORS[currentRank] + "20",
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: RANK_COLORS[currentRank] }}>
                        {RANK_LABELS[currentRank]}
                      </Text>
                    </View>
                  </Pressable>

                  {/* ポイント調整ボタン */}
                  <Pressable
                    onPress={() => handleEditPoints(member.id, member.name, currentPts)}
                    style={({ pressed }) => ({
                      marginTop: 8,
                      paddingVertical: 7,
                      borderRadius: 8,
                      alignItems: "center",
                      backgroundColor: "#34C75910",
                      borderWidth: 1,
                      borderColor: "#34C759",
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#34C759" }}>
                      {currentPts}pt を調整
                    </Text>
                  </Pressable>

                  {/* 期生変更ボタン */}
                  <Pressable
                    onPress={() => handleEditGeneration(member.id, member.name, generationOverrides[member.id] ?? member.generation)}
                    style={({ pressed }) => ({
                      marginTop: 8,
                      paddingVertical: 7,
                      borderRadius: 8,
                      alignItems: "center",
                      backgroundColor: "#A7C7E710",
                      borderWidth: 1,
                      borderColor: "#A7C7E7",
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#5B9BD5" }}>
                      {generationOverrides[member.id] ?? member.generation}期生を変更
                    </Text>
                  </Pressable>

                  {/* イロタスポイント付与ボタン */}
                  <Pressable
                    onPress={() => handleGrantIrotasPoints(member.id, member.name)}
                    style={({ pressed }) => ({
                      marginTop: 8,
                      paddingVertical: 7,
                      borderRadius: 8,
                      alignItems: "center",
                      backgroundColor: "#FF950010",
                      borderWidth: 1,
                      borderColor: "#FF9500",
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#FF9500" }}>
                      ★ イロタスPT付与 ({irotasBalances[member.id] ?? 0}pt保有)
                    </Text>
                  </Pressable>

                  {/* 会費免除ボタン */}
                  <Pressable
                    onPress={() => toggleFeeExemption(member.id, member.name)}
                    style={({ pressed }) => ({
                      marginTop: 8,
                      paddingVertical: 7,
                      borderRadius: 8,
                      alignItems: "center",
                      backgroundColor: feeExemptIds.has(member.id) ? "#34C75910" : "#8E8E9310",
                      borderWidth: 1,
                      borderColor: feeExemptIds.has(member.id) ? "#34C759" : "#8E8E93",
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: feeExemptIds.has(member.id) ? "#34C759" : "#8E8E93" }}>
                      {feeExemptIds.has(member.id) ? "✓ 会費免除中（タップで解除）" : "会費免除を付与"}
                    </Text>
                  </Pressable>

                  {/* 権限切り替えボタン */}
                  {!isSelf && (
                    <Pressable
                      onPress={() => toggleAdminRole(member.id, member.name)}
                      style={({ pressed }) => ({
                        marginTop: 10,
                        paddingVertical: 7,
                        borderRadius: 8,
                        alignItems: "center",
                        backgroundColor: isMemberAdmin ? "#FF3B3010" : "#E8A0BF10",
                        borderWidth: 1,
                        borderColor: isMemberAdmin ? "#FF3B30" : "#E8A0BF",
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: isMemberAdmin ? "#FF3B30" : "#E8A0BF",
                        }}
                      >
                        {isMemberAdmin ? "管理者権限を削除" : "管理者に任命"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}

            {/* ポイント変更履歴（全件） */}
            {pointsHistory.length > 0 && (
              <>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 20, marginBottom: 12 }}>
                  ポイント変更履歴（全{pointsHistory.length}件）
                </Text>
                <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
                  {pointsHistory.map((entry, i) => (
                    <View
                      key={i}
                      style={{
                        paddingVertical: 8,
                        borderBottomWidth: i < pointsHistory.length - 1 ? 0.5 : 0,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                          {entry.name}
                        </Text>
                        <Text style={{ fontSize: 13, color: entry.to > entry.from ? "#34C759" : "#FF3B30", fontWeight: "700" }}>
                          {entry.from}pt → {entry.to}pt
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{entry.rank}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{entry.at}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {activeTab === "clubs" && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>部活動一覧管理</Text>
                <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 3 }}>部長を設定すると、入部申請がその部長に通知されます。</Text>
              </View>
              <Pressable onPress={() => setEditingClub({ id: `club_${Date.now()}`, name: "", description: "", icon: "🏃", leaderId: CURRENT_USER.id, memberIds: [CURRENT_USER.id], applicantIds: [], applications: [], createdByAdmin: true, events: [] })} style={{ backgroundColor: "#E8A0BF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>＋ 新規追加</Text></Pressable>
            </View>
            {clubs.map((club) => {
              const leader = MEMBERS.find((member) => member.id === club.leaderId);
              return <View key={club.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 26, marginRight: 11 }}>{club.icon}</Text>
                <View style={{ flex: 1 }}><Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{club.name}</Text><Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>部長：{leader?.name ?? "未設定"}　部員{club.memberIds.length}名　申請{club.applicantIds.length}件</Text></View>
                <Pressable onPress={() => setEditingClub({ ...club, memberIds: [...club.memberIds], applicantIds: [...club.applicantIds], applications: [...club.applications], events: [...club.events] })} style={{ padding: 8 }}><Text style={{ fontSize: 12, fontWeight: "800", color: "#5B5A73" }}>編集</Text></Pressable>
              </View>;
            })}
          </>
        )}

        {activeTab === "announcements" && (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                お知らせ管理 ({announcements.length}件)
              </Text>
              <Pressable
                onPress={() => { setEditingAnnouncement(null); setShowAnnouncementModal(true); }}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "#d4849e" : "#E8A0BF",
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                })}
              >
                <IconSymbol name="plus" size={14} color="#FFF" />
                <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>新規作成</Text>
              </Pressable>
            </View>

            {announcements.length === 0 ? (
              <View style={{ alignItems: "center", marginTop: 40 }}>
                <IconSymbol name="megaphone.fill" size={40} color={colors.muted} />
                <Text style={{ fontSize: 15, color: colors.muted, marginTop: 12, textAlign: "center" }}>
                  まだお知らせがありません。{"\n"}「新規作成」からお知らせを投稿しましょう。
                </Text>
              </View>
            ) : (
              announcements.map((ann) => (
                <View
                  key={ann.id}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 0.5,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1, marginRight: 8 }}>
                      {ann.title}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Pressable
                        onPress={() => { setEditingAnnouncement(ann); setShowAnnouncementModal(true); }}
                        accessibilityLabel={`${ann.title}を編集`}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
                      >
                        <IconSymbol name="pencil" size={16} color="#5D5C74" />
                      </Pressable>
                      <Pressable
                        onPress={() => void handleDeleteAnnouncement(ann.id)}
                        accessibilityLabel={`${ann.title}を削除`}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
                      >
                        <IconSymbol name="trash.fill" size={16} color="#FF3B30" />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 18 }}>
                    {ann.content}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>
                    {ann.createdAt}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === "coupons" && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}><Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.foreground }}>クーポン管理</Text><Pressable onPress={openCouponCreate} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#E8A0BF", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 }}><IconSymbol name="plus" size={13} color="#FFF" /><Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800", marginLeft: 4 }}>新規作成</Text></Pressable></View>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: 16 }}>
              クーポンごとに「1回限定」または「期間中何度でも」を設定できます。1回限定は会員が利用を確定すると使用済みになります。
            </Text>
            {coupons.map((coupon) => (
              <View key={coupon.id} style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: colors.border, opacity: coupon.status === "ended" ? 0.6 : 1 }}>
                {coupon.imageUrl ? <Image source={{ uri: coupon.imageUrl }} style={{ width: 92, height: 92, borderRadius: 12, marginBottom: 10 }} contentFit="cover" /> : null}
                <View style={{ flexDirection: "row", alignItems: "center" }}><Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: colors.foreground }}>{coupon.title}</Text><Text style={{ fontSize: 10, fontWeight: "800", color: coupon.status === "ended" ? colors.muted : "#248A3D" }}>{coupon.status === "ended" ? "終了" : "利用可能"}</Text></View>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>有効期限 {coupon.expiresAt} ／ コード {coupon.code}</Text>
                <View style={{ flexDirection: "row", marginTop: 12, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                  {(["single", "multiple"] as const).map((usageType) => {
                    const selected = coupon.usageType === usageType;
                    return (
                      <Pressable
                        key={usageType}
                        onPress={() => { void updateCouponUsageType(coupon.id, usageType); }}
                        style={{ flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: selected ? "#E8A0BF" : colors.background }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "800", color: selected ? "#FFF" : colors.foreground }}>
                          {usageType === "single" ? "1回限定" : "期間中何度でも"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: "row", gap: 7, marginTop: 10 }}><Pressable onPress={() => openCouponEdit(coupon)} style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9, backgroundColor: "#5D5C7418" }}><Text style={{ color: "#5D5C74", fontSize: 12, fontWeight: "800" }}>編集</Text></Pressable><Pressable onPress={() => { void setCouponStatus(coupon.id, coupon.status === "ended" ? "active" : "ended"); }} style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9, backgroundColor: coupon.status === "ended" ? "#34C75918" : "#FF950018" }}><Text style={{ color: coupon.status === "ended" ? "#248A3D" : "#B06C21", fontSize: 12, fontWeight: "800" }}>{coupon.status === "ended" ? "再開" : "終了"}</Text></Pressable><Pressable onPress={() => confirmDeleteCoupon(coupon)} style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9, backgroundColor: "#FF3B3018" }}><Text style={{ color: "#FF3B30", fontSize: 12, fontWeight: "800" }}>削除</Text></Pressable></View>
              </View>
            ))}
          </>
        )}

        {activeTab === "emails" && (
          <>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
              承認メールアドレス管理
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 16, lineHeight: 18 }}>
              ここに登録したメールアドレスのみ新規登録が可能です。招待したいメンバーのメールアドレスを事前に追加してください。
            </Text>
            <View style={{ backgroundColor: "#FFF8E8", borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#E5C875" }}>
              <Text style={{ fontSize: 12, fontWeight: "900", color: "#71520B" }}>権限の強さ</Text>
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginTop: 5 }}>管理者 ＞ 運営メンバー ＞ 部長 ＞ 一般会員</Text>
              <Text style={{ fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 5 }}>管理者は全機能、運営メンバーは運営業務、部長は担当部活動の申請・部員管理のみ行えます。</Text>
            </View>

            {/* 新規追加フォーム */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
                borderWidth: 0.5,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
                メールアドレスを追加
              </Text>
              <TextInput
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="メールアドレス"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 0.5,
                  borderColor: colors.border,
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={newNote}
                onChangeText={setNewNote}
                placeholder="メモ（任意）例：山田太郎さんの紹介"
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 0.5,
                  borderColor: colors.border,
                  marginBottom: 12,
                }}
              />
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, marginBottom: 7 }}>ログイン権限</Text>
              <View style={{ flexDirection: "row", gap: 7, marginBottom: 12 }}>
                {([
                  { key: "admin", label: "管理者" },
                  { key: "operator", label: "運営メンバー" },
                  { key: "club_leader", label: "部長" },
                  { key: "member", label: "一般会員" },
                ] as const).map((option) => <Pressable key={option.key} onPress={() => setNewAccessRole(option.key)} style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", backgroundColor: newAccessRole === option.key ? "#5D5C74" : colors.background, borderWidth: 1, borderColor: newAccessRole === option.key ? "#5D5C74" : colors.border }}><Text style={{ fontSize: 11, fontWeight: "800", color: newAccessRole === option.key ? "#FFF" : colors.foreground }}>{option.label}</Text></Pressable>)}
              </View>
              {newAccessRole !== "member" ? <Text style={{ fontSize: 11, lineHeight: 16, color: "#B06C21", marginBottom: 10 }}>管理者・運営メンバー・部長は、役職が有効な間はSquareサブスクなしでログインできます。</Text> : null}
              <Pressable
                onPress={handleAddEmail}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "#d4849e" : "#E8A0BF",
                  borderRadius: 10,
                  padding: 12,
                  alignItems: "center",
                })}
              >
                {addEmailMutation.isPending ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>追加する</Text>
                )}
              </Pressable>
            </View>

            {/* 承認済みメール一覧 */}
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 10 }}>
              承認済み一覧 ({allowedEmails?.length ?? 0}件)
            </Text>
            {emailsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : allowedEmails?.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 20 }}>
                まだ承認メールアドレスが登録されていません
              </Text>
            ) : (
              allowedEmails?.map((item) => (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 0.5,
                    borderColor: item.isRegistered ? "#34C75940" : colors.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                        {item.email}
                      </Text>
                      {item.isRegistered === 1 && (
                        <View style={{ backgroundColor: "#34C75920", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#34C759" }}>登録済</Text>
                        </View>
                      )}
                    </View>
                    {item.note ? (
                      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.note}</Text>
                    ) : null}
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      {new Date(item.createdAt).toLocaleDateString("ja-JP")}追加
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                      {([
                        { key: "admin", label: "管理者" },
                        { key: "operator", label: "運営メンバー" },
                        { key: "club_leader", label: "部長" },
                        { key: "member", label: "一般会員" },
                      ] as const).map((option) => <Pressable key={option.key} disabled={setAccessRoleMutation.isPending} onPress={() => setAccessRoleMutation.mutate({ id: item.id, accessRole: option.key })} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: item.accessRole === option.key ? (option.key === "member" ? "#E8F2FA" : "#FFF0D8") : colors.background, borderWidth: 1, borderColor: item.accessRole === option.key ? (option.key === "member" ? "#5B9BD5" : "#D9942F") : colors.border }}><Text style={{ fontSize: 10, fontWeight: "800", color: item.accessRole === option.key ? (option.key === "member" ? "#3E78A1" : "#9A6115") : colors.muted }}>{option.label}</Text></Pressable>)}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => handleRemoveEmail(item.id, item.email)}
                    style={({ pressed }) => ({
                      padding: 8,
                      opacity: pressed ? 0.5 : 1,
                    })}
                  >
                    <IconSymbol name="trash.fill" size={18} color="#FF3B30" />
                  </Pressable>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === "payments" && (
          <>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              Squareイベント決済（共有DB・確認専用）
            </Text>
            {squarePaymentsError ? <Text style={{ color: "#B42318", marginBottom: 12 }}>Square決済記録を取得できませんでした。</Text> : null}
            {!squarePaymentsError && squareEventPayments.length === 0 ? <Text style={{ color: colors.muted, marginBottom: 16 }}>Square決済記録はまだありません。</Text> : null}
            {squareEventPayments.map((payment) => (
              <View key={payment.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8 }}>
                <Text style={{ color: colors.foreground, fontWeight: "800" }}>{payment.eventTitle}</Text>
                <Text style={{ color: colors.foreground, fontSize: 13, marginTop: 3 }}>{payment.memberName}（{payment.memberId}）</Text>
                <Text style={{ color: payment.status === "paid" ? "#218548" : "#B42318", fontSize: 12, fontWeight: "800", marginTop: 3 }}>
                  {payment.status === "paid" ? "支払済" : payment.status === "cancelled" ? "申込取消・リンク停止" : payment.status === "ready" ? "支払待ち" : "決済ページ作成中"} ・ {payment.amountYen.toLocaleString()}円
                  {payment.pointsUsed ? `（${payment.pointsUsed.toLocaleString()}pt利用）` : ""}
                </Text>
              </View>
            ))}
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 18, marginBottom: 7 }}>旧端末内の支払い記録</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>以下の記録と手動変更はこの端末内のみです。Squareの共有決済状態には反映されません。</Text>

            {/* イベント選択 */}
            {(() => {
              // 支払レコードがあるイベントの一覧
              const eventIds = [...new Set(paymentRecords.map((r) => r.eventId))];
              if (eventIds.length === 0) {
                return (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
                      まだ支払データがありません。{"\n"}イベントに参加すると自動登録されます。
                    </Text>
                  </View>
                );
              }
              return (
                <>
                  {/* イベント選択ピル */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: "row", gap: 8, marginBottom: 16 }}
                  >
                    {eventIds.map((eid) => {
                      const ev = adminEvents.find((e) => e.id === eid);
                      const label = ev?.title ?? eid;
                      const records = paymentRecords.filter((r) => r.eventId === eid);
                      const paidCount = records.filter((r) => r.status === "paid").length;
                      return (
                        <Pressable
                          key={eid}
                          onPress={() => setSelectedPaymentEventId(eid === selectedPaymentEventId ? null : eid)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 20,
                            backgroundColor: selectedPaymentEventId === eid ? "#E8A0BF" : colors.surface,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "600", color: selectedPaymentEventId === eid ? "#FFF" : colors.foreground }} numberOfLines={1}>
                            {label}
                          </Text>
                          <Text style={{ fontSize: 11, color: selectedPaymentEventId === eid ? "#FFF" : colors.muted, textAlign: "center", marginTop: 2 }}>
                            {paidCount}/{records.length}人済
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* 選択中イベントの参加者一覧 */}
                  {selectedPaymentEventId && (() => {
                    const ev = adminEvents.find((e) => e.id === selectedPaymentEventId);
                    const records = paymentRecords.filter((r) => r.eventId === selectedPaymentEventId);
                    const paidAmount = records.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
                    return (
                      <>
                        {/* サマリーカード */}
                        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>
                            {ev?.title ?? selectedPaymentEventId}
                          </Text>
                          <View style={{ flexDirection: "row", gap: 16 }}>
                            <View style={{ flex: 1, alignItems: "center" }}>
                              <Text style={{ fontSize: 11, color: colors.muted }}>参加者</Text>
                              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground }}>{records.length}人</Text>
                            </View>
                            <View style={{ flex: 1, alignItems: "center" }}>
                              <Text style={{ fontSize: 11, color: colors.muted }}>支払済み</Text>
                              <Text style={{ fontSize: 20, fontWeight: "700", color: "#34C759" }}>
                                {records.filter((r) => r.status === "paid").length}人
                              </Text>
                            </View>
                            <View style={{ flex: 1, alignItems: "center" }}>
                              <Text style={{ fontSize: 11, color: colors.muted }}>未払い</Text>
                              <Text style={{ fontSize: 20, fontWeight: "700", color: "#FF3B30" }}>
                                {records.filter((r) => r.status === "unpaid").length}人
                              </Text>
                            </View>
                            <View style={{ flex: 1, alignItems: "center" }}>
                              <Text style={{ fontSize: 11, color: colors.muted }}>入金額</Text>
                              <Text style={{ fontSize: 16, fontWeight: "700", color: "#E8A0BF" }}>
                                ¥{paidAmount.toLocaleString()}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* 参加者別支払状況 */}
                        {records.length === 0 ? (
                          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 20 }}>
                            まだ参加者がいません
                          </Text>
                        ) : (
                          records.map((rec) => {
                            const statusColor = rec.status === "paid" ? "#34C759" : rec.status === "exempted" ? "#AF52DE" : "#FF3B30";
                            return (
                              <View
                                key={rec.id}
                                style={{
                                  backgroundColor: colors.surface,
                                  borderRadius: 12,
                                  padding: 14,
                                  marginBottom: 8,
                                  flexDirection: "row",
                                  alignItems: "center",
                                }}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{rec.userName}</Text>
                                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                                    {RANK_LABELS[rec.userRank as keyof typeof RANK_LABELS] ?? rec.userRank} ・ ¥{rec.amount.toLocaleString()}
                                  </Text>
                                  {rec.paidAt && (
                                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                                      支払日: {new Date(rec.paidAt).toLocaleDateString("ja-JP")}
                                    </Text>
                                  )}
                                </View>
                                {/* 状態トグルボタン */}
                                <View style={{ flexDirection: "row", gap: 6 }}>
                                  {(["unpaid", "paid", "exempted"] as PaymentStatus[]).map((s) => (
                                    <Pressable
                                      key={s}
                                      onPress={async () => {
                                        await updatePaymentStatus(rec.id, s);
                                        clearPaymentCache();
                                        const updated = await getAllPayments();
                                        setPaymentRecords(updated);
                                      }}
                                      style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 8,
                                        backgroundColor: rec.status === s ? statusColor + "30" : colors.background,
                                        borderWidth: 1,
                                        borderColor: rec.status === s ? statusColor : colors.border,
                                      }}
                                    >
                                      <Text style={{ fontSize: 11, fontWeight: "600", color: rec.status === s ? statusColor : colors.muted }}>
                                        {s === "paid" ? "済" : s === "exempted" ? "免除" : "未"}
                                      </Text>
                                    </Pressable>
                                  ))}
                                </View>
                              </View>
                            );
                          })
                        )}
                      </>
                    );
                  })()}
                </>
              );
            })()}
          </>
        )}

        {activeTab === "events" && (
          <>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Discordイベント移行</Text>
              <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 6 }}>Discordのイベントを、元スレッドIDで重複なく反映します。既にアプリで編集した項目は上書きせず、差分は競合として記録します。</Text>
              {discordEventImportResult ? <Text style={{ fontSize: 12, fontWeight: "700", color: "#237A3B", marginTop: 10 }}>{discordEventImportResult}</Text> : null}
              <Pressable disabled={discordEventImporting} onPress={async () => {
                setDiscordEventImporting(true);
                setDiscordEventImportResult(null);
                try {
                  const selected = await selectJsonFile("DiscordイベントJSON");
                  const payload = JSON.parse(selected.text) as { events?: unknown[] };
                  const eventCount = Array.isArray(payload.events) ? payload.events.length : 0;
                  if (!eventCount) throw new Error("イベントデータが見つかりません");
                  // D1 writes are intentionally processed in small, retry-safe batches.
                  // This avoids a single long-running request timing out on a full Discord archive.
                  const totals = { created: 0, updated: 0, preserved: 0, conflicted: 0, skipped: 0 };
                  const events = payload.events as unknown[];
                  const batchSize = 12;
                  for (let start = 0; start < events.length; start += batchSize) {
                    const batch = events.slice(start, start + batchSize);
                    const response = await fetch("/api/admin/event-import/commit", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ ...payload, events: batch, confirmation: `APPLY_${batch.length}_EVENTS` }),
                    });
                    const result = await response.json() as { error?: string; counts?: { created?: number; updated?: number; preserved?: number; conflicted?: number; skipped?: number } };
                    if (!response.ok) throw new Error(result.error ?? "取込に失敗しました");
                    const counts = result.counts ?? {};
                    totals.created += counts.created ?? 0;
                    totals.updated += counts.updated ?? 0;
                    totals.preserved += counts.preserved ?? 0;
                    totals.conflicted += counts.conflicted ?? 0;
                    totals.skipped += counts.skipped ?? 0;
                  }
                  const counts = totals;
                  const summary = `新規 ${counts.created ?? 0}件／更新 ${counts.updated ?? 0}件／保持 ${counts.preserved ?? 0}件／競合 ${counts.conflicted ?? 0}件／保留 ${counts.skipped ?? 0}件`;
                  setDiscordEventImportResult(summary);
                  Alert.alert("イベント移行完了", summary);
                } catch (error) {
                  if (error instanceof SyntaxError) Alert.alert("読込エラー", "JSONファイルの形式を確認してください。");
                  else if (error instanceof Error && error.message !== "ファイルが選択されませんでした") Alert.alert("取込エラー", error.message);
                } finally { setDiscordEventImporting(false); }
              }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: discordEventImporting ? colors.border : "#5865F2", alignItems: "center", justifyContent: "center", marginTop: 14 }}>
                {discordEventImporting ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontWeight: "800" }}>DiscordイベントJSONを選択して反映</Text>}
              </Pressable>
            </View>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Discordイベントチャット移行</Text>
              <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 6 }}>イベントID・日付・名称が一致したチャットだけを取り込みます。イベント参加者およびメッセージ送信者以外には公開されません。</Text>
              {discordEventChatImportResult ? <Text style={{ fontSize: 12, fontWeight: "700", color: "#237A3B", marginTop: 10 }}>{discordEventChatImportResult}</Text> : null}
              <Pressable disabled={discordEventChatImporting} onPress={async () => {
                setDiscordEventChatImporting(true); setDiscordEventChatImportResult(null);
                try {
                  const selected = await selectJsonFile("DiscordイベントチャットJSON");
                  const payload = JSON.parse(selected.text) as { chats?: unknown[] };
                  if (!Array.isArray(payload.chats) || !payload.chats.length) throw new Error("イベントチャットデータが見つかりません");
                  const response = await fetch("/api/admin/event-chat-import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
                  const result = await response.json() as { error?: string; rooms?: number; messages?: number; held?: number };
                  if (!response.ok) throw new Error(result.error ?? "取込に失敗しました");
                  const summary = `チャット ${result.rooms ?? 0}件／メッセージ ${result.messages ?? 0}件／保留 ${result.held ?? 0}件`;
                  setDiscordEventChatImportResult(summary); Alert.alert("イベントチャット移行完了", summary);
                } catch (error) {
                  if (error instanceof SyntaxError) Alert.alert("読込エラー", "JSONファイルの形式を確認してください。");
                  else if (error instanceof Error && error.message !== "ファイルが選択されませんでした") Alert.alert("取込エラー", error.message);
                } finally { setDiscordEventChatImporting(false); }
              }} style={{ minHeight: 48, borderRadius: 12, backgroundColor: discordEventChatImporting ? colors.border : "#5865F2", alignItems: "center", justifyContent: "center", marginTop: 14 }}>
                {discordEventChatImporting ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontWeight: "800" }}>DiscordイベントチャットJSONを選択して反映</Text>}
              </Pressable>
              {discordEventChatPurgeResult ? <Text style={{ fontSize: 12, fontWeight: "700", color: "#237A3B", marginTop: 10 }}>{discordEventChatPurgeResult}</Text> : null}
              {discordEventChatPurgePreview ? <View style={{ marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: "#FFF3F1" }}>
                <Text style={{ color: "#8A1C12", fontWeight: "800", lineHeight: 20 }}>Discord由来のメッセージ {discordEventChatPurgePreview.messages}件を削除します。空になるチャットルームも削除します。</Text>
                <Text style={{ color: "#6F4B46", fontSize: 12, marginTop: 5, lineHeight: 18 }}>イベント・申込・参加者・IRO+で投稿したメッセージは残ります。</Text>
                <Pressable disabled={discordEventChatPurging} onPress={async () => {
                  const preview = discordEventChatPurgePreview;
                  if (!preview) return;
                  setDiscordEventChatPurging(true); setDiscordEventChatPurgeResult(null);
                  try {
                    const response = await fetch("/api/admin/event-chat-import/purge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation: `DELETE_${preview.messages}_IMPORTED_EVENT_CHAT_MESSAGES` }) });
                    const result = await response.json() as { error?: string; deletedMessages?: number; deletedRooms?: number; retainedRooms?: number };
                    if (!response.ok) throw new Error(result.error ?? "削除に失敗しました");
                    setDiscordEventChatPurgePreview(null);
                    setDiscordEventChatPurgeResult(`メッセージ ${result.deletedMessages ?? 0}件を削除／空のルーム ${result.deletedRooms ?? 0}件を削除／IRO+のメッセージを含むルーム ${result.retainedRooms ?? 0}件は保持`);
                  } catch (error) {
                    Alert.alert("削除エラー", error instanceof Error ? error.message : "削除に失敗しました");
                  } finally { setDiscordEventChatPurging(false); }
                }} style={{ minHeight: 42, borderRadius: 10, backgroundColor: "#D92D20", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
                  {discordEventChatPurging ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontWeight: "800" }}>この {discordEventChatPurgePreview.messages}件を削除する</Text>}
                </Pressable>
                <Pressable disabled={discordEventChatPurging} onPress={() => setDiscordEventChatPurgePreview(null)} style={{ minHeight: 38, alignItems: "center", justifyContent: "center", marginTop: 4 }}>
                  <Text style={{ color: colors.muted, fontWeight: "700" }}>キャンセル</Text>
                </Pressable>
              </View> : null}
              <Pressable disabled={discordEventChatPurging} onPress={async () => {
                try {
                  const previewResponse = await fetch("/api/admin/event-chat-import/purge");
                  const preview = await previewResponse.json() as { error?: string; messages?: number; rooms?: number };
                  if (!previewResponse.ok) throw new Error(preview.error ?? "対象を確認できませんでした");
                  const messages = preview.messages ?? 0;
                  const rooms = preview.rooms ?? 0;
                  if (!messages) { Alert.alert("削除対象なし", "Discordから取り込んだイベントチャットはありません。"); return; }
                  setDiscordEventChatPurgePreview({ messages, rooms });
                } catch (error) {
                  Alert.alert("確認エラー", error instanceof Error ? error.message : "対象を確認できませんでした");
                }
              }} style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: "#D92D20", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
                {discordEventChatPurging ? <ActivityIndicator color="#D92D20" /> : <Text style={{ color: "#D92D20", fontWeight: "800" }}>取り込み済みイベントチャットを削除</Text>}
              </Pressable>
            </View>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              イベント管理 ({adminEvents.length}件)
            </Text>
            {adminEvents.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => router.push({ pathname: "/event-detail", params: { id: event.id } })}
                style={({ pressed }) => ({
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }} numberOfLines={1}>
                    {event.title}
                  </Text>
                  <View
                    style={{
                      backgroundColor:
                        event.status === "open" ? "#34C75920" : event.status === "full" ? "#FF950020" : "#8E8E9320",
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      marginLeft: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: event.status === "open" ? "#34C759" : event.status === "full" ? "#FF9500" : "#8E8E93",
                      }}
                    >
                      {event.status === "open" ? "受付中" : event.status === "full" ? "募集終了" : "終了"}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {event.date} {event.time}〜 / {event.location}
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                  <Text style={{ fontSize: 13, color: colors.foreground }}>
                    参加: {event.attendees}/{event.capacity}名
                  </Text>
                  <Text style={{ fontSize: 13, color: "#E8A0BF", fontWeight: "600" }}>
                    {event.price}
                  </Text>
                </View>
              </Pressable>
            ))}
           </>
        )}
        {activeTab === "contests" && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>
                  グルメ選手権管理 ({gourmetContests.length}件)
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                  Discordから移行した大会を含めて確認できます
                </Text>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: "/board", params: { category: "gourmet-contest", view: "threads" } })}
                style={{ backgroundColor: "#C6962C", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>掲示板で確認</Text>
              </Pressable>
            </View>
            {gourmetContests.length === 0 ? (
              <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, padding: 28 }}>
                <IconSymbol name="trophy.fill" size={34} color="#C6962C" />
                <Text style={{ marginTop: 10, color: colors.muted }}>グルメ選手権を読み込んでいます</Text>
              </View>
            ) : gourmetContests.map(({ thread, comments }) => (
              <Pressable
                key={thread.id}
                onPress={() => router.push({ pathname: "/board", params: { category: "gourmet-contest", view: "threads", thread: thread.id } })}
                style={({ pressed }) => ({
                  backgroundColor: colors.surface,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: pressed ? 0.72 : 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#C6962C20", alignItems: "center", justifyContent: "center" }}>
                    <IconSymbol name="trophy.fill" size={19} color="#C6962C" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 11 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{thread.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 5 }}>
                      コメント {comments.length}件{thread.gourmetContest?.winnerName ? ` ・ 優勝 ${thread.gourmetContest.winnerName}さん` : ""}
                    </Text>
                  </View>
                  <IconSymbol name="chevron.right" size={17} color={colors.muted} />
                </View>
              </Pressable>
            ))}
          </>
        )}
        {activeTab === "analytics" && (
          <AnalyticsTab adminEvents={adminEvents} eventsReady={adminEventsReady} eventsError={adminEventsError} onReloadEvents={() => setAdminEventsReloadKey((value) => value + 1)} />
        )}
      </ScrollView>

      <Modal visible={!!editingClub} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingClub(null)}>
        {editingClub ? <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}><Pressable onPress={() => setEditingClub(null)}><Text style={{ color: colors.muted }}>キャンセル</Text></Pressable><Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: colors.foreground }}>部活動を編集</Text><Pressable onPress={() => { const existing = clubs.some((club) => club.id === editingClub.id); const normalized = { ...editingClub, name: editingClub.name.trim(), description: editingClub.description.trim(), memberIds: editingClub.memberIds.includes(editingClub.leaderId) ? editingClub.memberIds : [editingClub.leaderId, ...editingClub.memberIds] }; if (!normalized.name || !normalized.description) return; if (existing) updateClub(normalized); else addClub(normalized); setEditingClub(null); }}><Text style={{ color: "#E8A0BF", fontWeight: "800" }}>保存</Text></Pressable></View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>アイコン</Text><TextInput value={editingClub.icon} onChangeText={(icon) => setEditingClub({ ...editingClub, icon })} maxLength={4} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 22, marginBottom: 14, color: colors.foreground }} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>部活動名</Text><TextInput value={editingClub.name} onChangeText={(name) => setEditingClub({ ...editingClub, name })} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 14, color: colors.foreground }} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>説明</Text><TextInput value={editingClub.description} onChangeText={(description) => setEditingClub({ ...editingClub, description })} multiline style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 15, minHeight: 90, marginBottom: 18, color: colors.foreground, textAlignVertical: "top" }} />
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 9 }}>部長を選択</Text>
            {MEMBERS.map((member) => <Pressable key={member.id} onPress={() => { const changed = member.id !== editingClub.leaderId; setEditingClub({ ...editingClub, leaderId: member.id }); if (changed) sendLeaderAppointmentNotification(editingClub.name || "部活動", CURRENT_USER.name); }} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, marginBottom: 6, backgroundColor: editingClub.leaderId === member.id ? "#FFF0F6" : colors.surface, borderWidth: 1, borderColor: editingClub.leaderId === member.id ? "#E8A0BF" : colors.border }}><Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: colors.foreground }}>{member.name}</Text>{editingClub.leaderId === member.id ? <Text style={{ color: "#E8A0BF", fontWeight: "900" }}>部長</Text> : null}</Pressable>)}
            {clubs.some((club) => club.id === editingClub.id) ? <Pressable onPress={() => Alert.alert("部活動を削除しますか？", `${editingClub.name}を一覧から削除します。`, [{ text: "キャンセル", style: "cancel" }, { text: "削除", style: "destructive", onPress: () => { removeClub(editingClub.id); setEditingClub(null); } }])} style={{ alignItems: "center", paddingVertical: 14, marginTop: 16 }}><Text style={{ color: "#C94B55", fontWeight: "800" }}>この部活動を削除</Text></Pressable> : null}
          </ScrollView>
        </View> : null}
      </Modal>

      <Modal visible={showCouponModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowCouponModal(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}><Pressable onPress={() => setShowCouponModal(false)}><Text style={{ color: colors.muted }}>キャンセル</Text></Pressable><Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: colors.foreground }}>{editingCouponId ? "クーポン編集" : "クーポン作成"}</Text><Pressable onPress={() => { void saveCoupon(); }}><Text style={{ color: "#E8A0BF", fontWeight: "800" }}>保存</Text></Pressable></View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>画像（正方形）</Text>
            <Pressable onPress={() => { void pickCouponImage(); }} style={{ width: 180, height: 180, alignSelf: "center", borderRadius: 14, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderStyle: couponDraft.imageUrl ? "solid" : "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>{couponDraft.imageUrl ? <Image source={{ uri: couponDraft.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <><IconSymbol name="photo.fill" size={30} color={colors.muted} /><Text style={{ marginTop: 7, color: colors.muted, fontSize: 12 }}>正方形の画像を選択</Text></>}</Pressable>
            {couponDraft.imageUrl ? <Pressable onPress={() => setCouponDraft({ ...couponDraft, imageUrl: undefined })} style={{ alignSelf: "center", padding: 7, marginBottom: 10 }}><Text style={{ color: "#FF3B30", fontSize: 12, fontWeight: "700" }}>画像を削除</Text></Pressable> : <View style={{ height: 10 }} />}
            {([['title', 'タイトル', '例：提携店10%OFF'], ['description', '説明', '利用条件や説明'], ['discount', '特典内容', '例：10%OFF'], ['expiresAt', '有効期限（YYYY-MM-DD）', '2026-12-31'], ['code', '提示コード', 'IROPLUS2026']] as const).map(([key, label, placeholder]) => <View key={key}><Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 6 }}>{label}</Text><TextInput value={couponDraft[key]} onChangeText={(value) => setCouponDraft({ ...couponDraft, [key]: value })} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={key === 'description'} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 14, color: colors.foreground, minHeight: key === 'description' ? 80 : undefined, textAlignVertical: key === 'description' ? 'top' : 'auto' }} /></View>)}
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 7 }}>対象ランク</Text>
            <View style={{ flexDirection: "row", gap: 7, marginBottom: 16 }}>{([['regular', '全会員'], ['silver', 'シルバー以上'], ['gold', 'ゴールド以上'], ['platinum', 'プラチナ']] as const).map(([rank, label]) => <Pressable key={rank} onPress={() => setCouponDraft({ ...couponDraft, requiredRank: rank as MemberRank })} style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9, backgroundColor: couponDraft.requiredRank === rank ? "#E8A0BF" : colors.surface }}><Text style={{ fontSize: 10, fontWeight: "800", color: couponDraft.requiredRank === rank ? "#FFF" : colors.foreground }}>{label}</Text></Pressable>)}</View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 7 }}>利用回数</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>{([['single', '1回限定'], ['multiple', '期間中何度でも']] as const).map(([usageType, label]) => <Pressable key={usageType} onPress={() => setCouponDraft({ ...couponDraft, usageType })} style={{ flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10, backgroundColor: couponDraft.usageType === usageType ? "#5D5C74" : colors.surface }}><Text style={{ fontSize: 12, fontWeight: "800", color: couponDraft.usageType === usageType ? "#FFF" : colors.foreground }}>{label}</Text></Pressable>)}</View>
          </ScrollView>
        </View>
      </Modal>

      {/* お知らせ作成モーダル */}
      <AnnouncementCreateModal
        visible={showAnnouncementModal}
        announcement={editingAnnouncement}
        onClose={() => { setShowAnnouncementModal(false); setEditingAnnouncement(null); }}
        onSave={handleSaveAnnouncement}
      />
    </ScreenContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// 分析タブ
// ─────────────────────────────────────────────────────────────
function AnalyticsTab({ adminEvents, eventsReady, eventsError, onReloadEvents }: { adminEvents: Event[]; eventsReady: boolean; eventsError: boolean; onReloadEvents: () => void }) {
  const colors = useColors();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    setAnalyticsError("");
    void getAdminAnalytics()
      .then((result) => { if (active) setAnalytics(result); })
      .catch(() => { if (active) setAnalyticsError("分析データを読み込めませんでした"); });
    return () => { active = false; };
  }, [reloadKey]);

  // 男女比
  const genderCounts = { male: analytics?.genderCounts.male ?? 0, female: analytics?.genderCounts.female ?? 0, other: analytics?.genderCounts.other ?? 0, unset: analytics?.genderCounts.unset ?? 0 };
  const totalMembers = analytics?.totalMembers ?? 0;
  const totalWithGender = genderCounts.male + genderCounts.female + genderCounts.other;
  const maleRatio = totalWithGender > 0 ? Math.round((genderCounts.male / totalMembers) * 100) : 0;
  const femaleRatio = totalWithGender > 0 ? Math.round((genderCounts.female / totalMembers) * 100) : 0;
  const otherRatio = totalWithGender > 0 ? Math.round((genderCounts.other / totalMembers) * 100) : 0;

  // ランク分布
  const rankCounts = analytics?.rankCounts ?? {};

  // 支部別会員数
  const branchCounts = analytics?.branchCounts ?? {};

  // 月別入会者数（直近6ヶ月）
  const monthlyJoins = useMemo(() => {
    const now = new Date();
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}月`;
      const count = analytics?.monthlyJoins[key] ?? 0;
      months.push({ label, count });
    }
    return months;
  }, [analytics]);
  const maxMonthlyJoins = Math.max(...monthlyJoins.map((m) => m.count), 1);

  // イベント月別開催数（直近6ヶ月）
  const monthlyEvents = useMemo(() => {
    const now = new Date();
    const months: { label: string; count: number; avgFill: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}月`;
      const eventsInMonth = adminEvents.filter((e) => e.date?.startsWith(key));
      const avgFill = eventsInMonth.length > 0
        ? Math.round(eventsInMonth.reduce((s, e) => s + (e.attendees / Math.max(e.capacity, 1)), 0) / eventsInMonth.length * 100)
        : 0;
      months.push({ label, count: eventsInMonth.length, avgFill });
    }
    return months;
  }, [adminEvents]);
  const maxMonthlyEvents = Math.max(...monthlyEvents.map((m) => m.count), 1);

  // イベント全体の平均充足率
  const avgFillRate = adminEvents.length > 0
    ? Math.round(adminEvents.reduce((s, e) => s + (e.attendees / Math.max(e.capacity, 1)), 0) / adminEvents.length * 100)
    : 0;

  // 支部別イベント数
  const eventByCategory = useMemo(() => ({
    all: adminEvents.filter((e) => e.category === "all").length,
    kanto: adminEvents.filter((e) => e.category === "kanto").length,
    kansai: adminEvents.filter((e) => e.category === "kansai").length,
  }), [adminEvents]);

  if (!analytics) return analyticsError ? (
    <View style={{ alignItems: "center", padding: 24 }}>
      <Text style={{ color: colors.error, marginBottom: 12 }}>{analyticsError}</Text>
      <Pressable accessibilityRole="button" onPress={() => setReloadKey((value) => value + 1)}><Text style={{ color: colors.foreground, fontWeight: "700" }}>再読み込み</Text></Pressable>
    </View>
  ) : <ActivityIndicator color="#E8A0BF" style={{ margin: 24 }} />;
  if (eventsError) return (
    <View style={{ alignItems: "center", padding: 24 }}>
      <Text style={{ color: colors.error, marginBottom: 12 }}>イベントデータを読み込めませんでした</Text>
      <Pressable accessibilityRole="button" onPress={onReloadEvents}><Text style={{ color: colors.foreground, fontWeight: "700" }}>再読み込み</Text></Pressable>
    </View>
  );
  if (!eventsReady) return <ActivityIndicator color="#E8A0BF" style={{ margin: 24 }} />;

  const downloadCsv = () => {
    if (typeof document === "undefined") return;
    const blob = new Blob([buildAdminAnalyticsCsv(analytics, adminEvents)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `iro-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const BAR_COLOR_MALE = "#A7C7E7";
  const BAR_COLOR_FEMALE = "#E8A0BF";
  const BAR_COLOR_EVENT = "#A7C7E7";

  return (
    <View>
      {Platform.OS === "web" ? <Pressable accessibilityRole="button" onPress={downloadCsv} style={{ alignSelf: "flex-end", paddingVertical: 9, paddingHorizontal: 14, borderRadius: 9, backgroundColor: colors.surface, marginBottom: 12 }}><Text style={{ color: colors.foreground, fontWeight: "700" }}>分析CSVを保存</Text></Pressable> : null}
      {/* KPIカード */}
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
        主要指標
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        {[
          { label: "利用可能会員数", value: `${totalMembers}名`, color: "#E8A0BF" },
          { label: "男女比（男）", value: `${maleRatio}%`, color: BAR_COLOR_MALE },
          { label: "男女比（女）", value: `${femaleRatio}%`, color: BAR_COLOR_FEMALE },
          { label: "総イベント数", value: `${adminEvents.length}件`, color: "#34C759" },
          { label: "平均充足率", value: `${avgFillRate}%`, color: "#FF9500" },
        ].map((kpi) => (
          <View
            key={kpi.label}
            style={{
              flex: 1,
              minWidth: "28%",
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: "900", color: kpi.color }}>{kpi.value}</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2, textAlign: "center" }}>{kpi.label}</Text>
          </View>
        ))}
      </View>

      {/* 男女比バー */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          性別分布
        </Text>
        <View style={{ flexDirection: "row", height: 20, borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
          <View style={{ flex: maleRatio, backgroundColor: BAR_COLOR_MALE }} />
          <View style={{ flex: femaleRatio, backgroundColor: BAR_COLOR_FEMALE }} />
          <View style={{ flex: otherRatio, backgroundColor: "#AF52DE" }} />
          <View style={{ flex: Math.max(100 - maleRatio - femaleRatio - otherRatio, 0), backgroundColor: colors.border }} />
        </View>
        <View style={{ flexDirection: "row", gap: 16 }}>
          {[
            { label: "男性", count: genderCounts.male, color: BAR_COLOR_MALE },
            { label: "女性", count: genderCounts.female, color: BAR_COLOR_FEMALE },
            { label: "その他", count: genderCounts.other, color: "#AF52DE" },
            { label: "未設定", count: genderCounts.unset, color: colors.border },
          ].map((g) => (
            <View key={g.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: g.color }} />
              <Text style={{ fontSize: 12, color: colors.muted }}>{g.label}: {g.count}名</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ランク分布 */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          ランク分布
        </Text>
        {(["platinum", "gold", "silver", "regular"] as const).map((rank) => {
          const count = rankCounts[rank] ?? 0;
          const pct = totalMembers > 0 ? count / totalMembers : 0;
          return (
            <View key={rank} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: RANK_COLORS[rank] }}>{RANK_LABELS[rank]}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>{count}名 ({Math.round(pct * 100)}%)</Text>
              </View>
              <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${pct * 100}%`, backgroundColor: RANK_COLORS[rank], borderRadius: 4 }} />
              </View>
            </View>
          );
        })}
      </View>

      {/* 支部別会員数 */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          支部別会員数
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {[
            { label: "関東支部", count: branchCounts.kanto, color: "#A7C7E7" },
            { label: "関西支部", count: branchCounts.kansai, color: "#E8A0BF" },
          ].map((b) => (
            <View key={b.label} style={{ flex: 1, backgroundColor: b.color + "20", borderRadius: 12, padding: 14, alignItems: "center" }}>
              <Text style={{ fontSize: 28, fontWeight: "900", color: b.color }}>{b.count}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{b.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 月別入会者数グラフ */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          月別入会者数（直近6ヶ月）
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 80 }}>
          {monthlyJoins.map((m) => (
            <View key={m.label} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 2 }}>{m.count}</Text>
              <View
                style={{
                  width: "100%",
                  height: maxMonthlyJoins > 0 ? Math.max((m.count / maxMonthlyJoins) * 60, m.count > 0 ? 4 : 0) : 0,
                  backgroundColor: BAR_COLOR_FEMALE,
                  borderRadius: 4,
                }}
              />
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 月別イベント開催数グラフ */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          月別イベント開催数（直近6ヶ月）
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 80 }}>
          {monthlyEvents.map((m) => (
            <View key={m.label} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 2 }}>{m.count}</Text>
              <View
                style={{
                  width: "100%",
                  height: maxMonthlyEvents > 0 ? Math.max((m.count / maxMonthlyEvents) * 60, m.count > 0 ? 4 : 0) : 0,
                  backgroundColor: BAR_COLOR_EVENT,
                  borderRadius: 4,
                }}
              />
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>{m.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          {monthlyEvents.map((m) => (
            <View key={m.label} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 10, color: colors.muted }}>充{m.avgFill}%</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>小数値は平均充足率</Text>
      </View>

      {/* イベント支部別開催数 */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
          支部別イベント開催数
        </Text>
        {[
          { label: "全国共通", count: eventByCategory.all, color: "#34C759" },
          { label: "関東限定", count: eventByCategory.kanto, color: "#A7C7E7" },
          { label: "関西限定", count: eventByCategory.kansai, color: "#E8A0BF" },
        ].map((cat) => {
          const pct = adminEvents.length > 0 ? cat.count / adminEvents.length : 0;
          return (
            <View key={cat.label} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: colors.foreground }}>{cat.label}</Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>{cat.count}件</Text>
              </View>
              <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${pct * 100}%`, backgroundColor: cat.color, borderRadius: 4 }} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function AnnouncementCreateModal({
  visible,
  announcement,
  onClose,
  onSave,
}: {
  visible: boolean;
  announcement: Announcement | null;
  onClose: () => void;
  onSave: (title: string, content: string, type: string) => Promise<void>;
}) {
  const colors = useColors();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"important" | "event" | "general">("general");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(announcement?.title ?? "");
    setContent(announcement?.content ?? "");
    setType("general");
  }, [visible, announcement]);

  const typeOptions: { key: "important" | "event" | "general"; label: string; color: string }[] = [
    { key: "important", label: "重要", color: "#FF3B30" },
    { key: "event", label: "イベント", color: "#FF9500" },
    { key: "general", label: "一般", color: "#A7C7E7" },
  ];

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    await onSave(title.trim(), content.trim(), type);
    setSaving(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* ヘッダー */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border,
          }}
        >
          <Pressable onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
            {announcement ? "お知らせを編集" : "お知らせを作成"}
          </Text>
          <Pressable onPress={handleSave} disabled={saving || !title.trim() || !content.trim()}>
            {saving ? (
              <ActivityIndicator size="small" color="#E8A0BF" />
            ) : (
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: title.trim() && content.trim() ? "#E8A0BF" : colors.muted,
                }}
              >
                {announcement ? "保存" : "投稿"}
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* 種別選択 */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 8 }}>
            種別
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            {typeOptions.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => setType(opt.key)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 10,
                  alignItems: "center",
                  backgroundColor: type === opt.key ? opt.color + "20" : colors.surface,
                  borderWidth: 1.5,
                  borderColor: type === opt.key ? opt.color : colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: type === opt.key ? opt.color : colors.muted,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* タイトル */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
            タイトル
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="お知らせのタイトル"
            placeholderTextColor={colors.muted}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: colors.foreground,
              marginBottom: 16,
            }}
          />

          {/* 内容 */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>
            内容
          </Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="お知らせの内容を入力..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: colors.foreground,
              minHeight: 160,
              marginBottom: 16,
            }}
          />

          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            ※ 投稿したお知らせはホーム画面のお知らせ一覧に表示されます。
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
