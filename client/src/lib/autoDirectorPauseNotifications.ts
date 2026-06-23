import type { AutoDirectorFollowUpItem } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";

export const AUTO_DIRECTOR_PAUSE_NOTIFICATION_SETTINGS_EVENT = "ai-novel:auto-director-pause-notifications";

const ENABLED_STORAGE_KEY = "ai-novel.auto-director-pause-notifications.enabled";
const ACTIONABLE_IDS_STORAGE_KEY = "ai-novel.auto-director-pause-notifications.actionable-ids";
const NOTIFICATION_TAG = "ai-novel-auto-director-pause";

const ACTIONABLE_SECTIONS = new Set<AutoDirectorFollowUpSection>([
  "needs_validation",
  "exception",
  "pending",
]);

export type BrowserNotificationPermissionState = NotificationPermission | "unsupported";

export function isAutoDirectorPauseNotificationEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setAutoDirectorPauseNotificationEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage failures; notification permission still gates actual delivery.
  }
  window.dispatchEvent(new CustomEvent(AUTO_DIRECTOR_PAUSE_NOTIFICATION_SETTINGS_EVENT, {
    detail: { enabled },
  }));
}

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }
  return window.Notification.requestPermission();
}

export function isAutoDirectorPauseNotificationItem(item: AutoDirectorFollowUpItem): boolean {
  return ACTIONABLE_SECTIONS.has(item.section);
}

export function getStoredAutoDirectorPauseActionableIds(): string[] {
  try {
    const raw = window.localStorage.getItem(ACTIONABLE_IDS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function setStoredAutoDirectorPauseActionableIds(ids: string[]): void {
  try {
    window.localStorage.setItem(ACTIONABLE_IDS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort duplicate suppression only.
  }
}

function clipNotificationBody(value: string, maxLength = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function buildAutoDirectorPauseNotificationBody(item: AutoDirectorFollowUpItem): string {
  const scope = item.executionScope?.trim();
  const summary = item.followUpSummary?.trim() || item.reasonLabel;
  const prefix = scope
    ? `《${item.novelTitle}》${scope}需要处理`
    : `《${item.novelTitle}》需要处理`;
  return clipNotificationBody(`${prefix}：${summary}`);
}

export function showAutoDirectorPauseNotification(input: {
  item: AutoDirectorFollowUpItem;
  targetUrl: string;
}): boolean {
  if (!isAutoDirectorPauseNotificationEnabled() || getBrowserNotificationPermission() !== "granted") {
    return false;
  }

  const notification = new window.Notification("自动导演需要你处理", {
    body: buildAutoDirectorPauseNotificationBody(input.item),
    tag: NOTIFICATION_TAG,
  });

  notification.onclick = () => {
    window.focus();
    window.location.assign(input.targetUrl);
    notification.close();
  };

  return true;
}
