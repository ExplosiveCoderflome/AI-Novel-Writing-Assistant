import { prisma } from "../../db/prisma";

const BASE_URL_KEY = "autoDirector.baseUrl";
const DINGTALK_WEBHOOK_KEY = "autoDirector.channels.dingtalk.webhookUrl";
const DINGTALK_CALLBACK_TOKEN_KEY = "autoDirector.channels.dingtalk.callbackToken";
const DINGTALK_OPERATOR_MAP_KEY = "autoDirector.channels.dingtalk.operatorMapJson";
const DINGTALK_EVENT_TYPES_KEY = "autoDirector.channels.dingtalk.eventTypes";

const WECOM_WEBHOOK_KEY = "autoDirector.channels.wecom.webhookUrl";
const WECOM_CALLBACK_TOKEN_KEY = "autoDirector.channels.wecom.callbackToken";
const WECOM_OPERATOR_MAP_KEY = "autoDirector.channels.wecom.operatorMapJson";
const WECOM_EVENT_TYPES_KEY = "autoDirector.channels.wecom.eventTypes";

const DEFAULT_EVENT_TYPES = [
  "auto_director.approval_required",
  "auto_director.exception",
  "auto_director.recovered",
  "auto_director.completed",
] as const;

const ALL_KEYS = [
  BASE_URL_KEY,
  DINGTALK_WEBHOOK_KEY,
  DINGTALK_CALLBACK_TOKEN_KEY,
  DINGTALK_OPERATOR_MAP_KEY,
  DINGTALK_EVENT_TYPES_KEY,
  WECOM_WEBHOOK_KEY,
  WECOM_CALLBACK_TOKEN_KEY,
  WECOM_OPERATOR_MAP_KEY,
  WECOM_EVENT_TYPES_KEY,
] as const;

export interface AutoDirectorChannelConfig {
  webhookUrl: string;
  callbackToken: string;
  operatorMapJson: string;
  eventTypes: string[];
}

export interface AutoDirectorChannelSettings {
  baseUrl: string;
  dingtalk: AutoDirectorChannelConfig;
  wecom: AutoDirectorChannelConfig;
}

export interface SaveAutoDirectorChannelSettingsInput {
  baseUrl?: string;
  dingtalk?: Partial<AutoDirectorChannelConfig>;
  wecom?: Partial<AutoDirectorChannelConfig>;
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function isDbUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return code === "P1001" || /can't reach database server/i.test(message);
}

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function getDefaultBaseUrl(): string {
  return trimText(process.env.APP_BASE_URL) || trimText(process.env.CORS_ORIGIN) || "";
}

function getConfiguredText(entries: Map<string, string>, key: string, fallback: string): string {
  if (entries.has(key)) {
    return trimText(entries.get(key));
  }
  return fallback;
}

function parseEventTypes(value: string | null | undefined): string[] {
  const trimmed = trimText(value);
  if (!trimmed) {
    return [...DEFAULT_EVENT_TYPES];
  }
  const items = trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? Array.from(new Set(items)) : [...DEFAULT_EVENT_TYPES];
}

function stringifyEventTypes(value: string[] | undefined): string {
  const items = (value ?? [...DEFAULT_EVENT_TYPES])
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(items)).join(",");
}

function buildDefaults(): AutoDirectorChannelSettings {
  return {
    baseUrl: getDefaultBaseUrl(),
    dingtalk: {
      webhookUrl: trimText(process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL),
      callbackToken: trimText(process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN),
      operatorMapJson: trimText(process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON),
      eventTypes: parseEventTypes(process.env.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES),
    },
    wecom: {
      webhookUrl: trimText(process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL),
      callbackToken: trimText(process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN),
      operatorMapJson: trimText(process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON),
      eventTypes: parseEventTypes(process.env.AUTO_DIRECTOR_WECOM_EVENT_TYPES),
    },
  };
}

function buildSettingsFromEntries(entries: Map<string, string>): AutoDirectorChannelSettings {
  const defaults = buildDefaults();
  return {
    baseUrl: getConfiguredText(entries, BASE_URL_KEY, defaults.baseUrl),
    dingtalk: {
      webhookUrl: getConfiguredText(entries, DINGTALK_WEBHOOK_KEY, defaults.dingtalk.webhookUrl),
      callbackToken: getConfiguredText(entries, DINGTALK_CALLBACK_TOKEN_KEY, defaults.dingtalk.callbackToken),
      operatorMapJson: getConfiguredText(entries, DINGTALK_OPERATOR_MAP_KEY, defaults.dingtalk.operatorMapJson),
      eventTypes: entries.has(DINGTALK_EVENT_TYPES_KEY)
        ? parseEventTypes(entries.get(DINGTALK_EVENT_TYPES_KEY))
        : [...defaults.dingtalk.eventTypes],
    },
    wecom: {
      webhookUrl: getConfiguredText(entries, WECOM_WEBHOOK_KEY, defaults.wecom.webhookUrl),
      callbackToken: getConfiguredText(entries, WECOM_CALLBACK_TOKEN_KEY, defaults.wecom.callbackToken),
      operatorMapJson: getConfiguredText(entries, WECOM_OPERATOR_MAP_KEY, defaults.wecom.operatorMapJson),
      eventTypes: entries.has(WECOM_EVENT_TYPES_KEY)
        ? parseEventTypes(entries.get(WECOM_EVENT_TYPES_KEY))
        : [...defaults.wecom.eventTypes],
    },
  };
}

export async function getAutoDirectorChannelSettings(): Promise<AutoDirectorChannelSettings> {
  try {
    const rows = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [...ALL_KEYS],
        },
      },
    });
    const entries = new Map(rows.map((item) => [item.key, item.value]));
    return buildSettingsFromEntries(entries);
  } catch (error) {
    if (isMissingTableError(error) || isDbUnavailableError(error)) {
      return buildDefaults();
    }
    throw error;
  }
}

export async function saveAutoDirectorChannelSettings(
  input: SaveAutoDirectorChannelSettingsInput,
): Promise<AutoDirectorChannelSettings> {
  const previous = await getAutoDirectorChannelSettings();
  const next: AutoDirectorChannelSettings = {
    baseUrl: hasOwn(input, "baseUrl") ? trimText(input.baseUrl) : previous.baseUrl,
    dingtalk: {
      webhookUrl: input.dingtalk && hasOwn(input.dingtalk, "webhookUrl")
        ? trimText(input.dingtalk.webhookUrl)
        : previous.dingtalk.webhookUrl,
      callbackToken: input.dingtalk && hasOwn(input.dingtalk, "callbackToken")
        ? trimText(input.dingtalk.callbackToken)
        : previous.dingtalk.callbackToken,
      operatorMapJson: input.dingtalk && hasOwn(input.dingtalk, "operatorMapJson")
        ? trimText(input.dingtalk.operatorMapJson)
        : previous.dingtalk.operatorMapJson,
      eventTypes: input.dingtalk && hasOwn(input.dingtalk, "eventTypes")
        ? parseEventTypes(stringifyEventTypes(input.dingtalk.eventTypes))
        : previous.dingtalk.eventTypes,
    },
    wecom: {
      webhookUrl: input.wecom && hasOwn(input.wecom, "webhookUrl")
        ? trimText(input.wecom.webhookUrl)
        : previous.wecom.webhookUrl,
      callbackToken: input.wecom && hasOwn(input.wecom, "callbackToken")
        ? trimText(input.wecom.callbackToken)
        : previous.wecom.callbackToken,
      operatorMapJson: input.wecom && hasOwn(input.wecom, "operatorMapJson")
        ? trimText(input.wecom.operatorMapJson)
        : previous.wecom.operatorMapJson,
      eventTypes: input.wecom && hasOwn(input.wecom, "eventTypes")
        ? parseEventTypes(stringifyEventTypes(input.wecom.eventTypes))
        : previous.wecom.eventTypes,
    },
  };

  try {
    await Promise.all([
      prisma.appSetting.upsert({
        where: { key: BASE_URL_KEY },
        update: { value: next.baseUrl },
        create: { key: BASE_URL_KEY, value: next.baseUrl },
      }),
      prisma.appSetting.upsert({
        where: { key: DINGTALK_WEBHOOK_KEY },
        update: { value: next.dingtalk.webhookUrl },
        create: { key: DINGTALK_WEBHOOK_KEY, value: next.dingtalk.webhookUrl },
      }),
      prisma.appSetting.upsert({
        where: { key: DINGTALK_CALLBACK_TOKEN_KEY },
        update: { value: next.dingtalk.callbackToken },
        create: { key: DINGTALK_CALLBACK_TOKEN_KEY, value: next.dingtalk.callbackToken },
      }),
      prisma.appSetting.upsert({
        where: { key: DINGTALK_OPERATOR_MAP_KEY },
        update: { value: next.dingtalk.operatorMapJson },
        create: { key: DINGTALK_OPERATOR_MAP_KEY, value: next.dingtalk.operatorMapJson },
      }),
      prisma.appSetting.upsert({
        where: { key: DINGTALK_EVENT_TYPES_KEY },
        update: { value: stringifyEventTypes(next.dingtalk.eventTypes) },
        create: { key: DINGTALK_EVENT_TYPES_KEY, value: stringifyEventTypes(next.dingtalk.eventTypes) },
      }),
      prisma.appSetting.upsert({
        where: { key: WECOM_WEBHOOK_KEY },
        update: { value: next.wecom.webhookUrl },
        create: { key: WECOM_WEBHOOK_KEY, value: next.wecom.webhookUrl },
      }),
      prisma.appSetting.upsert({
        where: { key: WECOM_CALLBACK_TOKEN_KEY },
        update: { value: next.wecom.callbackToken },
        create: { key: WECOM_CALLBACK_TOKEN_KEY, value: next.wecom.callbackToken },
      }),
      prisma.appSetting.upsert({
        where: { key: WECOM_OPERATOR_MAP_KEY },
        update: { value: next.wecom.operatorMapJson },
        create: { key: WECOM_OPERATOR_MAP_KEY, value: next.wecom.operatorMapJson },
      }),
      prisma.appSetting.upsert({
        where: { key: WECOM_EVENT_TYPES_KEY },
        update: { value: stringifyEventTypes(next.wecom.eventTypes) },
        create: { key: WECOM_EVENT_TYPES_KEY, value: stringifyEventTypes(next.wecom.eventTypes) },
      }),
    ]);
    return next;
  } catch (error) {
    if (isMissingTableError(error) || isDbUnavailableError(error)) {
      return next;
    }
    throw error;
  }
}
