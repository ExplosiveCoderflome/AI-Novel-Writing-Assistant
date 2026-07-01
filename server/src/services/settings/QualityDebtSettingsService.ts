import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { isMissingTableError, normalizeOptionalText } from "./ragLegacyCompatibility";
import {
  QUALITY_DEBT_AUTO_PROMOTION_BASELINE_AT_KEY,
  QUALITY_DEBT_AUTO_PROMOTION_ENABLED_KEY,
  QUALITY_DEBT_AUTO_PROMOTION_SETTING_KEYS,
} from "./qualityDebtSettingKeys";

export const QUALITY_DEBT_AUTO_PROMOTION_ACK_TEXT = "我已了解自动放行风险";

export interface QualityDebtAutoPromotionSettings {
  enabled: boolean;
  baselineAt: string | null;
  acknowledgementText: string;
}

export interface SaveQualityDebtAutoPromotionSettingsInput {
  enabled: boolean;
  acknowledgedRisks?: boolean;
  confirmationText?: string | null;
}

interface AppSettingStore {
  findMany(args: {
    where: {
      key: {
        in: string[];
      };
    };
  }): Promise<Array<{ key: string; value: string }>>;
  upsert(args: {
    where: { key: string };
    update: { value: string };
    create: { key: string; value: string };
  }): Promise<unknown>;
}

interface QualityDebtSettingsServiceDeps {
  appSettingStore?: AppSettingStore;
  transaction?: (operations: Promise<unknown>[]) => Promise<unknown[]>;
  now?: () => Date;
  warn?: (message: string, details?: Record<string, unknown>) => void;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

function normalizeIsoDate(value: string | undefined): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildSettings(valueMap: Map<string, string>): QualityDebtAutoPromotionSettings {
  return {
    enabled: parseBoolean(valueMap.get(QUALITY_DEBT_AUTO_PROMOTION_ENABLED_KEY), false),
    baselineAt: normalizeIsoDate(valueMap.get(QUALITY_DEBT_AUTO_PROMOTION_BASELINE_AT_KEY)),
    acknowledgementText: QUALITY_DEBT_AUTO_PROMOTION_ACK_TEXT,
  };
}

export class QualityDebtSettingsService {
  private warnedEnabled = false;

  constructor(private readonly deps: QualityDebtSettingsServiceDeps = {}) {}

  async getAutoPromotionSettings(options: {
    warnIfEnabled?: boolean;
  } = {}): Promise<QualityDebtAutoPromotionSettings> {
    try {
      const records = await this.getStore().findMany({
        where: {
          key: {
            in: [...QUALITY_DEBT_AUTO_PROMOTION_SETTING_KEYS],
          },
        },
      });
      const settings = buildSettings(new Map(records.map((item) => [item.key, item.value])));
      if (options.warnIfEnabled) {
        this.warnIfEnabled(settings);
      }
      return settings;
    } catch (error) {
      if (isMissingTableError(error)) {
        return buildSettings(new Map());
      }
      throw error;
    }
  }

  async isAutoPromotionEnabled(): Promise<boolean> {
    const settings = await this.getAutoPromotionSettings();
    return settings.enabled && Boolean(settings.baselineAt);
  }

  async saveAutoPromotionSettings(
    input: SaveQualityDebtAutoPromotionSettingsInput,
  ): Promise<QualityDebtAutoPromotionSettings> {
    const previous = await this.getAutoPromotionSettings();
    const nextEnabled = Boolean(input.enabled);

    if (nextEnabled) {
      this.assertAcknowledged(input);
    }

    const baselineAt = nextEnabled && !previous.baselineAt
      ? this.getNow().toISOString()
      : previous.baselineAt;
    const next: QualityDebtAutoPromotionSettings = {
      enabled: nextEnabled,
      baselineAt,
      acknowledgementText: QUALITY_DEBT_AUTO_PROMOTION_ACK_TEXT,
    };

    const operations: Promise<unknown>[] = [
      this.getStore().upsert({
        where: { key: QUALITY_DEBT_AUTO_PROMOTION_ENABLED_KEY },
        update: { value: String(next.enabled) },
        create: { key: QUALITY_DEBT_AUTO_PROMOTION_ENABLED_KEY, value: String(next.enabled) },
      }),
      this.getStore().upsert({
        where: { key: QUALITY_DEBT_AUTO_PROMOTION_BASELINE_AT_KEY },
        update: { value: next.baselineAt ?? "" },
        create: { key: QUALITY_DEBT_AUTO_PROMOTION_BASELINE_AT_KEY, value: next.baselineAt ?? "" },
      }),
    ];

    try {
      if (this.deps.transaction) {
        await this.deps.transaction(operations);
      } else {
        await prisma.$transaction(operations as never);
      }
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }

    if (next.enabled) {
      this.warnEnabled(next);
    }
    return next;
  }

  async warnIfAutoPromotionEnabled(): Promise<void> {
    await this.getAutoPromotionSettings({ warnIfEnabled: true });
  }

  private assertAcknowledged(input: SaveQualityDebtAutoPromotionSettingsInput): void {
    if (input.acknowledgedRisks !== true) {
      throw new AppError("开启待确认状态自动放行前，需要先确认风险说明。", 400);
    }
    if (normalizeOptionalText(input.confirmationText ?? undefined) !== QUALITY_DEBT_AUTO_PROMOTION_ACK_TEXT) {
      throw new AppError(`请输入确认文本：${QUALITY_DEBT_AUTO_PROMOTION_ACK_TEXT}`, 400);
    }
  }

  private warnIfEnabled(settings: QualityDebtAutoPromotionSettings): void {
    if (!settings.enabled || this.warnedEnabled) {
      return;
    }
    this.warnedEnabled = true;
    this.warnEnabled(settings);
  }

  private warnEnabled(settings: QualityDebtAutoPromotionSettings): void {
    const warn = this.deps.warn ?? console.warn;
    warn("[quality-debt] pending review auto-promotion is enabled.", {
      baselineAt: settings.baselineAt,
    });
  }

  private getStore(): AppSettingStore {
    return (this.deps.appSettingStore ?? prisma.appSetting) as unknown as AppSettingStore;
  }

  private getNow(): Date {
    return this.deps.now?.() ?? new Date();
  }
}

export const qualityDebtSettingsService = new QualityDebtSettingsService();
