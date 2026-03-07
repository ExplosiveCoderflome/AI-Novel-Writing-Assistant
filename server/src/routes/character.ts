import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { getLLM } from "../llm/factory";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

const listQuerySchema = z.object({
  category: z.string().trim().optional(),
  tags: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

const idSchema = z.object({
  id: z.string().trim().min(1),
});

const baseCharacterSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  personality: z.string().trim().min(1),
  background: z.string().trim().min(1),
  development: z.string().trim().min(1),
  appearance: z.string().optional(),
  weaknesses: z.string().optional(),
  interests: z.string().optional(),
  keyEvents: z.string().optional(),
  tags: z.string().optional(),
  category: z.string().trim().min(1),
});

const updateBaseCharacterSchema = baseCharacterSchema.partial();

const generateSchema = z.object({
  description: z.string().trim().min(1),
  category: z.string().trim().min(1),
  genre: z.string().trim().optional(),
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok"]).optional(),
  model: z.string().optional(),
  knowledgeDocumentIds: z.array(z.string().trim().min(1)).max(5).optional(),
  bookAnalysisIds: z.array(z.string().trim().min(1)).max(5).optional(),
});

const MAX_DOCUMENT_REFERENCE_CHARS = 2_400;
const MAX_ANALYSIS_SUMMARY_CHARS = 400;
const MAX_ANALYSIS_SECTION_CHARS = 500;
const MAX_ANALYSIS_SECTION_COUNT = 5;
const MAX_REFERENCE_CONTEXT_CHARS = 12_000;

function dedupeIds(ids: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (ids ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function clipText(source: string, maxChars: number): string {
  const normalized = source.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trim()}\n...(已截断)`;
}

function extractJSONObject(source: string): string {
  const normalized = source.replace(/```json|```/gi, "").trim();
  const first = normalized.indexOf("{");
  const last = normalized.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("AI 返回内容不是合法 JSON。");
  }
  return normalized.slice(first, last + 1);
}

function toTrimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function buildReferenceContext(input: {
  knowledgeDocumentIds?: string[];
  bookAnalysisIds?: string[];
}): Promise<string> {
  const knowledgeDocumentIds = dedupeIds(input.knowledgeDocumentIds);
  const bookAnalysisIds = dedupeIds(input.bookAnalysisIds);
  if (knowledgeDocumentIds.length === 0 && bookAnalysisIds.length === 0) {
    return "";
  }

  const [documents, analyses] = await Promise.all([
    knowledgeDocumentIds.length > 0
      ? prisma.knowledgeDocument.findMany({
          where: {
            id: { in: knowledgeDocumentIds },
            status: { not: "archived" },
          },
          include: {
            activeVersion: {
              select: {
                id: true,
                versionNumber: true,
                content: true,
              },
            },
            versions: {
              orderBy: [{ versionNumber: "desc" }],
              take: 1,
              select: {
                id: true,
                versionNumber: true,
                content: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    bookAnalysisIds.length > 0
      ? prisma.bookAnalysis.findMany({
          where: {
            id: { in: bookAnalysisIds },
            status: { not: "archived" },
          },
          include: {
            document: {
              select: {
                title: true,
              },
            },
            documentVersion: {
              select: {
                versionNumber: true,
              },
            },
            sections: {
              orderBy: [{ sortOrder: "asc" }],
              select: {
                title: true,
                aiContent: true,
                editedContent: true,
                notes: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  if (knowledgeDocumentIds.length > 0 && documents.length !== knowledgeDocumentIds.length) {
    throw new Error("部分知识文档不存在或已归档，无法作为角色生成参考。");
  }
  if (bookAnalysisIds.length > 0 && analyses.length !== bookAnalysisIds.length) {
    throw new Error("部分拆书分析不存在或已归档，无法作为角色生成参考。");
  }

  const documentById = new Map(documents.map((item) => [item.id, item] as const));
  const analysisById = new Map(analyses.map((item) => [item.id, item] as const));

  const orderedDocuments = knowledgeDocumentIds
    .map((id) => documentById.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const orderedAnalyses = bookAnalysisIds
    .map((id) => analysisById.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const documentReferences = orderedDocuments
    .map((document) => {
      const version = document.activeVersion ?? document.versions[0];
      const versionNumber = version?.versionNumber ?? 0;
      const excerpt = version?.content
        ? clipText(version.content, MAX_DOCUMENT_REFERENCE_CHARS)
        : "（该文档暂无可用版本内容）";
      return `【知识库】${document.title}（v${versionNumber}）\n${excerpt}`;
    });

  const analysisReferences = orderedAnalyses
    .map((analysis) => {
      const summary = analysis.summary?.trim()
        ? clipText(analysis.summary, MAX_ANALYSIS_SUMMARY_CHARS)
        : "无";
      const sectionLines = analysis.sections
        .map((section) => {
          const content = section.editedContent?.trim()
            || section.aiContent?.trim()
            || section.notes?.trim()
            || "";
          if (!content) {
            return null;
          }
          return `- ${section.title}：${clipText(content, MAX_ANALYSIS_SECTION_CHARS)}`;
        })
        .filter((line): line is string => Boolean(line))
        .slice(0, MAX_ANALYSIS_SECTION_COUNT);

      return [
        `【拆书】${analysis.title}（文档：${analysis.document.title} v${analysis.documentVersion.versionNumber}）`,
        `摘要：${summary}`,
        sectionLines.length > 0
          ? `小节要点：\n${sectionLines.join("\n")}`
          : "小节要点：无",
      ].join("\n");
    });

  const sections: string[] = [];
  if (documentReferences.length > 0) {
    sections.push(`### 知识库参考\n${documentReferences.join("\n\n")}`);
  }
  if (analysisReferences.length > 0) {
    sections.push(`### 拆书参考\n${analysisReferences.join("\n\n")}`);
  }

  return clipText(sections.join("\n\n"), MAX_REFERENCE_CONTEXT_CHARS);
}

router.use(authMiddleware);

router.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof listQuerySchema>;
    const data = await prisma.baseCharacter.findMany({
      where: {
        category: query.category ? { equals: query.category } : undefined,
        tags: query.tags ? { contains: query.tags } : undefined,
        OR: query.search
          ? [
              { name: { contains: query.search } },
              { personality: { contains: query.search } },
              { background: { contains: query.search } },
            ]
          : undefined,
      },
      orderBy: { updatedAt: "desc" },
    });
    res.status(200).json({
      success: true,
      data,
      message: "获取基础角色列表成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/", validate({ body: baseCharacterSchema }), async (req, res, next) => {
  try {
    const data = await prisma.baseCharacter.create({
      data: {
        ...req.body,
        tags: req.body.tags ?? "",
      },
    });
    res.status(201).json({
      success: true,
      data,
      message: "创建基础角色成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validate({ params: idSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    const data = await prisma.baseCharacter.findUnique({
      where: { id },
    });
    if (!data) {
      res.status(404).json({
        success: false,
        error: "角色不存在。",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "获取角色详情成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/:id",
  validate({ params: idSchema, body: updateBaseCharacterSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idSchema>;
      const data = await prisma.baseCharacter.update({
        where: { id },
        data: req.body as z.infer<typeof updateBaseCharacterSchema>,
      });
      res.status(200).json({
        success: true,
        data,
        message: "更新角色成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id", validate({ params: idSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    await prisma.baseCharacter.delete({ where: { id } });
    res.status(200).json({
      success: true,
      message: "删除角色成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.post("/generate", validate({ body: generateSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof generateSchema>;
    const referenceContext = await buildReferenceContext({
      knowledgeDocumentIds: body.knowledgeDocumentIds,
      bookAnalysisIds: body.bookAnalysisIds,
    });
    const llm = await getLLM(body.provider ?? "deepseek", {
      model: body.model,
      temperature: 0.8,
    });

    const result = await llm.invoke([
      new SystemMessage(
        `你是一位专业的小说角色设计师。请根据描述生成完整角色设定。
如果用户提供了“参考资料”，必须优先吸收参考中的设定、人物关系、世界规则与冲突线索，避免与参考资料冲突。
输出 JSON：
{
  "name": "...",
  "role": "主角/反派/配角",
  "personality": "...",
  "background": "...",
  "development": "...",
  "appearance": "...",
  "weaknesses": "...",
  "interests": "...",
  "keyEvents": "...",
  "tags": "标签1,标签2"
}`,
      ),
      new HumanMessage(
        `角色描述：${body.description}
角色类别：${body.category}
小说类型：${body.genre ?? "通用"}
${referenceContext ? `\n参考资料：\n${referenceContext}\n` : ""}
请仅输出 JSON。`,
      ),
    ]);

    const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    const parsed = JSON.parse(extractJSONObject(text)) as Record<string, unknown>;
    const defaultName = body.description.trim().slice(0, 12) || "未命名角色";
    const data = await prisma.baseCharacter.create({
      data: {
        name: toTrimmedText(parsed.name) || defaultName,
        role: toTrimmedText(parsed.role) || body.category,
        personality: toTrimmedText(parsed.personality) || body.description.trim(),
        background: toTrimmedText(parsed.background) || `来自用户描述：${body.description.trim()}`,
        development: toTrimmedText(parsed.development) || "待补充成长线",
        appearance: toTrimmedText(parsed.appearance),
        weaknesses: toTrimmedText(parsed.weaknesses),
        interests: toTrimmedText(parsed.interests),
        keyEvents: toTrimmedText(parsed.keyEvents),
        category: body.category,
        tags: toTrimmedText(parsed.tags),
      },
    });

    res.status(200).json({
      success: true,
      data,
      message: "AI 角色生成成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
