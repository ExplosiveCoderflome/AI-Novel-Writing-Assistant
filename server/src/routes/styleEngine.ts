import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../llm/providerSchema";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AntiAiRuleService } from "../services/styleEngine/AntiAiRuleService";
import { StyleBindingService } from "../services/styleEngine/StyleBindingService";
import { StyleDetectionService } from "../services/styleEngine/StyleDetectionService";
import { StyleGenerationService } from "../services/styleEngine/StyleGenerationService";
import { StyleProfileService } from "../services/styleEngine/StyleProfileService";
import { styleRecommendationService } from "../services/styleEngine/StyleRecommendationService";
import { StyleRewriteService } from "../services/styleEngine/StyleRewriteService";

const router = Router();
const styleProfileService = new StyleProfileService();
const antiAiRuleService = new AntiAiRuleService();
const styleBindingService = new StyleBindingService();
const styleDetectionService = new StyleDetectionService();
const styleRewriteService = new StyleRewriteService();
const styleGenerationService = new StyleGenerationService();

const idSchema = z.object({ id: z.string().trim().min(1) });
const bindingIdSchema = z.object({ id: z.string().trim().min(1) });
const antiRuleIdSchema = z.object({ id: z.string().trim().min(1) });

const manualProfileSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  tags: z.array(z.string().trim()).optional(),
  applicableGenres: z.array(z.string().trim()).optional(),
  sourceType: z.enum(["manual", "from_text", "from_book_analysis", "from_current_work"]).optional(),
  sourceRefId: z.string().trim().optional(),
  sourceContent: z.string().optional(),
  extractedFeatures: z.array(z.object({
    id: z.string().trim().min(1),
    group: z.enum(["narrative", "language", "dialogue", "rhythm", "fingerprint"]),
    label: z.string().trim().min(1),
    description: z.string().trim().min(1),
    evidence: z.string().trim().min(1),
    importance: z.number().min(0).max(1),
    imitationValue: z.number().min(0).max(1),
    transferability: z.number().min(0).max(1),
    fingerprintRisk: z.number().min(0).max(1),
    enabled: z.boolean(),
    selectedDecision: z.enum(["keep", "weaken", "remove"]).optional(),
    keepRulePatch: z.record(z.string(), z.unknown()),
    weakenRulePatch: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
  analysisMarkdown: z.string().optional(),
  narrativeRules: z.record(z.string(), z.unknown()).optional(),
  characterRules: z.record(z.string(), z.unknown()).optional(),
  languageRules: z.record(z.string(), z.unknown()).optional(),
  rhythmRules: z.record(z.string(), z.unknown()).optional(),
  antiAiRuleIds: z.array(z.string().trim()).optional(),
});

const fromBookAnalysisSchema = z.object({
  bookAnalysisId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const fromTemplateSchema = z.object({
  templateId: z.string().trim().min(1),
  name: z.string().trim().optional(),
});

const fromBriefSchema = z.object({
  brief: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const antiAiRuleSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(["forbidden", "risk", "encourage"]),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string().trim().min(1),
  detectPatterns: z.array(z.string().trim()).optional(),
  rewriteSuggestion: z.string().trim().optional(),
  promptInstruction: z.string().trim().optional(),
  autoRewrite: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const antiAiRuleUpdateSchema = antiAiRuleSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个更新字段。" },
);

const bindingSchema = z.object({
  styleProfileId: z.string().trim().min(1),
  targetType: z.enum(["novel", "chapter", "task"]),
  targetId: z.string().trim().min(1),
  priority: z.number().int().min(0).default(1),
  weight: z.number().min(0.3).max(1).default(1),
  enabled: z.boolean().default(true),
});

const bindingQuerySchema = z.object({
  targetType: z.enum(["novel", "chapter", "task"]).optional(),
  targetId: z.string().trim().optional(),
  styleProfileId: z.string().trim().optional(),
});

const testWriteSchema = z.object({
  mode: z.enum(["generate", "rewrite"]),
  topic: z.string().trim().optional(),
  sourceText: z.string().optional(),
  targetLength: z.number().int().min(100).max(8000).optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const detectionSchema = z.object({
  content: z.string().trim().min(1),
  styleProfileId: z.string().trim().optional(),
  novelId: z.string().trim().optional(),
  chapterId: z.string().trim().optional(),
  taskStyleProfileId: z.string().trim().optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const rewriteSchema = z.object({
  content: z.string().trim().min(1),
  styleProfileId: z.string().trim().optional(),
  novelId: z.string().trim().optional(),
  chapterId: z.string().trim().optional(),
  taskStyleProfileId: z.string().trim().optional(),
  issues: z.array(z.object({
    ruleName: z.string().trim().min(1),
    excerpt: z.string().trim().min(1),
    suggestion: z.string().trim().min(1),
  })).min(1),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const novelRecommendationParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const recommendationRequestSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

router.use(authMiddleware);

router.get("/style-profiles", async (_req, res, next) => {
  try {
    const data = await styleProfileService.listProfiles();
    res.status(200).json({
      success: true,
      data,
      message: "获取写法资产列表成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/style-profiles", validate({ body: manualProfileSchema }), async (req, res, next) => {
  try {
    const data = await styleProfileService.createManualProfile(req.body as z.infer<typeof manualProfileSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "创建写法资产成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/style-profiles/from-book-analysis", validate({ body: fromBookAnalysisSchema }), async (req, res, next) => {
  try {
    const data = await styleProfileService.createFromBookAnalysis(req.body as z.infer<typeof fromBookAnalysisSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "从拆书生成写法成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/style-profiles/from-template", validate({ body: fromTemplateSchema }), async (req, res, next) => {
  try {
    const data = await styleProfileService.createFromTemplate(req.body as z.infer<typeof fromTemplateSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "从模板创建写法成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/style-profiles/from-brief", validate({ body: fromBriefSchema }), async (req, res, next) => {
  try {
    const data = await styleProfileService.createFromBrief(req.body as z.infer<typeof fromBriefSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "AI 生成写法成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/style-profiles/:id", validate({ params: idSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    const data = await styleProfileService.getProfileById(id);
    if (!data) {
      res.status(404).json({
        success: false,
        error: "写法资产不存在。",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "获取写法资产详情成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put("/style-profiles/:id", validate({ params: idSchema, body: manualProfileSchema.partial() }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    const data = await styleProfileService.updateProfile(id, req.body as any);
    res.status(200).json({
      success: true,
      data,
      message: "更新写法资产成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/style-profiles/:id", validate({ params: idSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    await styleProfileService.deleteProfile(id);
    res.status(200).json({
      success: true,
      message: "删除写法资产成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.post("/style-profiles/:id/test-write", validate({ params: idSchema, body: testWriteSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    const data = await styleGenerationService.testWrite({
      styleProfileId: id,
      ...(req.body as z.infer<typeof testWriteSchema>),
    });
    res.status(200).json({
      success: true,
      data,
      message: "试写完成。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/style-templates", async (_req, res, next) => {
  try {
    const data = await styleProfileService.listTemplates();
    res.status(200).json({
      success: true,
      data,
      message: "获取模板成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/anti-ai-rules", async (_req, res, next) => {
  try {
    const data = await antiAiRuleService.listRules();
    res.status(200).json({
      success: true,
      data,
      message: "获取反AI规则成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/anti-ai-rules", validate({ body: antiAiRuleSchema }), async (req, res, next) => {
  try {
    const data = await antiAiRuleService.createRule(req.body as z.infer<typeof antiAiRuleSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "创建反AI规则成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put("/anti-ai-rules/:id", validate({ params: antiRuleIdSchema, body: antiAiRuleUpdateSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof antiRuleIdSchema>;
    const data = await antiAiRuleService.updateRule(id, req.body as z.infer<typeof antiAiRuleUpdateSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "更新反AI规则成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/style-bindings", validate({ query: bindingQuerySchema }), async (req, res, next) => {
  try {
    const query = bindingQuerySchema.parse(req.query);
    const data = await styleBindingService.listBindings(query);
    res.status(200).json({
      success: true,
      data,
      message: "获取写法绑定成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/style-bindings", validate({ body: bindingSchema }), async (req, res, next) => {
  try {
    const data = await styleBindingService.createBinding(req.body as z.infer<typeof bindingSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "创建写法绑定成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/style-bindings/:id", validate({ params: bindingIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof bindingIdSchema>;
    await styleBindingService.deleteBinding(id);
    res.status(200).json({
      success: true,
      message: "删除写法绑定成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

/*
router.post("/style-profiles/from-extraction", validate({ body: fromExtractionSchema }), async (req, res, next) => {
  try {
    const data = await styleProfileService.createProfileFromExtraction(req.body as z.infer<typeof fromExtractionSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "已按特征选择生成写法资产。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});
*/

router.post("/style-recommendations/novels/:id", validate({
  params: novelRecommendationParamsSchema,
  body: recommendationRequestSchema,
}), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof novelRecommendationParamsSchema>;
    const data = await styleRecommendationService.recommendForNovel({
      novelId: id,
      ...(req.body as z.infer<typeof recommendationRequestSchema>),
    });
    res.status(200).json({
      success: true,
      data,
      message: "写法推荐已生成。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/style-detection/check", validate({ body: detectionSchema }), async (req, res, next) => {
  try {
    const data = await styleDetectionService.check(req.body as z.infer<typeof detectionSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "写法检测完成。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/style-detection/rewrite", validate({ body: rewriteSchema }), async (req, res, next) => {
  try {
    const data = await styleRewriteService.rewrite(req.body as z.infer<typeof rewriteSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "写法修正完成。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
