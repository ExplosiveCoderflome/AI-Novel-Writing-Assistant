import type { ChapterAcceptanceAssessmentInput } from "../../../../../services/novel/runtime/ChapterAcceptanceAssessmentService";
import type { ChapterPatchRepairInput } from "../../../../../services/novel/chapterPatchRepairService";
import type { PromptExecutionContext } from "../../../../../prompting/context/types";
import type { PromptContextBlock } from "../../../../../prompting/core/promptTypes";
import { chapterAcceptanceAssessmentPrompt, resolveChapterAcceptanceOutputTokens } from "../../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import { chapterPatchRepairPrompt } from "../../../../../prompting/prompts/novel/chapterPatchRepair.prompts";
import { buildChapterReviewContextBlocks, buildChapterPatchRepairContextBlocks } from "../../../../../prompting/prompts/novel/chapterLayeredContext";
import { isStyleIssueRewritable } from "@ai-novel/shared/types/styleEngine";
import { applyAcceptanceStyleContext, buildAcceptanceStyleSignals, getAcceptanceNarrativePov,
  getAcceptanceStyleRuleIds, isAcceptanceStyleReviewEnabled } from "../../../../../services/novel/runtime/acceptance/styleReview";

export type AcceptancePromptContextResolver = (input: {asset: typeof chapterAcceptanceAssessmentPrompt;
  executionContext: PromptExecutionContext; fallbackBlocks: PromptContextBlock[]}) => Promise<{blocks: PromptContextBlock[]}>;

/** Approved G1 isolation: only native request construction. No evaluation, retry, cache, patch application or writes. */
export async function buildKernelAcceptancePromptRequest(input: ChapterAcceptanceAssessmentInput, resolveContext: AcceptancePromptContextResolver) {
  const fallbackBlocks = input.contextPackage.chapterReviewContext ? buildChapterReviewContextBlocks(input.contextPackage.chapterReviewContext) : [];
  const resolved = await resolveContext({asset:chapterAcceptanceAssessmentPrompt,executionContext:{
    entrypoint:"chapter_pipeline",novelId:input.novelId,chapterId:input.chapterId,
    metadata:{chapterReviewContext:input.contextPackage.chapterReviewContext},
  },fallbackBlocks:applyAcceptanceStyleContext(input.contextPackage,fallbackBlocks)});
  return {asset:chapterAcceptanceAssessmentPrompt,promptInput:{
    novelTitle:input.novelTitle,chapterOrder:input.chapterOrder,chapterTitle:input.chapterTitle,targetWordCount:input.targetWordCount ?? null,
    content:input.content,previousChapterContent:input.contextPackage.previousChapterContent,
    styleReviewEnabled:isAcceptanceStyleReviewEnabled(input.contextPackage),styleRuleIds:getAcceptanceStyleRuleIds(input.contextPackage),
    expectedNarrativePov:getAcceptanceNarrativePov(input.contextPackage),repairReviewBaseline:input.repairReviewBaseline,
    styleRewriteBaseline:input.styleRewriteBaseline,styleSignals:buildAcceptanceStyleSignals(input.contextPackage,input.content),
  },contextBlocks:applyAcceptanceStyleContext(input.contextPackage,resolved.blocks),options:{
    provider:input.provider,model:input.model,temperature:Math.min(input.temperature ?? 0.2,0.35),
    maxTokens:resolveChapterAcceptanceOutputTokens(input),novelId:input.novelId,chapterId:input.chapterId,
    stage:"chapter_acceptance",triggerReason:"chapter_acceptance_assessment",
  }};
}

export function buildKernelPatchPromptRequest(input: ChapterPatchRepairInput) {
  const repairContext = input.repairContext ?? input.runtimePackage?.context.chapterRepairContext;
  const issuesJson = input.issuesJson ?? JSON.stringify(input.issues);
  const styleIssues = input.runtimePackage?.styleReview?.report?.violations ?? [];
  const styleIds = new Set(styleIssues.map(issue=>issue.issueCode).filter((id): id is string=>Boolean(id)));
  const allowedStyleIds = styleIssues.filter(issue=>isStyleIssueRewritable(issue)).map(issue=>issue.issueCode).filter((id): id is string=>Boolean(id));
  const nonStyleIds = (input.runtimePackage?.audit.openIssues ?? []).filter(issue=>!styleIds.has(issue.code ?? ""))
    .flatMap(issue=>[issue.id,issue.code].filter((id): id is string=>Boolean(id)));
  const obligationIds = (input.runtimePackage?.obligationCoverage?.missing ?? []).map(item=>`${item.kind}:${item.summary}`);
  const allowedIssueIds = [...new Set([...allowedStyleIds,...nonStyleIds,...obligationIds])];
  const protectedTerms = repairContext?.writeContext.characterHardFacts?.map(item=>item.name) ?? [];
  return {asset:chapterPatchRepairPrompt,promptInput:{
    novelTitle:input.novelTitle,chapterTitle:input.chapterTitle,chapterContent:input.content,issuesJson,modeHint:input.modeHint,
    styleProtection:styleIssues.length ? JSON.stringify({allowedIssueIds,styleIssueIds:allowedStyleIds,
      reportOnly:styleIssues.filter(issue=>!isStyleIssueRewritable(issue)),protectedTerms,
      wholeChapterTouchedRatioMax:0.3,wholeChapterAddedRatioMax:0.05}) : undefined,
  },contextBlocks:repairContext ? buildChapterPatchRepairContextBlocks(repairContext,issuesJson) : undefined,
  options:{provider:input.provider,model:input.model,temperature:Math.min(input.temperature ?? 0.35,0.45),maxTokens:4200,
    novelId:input.novelId,chapterId:input.chapterId,stage:"chapter_patch",triggerReason:input.repairMode ?? "patch_first"},
  };
}
