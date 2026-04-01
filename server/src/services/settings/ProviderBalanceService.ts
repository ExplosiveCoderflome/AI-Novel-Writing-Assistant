import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { PROVIDERS } from "../../llm/providers";

export type ProviderBalanceStatusKind = "available" | "missing_api_key" | "unsupported" | "error";

export interface ProviderBalanceStatus {
  provider: LLMProvider;
  status: ProviderBalanceStatusKind;
  supported: boolean;
  canRefresh: boolean;
  source: "provider_api" | "aliyun_account" | "none";
  currency: string | null;
  availableBalance: number | null;
  totalBalance: number | null;
  cashBalance: number | null;
  voucherBalance: number | null;
  chargeBalance: number | null;
  toppedUpBalance: number | null;
  grantedBalance: number | null;
  fetchedAt: string;
  message: string;
  error: string | null;
}

interface ProviderBalanceInput {
  provider: LLMProvider;
  apiKey?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeBaseUrl(baseURL: string): string {
  return baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildStatus(
  input: Omit<ProviderBalanceStatus, "fetchedAt"> & { fetchedAt?: string },
): ProviderBalanceStatus {
  return {
    ...input,
    fetchedAt: input.fetchedAt ?? nowIso(),
  };
}

function buildUnsupportedStatus(provider: LLMProvider, message: string): ProviderBalanceStatus {
  return buildStatus({
    provider,
    status: "unsupported",
    supported: false,
    canRefresh: false,
    source: provider === "qwen" ? "aliyun_account" : "none",
    currency: null,
    availableBalance: null,
    totalBalance: null,
    cashBalance: null,
    voucherBalance: null,
    chargeBalance: null,
    toppedUpBalance: null,
    grantedBalance: null,
    message,
    error: null,
  });
}

function buildMissingApiKeyStatus(provider: LLMProvider): ProviderBalanceStatus {
  return buildStatus({
    provider,
    status: "missing_api_key",
    supported: provider === "deepseek" || provider === "siliconflow" || provider === "kimi",
    canRefresh: false,
    source: "provider_api",
    currency: null,
    availableBalance: null,
    totalBalance: null,
    cashBalance: null,
    voucherBalance: null,
    chargeBalance: null,
    toppedUpBalance: null,
    grantedBalance: null,
    message: "请先配置 API Key，再查询余额。",
    error: null,
  });
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail.trim() || `请求失败（${response.status}）`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDeepSeekBalance(apiKey: string): Promise<ProviderBalanceStatus> {
  const baseURL = normalizeBaseUrl(process.env.DEEPSEEK_BASE_URL ?? PROVIDERS.deepseek.baseURL);
  const payload = await fetchJson(`${baseURL}/user/balance`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  }) as {
    balance_infos?: Array<{
      currency?: string;
      total_balance?: string;
      granted_balance?: string;
      topped_up_balance?: string;
    }>;
  };
  const primary = Array.isArray(payload.balance_infos) ? payload.balance_infos[0] : null;
  if (!primary) {
    throw new Error("DeepSeek 未返回可用余额信息。");
  }
  return buildStatus({
    provider: "deepseek",
    status: "available",
    supported: true,
    canRefresh: true,
    source: "provider_api",
    currency: primary.currency ?? "CNY",
    availableBalance: toNumber(primary.total_balance),
    totalBalance: toNumber(primary.total_balance),
    cashBalance: null,
    voucherBalance: null,
    chargeBalance: null,
    toppedUpBalance: toNumber(primary.topped_up_balance),
    grantedBalance: toNumber(primary.granted_balance),
    message: "余额已从 DeepSeek 官方接口刷新。",
    error: null,
  });
}

async function fetchSiliconFlowBalance(apiKey: string): Promise<ProviderBalanceStatus> {
  const baseURL = normalizeBaseUrl(process.env.SILICONFLOW_BASE_URL ?? PROVIDERS.siliconflow.baseURL);
  const payload = await fetchJson(`${baseURL}/user/info`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  }) as {
    data?: {
      balance?: string | number;
      chargeBalance?: string | number;
      totalBalance?: string | number;
    };
  };
  const data = payload.data ?? {};
  const totalBalance = toNumber(data.totalBalance) ?? toNumber(data.balance);
  if (totalBalance === null) {
    throw new Error("SiliconFlow 未返回可用余额信息。");
  }
  return buildStatus({
    provider: "siliconflow",
    status: "available",
    supported: true,
    canRefresh: true,
    source: "provider_api",
    currency: null,
    availableBalance: totalBalance,
    totalBalance,
    cashBalance: null,
    voucherBalance: null,
    chargeBalance: toNumber(data.chargeBalance),
    toppedUpBalance: null,
    grantedBalance: toNumber(data.balance),
    message: "余额已从 SiliconFlow 官方接口刷新。",
    error: null,
  });
}

async function fetchKimiBalance(apiKey: string): Promise<ProviderBalanceStatus> {
  const baseURL = normalizeBaseUrl(process.env.KIMI_BASE_URL ?? PROVIDERS.kimi.baseURL);
  const payload = await fetchJson(`${baseURL}/users/me/balance`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  }) as {
    data?: {
      available_balance?: number;
      voucher_balance?: number;
      cash_balance?: number;
    };
  };
  const data = payload.data ?? {};
  const availableBalance = toNumber(data.available_balance);
  if (availableBalance === null) {
    throw new Error("Kimi 未返回可用余额信息。");
  }
  return buildStatus({
    provider: "kimi",
    status: "available",
    supported: true,
    canRefresh: true,
    source: "provider_api",
    currency: "CNY",
    availableBalance,
    totalBalance: availableBalance,
    cashBalance: toNumber(data.cash_balance),
    voucherBalance: toNumber(data.voucher_balance),
    chargeBalance: null,
    toppedUpBalance: null,
    grantedBalance: null,
    message: "余额已从 Kimi 官方接口刷新。",
    error: null,
  });
}

async function getProviderBalance(input: ProviderBalanceInput): Promise<ProviderBalanceStatus> {
  const apiKey = input.apiKey?.trim();
  if (input.provider === "qwen") {
    return buildUnsupportedStatus(
      "qwen",
      "当前系统只保存 DashScope API Key；阿里云账户余额查询需要额外的账户级凭证，暂不支持直接读取。",
    );
  }
  if (input.provider !== "deepseek" && input.provider !== "siliconflow" && input.provider !== "kimi") {
    return buildUnsupportedStatus(input.provider, "当前厂商暂未接入可程序化余额查询。");
  }
  if (!apiKey) {
    return buildMissingApiKeyStatus(input.provider);
  }

  try {
    if (input.provider === "deepseek") {
      return await fetchDeepSeekBalance(apiKey);
    }
    if (input.provider === "siliconflow") {
      return await fetchSiliconFlowBalance(apiKey);
    }
    return await fetchKimiBalance(apiKey);
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "余额查询失败。";
    return buildStatus({
      provider: input.provider,
      status: "error",
      supported: true,
      canRefresh: true,
      source: "provider_api",
      currency: null,
      availableBalance: null,
      totalBalance: null,
      cashBalance: null,
      voucherBalance: null,
      chargeBalance: null,
      toppedUpBalance: null,
      grantedBalance: null,
      message: "余额查询失败，请稍后重试。",
      error: message,
    });
  }
}

async function listBalances(providerKeyMap: Map<LLMProvider, string | null | undefined>): Promise<ProviderBalanceStatus[]> {
  const providers = Object.keys(PROVIDERS) as LLMProvider[];
  const results = await Promise.all(providers.map((provider) => getProviderBalance({
    provider,
    apiKey: providerKeyMap.get(provider),
  })));
  return results;
}

export const providerBalanceService = {
  getProviderBalance,
  listBalances,
};
