import {
  DEFAULT_PAYWALL_STRATEGY,
  type PaywallStrategy,
} from "./rhythmEngine";
import { safeJsonParse } from "../utils/json";

export interface DramaPaywallIntensitySegment {
  fromEpisode: number;
  toEpisode: number;
  goal: string;
  targetEmotionNet: number;
}

export interface DramaPaywallPlan extends PaywallStrategy {
  cliffhangerStrengthThreshold: number;
  buildupBeforePaywall?: string;
  intensityCurve: DramaPaywallIntensitySegment[];
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeIntensityCurve(value: unknown, targetEpisodes: number): DramaPaywallIntensitySegment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const fromEpisode = clampInt(record.fromEpisode, 1, 1, targetEpisodes);
      const toEpisode = clampInt(record.toEpisode, fromEpisode, fromEpisode, targetEpisodes);
      const goal = typeof record.goal === "string" && record.goal.trim()
        ? record.goal.trim()
        : "保持付费短剧钩子和情绪推进";
      return {
        fromEpisode,
        toEpisode,
        goal,
        targetEmotionNet: clampInt(record.targetEmotionNet, 0, -5, 5),
      };
    })
    .filter((item): item is DramaPaywallIntensitySegment => Boolean(item));
}

export function resolveDramaPaywallPlan(strategyJson: string | null | undefined, targetEpisodes: number): DramaPaywallPlan {
  const strategy = safeJsonParse<Record<string, unknown>>(strategyJson, {});
  const rawPlan = strategy.paywallPlan && typeof strategy.paywallPlan === "object"
    ? strategy.paywallPlan as Record<string, unknown>
    : {};
  const safeTargetEpisodes = Math.max(1, Math.round(targetEpisodes));
  const firstPaywallFallback = Math.min(safeTargetEpisodes, DEFAULT_PAYWALL_STRATEGY.firstPaywallAt);
  const firstPaywallAt = clampInt(
    rawPlan.firstPaywallAt,
    firstPaywallFallback,
    1,
    safeTargetEpisodes,
  );
  const freeEpisodes = clampInt(
    rawPlan.freeEpisodes,
    Math.max(1, Math.min(firstPaywallAt - 1, DEFAULT_PAYWALL_STRATEGY.freeEpisodes)),
    1,
    Math.max(1, firstPaywallAt),
  );
  return {
    freeEpisodes,
    firstPaywallAt,
    paywallCadence: clampInt(rawPlan.paywallCadence, DEFAULT_PAYWALL_STRATEGY.paywallCadence, 1, 5),
    cliffhangerStrengthThreshold: clampInt(rawPlan.cliffhangerStrengthThreshold, 85, 60, 100),
    buildupBeforePaywall: typeof rawPlan.buildupBeforePaywall === "string" ? rawPlan.buildupBeforePaywall.trim() : undefined,
    intensityCurve: normalizeIntensityCurve(rawPlan.intensityCurve, safeTargetEpisodes),
  };
}

export function describeDramaPaywallPlan(plan: DramaPaywallPlan): string {
  const curve = plan.intensityCurve.length
    ? plan.intensityCurve
      .map((segment) => `E${segment.fromEpisode}-${segment.toEpisode}：${segment.goal}（情绪目标 ${segment.targetEmotionNet}）`)
      .join("\n")
    : "按赛道默认节奏推进。";
  return [
    `首付费集：第 ${plan.firstPaywallAt} 集`,
    `免费引流：前 ${plan.freeEpisodes} 集`,
    `付费卡点间隔：${plan.paywallCadence} 集`,
    `付费集卡点强度阈值：${plan.cliffhangerStrengthThreshold}`,
    plan.buildupBeforePaywall ? `付费前蓄势：${plan.buildupBeforePaywall}` : "",
    `强度曲线：\n${curve}`,
  ].filter(Boolean).join("\n");
}
