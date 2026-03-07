import type {
  BookAnalysis,
  BookAnalysisDetail,
  BookAnalysisEvidenceItem,
  BookAnalysisSection,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { prisma } from "../../db/prisma";
import { supportsForcedJsonOutput } from "../../llm/capabilities";
import { getLLM } from "../../llm/factory";
import { AppError } from "../../middleware/errorHandler";

type AnalysisTask =
  | { analysisId: string; kind: "full" }
  | { analysisId: string; kind: "section"; sectionKey: BookAnalysisSectionKey };

interface SourceSegment {
  label: string;
  content: string;
}

interface SourceNote {
  sourceLabel: string;
  summary: string;
  plotPoints: string[];
  characters: string[];
  worldbuilding: string[];
  themes: string[];
  styleTechniques: string[];
  marketHighlights: string[];
  evidence: BookAnalysisEvidenceItem[];
}

interface SectionGenerationResult {
  markdown: string;
  structuredData: Record<string, unknown> | null;
  evidence: BookAnalysisEvidenceItem[];
}

const CHAPTER_HEADING_REGEX =
  /^\s*(第[零一二三四五六七八九十百千万两\d]+[章节回节卷部集篇幕][^\n]{0,40}|chapter\s+\d+[^\n]{0,40}|chap\.\s*\d+[^\n]{0,40})\s*$/i;
const MIN_CHAPTER_DETECTION_COUNT = 3;
const MIN_SEGMENT_BODY_LENGTH = 120;
const MAX_SEGMENT_COUNT = 24;
const MIN_SEGMENT_CHARS = 6_000;
const TARGET_SEGMENT_CHARS = 10_000;
const MAX_SEGMENT_CHARS = 16_000;
const CHUNK_OVERLAP_CHARS = 400;
const DEFAULT_ANALYSIS_TEMPERATURE = 0.3;
const DEFAULT_ANALYSIS_MAX_TOKENS = 4_800;
const MIN_ANALYSIS_MAX_TOKENS = 256;
const MAX_ANALYSIS_MAX_TOKENS = 32_768;

const SECTION_PROMPTS: Record<BookAnalysisSectionKey, string> = {
  overview: `请围绕这部作品输出拆书总览，必须覆盖：
- 一句话定位
- 题材标签
- 卖点标签
- 目标读者判断
- 整体优势
- 整体短板

输出 JSON：
{
  "markdown": "Markdown 内容",
  "structuredData": {
    "oneLinePositioning": "...",
    "genreTags": ["..."],
    "sellingPoints": ["..."],
    "targetAudience": "...",
    "strengths": ["..."],
    "weaknesses": ["..."]
  },
  "evidence": [{ "label": "...", "excerpt": "...", "sourceLabel": "..." }]
}`,
  plot_structure: `请分析这部作品的剧情结构，必须覆盖：
- 主线梗概
- 阶段推进
- 冲突升级
- 高潮设计
- 节奏评估
- 章节组织
- 结构问题
- 结构亮点
- 可复用套路

输出 JSON：
{
  "markdown": "Markdown 内容",
  "structuredData": {
    "mainlineSummary": "...",
    "stageProgression": ["..."],
    "conflictEscalation": ["..."],
    "climaxDesign": "...",
    "paceAssessment": "...",
    "chapterOrganization": "...",
    "structureProblems": ["..."],
    "structureHighlights": ["..."],
    "reusablePatterns": ["..."]
  },
  "evidence": [{ "label": "...", "excerpt": "...", "sourceLabel": "..." }]
}`,
  character_system: `请分析人物系统，必须覆盖：
- 主角定位
- 配角 / 反派功能
- 角色关系网
- 成长弧线
- 人物高光场景
- 人物分工是否清晰

输出 JSON：
{
  "markdown": "Markdown 内容",
  "structuredData": {
    "leadRoles": ["..."],
    "supportingRoles": ["..."],
    "relationshipNetwork": ["..."],
    "growthArcs": ["..."],
    "highlightMoments": ["..."],
    "functionAssessment": "..."
  },
  "evidence": [{ "label": "...", "excerpt": "...", "sourceLabel": "..." }]
}`,
  worldbuilding: `请分析世界观与设定，必须覆盖：
- 世界观框架
- 规则系统
- 关键设定亮点
- 设定服务剧情的方式
- 设定存在的问题

输出 JSON：
{
  "markdown": "Markdown 内容",
  "structuredData": {
    "worldFramework": "...",
    "ruleSystems": ["..."],
    "settingHighlights": ["..."],
    "storySupport": "...",
    "settingProblems": ["..."]
  },
  "evidence": [{ "label": "...", "excerpt": "...", "sourceLabel": "..." }]
}`,
  themes: `请分析主题表达，必须覆盖：
- 核心主题
- 题眼
- 情绪基调
- 象征 / 母题
- 主题呈现方式

输出 JSON：
{
  "markdown": "Markdown 内容",
  "structuredData": {
    "coreThemes": ["..."],
    "centralHook": "...",
    "emotionalTone": "...",
    "motifs": ["..."],
    "themeDelivery": "..."
  },
  "evidence": [{ "label": "...", "excerpt": "...", "sourceLabel": "..." }]
}`,
  style_technique: `请分析文风与技法，必须覆盖：
- 叙事视角
- 语言风格
- 描写方式
- 对白特征
- 节奏控制
- 爽点 / 钩子设计
- 可复用写法

输出 JSON：
{
  "markdown": "Markdown 内容",
  "structuredData": {
    "narrativePerspective": "...",
    "languageStyle": "...",
    "descriptionPatterns": ["..."],
    "dialogueTraits": ["..."],
    "pacingControl": "...",
    "hooks": ["..."],
    "reusableTechniques": ["..."]
  },
  "evidence": [{ "label": "...", "excerpt": "...", "sourceLabel": "..." }]
}`,
  market_highlights: `请分析这部作品的商业化卖点，必须覆盖：
- 读者爽点
- 点击驱动要素
- 人设卖点
- 题材卖点
- 商业化风险

输出 JSON：
{
  "markdown": "Markdown 内容",
  "structuredData": {
    "readerPayoffs": ["..."],
    "clickDrivers": ["..."],
    "characterSellingPoints": ["..."],
    "genreSellingPoints": ["..."],
    "marketRisks": ["..."]
  },
  "evidence": [{ "label": "...", "excerpt": "...", "sourceLabel": "..." }]
}`,
};

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2021"
  );
}

function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

function extractJSONObject(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("Invalid JSON object.");
  }
  return text.slice(first, last + 1);
}

function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeTemperature(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ANALYSIS_TEMPERATURE;
  }
  return Math.min(2, Math.max(0, Number(value)));
}

function normalizeMaxTokens(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ANALYSIS_MAX_TOKENS;
  }
  return Math.min(MAX_ANALYSIS_MAX_TOKENS, Math.max(MIN_ANALYSIS_MAX_TOKENS, Math.floor(Number(value))));
}

function getNotesMaxTokens(sectionMaxTokens: number): number {
  return Math.max(1200, Math.min(10_000, Math.floor(sectionMaxTokens * 0.6)));
}

async function invokeWithJsonGuard(
  llm: Awaited<ReturnType<typeof getLLM>>,
  messages: BaseMessage[],
  provider: LLMProvider,
  model?: string,
) {
  if (!supportsForcedJsonOutput(provider, model)) {
    return llm.invoke(messages);
  }

  try {
    return await llm.invoke(messages, {
      response_format: { type: "json_object" },
    } as Record<string, unknown>);
  } catch {
    return llm.invoke(messages);
  }
}

function normalizeText(source: string): string {
  return source.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
}

function compactExcerpt(source: string, maxChars = 110): string {
  const normalized = source.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 1).trim()}...`;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function toEvidenceList(value: unknown, sourceLabelFallback = ""): BookAnalysisEvidenceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const excerpt = typeof record.excerpt === "string" ? compactExcerpt(record.excerpt) : "";
      const sourceLabel = typeof record.sourceLabel === "string" && record.sourceLabel.trim()
        ? record.sourceLabel.trim()
        : sourceLabelFallback;
      if (!label && !excerpt) {
        return null;
      }
      return {
        label: label || "关键证据",
        excerpt,
        sourceLabel,
      };
    })
    .filter((item): item is BookAnalysisEvidenceItem => Boolean(item))
    .slice(0, 8);
}

function detectChapterSegments(content: string): SourceSegment[] {
  const normalized = normalizeText(content);
  if (!normalized) {
    return [];
  }
  const lines = normalized.split("\n");
  const headings: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (CHAPTER_HEADING_REGEX.test(lines[index].trim())) {
      headings.push(index);
    }
  }

  if (headings.length < MIN_CHAPTER_DETECTION_COUNT) {
    return [];
  }

  const segments: SourceSegment[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const start = headings[i];
    const end = headings[i + 1] ?? lines.length;
    const title = lines[start].trim() || `章节 ${i + 1}`;
    const body = lines.slice(start + 1, end).join("\n").trim();
    const raw = [title, body].filter(Boolean).join("\n");
    if (body.length < MIN_SEGMENT_BODY_LENGTH) {
      continue;
    }
    segments.push({
      label: title,
      content: raw,
    });
  }
  return segments;
}

function mergeSegments(segments: SourceSegment[]): SourceSegment[] {
  if (segments.length === 0) {
    return [];
  }

  const totalChars = segments.reduce((sum, item) => sum + item.content.length, 0);
  const targetChars = Math.min(
    MAX_SEGMENT_CHARS,
    Math.max(MIN_SEGMENT_CHARS, Math.ceil(totalChars / Math.min(MAX_SEGMENT_COUNT, segments.length))),
  );

  const merged: SourceSegment[] = [];
  let currentLabels: string[] = [];
  let currentContent = "";

  const pushCurrent = () => {
    if (!currentContent.trim()) {
      return;
    }
    merged.push({
      label: currentLabels[0] ?? `分段 ${merged.length + 1}`,
      content: currentContent.trim(),
    });
    currentLabels = [];
    currentContent = "";
  };

  for (const segment of segments) {
    const nextContent = currentContent ? `${currentContent}\n\n${segment.content}` : segment.content;
    if (currentContent && nextContent.length > targetChars) {
      pushCurrent();
    }
    currentLabels.push(segment.label);
    currentContent = currentContent ? `${currentContent}\n\n${segment.content}` : segment.content;
  }
  pushCurrent();
  return merged.slice(0, MAX_SEGMENT_COUNT);
}

function splitIntoChunkSegments(content: string): SourceSegment[] {
  const normalized = normalizeText(content);
  if (!normalized) {
    return [];
  }
  const targetCount = Math.max(1, Math.ceil(normalized.length / TARGET_SEGMENT_CHARS));
  const chunkSize = Math.min(
    MAX_SEGMENT_CHARS,
    Math.max(MIN_SEGMENT_CHARS, Math.ceil(normalized.length / Math.min(MAX_SEGMENT_COUNT, targetCount))),
  );

  const segments: SourceSegment[] = [];
  const step = Math.max(chunkSize - CHUNK_OVERLAP_CHARS, 1);

  for (let cursor = 0; cursor < normalized.length; cursor += step) {
    const slice = normalized.slice(cursor, cursor + chunkSize).trim();
    if (!slice) {
      continue;
    }
    segments.push({
      label: `分块 ${segments.length + 1}`,
      content: slice,
    });
    if (cursor + chunkSize >= normalized.length || segments.length >= MAX_SEGMENT_COUNT) {
      break;
    }
  }

  return segments;
}

function buildSourceSegments(content: string): SourceSegment[] {
  const detected = detectChapterSegments(content);
  if (detected.length > 0) {
    return mergeSegments(detected);
  }
  return splitIntoChunkSegments(content);
}

function renderNotesForPrompt(notes: SourceNote[]): string {
  return notes
    .map((note) => {
      const sections = [
        `## ${note.sourceLabel}`,
        `摘要：${note.summary}`,
        `剧情要点：${note.plotPoints.join("；") || "无"}`,
        `人物信息：${note.characters.join("；") || "无"}`,
        `设定信息：${note.worldbuilding.join("；") || "无"}`,
        `主题信息：${note.themes.join("；") || "无"}`,
        `文风技法：${note.styleTechniques.join("；") || "无"}`,
        `商业卖点：${note.marketHighlights.join("；") || "无"}`,
        note.evidence.length > 0
          ? `证据摘录：\n${note.evidence.map((item) => `- ${item.label}：${item.excerpt}`).join("\n")}`
          : "证据摘录：无",
      ];
      return sections.join("\n");
    })
    .join("\n\n");
}

function getSectionTitle(sectionKey: BookAnalysisSectionKey): string {
  return BOOK_ANALYSIS_SECTIONS.find((item) => item.key === sectionKey)?.title ?? sectionKey;
}

function getEffectiveContent(section: Pick<BookAnalysisSection, "editedContent" | "aiContent">): string {
  const edited = section.editedContent?.trim();
  if (edited) {
    return edited;
  }
  return section.aiContent?.trim() ?? "";
}

function buildAnalysisSummaryFromContent(content: string): string | null {
  const normalized = content.trim();
  if (!normalized) {
    return null;
  }
  const withoutHeadings = normalized
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  return withoutHeadings ? compactExcerpt(withoutHeadings, 160) : compactExcerpt(normalized, 160);
}

function encodeStructuredData(value: Record<string, unknown> | null): string | null {
  if (!value) {
    return null;
  }
  return JSON.stringify(value);
}

function encodeEvidence(value: BookAnalysisEvidenceItem[]): string | null {
  if (!value.length) {
    return null;
  }
  return JSON.stringify(value);
}

function decodeStructuredData(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  const parsed = safeParseJSON<Record<string, unknown> | null>(value, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function decodeEvidence(value: string | null): BookAnalysisEvidenceItem[] {
  if (!value) {
    return [];
  }
  return toEvidenceList(safeParseJSON<unknown[]>(value, []));
}

function sectionContentToMarkdown(section: BookAnalysisSection): string {
  const content = getEffectiveContent(section);
  if (!content) {
    return "_暂无内容_";
  }
  return content;
}

export class BookAnalysisService {
  private readonly taskQueue: AnalysisTask[] = [];

  private isProcessing = false;

  async resumePendingAnalyses(): Promise<void> {
    try {
      const rows = await prisma.bookAnalysis.findMany({
        where: {
          status: {
            in: ["queued", "running"],
          },
        },
        select: { id: true },
      });

      if (rows.length === 0) {
        return;
      }

      await prisma.bookAnalysis.updateMany({
        where: {
          id: { in: rows.map((item) => item.id) },
        },
        data: {
          status: "queued",
          lastError: null,
        },
      });

      for (const row of rows) {
        this.enqueueTask({ analysisId: row.id, kind: "full" });
      }
    } catch (error) {
      if (isMissingTableError(error)) {
        return;
      }
      throw error;
    }
  }

  async listAnalyses(filters: {
    keyword?: string;
    status?: BookAnalysisStatus;
    documentId?: string;
  } = {}): Promise<BookAnalysis[]> {
    const keyword = filters.keyword?.trim();
    const rows = await prisma.bookAnalysis.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : { status: { not: "archived" } }),
        ...(filters.documentId ? { documentId: filters.documentId } : {}),
        ...(keyword
          ? {
            OR: [
              { title: { contains: keyword } },
              { document: { title: { contains: keyword } } },
              { document: { fileName: { contains: keyword } } },
            ],
          }
          : {}),
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileName: true,
            activeVersionId: true,
            activeVersionNumber: true,
          },
        },
        documentVersion: {
          select: {
            id: true,
            versionNumber: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return rows.map((row) => this.serializeAnalysis(row));
  }

  async getAnalysisById(analysisId: string): Promise<BookAnalysisDetail | null> {
    const row = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileName: true,
            activeVersionId: true,
            activeVersionNumber: true,
          },
        },
        documentVersion: {
          select: {
            id: true,
            versionNumber: true,
          },
        },
        sections: {
          orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }],
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      ...this.serializeAnalysis(row),
      sections: row.sections.map((section) => this.serializeSection(section)),
    };
  }

  async createAnalysis(input: {
    documentId: string;
    versionId?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<BookAnalysisDetail> {
    const temperature = normalizeTemperature(input.temperature);
    const maxTokens = normalizeMaxTokens(input.maxTokens);

    const analysisId = await prisma.$transaction(async (tx) => {
      const document = await tx.knowledgeDocument.findUnique({
        where: { id: input.documentId },
        include: {
          versions: {
            select: {
              id: true,
              versionNumber: true,
            },
            orderBy: [{ versionNumber: "desc" }],
          },
        },
      });

      if (!document) {
        throw new AppError("Knowledge document not found.", 404);
      }
      if (document.status === "archived") {
        throw new AppError("Archived knowledge documents cannot be analyzed.", 400);
      }

      const version = input.versionId
        ? document.versions.find((item) => item.id === input.versionId)
        : document.versions.find((item) => item.id === document.activeVersionId) ?? document.versions[0];

      if (!version) {
        throw new AppError("Knowledge document version not found.", 400);
      }

      const analysis = await tx.bookAnalysis.create({
        data: {
          documentId: document.id,
          documentVersionId: version.id,
          title: `${document.title} v${version.versionNumber}`,
          status: "queued",
          provider: input.provider ?? "deepseek",
          model: input.model?.trim() || null,
          temperature,
          maxTokens,
          progress: 0,
          lastError: null,
        },
      });

      await tx.bookAnalysisSection.createMany({
        data: BOOK_ANALYSIS_SECTIONS.map((section, index) => ({
          analysisId: analysis.id,
          sectionKey: section.key,
          title: section.title,
          sortOrder: index,
          status: "idle",
        })),
      });

      return analysis.id;
    });

    this.enqueueTask({ analysisId, kind: "full" });
    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after creation.", 500);
    }
    return detail;
  }
  async copyAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    const source = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        sections: {
          orderBy: [{ sortOrder: "asc" }],
        },
      },
    });

    if (!source) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (source.status === "archived") {
      throw new AppError("Archived book analysis cannot be copied.", 400);
    }

    const newAnalysisId = await prisma.$transaction(async (tx) => {
      const copied = await tx.bookAnalysis.create({
        data: {
          documentId: source.documentId,
          documentVersionId: source.documentVersionId,
          title: `${source.title} - 副本`,
          status: "draft",
          summary: source.summary,
          provider: source.provider,
          model: source.model,
          temperature: source.temperature,
          maxTokens: source.maxTokens,
          progress: 1,
          lastError: null,
          lastRunAt: source.lastRunAt,
        },
      });

      await tx.bookAnalysisSection.createMany({
        data: source.sections.map((section) => ({
          analysisId: copied.id,
          sectionKey: section.sectionKey,
          title: section.title,
          status: section.status,
          aiContent: section.aiContent,
          editedContent: section.editedContent,
          notes: section.notes,
          structuredDataJson: section.structuredDataJson,
          evidenceJson: section.evidenceJson,
          frozen: section.frozen,
          sortOrder: section.sortOrder,
        })),
      });

      return copied.id;
    });

    const detail = await this.getAnalysisById(newAnalysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after copy.", 500);
    }
    return detail;
  }

  async rebuildAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        sections: true,
      },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (analysis.status === "archived") {
      throw new AppError("Archived book analysis cannot be rebuilt.", 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "queued",
          progress: 0,
          lastError: null,
        },
      });
      await tx.bookAnalysisSection.updateMany({
        where: {
          analysisId,
          frozen: false,
        },
        data: {
          status: "idle",
        },
      });
    });

    this.enqueueTask({ analysisId, kind: "full" });
    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after rebuild.", 500);
    }
    return detail;
  }

  async regenerateSection(analysisId: string, sectionKey: BookAnalysisSectionKey): Promise<BookAnalysisDetail> {
    const section = await prisma.bookAnalysisSection.findFirst({
      where: {
        analysisId,
        sectionKey,
      },
      include: {
        analysis: true,
      },
    });

    if (!section) {
      throw new AppError("Book analysis section not found.", 404);
    }
    if (section.analysis.status === "archived") {
      throw new AppError("Archived book analysis cannot be regenerated.", 400);
    }
    if (section.frozen) {
      throw new AppError("Frozen sections cannot be regenerated until unfrozen.", 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "queued",
          lastError: null,
        },
      });
      await tx.bookAnalysisSection.update({
        where: {
          analysisId_sectionKey: {
            analysisId,
            sectionKey,
          },
        },
        data: {
          status: "idle",
        },
      });
    });

    this.enqueueTask({ analysisId, kind: "section", sectionKey });
    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after section regeneration.", 500);
    }
    return detail;
  }

  async updateSection(
    analysisId: string,
    sectionKey: BookAnalysisSectionKey,
    input: {
      editedContent?: string | null;
      notes?: string | null;
      frozen?: boolean;
    },
  ): Promise<BookAnalysisDetail> {
    const section = await prisma.bookAnalysisSection.findFirst({
      where: {
        analysisId,
        sectionKey,
      },
    });

    if (!section) {
      throw new AppError("Book analysis section not found.", 404);
    }

    await prisma.bookAnalysisSection.update({
      where: {
        analysisId_sectionKey: {
          analysisId,
          sectionKey,
        },
      },
      data: {
        ...(input.editedContent !== undefined ? { editedContent: input.editedContent?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.frozen !== undefined ? { frozen: input.frozen } : {}),
      },
    });

    if (sectionKey === "overview" && input.editedContent !== undefined) {
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          summary: buildAnalysisSummaryFromContent(input.editedContent ?? section.aiContent ?? ""),
        },
      });
    }

    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after section update.", 500);
    }
    return detail;
  }

  async updateAnalysisStatus(analysisId: string, status: Extract<BookAnalysisStatus, "archived">): Promise<BookAnalysisDetail> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }

    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: { status },
    });

    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after status update.", 500);
    }
    return detail;
  }

  async buildExportContent(analysisId: string, format: "markdown" | "json"): Promise<{
    fileName: string;
    contentType: string;
    content: string;
  }> {
    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found.", 404);
    }

    const slugBase = `${detail.documentTitle}-v${detail.documentVersionNumber}`.replace(/[\\/:*?"<>|]/g, "-");

    if (format === "json") {
      return {
        fileName: `${slugBase}-book-analysis.json`,
        contentType: "application/json; charset=utf-8",
        content: JSON.stringify(detail, null, 2),
      };
    }

    const markdownParts: string[] = [
      `# ${detail.title}`,
      "",
      `- 文档：${detail.documentTitle}`,
      `- 原文件：${detail.documentFileName}`,
      `- 来源版本：v${detail.documentVersionNumber}`,
      `- 当前激活版本：v${detail.currentDocumentVersionNumber}`,
      `- 状态：${detail.status}`,
      detail.summary ? `- 摘要：${detail.summary}` : "",
      "",
    ];

    for (const section of detail.sections) {
      markdownParts.push(`## ${section.title}`);
      markdownParts.push("");
      markdownParts.push(sectionContentToMarkdown(section));
      if (section.notes?.trim()) {
        markdownParts.push("");
        markdownParts.push("### 人工备注");
        markdownParts.push("");
        markdownParts.push(section.notes.trim());
      }
      if (section.evidence.length > 0) {
        markdownParts.push("");
        markdownParts.push("### 证据摘录");
        markdownParts.push("");
        for (const evidence of section.evidence) {
          markdownParts.push(`- [${evidence.sourceLabel}] ${evidence.label}：${evidence.excerpt}`);
        }
      }
      markdownParts.push("");
    }

    return {
      fileName: `${slugBase}-book-analysis.md`,
      contentType: "text/markdown; charset=utf-8",
      content: markdownParts.join("\n"),
    };
  }

  private serializeAnalysis(row: {
    id: string;
    documentId: string;
    documentVersionId: string;
    title: string;
    status: BookAnalysisStatus;
    summary: string | null;
    provider: string | null;
    model: string | null;
    temperature: number | null;
    maxTokens: number | null;
    progress: number;
    lastError: string | null;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    document: {
      id: string;
      title: string;
      fileName: string;
      activeVersionId: string | null;
      activeVersionNumber: number;
    };
    documentVersion: {
      id: string;
      versionNumber: number;
    };
  }): BookAnalysis {
    return {
      id: row.id,
      documentId: row.documentId,
      documentVersionId: row.documentVersionId,
      documentTitle: row.document.title,
      documentFileName: row.document.fileName,
      documentVersionNumber: row.documentVersion.versionNumber,
      currentDocumentVersionId: row.document.activeVersionId,
      currentDocumentVersionNumber: row.document.activeVersionNumber,
      isCurrentVersion: row.document.activeVersionId === row.documentVersionId,
      title: row.title,
      status: row.status,
      summary: row.summary,
      provider: (row.provider as LLMProvider | null) ?? null,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      progress: row.progress,
      lastError: row.lastError,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeSection(row: {
    id: string;
    analysisId: string;
    sectionKey: string;
    title: string;
    status: "idle" | "running" | "succeeded" | "failed";
    aiContent: string | null;
    editedContent: string | null;
    notes: string | null;
    structuredDataJson: string | null;
    evidenceJson: string | null;
    frozen: boolean;
    sortOrder: number;
    updatedAt: Date;
  }): BookAnalysisSection {
    return {
      id: row.id,
      analysisId: row.analysisId,
      sectionKey: row.sectionKey as BookAnalysisSectionKey,
      title: row.title,
      status: row.status,
      aiContent: row.aiContent,
      editedContent: row.editedContent,
      notes: row.notes,
      structuredData: decodeStructuredData(row.structuredDataJson),
      evidence: decodeEvidence(row.evidenceJson),
      frozen: row.frozen,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private enqueueTask(task: AnalysisTask): void {
    this.taskQueue.push(task);
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      while (this.taskQueue.length > 0) {
        const task = this.taskQueue.shift();
        if (!task) {
          continue;
        }
        if (task.kind === "full") {
          await this.runFullAnalysis(task.analysisId);
        } else {
          await this.runSingleSection(task.analysisId, task.sectionKey);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async runFullAnalysis(analysisId: string): Promise<void> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        document: true,
        documentVersion: true,
        sections: {
          orderBy: [{ sortOrder: "asc" }],
        },
      },
    });

    if (!analysis || analysis.status === "archived") {
      return;
    }

    const activeSections = analysis.sections.filter((section) => !section.frozen);
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "running",
        progress: activeSections.length === 0 ? 1 : 0,
        lastError: null,
        lastRunAt: new Date(),
      },
    });

    if (activeSections.length === 0) {
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "succeeded",
          progress: 1,
        },
      });
      return;
    }

    const provider = (analysis.provider as LLMProvider | null) ?? "deepseek";
    const model = analysis.model ?? undefined;
    const temperature = normalizeTemperature(analysis.temperature);
    const maxTokens = normalizeMaxTokens(analysis.maxTokens);

    try {
      const notes = await this.buildSourceNotes(analysis.documentVersion.content, provider, model, temperature, maxTokens);
      let completedCount = 0;
      const errors: string[] = [];
      let summary = analysis.summary;

      for (const section of analysis.sections) {
        if (section.frozen) {
          continue;
        }
        try {
          await prisma.bookAnalysisSection.update({
            where: {
              analysisId_sectionKey: {
                analysisId,
                sectionKey: section.sectionKey,
              },
            },
            data: {
              status: "running",
            },
          });

          const generated = await this.generateSection(
            section.sectionKey as BookAnalysisSectionKey,
            notes,
            provider,
            model,
            temperature,
            maxTokens,
          );

          await prisma.bookAnalysisSection.update({
            where: {
              analysisId_sectionKey: {
                analysisId,
                sectionKey: section.sectionKey,
              },
            },
            data: {
              status: "succeeded",
              aiContent: generated.markdown,
              structuredDataJson: encodeStructuredData(generated.structuredData),
              evidenceJson: encodeEvidence(generated.evidence),
            },
          });

          if (section.sectionKey === "overview") {
            summary = buildAnalysisSummaryFromContent(generated.markdown);
          }
        } catch (error) {
          errors.push(`${section.title}: ${error instanceof Error ? error.message : "Unknown error"}`);
          await prisma.bookAnalysisSection.update({
            where: {
              analysisId_sectionKey: {
                analysisId,
                sectionKey: section.sectionKey,
              },
            },
            data: {
              status: "failed",
            },
          });
        } finally {
          completedCount += 1;
          await prisma.bookAnalysis.update({
            where: { id: analysisId },
            data: {
              progress: Math.min(1, completedCount / activeSections.length),
            },
          });
        }
      }

      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: errors.length > 0 ? "failed" : "succeeded",
          progress: 1,
          summary,
          lastError: errors.length > 0 ? errors.join(" | ") : null,
        },
      });
    } catch (error) {
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "failed",
          progress: 1,
          lastError: error instanceof Error ? error.message : "Book analysis failed.",
        },
      });
    }
  }

  private async runSingleSection(analysisId: string, sectionKey: BookAnalysisSectionKey): Promise<void> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        documentVersion: true,
        sections: true,
      },
    });
    if (!analysis || analysis.status === "archived") {
      return;
    }

    const section = analysis.sections.find((item) => item.sectionKey === sectionKey);
    if (!section || section.frozen) {
      return;
    }

    const provider = (analysis.provider as LLMProvider | null) ?? "deepseek";
    const model = analysis.model ?? undefined;
    const temperature = normalizeTemperature(analysis.temperature);
    const maxTokens = normalizeMaxTokens(analysis.maxTokens);

    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "running",
        lastError: null,
        lastRunAt: new Date(),
      },
    });

    try {
      await prisma.bookAnalysisSection.update({
        where: {
          analysisId_sectionKey: {
            analysisId,
            sectionKey,
          },
        },
        data: {
          status: "running",
        },
      });

      const notes = await this.buildSourceNotes(analysis.documentVersion.content, provider, model, temperature, maxTokens);
      const generated = await this.generateSection(sectionKey, notes, provider, model, temperature, maxTokens);

      await prisma.bookAnalysisSection.update({
        where: {
          analysisId_sectionKey: {
            analysisId,
            sectionKey,
          },
        },
        data: {
          status: "succeeded",
          aiContent: generated.markdown,
          structuredDataJson: encodeStructuredData(generated.structuredData),
          evidenceJson: encodeEvidence(generated.evidence),
        },
      });

      const sectionStatuses = await prisma.bookAnalysisSection.findMany({
        where: { analysisId },
        select: {
          sectionKey: true,
          status: true,
          frozen: true,
          editedContent: true,
          aiContent: true,
        },
      });

      const overview = sectionKey === "overview"
        ? generated.markdown
        : getEffectiveContent(
          sectionStatuses.find((item) => item.sectionKey === "overview") ?? { aiContent: null, editedContent: null },
        );

      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: sectionStatuses.some((item) => !item.frozen && item.status === "failed") ? "failed" : "succeeded",
          progress: 1,
          summary: buildAnalysisSummaryFromContent(overview),
          lastError: null,
        },
      });
    } catch (error) {
      await prisma.bookAnalysisSection.update({
        where: {
          analysisId_sectionKey: {
            analysisId,
            sectionKey,
          },
        },
        data: {
          status: "failed",
        },
      });
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "failed",
          progress: 1,
          lastError: error instanceof Error ? error.message : "Section regeneration failed.",
        },
      });
    }
  }

  private async buildSourceNotes(
    content: string,
    provider: LLMProvider,
    model?: string,
    temperature?: number,
    sectionMaxTokens?: number,
  ): Promise<SourceNote[]> {
    const segments = buildSourceSegments(content);
    if (segments.length === 0) {
      throw new AppError("Knowledge document version content is empty.", 400);
    }

    const llm = await getLLM(provider, {
      model,
      temperature: normalizeTemperature(temperature),
      maxTokens: getNotesMaxTokens(normalizeMaxTokens(sectionMaxTokens)),
    });

    const notes: SourceNote[] = [];
    for (const segment of segments) {
      try {
        const result = await invokeWithJsonGuard(llm, [
          new SystemMessage(`你是拆书分析助手。请根据给定文本片段输出一个紧凑 JSON，用于后续全书拆解汇总。输出 JSON：
{
  "summary": "100字内片段摘要",
  "plotPoints": ["..."],
  "characters": ["..."],
  "worldbuilding": ["..."],
  "themes": ["..."],
  "styleTechniques": ["..."],
  "marketHighlights": ["..."],
  "evidence": [{"label": "...", "excerpt": "..."}]
}
规则：
- 全部使用简体中文。
- 每个数组最多 5 项。
- evidence 最多 3 项，excerpt 保持简短原文摘录。`),
          new HumanMessage(`片段标题：${segment.label}\n\n片段内容：\n${segment.content}`),
        ], provider, model);

        const parsed = safeParseJSON<Record<string, unknown>>(
          extractJSONObject(String(result.content)),
          {},
        );

        notes.push({
          sourceLabel: segment.label,
          summary:
            (typeof parsed.summary === "string" && parsed.summary.trim()) ||
            compactExcerpt(segment.content, 120),
          plotPoints: toStringList(parsed.plotPoints),
          characters: toStringList(parsed.characters),
          worldbuilding: toStringList(parsed.worldbuilding),
          themes: toStringList(parsed.themes),
          styleTechniques: toStringList(parsed.styleTechniques),
          marketHighlights: toStringList(parsed.marketHighlights),
          evidence: toEvidenceList(parsed.evidence, segment.label),
        });
      } catch {
        notes.push({
          sourceLabel: segment.label,
          summary: compactExcerpt(segment.content, 120),
          plotPoints: [],
          characters: [],
          worldbuilding: [],
          themes: [],
          styleTechniques: [],
          marketHighlights: [],
          evidence: [],
        });
      }
    }

    return notes;
  }

  private async generateSection(
    sectionKey: BookAnalysisSectionKey,
    notes: SourceNote[],
    provider: LLMProvider,
    model?: string,
    temperature?: number,
    maxTokens?: number,
  ): Promise<SectionGenerationResult> {
    const llm = await getLLM(provider, {
      model,
      temperature: normalizeTemperature(temperature),
      maxTokens: normalizeMaxTokens(maxTokens),
    });

    const prompt = SECTION_PROMPTS[sectionKey];
    const notesText = renderNotesForPrompt(notes);
    const result = await invokeWithJsonGuard(llm, [
      new SystemMessage(`你是资深中文小说拆书编辑。请基于全书分段笔记生成《${getSectionTitle(sectionKey)}》分析。要求：
- 只输出合法 JSON。
- markdown 字段使用 Markdown 标题和列表组织。
- evidence 只能引用给定笔记中出现过的 sourceLabel 和摘录线索。
- 结论要具体，不要空泛。
${prompt}`),
      new HumanMessage(`分段笔记如下：\n${notesText}`),
    ], provider, model);

    try {
      const parsed = safeParseJSON<Record<string, unknown>>(
        extractJSONObject(String(result.content)),
        {},
      );
      const markdown =
        (typeof parsed.markdown === "string" && parsed.markdown.trim()) ||
        String(result.content).trim();
      const structuredData = parsed.structuredData && typeof parsed.structuredData === "object"
        ? parsed.structuredData as Record<string, unknown>
        : null;
      const evidence = toEvidenceList(parsed.evidence);
      return {
        markdown,
        structuredData,
        evidence,
      };
    } catch {
      return {
        markdown: String(result.content).trim(),
        structuredData: null,
        evidence: [],
      };
    }
  }
}

export const bookAnalysisService = new BookAnalysisService();

