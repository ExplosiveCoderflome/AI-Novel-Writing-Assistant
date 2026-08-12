import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDirectorRiskPolicy, saveDirectorRiskPolicy } from "@/api/directorRiskPolicy";
import { queryKeys } from "@/api/queryKeys";
import AutoDirectorSettingsSection from "../AutoDirectorSettingsSection";
import { AutoDirectorRiskPolicyCard } from "../AutoDirectorRiskPolicyCard";
import SettingsActionResult from "../SettingsActionResult";
import { SettingsShell } from "../components/SettingsShell";

export default function DirectorSettingsPage() {
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const riskPolicyQuery = useQuery({ queryKey: queryKeys.settings.autoDirectorRiskPolicy, queryFn: getDirectorRiskPolicy });
  const saveRiskPolicyMutation = useMutation({
    mutationFn: saveDirectorRiskPolicy,
    onSuccess: async (response) => {
      setMessage(response.message ?? "风险规则已保存。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.autoDirectorRiskPolicy });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "风险规则保存失败。"),
  });
  return (
    <SettingsShell title="自动导演" description="设置问题处理、自动确认和创作提醒；每本书开始后会按当时设置保留自己的执行规则。">
      <AutoDirectorSettingsSection onActionResult={setMessage} collapseAdvanced />
      <details className="rounded-md border bg-muted/20 p-4">
        <summary className="cursor-pointer text-sm font-medium">风险阈值</summary>
        <div className="mt-4">
          <AutoDirectorRiskPolicyCard
            policy={riskPolicyQuery.data?.data}
            isLoading={riskPolicyQuery.isLoading}
            isSaving={saveRiskPolicyMutation.isPending}
            onSave={(policy) => saveRiskPolicyMutation.mutate(policy)}
          />
        </div>
      </details>
      <SettingsActionResult message={message} />
    </SettingsShell>
  );
}
