import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAutoDirectorApprovalPreferenceSettings,
  getAutoDirectorChannelSettings,
  saveAutoDirectorApprovalPreferenceSettings,
  saveAutoDirectorChannelSettings,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { AutoDirectorApprovalPreferenceCard } from "./AutoDirectorApprovalPreferenceCard";
import { AutoDirectorChannelSettingsCard } from "./AutoDirectorChannelSettingsCard";
import {
  buildAutoDirectorChannelDraft,
  type AutoDirectorChannelDraft,
} from "./autoDirectorEventOptions";

export default function AutoDirectorSettingsSection(props: {
  onActionResult: (message: string) => void;
}) {
  const { onActionResult } = props;
  const queryClient = useQueryClient();
  const [autoDirectorChannelDraft, setAutoDirectorChannelDraft] = useState<AutoDirectorChannelDraft | null>(null);
  const [approvalPreferenceDraft, setApprovalPreferenceDraft] = useState<string[] | null>(null);

  const autoDirectorChannelsQuery = useQuery({
    queryKey: queryKeys.settings.autoDirectorChannels,
    queryFn: getAutoDirectorChannelSettings,
  });
  const approvalPreferenceQuery = useQuery({
    queryKey: queryKeys.settings.autoDirectorApprovalPreferences,
    queryFn: getAutoDirectorApprovalPreferenceSettings,
  });

  const autoDirectorChannels = autoDirectorChannelsQuery.data?.data;
  const approvalPreference = approvalPreferenceQuery.data?.data;
  const channelDraft = autoDirectorChannelDraft ?? buildAutoDirectorChannelDraft(autoDirectorChannels);
  const approvalCodes = approvalPreferenceDraft ?? approvalPreference?.approvalPointCodes ?? [];

  const saveAutoDirectorChannelsMutation = useMutation({
    mutationFn: saveAutoDirectorChannelSettings,
    onSuccess: async (response) => {
      onActionResult(response.message ?? "导演跟进通道配置已保存。");
      if (response.data) {
        setAutoDirectorChannelDraft(buildAutoDirectorChannelDraft(response.data));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.autoDirectorChannels });
    },
    onError: (error) => {
      onActionResult(error instanceof Error ? error.message : "保存导演跟进通道配置失败。");
    },
  });

  const saveApprovalPreferenceMutation = useMutation({
    mutationFn: saveAutoDirectorApprovalPreferenceSettings,
    onSuccess: async (response) => {
      onActionResult(response.message ?? "审批授权偏好已保存。");
      if (response.data) {
        setApprovalPreferenceDraft(response.data.approvalPointCodes);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.autoDirectorApprovalPreferences });
    },
    onError: (error) => {
      onActionResult(error instanceof Error ? error.message : "保存审批授权偏好失败。");
    },
  });

  const patchChannelDraft = (
    channelType: "dingtalk" | "wecom",
    patch: Partial<(typeof channelDraft)["dingtalk"]>,
  ) => {
    setAutoDirectorChannelDraft((prev) => {
      const current = prev ?? channelDraft;
      return {
        ...current,
        [channelType]: {
          ...current[channelType],
          ...patch,
        },
      };
    });
  };

  return (
    <>
      <AutoDirectorApprovalPreferenceCard
        settings={approvalPreference}
        draftCodes={approvalCodes}
        onDraftCodesChange={setApprovalPreferenceDraft}
        onSave={() => saveApprovalPreferenceMutation.mutate({
          approvalPointCodes: approvalCodes,
        })}
        isSaving={saveApprovalPreferenceMutation.isPending}
      />

      <AutoDirectorChannelSettingsCard
        channelDraft={channelDraft}
        onBaseUrlChange={(value) => setAutoDirectorChannelDraft((prev) => ({
          ...(prev ?? channelDraft),
          baseUrl: value,
        }))}
        onPatchChannelDraft={patchChannelDraft}
        onSave={() => saveAutoDirectorChannelsMutation.mutate({
          baseUrl: channelDraft.baseUrl.trim(),
          dingtalk: {
            webhookUrl: channelDraft.dingtalk.webhookUrl.trim(),
            callbackToken: channelDraft.dingtalk.callbackToken.trim(),
            operatorMapJson: channelDraft.dingtalk.operatorMapJson.trim(),
            eventTypes: channelDraft.dingtalk.eventTypes,
          },
          wecom: {
            webhookUrl: channelDraft.wecom.webhookUrl.trim(),
            callbackToken: channelDraft.wecom.callbackToken.trim(),
            operatorMapJson: channelDraft.wecom.operatorMapJson.trim(),
            eventTypes: channelDraft.wecom.eventTypes,
          },
        })}
        isSaving={saveAutoDirectorChannelsMutation.isPending}
      />
    </>
  );
}
