import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  dramaCompliancePrompt,
  type DramaComplianceOutput,
  type DramaQualityOutput,
} from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import { safeJsonParse } from "./utils/json";
import type { DramaLLMOptions } from "./DramaStrategyService";

export interface DramaComplianceBatchResult {
  checked: number;
  pass: number;
  warn: number;
  block: number;
  results: Array<{
    episodeOrder: number;
    title: string;
    level: DramaComplianceOutput["level"];
    itemCount: number;
  }>;
}

interface ComplianceContext {
  episode: {
    id: string;
    order: number;
    title: string;
    status: string;
    content?: string | null;
    qualityFlags?: string | null;
  };
  episodeJson: string;
  charactersDigest: string;
  factsDigest: string;
}

type QualityFlag = DramaQualityOutput["flags"][number];

function complianceToQualityFlags(compliance: DramaComplianceOutput): QualityFlag[] {
  if (compliance.level === "pass") {
    return [];
  }
  const severity: QualityFlag["severity"] = compliance.level === "block" ? "critical" : "medium";
  return compliance.items.map((item) => ({
    severity,
    code: `compliance_${compliance.level}`,
    evidence: `${item.rule}：${item.excerpt}`,
    suggestion: item.suggestion,
  }));
}

function mergeRepairPlan(
  current: DramaQualityOutput["repairPlan"] | undefined,
  flags: QualityFlag[],
): DramaQualityOutput["repairPlan"] | undefined {
  if (current || !flags.length) {
    return current;
  }
  return {
    mode: "patch",
    instruction: flags.map((flag) => flag.suggestion).join("；"),
  };
}

export function mergeComplianceIntoQuality(
  quality: DramaQualityOutput,
  compliance: DramaComplianceOutput,
): DramaQualityOutput & { compliance: DramaComplianceOutput } {
  const complianceFlags = complianceToQualityFlags(compliance);
  if (compliance.level === "pass") {
    return { ...quality, compliance };
  }
  const nextStatus = compliance.level === "block"
    ? "blocked"
    : quality.status === "approved" ? "continue_with_warning" : quality.status;
  return {
    ...quality,
    status: nextStatus,
    flags: quality.flags.concat(complianceFlags),
    repairPlan: compliance.level === "block"
      ? mergeRepairPlan(quality.repairPlan, complianceFlags)
      : quality.repairPlan,
    compliance,
  };
}

export function mergeComplianceIntoStoredQuality(
  rawQualityFlags: string | null | undefined,
  compliance: DramaComplianceOutput,
): Record<string, unknown> {
  const current = safeJsonParse<Record<string, unknown>>(rawQualityFlags, {});
  const currentFlags = Array.isArray(current.flags)
    ? current.flags.filter((flag) => {
      return !(flag && typeof flag === "object" && String((flag as { code?: unknown }).code ?? "").startsWith("compliance_"));
    })
    : [];
  const complianceFlags = complianceToQualityFlags(compliance);
  const next: Record<string, unknown> = {
    ...current,
    compliance,
  };
  if (complianceFlags.length) {
    next.flags = currentFlags.concat(complianceFlags);
  }
  if (compliance.level === "block") {
    next.status = "blocked";
    if (!next.repairPlan) {
      next.repairPlan = mergeRepairPlan(undefined, complianceFlags);
    }
  } else if (compliance.level === "warn" && !next.status) {
    next.status = "continue_with_warning";
  }
  return next;
}

export class DramaComplianceService {
  async checkEpisode(projectId: string, episodeOrder: number, options: DramaLLMOptions = {}) {
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, episodeOrder);
    const compliance = await this.checkEpisodeContext(context, options);
    const qualityFlags = mergeComplianceIntoStoredQuality(context.episode.qualityFlags, compliance);
    await prisma.dramaEpisode.update({
      where: { id: context.episode.id },
      data: {
        status: compliance.level === "block" ? "needs_repair" : context.episode.status,
        qualityFlags: JSON.stringify(qualityFlags),
      },
    });
    return compliance;
  }

  async checkProject(projectId: string, options: DramaLLMOptions = {}): Promise<DramaComplianceBatchResult> {
    const episodes = await prisma.dramaEpisode.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: { order: true, title: true, content: true },
    });
    const scriptedEpisodes = episodes.filter((episode) => episode.content?.trim());
    const results: DramaComplianceBatchResult["results"] = [];
    for (const episode of scriptedEpisodes) {
      const compliance = await this.checkEpisode(projectId, episode.order, options);
      results.push({
        episodeOrder: episode.order,
        title: episode.title,
        level: compliance.level,
        itemCount: compliance.items.length,
      });
    }
    return {
      checked: results.length,
      pass: results.filter((item) => item.level === "pass").length,
      warn: results.filter((item) => item.level === "warn").length,
      block: results.filter((item) => item.level === "block").length,
      results,
    };
  }

  async checkEpisodeContext(context: ComplianceContext, options: DramaLLMOptions = {}): Promise<DramaComplianceOutput> {
    if (!context.episode.content?.trim()) {
      throw new Error(`第 ${context.episode.order} 集尚未生成台本，不能执行合规预检。`);
    }
    const result = await runStructuredPrompt({
      asset: dramaCompliancePrompt,
      promptInput: {
        episodeJson: context.episodeJson,
        content: context.episode.content,
        charactersDigest: context.charactersDigest,
        factsDigest: context.factsDigest,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.1,
      },
    });
    return result.output;
  }
}

export const dramaComplianceService = new DramaComplianceService();
