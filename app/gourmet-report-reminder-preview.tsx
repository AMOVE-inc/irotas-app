import { GourmetReportReminderPreview } from "@/components/gourmet-report-reminder-gate";
import { useAuthContext } from "@/lib/auth-context";
import { isAdminRole } from "@/lib/access-control";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

/** 非公開の管理者確認用画面。実際の自動表示はグルメ会参加翌日にのみ行う。 */
export default function GourmetReportReminderPreviewScreen() {
  const router = useRouter();
  const { user, loading } = useAuthContext();
  const allowed = isAdminRole(user?.role, user?.accessRole);

  useEffect(() => {
    if (!loading && !allowed) router.replace("/(tabs)/profile");
  }, [allowed, loading, router]);

  if (loading || !allowed) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
        <ActivityIndicator color="#D97FA8" />
      </View>
    );
  }

  return <GourmetReportReminderPreview />;
}
