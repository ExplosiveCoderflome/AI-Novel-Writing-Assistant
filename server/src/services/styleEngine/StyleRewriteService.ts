import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { isStyleIssueRewritable, type StyleRewriteGuard, type StyleDetectionReport } from "@ai-novel/shared/types/styleEngine";
import { styleRewritePrompt } from "../../prompting/prompts/style/style.prompts";
import { buildWriterStyleContractText } from "./styleContractText";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";
import { buildAntiAiRuleDirectiveText, listPreviewAntiAiRules } from "./antiAiPreviewRules";
import { StyleDetectionService } from "./StyleDetectionService";
import { guardStylePatches } from "./rewrite";

interface RewriteInput {
  content: string;
  styleProfileId?: string;
  novelId?: string;
  chapterId?: string;
  taskStyleProfileId?: string;
  previewAntiAiRuleIds?: string[];
  issues: Array<{
    ruleName: string;
    excerpt: string;
    suggestion: string;
  }>;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export class StyleRewriteService {
  private readonly resolver = new StyleRuntimeResolver();
  private readonly detector = new StyleDetectionService();

  async rewrite(input: RewriteInput): Promise<{ content: string; report: StyleDetectionReport; rewriteGuard?: StyleRewriteGuard }> {
    // Request issues are hints, never an authorization receipt. Recheck the current
    // source and policy; clients cannot mark narrative edits as safe.
    const report = await this.detector.check(input);
    const issues = report.violations.filter(item => isStyleIssueRewritable(item)
      && (input.issues.length === 0 || input.issues.some(selected => selected.excerpt === item.excerpt && selected.ruleName === item.ruleName)))
      .map((item, index) => ({ ...item, issueId: `style:${index + 1}` }));
    if (issues.length === 0) return { content: input.content, report };
    const resolved = await this.resolver.resolve({
      styleProfileId: input.styleProfileId,
      novelId: input.novelId,
      chapterId: input.chapterId,
      taskStyleProfileId: input.taskStyleProfileId,
    });
    const previewRules = await listPreviewAntiAiRules(input.previewAntiAiRuleIds);
    const existingRuleIds = new Set(resolved.antiAiRules.map((rule) => rule.id));
    const extraPreviewRules = previewRules.filter((rule) => !existingRuleIds.has(rule.id));

    const issuesBlock = JSON.stringify(issues);
    const styleContractText = [
      buildWriterStyleContractText(resolved.context.compiledBlocks?.contract ?? null),
      buildAntiAiRuleDirectiveText(extraPreviewRules),
    ].filter(Boolean).join("\n\n");

    const result = await runStructuredPrompt({
      asset: styleRewritePrompt,
      promptInput: {
        styleContractText,
        content: input.content,
        issuesBlock,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: Math.min(input.temperature ?? 0.35, 0.45),
      },
    });

    const protectedResult = guardStylePatches({
      original: input.content, plan: result.output,
      allowedIssueIds: issues.map(item => item.issueId),
      styleIssueIds: issues.map(item => item.issueId),
    });
    return { content: protectedResult.content, report, rewriteGuard: protectedResult.guard };
  }
}
