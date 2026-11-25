import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
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
  factContextText?: string;
  protectedTerms?: string[];
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

  private async resolveFactBoundary(input: Pick<RewriteInput, "novelId" | "chapterId" | "factContextText" | "protectedTerms">): Promise<{
    factContextText?: string;
    protectedTerms: string[];
  }> {
    const providedFacts = input.factContextText?.trim();
    const providedTerms = (input.protectedTerms ?? []).map((item) => item.trim()).filter(Boolean);
    if (providedFacts || !input.novelId?.trim()) {
      return {
        ...(providedFacts ? { factContextText: providedFacts } : {}),
        protectedTerms: providedTerms,
      };
    }

    const [characters, chapter] = await Promise.all([
      prisma.character.findMany({
        where: { novelId: input.novelId.trim() },
        take: 10,
        orderBy: [{ updatedAt: "desc" }],
        select: { name: true, role: true, currentState: true, currentGoal: true },
      }).catch(() => []),
      input.chapterId?.trim()
        ? prisma.chapter.findUnique({
          where: { id: input.chapterId.trim() },
          select: { title: true, expectation: true },
        }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const characterTerms = characters.map((item) => item.name.trim()).filter(Boolean);
    const lines: string[] = [];
    if (chapter?.title || chapter?.expectation) {
      lines.push(`当前章：${chapter.title ?? ""}${chapter.expectation ? `｜目标：${chapter.expectation.slice(0, 120)}` : ""}`);
    }
    if (characters.length > 0) {
      lines.push(
        "已知人物：",
        ...characters.slice(0, 6).map((item) => (
          `- ${item.name}（${item.role}${item.currentState ? `；状态：${item.currentState}` : ""}${item.currentGoal ? `；目标：${item.currentGoal}` : ""}）`
        )),
      );
    }

    const factContextText = lines.filter(Boolean).join("\n").trim();
    return {
      ...(factContextText ? { factContextText } : {}),
      protectedTerms: Array.from(new Set([...providedTerms, ...characterTerms])),
    };
  }

  async rewrite(input: RewriteInput): Promise<{ content: string; report: StyleDetectionReport; rewriteGuard?: StyleRewriteGuard }> {
    // Request issues are hints, never an authorization receipt. Recheck the current
    // source and policy; clients cannot mark narrative edits as safe.
    const report = await this.detector.check(input);
    const issues = report.violations.filter(item => isStyleIssueRewritable(item)
      && (input.issues.length === 0 || input.issues.some(selected => selected.excerpt === item.excerpt && selected.ruleName === item.ruleName)))
      .map((item, index) => ({ ...item, issueId: `style:${index + 1}` }));
    if (issues.length === 0) return { content: input.content, report };
    const [resolved, previewRules, factBoundary] = await Promise.all([
      this.resolver.resolve({
        styleProfileId: input.styleProfileId,
        novelId: input.novelId,
        chapterId: input.chapterId,
        taskStyleProfileId: input.taskStyleProfileId,
      }),
      listPreviewAntiAiRules(input.previewAntiAiRuleIds),
      this.resolveFactBoundary(input),
    ]);
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
        ...(factBoundary.factContextText ? { factContextText: factBoundary.factContextText } : {}),
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
      protectedTerms: factBoundary.protectedTerms,
    });
    return { content: protectedResult.content, report, rewriteGuard: protectedResult.guard };
  }
}
