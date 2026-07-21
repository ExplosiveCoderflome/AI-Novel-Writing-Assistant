import type {
  GenerationContextPackage,
  RuntimeStyleDetectionReport,
} from "@ai-novel/shared/types/chapterRuntime";
import { StyleDetectionService } from "../../styleEngine/StyleDetectionService";
import { StyleRewriteService } from "../../styleEngine/StyleRewriteService";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import { PostGenerationStyleReviewPolicyResolver } from "./PostGenerationStyleReviewPolicyResolver";
import { StylePatchService } from "../../styleEngine/StylePatchService";

export interface StyleReviewResult {
  report: RuntimeStyleDetectionReport | null;
  autoRewritten: boolean;
  originalContent: string | null;
  finalContent: string;
}

export interface PostGenerationStyleReviewInput {
  novelId: string;
  chapterId: string;
  request: ChapterRuntimeRequestInput;
  contextPackage: GenerationContextPackage;
  content: string;
}

interface PostGenerationStyleReviewRunnerDeps {
  styleDetectionService?: Pick<StyleDetectionService, "check">;
  styleRewriteService?: Pick<StyleRewriteService, "rewrite">;
  postGenerationStyleReviewPolicyResolver?: Pick<PostGenerationStyleReviewPolicyResolver, "resolve">;
  stylePatchService?: StylePatchService;
}

export class PostGenerationStyleReviewRunner {
  private readonly deps: Required<PostGenerationStyleReviewRunnerDeps>;

  constructor(deps: PostGenerationStyleReviewRunnerDeps = {}) {
    this.deps = {
      styleDetectionService: deps.styleDetectionService ?? new StyleDetectionService(),
      styleRewriteService: deps.styleRewriteService ?? new StyleRewriteService(),
      postGenerationStyleReviewPolicyResolver: deps.postGenerationStyleReviewPolicyResolver
        ?? new PostGenerationStyleReviewPolicyResolver(),
      stylePatchService: deps.stylePatchService ?? new StylePatchService(),
    };
  }


  async run(input: PostGenerationStyleReviewInput): Promise<StyleReviewResult> {
    const policy = await this.deps.postGenerationStyleReviewPolicyResolver.resolve(input.novelId).catch(() => ({
      enabled: true,
    }));
    if (!policy.enabled) {
      return {
        report: null,
        autoRewritten: false,
        originalContent: null,
        finalContent: input.content,
      };
    }

    if (!input.contextPackage.styleContext?.compiledBlocks) {
      return {
        report: null,
        autoRewritten: false,
        originalContent: null,
        finalContent: input.content,
      };
    }

    let report: RuntimeStyleDetectionReport | null = null;
    try {
      report = await this.deps.styleDetectionService.check({
        content: input.content,
        novelId: input.novelId,
        chapterId: input.chapterId,
        taskStyleProfileId: input.request.taskStyleProfileId,
        provider: input.request.provider,
        model: input.request.model,
        temperature: 0.2,
      });
    } catch {
      return {
        report: null,
        autoRewritten: false,
        originalContent: null,
        finalContent: input.content,
      };
    }

    const rewritableIssues = report.violations.filter((item) => item.canAutoRewrite && item.suggestion.trim());
    const shouldAutoRewrite = report.canAutoRewrite
      && rewritableIssues.length > 0
      && report.riskScore >= 35;

    if (!shouldAutoRewrite) {
      return {
        report,
        autoRewritten: false,
        originalContent: null,
        finalContent: input.content,
      };
    }

    try {
      const rewritten = await this.deps.styleRewriteService.rewrite({
        content: input.content,
        novelId: input.novelId,
        chapterId: input.chapterId,
        taskStyleProfileId: input.request.taskStyleProfileId,
        issues: rewritableIssues.map((item) => ({
          ruleName: item.ruleName,
          excerpt: item.excerpt,
          suggestion: item.suggestion,
        })),
        provider: input.request.provider,
        model: input.request.model,
        temperature: Math.min(input.request.temperature ?? 0.5, 0.7),
      });
      const finalContent = rewritten.content.trim() || input.content;
      const autoRewritten = finalContent.trim() !== input.content.trim();

      if (autoRewritten) {
        for (const issue of rewritableIssues) {
          await this.deps.stylePatchService.recordViolation(
            input.novelId,
            issue.ruleName,
            issue.suggestion
          ).catch(() => {});
        }
      }

      return {
        report,
        autoRewritten,
        originalContent: autoRewritten ? input.content : null,
        finalContent,
      };
    } catch {
      return {
        report,
        autoRewritten: false,
        originalContent: null,
        finalContent: input.content,
      };
    }
  }
}
