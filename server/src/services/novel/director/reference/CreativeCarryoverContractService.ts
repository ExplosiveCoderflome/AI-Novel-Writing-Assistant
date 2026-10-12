import {
  BOOK_ANALYSIS_SECTIONS,
  type BookAnalysisSectionKey,
} from "@ai-novel/shared/types/bookAnalysis";
import {
  CREATIVE_CARRYOVER_CONTRACT_SCHEMA_VERSION,
  OPTIONAL_SECTIONS_BY_CARRYOVER_MODE,
  REQUIRED_SECTIONS_BY_CARRYOVER_MODE,
  creativeCarryoverContractSchema,
  type CreativeCarryoverContract,
  type CreativeCarryoverMode,
} from "@ai-novel/shared/types/creativeCarryoverContract";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { creativeCarryoverContractPrompt } from "../../../../prompting/prompts/novel/creativeCarryoverContract.prompts";
import { normalizeBookAnalysisStructuredData } from "../../../bookAnalysis/shared/bookAnalysis.utils";

const SECTION_TITLE_BY_KEY = new Map(
  BOOK_ANALYSIS_SECTIONS.map((section) => [section.key, section.title] as const),
);

const MAX_SECTION_CHARS = 2_400;

export type CreativeCarryoverGenerateResult =
  | {
    status: "ready";
    contract: CreativeCarryoverContract;
  }
  | {
    status: "insufficient_material";
    bookAnalysisId: string;
    analysisTitle: string;
    missingSectionTitles: string[];
    sourceVersionReadable: boolean;
  };

type SectionRow = {
  sectionKey: string;
  title: string;
  structuredDataJson: string | null;
  aiContent: string | null;
  editedContent: string | null;
};

function isReadableSection(section: SectionRow | undefined): boolean {
  if (!section) {
    return false;
  }
  if ((section.editedContent ?? "").trim() || (section.aiContent ?? "").trim()) {
    return true;
  }
  if (!section.structuredDataJson?.trim()) {
    return false;
  }
  try {
    const parsed = JSON.parse(section.structuredDataJson) as unknown;
    return Boolean(parsed && typeof parsed === "object" && Object.keys(parsed as object).length > 0);
  } catch {
    return false;
  }
}

function clipText(value: string, maxChars: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function formatSectionForPrompt(section: SectionRow): string {
  let structuredBlock = "";
  if (section.structuredDataJson?.trim()) {
    try {
      const parsed = JSON.parse(section.structuredDataJson) as unknown;
      if (parsed && typeof parsed === "object") {
        const normalized = normalizeBookAnalysisStructuredData(
          section.sectionKey as BookAnalysisSectionKey,
          parsed as Record<string, unknown>,
        );
        if (Object.keys(normalized).length > 0) {
          structuredBlock = JSON.stringify(normalized, null, 2);
        }
      }
    } catch {
      structuredBlock = "";
    }
  }
  const prose = section.editedContent?.trim() || section.aiContent?.trim() || "";
  const parts = [
    `## ${section.title} (${section.sectionKey})`,
    structuredBlock ? `结构化结论：\n${structuredBlock}` : "",
    prose ? `正文摘录：\n${clipText(prose, MAX_SECTION_CHARS)}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

function resolveUsedSectionKeys(
  mode: CreativeCarryoverMode,
  sectionByKey: Map<string, SectionRow>,
): BookAnalysisSectionKey[] {
  const required = REQUIRED_SECTIONS_BY_CARRYOVER_MODE[mode];
  const optional = OPTIONAL_SECTIONS_BY_CARRYOVER_MODE[mode];
  const used: BookAnalysisSectionKey[] = [];
  for (const key of required) {
    used.push(key);
  }
  for (const key of optional) {
    if (isReadableSection(sectionByKey.get(key))) {
      used.push(key);
    }
  }
  return used;
}

export class CreativeCarryoverContractService {
  async evaluateMaterials(input: {
    mode: CreativeCarryoverMode;
    bookAnalysisId: string;
  }): Promise<{
    analysis: {
      id: string;
      title: string;
      documentId: string;
      documentVersionId: string;
      documentTitle: string;
      documentVersionNumber: number;
    };
    sections: SectionRow[];
    usedSectionKeys: BookAnalysisSectionKey[];
    missingSectionTitles: string[];
    sourceVersionReadable: boolean;
  }> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: input.bookAnalysisId },
      select: {
        id: true,
        title: true,
        status: true,
        documentId: true,
        documentVersionId: true,
        document: { select: { title: true } },
        documentVersion: { select: { id: true, versionNumber: true, content: true } },
        sections: {
          select: {
            sectionKey: true,
            title: true,
            structuredDataJson: true,
            aiContent: true,
            editedContent: true,
          },
        },
      },
    });

    if (!analysis) {
      throw new AppError("未找到对应的拆书结果。", 404);
    }
    if (analysis.status !== "succeeded") {
      throw new AppError("请先完成拆书后再生成创作承接方案。", 400);
    }

    const sectionByKey = new Map(analysis.sections.map((section) => [section.sectionKey, section]));
    const missingSectionTitles = REQUIRED_SECTIONS_BY_CARRYOVER_MODE[input.mode]
      .filter((key) => !isReadableSection(sectionByKey.get(key)))
      .map((key) => SECTION_TITLE_BY_KEY.get(key) ?? key);

    const sourceVersionReadable = Boolean(analysis.documentVersion?.content?.trim());
    if (!sourceVersionReadable) {
      missingSectionTitles.push("原文版本");
    }

    return {
      analysis: {
        id: analysis.id,
        title: analysis.title,
        documentId: analysis.documentId,
        documentVersionId: analysis.documentVersionId,
        documentTitle: analysis.document.title,
        documentVersionNumber: analysis.documentVersion?.versionNumber ?? 1,
      },
      sections: analysis.sections,
      usedSectionKeys: resolveUsedSectionKeys(input.mode, sectionByKey),
      missingSectionTitles,
      sourceVersionReadable,
    };
  }

  async generate(input: {
    mode: CreativeCarryoverMode;
    bookAnalysisId: string;
    provider?: LLMProvider | string;
    model?: string;
    temperature?: number;
  }): Promise<CreativeCarryoverGenerateResult> {
    const materials = await this.evaluateMaterials({
      mode: input.mode,
      bookAnalysisId: input.bookAnalysisId,
    });

    if (materials.missingSectionTitles.length > 0) {
      return {
        status: "insufficient_material",
        bookAnalysisId: materials.analysis.id,
        analysisTitle: materials.analysis.title,
        missingSectionTitles: materials.missingSectionTitles,
        sourceVersionReadable: materials.sourceVersionReadable,
      };
    }

    const sectionByKey = new Map(materials.sections.map((section) => [section.sectionKey, section]));
    const sectionSummaries = materials.usedSectionKeys
      .map((key) => sectionByKey.get(key))
      .filter((section): section is SectionRow => Boolean(section))
      .map((section) => formatSectionForPrompt(section))
      .join("\n\n");

    const result = await runStructuredPrompt({
      asset: creativeCarryoverContractPrompt,
      promptInput: {
        mode: input.mode,
        analysisTitle: materials.analysis.title,
        documentTitle: materials.analysis.documentTitle,
        documentVersionNumber: materials.analysis.documentVersionNumber,
        sectionSummaries,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.45,
        stage: "auto_director",
        itemKey: "creative_carryover_contract",
        entrypoint: "auto_director_create",
      },
    });

    const contract = creativeCarryoverContractSchema.parse({
      ...result.output,
      schemaVersion: CREATIVE_CARRYOVER_CONTRACT_SCHEMA_VERSION,
      mode: input.mode,
      bookAnalysisId: materials.analysis.id,
      documentId: materials.analysis.documentId,
      documentVersionId: materials.analysis.documentVersionId,
      documentVersionNumber: materials.analysis.documentVersionNumber,
      documentTitle: materials.analysis.documentTitle,
      usedSectionKeys: materials.usedSectionKeys,
      generatedAt: new Date().toISOString(),
      adopted: false,
    });

    return {
      status: "ready",
      contract,
    };
  }
}

export const creativeCarryoverContractService = new CreativeCarryoverContractService();
