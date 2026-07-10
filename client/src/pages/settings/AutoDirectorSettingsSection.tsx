import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAutoDirectorApprovalPreferenceSettings,
  getAutoDirectorChannelSettings,
  getPendingReviewAutoPromotionSettings,
  saveAutoDirectorApprovalPreferenceSettings,
  saveAutoDirectorChannelSettings,
  savePendingReviewAutoPromotionSettings,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { AutoDirectorApprovalPreferenceCard } from "./AutoDirectorApprovalPreferenceCard";
import { AutoDirectorBrowserNotificationSettingsCard } from "./AutoDirectorBrowserNotificationSettingsCard";
import { AutoDirectorChannelSettingsCard } from "./AutoDirectorChannelSettingsCard";
import { AutoDirectorPendingReviewAutoPromotionCard } from "./AutoDirectorPendingReviewAutoPromotionCard";
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
  const pendingReviewAutoPromotionQuery = useQuery({
    queryKey: queryKeys.settings.pendingReviewAutoPromotion,
    queryFn: getPendingReviewAutoPromotionSettings,
  });

  const autoDirectorChannels = autoDirectorChannelsQuery.data?.data;
  const approvalPreference = approvalPreferenceQuery.data?.data;
  const pendingReviewAutoPromotion = pendingReviewAutoPromotionQuery.data?.data;
  const channelDraft = autoDirectorChannelDraft ?? buildAutoDirectorChannelDraft(autoDirectorChannels);
  const approvalCodes = approvalPreferenceDraft ?? approvalPreference?.approvalPointCodes ?? [];

  const saveAutoDirectorChannelsMutation = useMutation({
    mutationFn: saveAutoDirectorChannelSettings,
    onSuccess: async (response) => {
      onActionResult(response.message ?? t("gen.pages.settings.AutoDirectorSettingsSection.gen_a20173bc"));
      if (response.data) {
        setAutoDirectorChannelDraft(buildAutoDirectorChannelDraft(response.data));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.autoDirectorChannels });
    },
    onError: (error) => {
      onActionResult(error instanceof Error ? error.message : t("gen.pages.settings.AutoDirectorSettingsSection.saveDirectorFollowUpChannelConfigFailed"));
    },
  });

  const saveApprovalPreferenceMutation = useMutation({
    mutationFn: saveAutoDirectorApprovalPreferenceSettings,
    onSuccess: async (response) => {
      onActionResult(response.message ?? t("gen.pages.settings.AutoDirectorSettingsSection.gen_0c54d981"));
      if (response.data) {
        setApprovalPreferenceDraft(response.data.approvalPointCodes);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.autoDirectorApprovalPreferences });
    },
    onError: (error) => {
      onActionResult(error instanceof Error ? error.message : t("gen.pages.settings.AutoDirectorSettingsSection.saveApprovalAuthorizationPreferenceFailed"));
    },
  });

  const savePendingReviewAutoPromotionMutation = useMutation({
    mutationFn: savePendingReviewAutoPromotionSettings,
    onSuccess: async (response) => {
      onActionResult(response.message ?? t("gen.pages.settings.AutoDirectorSettingsSection.gen_58e7d74a"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.pendingReviewAutoPromotion });
    },
    onError: (error) => {
      onActionResult(error instanceof Error ? error.message : t("gen.pages.settings.AutoDirectorSettingsSection.gen_3cbc83c7"));
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
      <AutoDirectorBrowserNotificationSettingsCard onActionResult={onActionResult} />

      <AutoDirectorApprovalPreferenceCard
        settings={approvalPreference}
        draftCodes={approvalCodes}
        onDraftCodesChange={setApprovalPreferenceDraft}
        onSave={() => saveApprovalPreferenceMutation.mutate({
          approvalPointCodes: approvalCodes,
        })}
        isSaving={saveApprovalPreferenceMutation.isPending}
      />

      <AutoDirectorPendingReviewAutoPromotionCard
        settings={pendingReviewAutoPromotion}
        isLoading={pendingReviewAutoPromotionQuery.isLoading}
        isSaving={savePendingReviewAutoPromotionMutation.isPending}
        onEnable={(payload) => savePendingReviewAutoPromotionMutation.mutate({
          enabled: true,
          acknowledgedRisks: payload.acknowledgedRisks,
          confirmationText: payload.confirmationText,
        })}
        onDisable={() => savePendingReviewAutoPromotionMutation.mutate({
          enabled: false,
        })}
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
