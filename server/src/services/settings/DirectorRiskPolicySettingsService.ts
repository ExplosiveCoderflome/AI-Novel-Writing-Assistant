import {
  DEFAULT_DIRECTOR_RISK_POLICY as SHARED_DEFAULT_DIRECTOR_RISK_POLICY,
  DIRECTOR_RISK_NOTICE_THRESHOLD_MAX,
  DIRECTOR_RISK_NOTICE_THRESHOLD_MIN,
  DIRECTOR_RISK_PAUSE_THRESHOLD_MAX,
  DIRECTOR_RISK_PAUSE_THRESHOLD_MIN,
  type DirectorRiskPolicy,
} from "@ai-novel/shared/types/directorRisk";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { isMissingTableError } from "./ragLegacyCompatibility";

export const DIRECTOR_RISK_NOTICE_THRESHOLD_KEY = "autoDirector.riskPolicy.noticeThreshold";
export const DIRECTOR_RISK_PAUSE_THRESHOLD_KEY = "autoDirector.riskPolicy.pauseThreshold";

export const DIRECTOR_RISK_POLICY_SETTING_KEYS = [
  DIRECTOR_RISK_NOTICE_THRESHOLD_KEY,
  DIRECTOR_RISK_PAUSE_THRESHOLD_KEY,
] as const;

export const DEFAULT_DIRECTOR_RISK_POLICY: DirectorRiskPolicy = { ...SHARED_DEFAULT_DIRECTOR_RISK_POLICY };

interface AppSettingStore {
  findMany(args: { where: { key: { in: string[] } } }): Promise<Array<{ key: string; value: string }>>;
  upsert(args: {
    where: { key: string };
    update: { value: string };
    create: { key: string; value: string };
  }): Promise<unknown>;
}

export interface DirectorRiskPolicySettingsServiceDeps {
  appSettingStore?: AppSettingStore;
  transaction?: (operations: Promise<unknown>[]) => Promise<unknown[]>;
}

function isDbUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return code === "P1001" || /can't reach database server/i.test(message);
}

function parseThreshold(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function assertDirectorRiskPolicy(policy: DirectorRiskPolicy): DirectorRiskPolicy {
  const { noticeThreshold, pauseThreshold } = policy;
  if (
    !Number.isInteger(noticeThreshold)
    || noticeThreshold < DIRECTOR_RISK_NOTICE_THRESHOLD_MIN
    || noticeThreshold > DIRECTOR_RISK_NOTICE_THRESHOLD_MAX
  ) {
    throw new AppError(`风险提醒分数必须是 ${DIRECTOR_RISK_NOTICE_THRESHOLD_MIN} 到 ${DIRECTOR_RISK_NOTICE_THRESHOLD_MAX} 之间的整数。`, 400);
  }
  if (
    !Number.isInteger(pauseThreshold)
    || pauseThreshold < DIRECTOR_RISK_PAUSE_THRESHOLD_MIN
    || pauseThreshold > DIRECTOR_RISK_PAUSE_THRESHOLD_MAX
  ) {
    throw new AppError(`风险暂停分数必须是 ${DIRECTOR_RISK_PAUSE_THRESHOLD_MIN} 到 ${DIRECTOR_RISK_PAUSE_THRESHOLD_MAX} 之间的整数。`, 400);
  }
  if (noticeThreshold >= pauseThreshold) {
    throw new AppError("风险暂停分数必须高于提醒分数。", 400);
  }
  return { noticeThreshold, pauseThreshold };
}

export function buildDirectorRiskPolicy(entries: Map<string, string>): DirectorRiskPolicy {
  // Previous versions allowed a 9–10 point pause threshold. Keep both user
  // choices when possible, but clamp the pause boundary to the 1–8 scale.
  const noticeThreshold = Math.min(
    DIRECTOR_RISK_NOTICE_THRESHOLD_MAX,
    Math.max(
      DIRECTOR_RISK_NOTICE_THRESHOLD_MIN,
      parseThreshold(entries.get(DIRECTOR_RISK_NOTICE_THRESHOLD_KEY), DEFAULT_DIRECTOR_RISK_POLICY.noticeThreshold),
    ),
  );
  const pauseThreshold = Math.max(
    DIRECTOR_RISK_PAUSE_THRESHOLD_MIN,
    Math.min(
      DIRECTOR_RISK_PAUSE_THRESHOLD_MAX,
      Math.max(noticeThreshold + 1, parseThreshold(
        entries.get(DIRECTOR_RISK_PAUSE_THRESHOLD_KEY),
        DEFAULT_DIRECTOR_RISK_POLICY.pauseThreshold,
      )),
    ),
  );
  return assertDirectorRiskPolicy({ noticeThreshold, pauseThreshold });
}

export class DirectorRiskPolicySettingsService {
  constructor(private readonly deps: DirectorRiskPolicySettingsServiceDeps = {}) {}

  async getRiskPolicy(): Promise<DirectorRiskPolicy> {
    try {
      const rows = await this.getStore().findMany({
        where: { key: { in: [...DIRECTOR_RISK_POLICY_SETTING_KEYS] } },
      });
      return buildDirectorRiskPolicy(new Map(rows.map((item) => [item.key, item.value])));
    } catch (error) {
      if (isMissingTableError(error) || isDbUnavailableError(error)) {
        return { ...DEFAULT_DIRECTOR_RISK_POLICY };
      }
      throw error;
    }
  }

  async saveRiskPolicy(input: DirectorRiskPolicy): Promise<DirectorRiskPolicy> {
    const next = assertDirectorRiskPolicy(input);
    const operations = [
      this.getStore().upsert({
        where: { key: DIRECTOR_RISK_NOTICE_THRESHOLD_KEY },
        update: { value: String(next.noticeThreshold) },
        create: { key: DIRECTOR_RISK_NOTICE_THRESHOLD_KEY, value: String(next.noticeThreshold) },
      }),
      this.getStore().upsert({
        where: { key: DIRECTOR_RISK_PAUSE_THRESHOLD_KEY },
        update: { value: String(next.pauseThreshold) },
        create: { key: DIRECTOR_RISK_PAUSE_THRESHOLD_KEY, value: String(next.pauseThreshold) },
      }),
    ];
    try {
      if (this.deps.transaction) {
        await this.deps.transaction(operations);
      } else {
        await prisma.$transaction(operations as never);
      }
      return next;
    } catch (error) {
      if (isMissingTableError(error) || isDbUnavailableError(error)) {
        return next;
      }
      throw error;
    }
  }

  private getStore(): AppSettingStore {
    return (this.deps.appSettingStore ?? prisma.appSetting) as unknown as AppSettingStore;
  }
}

export const directorRiskPolicySettingsService = new DirectorRiskPolicySettingsService();
