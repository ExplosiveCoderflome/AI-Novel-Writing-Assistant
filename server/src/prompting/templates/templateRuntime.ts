import type { BaseMessage } from "@langchain/core/messages";
import type { PromptAsset, PromptRenderContext } from "../core/promptTypes";
import { compilePromptTemplate, hasBlockingPromptTemplateDiagnostics } from "./templateCompiler";
import { promptTemplateOverrideService } from "./PromptTemplateOverrideService";
import { ADVANCED_TEMPLATE_PROMPT_ID, WRITER_REQUIRED_CONTEXT_GROUPS } from "./templateTypes";

function getAllowedTemplateContextGroups(asset: PromptAsset<unknown, unknown, unknown>): string[] {
  return [
    ...new Set([
      ...(asset.contextRequirements ?? []).map((requirement) => requirement.group),
      ...(asset.contextPolicy.requiredGroups ?? []),
      ...(asset.contextPolicy.preferredGroups ?? []),
      ...(asset.contextPolicy.dropOrder ?? []),
    ]),
  ];
}

export async function resolveAdvancedTextPromptMessages<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  context: PromptRenderContext;
  officialMessages: BaseMessage[];
  novelId?: string;
}): Promise<BaseMessage[]> {
  if (input.asset.id !== ADVANCED_TEMPLATE_PROMPT_ID || !input.novelId) {
    return input.officialMessages;
  }
  const activeTemplate = await promptTemplateOverrideService.getActiveCustomTemplate({
    promptId: input.asset.id,
    novelId: input.novelId,
  });
  if (!activeTemplate) {
    return input.officialMessages;
  }
  const compiled = compilePromptTemplate({
    template: activeTemplate.template,
    promptInput: input.promptInput,
    context: input.context,
    slotDefs: input.asset.slots ?? [],
    slots: input.context.slots,
    allowedContextGroups: getAllowedTemplateContextGroups(input.asset as PromptAsset<unknown, unknown, unknown>),
    requiredContextGroups: [...WRITER_REQUIRED_CONTEXT_GROUPS],
  });
  if (hasBlockingPromptTemplateDiagnostics(compiled.diagnostics)) {
    const details = [
      compiled.diagnostics.invalidMessages.join("；"),
      compiled.diagnostics.unknownTokens.length > 0
        ? `未知 token：${compiled.diagnostics.unknownTokens.join("、")}`
        : "",
      compiled.diagnostics.missingRequiredGroups.length > 0
        ? `缺少必需上下文组：${compiled.diagnostics.missingRequiredGroups.join("、")}`
        : "",
    ].filter(Boolean).join("；");
    throw new Error(`正文写作高级模板渲染失败：${details}`);
  }
  return compiled.messages;
}
