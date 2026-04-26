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
    label: "自动继续待处理",
    description: "自动导演卡在需要继续或确认的节点时通知你处理。",
  },
  {
    code: "auto_director.auto_approved",
    label: "AI 已自动通过",
    description: "AI 推进替你通过审批点并继续执行时通知你。",
  },
  {
    code: "auto_director.exception",
    label: "运行异常",
    description: "自动导演执行报错、失败或进入异常状态时通知你。",
  },
  {
    code: "auto_director.recovered",
    label: "异常恢复",
    description: "之前异常的自动导演任务恢复执行时通知你。",
  },
  {
    code: "auto_director.completed",
    label: "执行完成",
    description: "自动导演任务顺利完成当前阶段或整体流程时通知你。",
  },
  {
    code: "auto_director.progress_changed",
    label: "进度变化",
    description: "自动导演跨阶段或关键进度变化时通知你。",
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
    return "未订阅事件";
  }
  if (labels.length <= 2) {
    return labels.join("、");
  }
  return `${labels.slice(0, 2).join("、")} 等 ${labels.length} 项`;
}
