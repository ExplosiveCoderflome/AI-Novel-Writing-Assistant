import i18next from "i18next";
import type { AutoDirectorChannelSettings } from "@/api/settings";

export interface AutoDirectorEventOption {
  code: string;
  label: string;
  description: string;
}

export interface AutoDirectorChannelDraft {
  baseUrl: string;
  dingtalk: {
    webhookUrl: string;
    callbackToken: string;
    operatorMapJson: string;
    eventTypes: string[];
  };
  wecom: {
    webhookUrl: string;
    callbackToken: string;
    operatorMapJson: string;
    eventTypes: string[];
  };
}

export const AUTO_DIRECTOR_EVENT_OPTIONS: AutoDirectorEventOption[] = [
  {
    code: "auto_director.approval_required",
    label: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_6ddf67de"),
    description: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_7ba285de"),
  },
  {
    code: "auto_director.auto_approved",
    label: i18next.t("gen.pages.settings.autoDirectorEventOptions.aiAutoPassed"),
    description: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_66e28e61"),
  },
  {
    code: "auto_director.exception",
    label: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_c227402e"),
    description: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_4c018930"),
  },
  {
    code: "auto_director.recovered",
    label: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_ad9788b1"),
    description: i18next.t("gen.pages.settings.autoDirectorEventOptions.previouslyFailedAutoDirectorNotification"),
  },
  {
    code: "auto_director.completed",
    label: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_c044a14e"),
    description: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_55fc86a9"),
  },
  {
    code: "auto_director.progress_changed",
    label: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_9a392ae5"),
    description: i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_ae088ce2"),
  },
];

const AUTO_DIRECTOR_EVENT_LABEL_MAP = new Map(
  AUTO_DIRECTOR_EVENT_OPTIONS.map((item) => [item.code, item.label]),
);

export function buildAutoDirectorChannelDraft(
  settings?: AutoDirectorChannelSettings | null,
): AutoDirectorChannelDraft {
  return settings ? {
    baseUrl: settings.baseUrl,
    dingtalk: {
      webhookUrl: settings.dingtalk.webhookUrl,
      callbackToken: settings.dingtalk.callbackToken,
      operatorMapJson: settings.dingtalk.operatorMapJson,
      eventTypes: settings.dingtalk.eventTypes,
    },
    wecom: {
      webhookUrl: settings.wecom.webhookUrl,
      callbackToken: settings.wecom.callbackToken,
      operatorMapJson: settings.wecom.operatorMapJson,
      eventTypes: settings.wecom.eventTypes,
    },
  } : {
    baseUrl: "",
    dingtalk: {
      webhookUrl: "",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
    wecom: {
      webhookUrl: "",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
  };
}

export function summarizeSelectedAutoDirectorEvents(codes: string[]): string {
  const labels = codes
    .map((code) => AUTO_DIRECTOR_EVENT_LABEL_MAP.get(code))
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) {
    return i18next.t("gen.pages.settings.autoDirectorEventOptions.gen_7940b70c");
  }
  if (labels.length <= 2) {
    return labels.join("、");
  }
  return `${labels.slice(0, 2).join("、")} 等 ${labels.length} 项`;
}
