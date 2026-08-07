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
    label: "Automatically continue to be processed",
    description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  },
  {
    code: "auto_director.auto_approved",
    label: "AI has automatically passed",
    description: "The system notifies you when it passes the checkpoint and continues execution as authorized by the approval.",
  },
  {
    code: "auto_director.exception",
    label: "Abnormal operation",
    description: "Notify you when the automatic director execution reports an error, fails, or enters an abnormal state.",
  },
  {
    code: "auto_director.recovered",
    label: "Exception recovery",
    description: "You will be notified when the previously abnormal automatic director task resumes execution.",
  },
  {
    code: "auto_director.completed",
    label: "Execution completed",
    description: "Automatically notify you when a director task successfully completes the current stage or overall process.",
  },
  {
    code: "auto_director.progress_changed",
    label: "Progress changes",
    description: "Automatically notify you of cross-stage or critical progress changes.",
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
    return "Not subscribed to events";
  }
  if (labels.length <= 2) {
    return labels.join("、");
  }
  return `${labels.slice(0, 2).join("、")} 等 ${labels.length} 项`;
}
