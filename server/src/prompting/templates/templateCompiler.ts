import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { PromptRenderContext } from "../core/promptTypes";
import { formatContextGroupLabel } from "../context/contextGroupLabels";
import type { PromptSlotDef, ResolvedSlots } from "../slots/slotTypes";
import type {
  PromptTemplateContextRefs,
  PromptTemplateDiagnostics,
  PromptTemplateJson,
  PromptTemplateMessage,
} from "./templateTypes";
import { ADVANCED_TEMPLATE_MAX_CHARS, WRITER_REQUIRED_CONTEXT_GROUPS } from "./templateTypes";

const TOKEN_PATTERN = /\{\{\s*([^\s{}]+(?:\.[^\s{}]+)+)\s*\}\}/g;
const BRACE_TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

const EMPTY_DIAGNOSTICS: PromptTemplateDiagnostics = {
  referencedContextGroups: [],
  referencedInputFields: [],
  referencedSlotKeys: [],
  fallbackRequiredGroups: [],
  missingRequiredGroups: [],
  missingReferencedContextGroups: [],
  missingInputFields: [],
  unknownTokens: [],
  invalidMessages: [],
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function cloneDiagnostics(input?: Partial<PromptTemplateDiagnostics>): PromptTemplateDiagnostics {
  return {
    referencedContextGroups: unique(input?.referencedContextGroups ?? []),
    referencedInputFields: unique(input?.referencedInputFields ?? []),
    referencedSlotKeys: unique(input?.referencedSlotKeys ?? []),
    fallbackRequiredGroups: unique(input?.fallbackRequiredGroups ?? []),
    missingRequiredGroups: unique(input?.missingRequiredGroups ?? []),
    missingReferencedContextGroups: unique(input?.missingReferencedContextGroups ?? []),
    missingInputFields: unique(input?.missingInputFields ?? []),
    unknownTokens: unique(input?.unknownTokens ?? []),
    invalidMessages: unique(input?.invalidMessages ?? []),
  };
}

export function createEmptyPromptTemplateDiagnostics(): PromptTemplateDiagnostics {
  return cloneDiagnostics(EMPTY_DIAGNOSTICS);
}

function appendDiagnostic(
  diagnostics: PromptTemplateDiagnostics,
  key: keyof PromptTemplateDiagnostics,
  value: string,
): void {
  if (!value || diagnostics[key].includes(value)) {
    return;
  }
  diagnostics[key].push(value);
}

function tokenParts(token: string): { namespace: string; key: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return null;
  }
  return {
    namespace: token.slice(0, dot),
    key: token.slice(dot + 1),
  };
}

function collectBraceTokens(template: PromptTemplateJson): string[] {
  if (!template || !Array.isArray(template.messages)) {
    return [];
  }
  const tokens: string[] = [];
  for (const message of template.messages) {
    const content = typeof message.content === "string" ? message.content : "";
    for (const match of content.matchAll(BRACE_TOKEN_PATTERN)) {
      tokens.push(match[1].trim());
    }
  }
  return tokens;
}

function isKnownTokenNamespace(namespace: string): boolean {
  return namespace === "context" || namespace === "input" || namespace === "slot";
}

function collectMalformedTokens(template: PromptTemplateJson): string[] {
  return collectBraceTokens(template).filter((raw) => {
    const parsed = tokenParts(raw);
    return !parsed || !isKnownTokenNamespace(parsed.namespace);
  });
}

function getPathValue(source: unknown, path: string): unknown {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function stringifyInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function groupContextBlocks(context: PromptRenderContext): Map<string, string> {
  const grouped = new Map<string, string[]>();
  for (const block of context.blocks) {
    const content = block.content.trim();
    if (!content) {
      continue;
    }
    const list = grouped.get(block.group) ?? [];
    list.push(content);
    grouped.set(block.group, list);
  }
  return new Map([...grouped.entries()].map(([group, blocks]) => [group, blocks.join("\n\n")]));
}

function resolveDefaultSlot(def: PromptSlotDef): string {
  if (def.kind === "choice") {
    return def.options.find((option) => option.value === def.default)?.copy ?? "";
  }
  if (def.kind === "toggle") {
    return def.default ? def.copy : "";
  }
  return String((def as { default: string | boolean }).default ?? "");
}

function resolveSlotValue(key: string, slotDefs: PromptSlotDef[], slots?: ResolvedSlots): string | undefined {
  const def = slotDefs.find((item) => item.key === key);
  if (!def) {
    return undefined;
  }
  if (!slots) {
    return resolveDefaultSlot(def);
  }
  if (def.kind === "choice") {
    return slots.choiceCopy(key) || resolveDefaultSlot(def);
  }
  if (def.kind === "toggle") {
    return slots.enabled(key) ? def.copy : "";
  }
  if (def.kind === "token") {
    return slots.token(key) || resolveDefaultSlot(def);
  }
  if (def.kind === "append") {
    return slots.append(key);
  }
  return slots.text(key) || resolveDefaultSlot(def);
}

function validateTemplateShape(template: PromptTemplateJson): string[] {
  const errors: string[] = [];
  if (!template || template.kind !== "chat" || !Array.isArray(template.messages)) {
    return ["模板必须是 chat messages 结构。"];
  }
  const totalChars = template.messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0);
  if (totalChars > ADVANCED_TEMPLATE_MAX_CHARS) {
    errors.push(`模板不能超过 ${ADVANCED_TEMPLATE_MAX_CHARS} 个字符。`);
  }
  const systemCount = template.messages.filter((message) => message.role === "system").length;
  const humanCount = template.messages.filter((message) => message.role === "human").length;
  if (systemCount !== 1) {
    errors.push("模板必须包含一个 system 消息。");
  }
  if (humanCount !== 1) {
    errors.push("模板必须包含一个 human 消息。");
  }
  for (const message of template.messages) {
    if (message.role !== "system" && message.role !== "human") {
      errors.push(`不支持的消息角色：${String(message.role)}。`);
    }
    if (typeof message.content !== "string" || message.content.trim().length === 0) {
      errors.push(`${message.role} 模板不能为空。`);
    }
  }
  return unique(errors);
}

function toBaseMessage(message: PromptTemplateMessage): BaseMessage {
  if (message.role === "system") {
    return new SystemMessage(message.content);
  }
  return new HumanMessage(message.content);
}

function renderFallbackRequiredContext(input: {
  groups: string[];
  contextByGroup: Map<string, string>;
  diagnostics: PromptTemplateDiagnostics;
}): string {
  const sections: string[] = [];
  for (const group of input.groups) {
    const content = input.contextByGroup.get(group)?.trim();
    if (!content) {
      appendDiagnostic(input.diagnostics, "missingRequiredGroups", group);
      continue;
    }
    sections.push(`【${formatContextGroupLabel(group)}】\n${content}`);
  }
  if (sections.length === 0) {
    return "";
  }
  return ["", "", "【必需上下文保底】", ...sections].join("\n");
}

export function extractPromptTemplateContextRefs(template: PromptTemplateJson): PromptTemplateContextRefs {
  const refs: PromptTemplateContextRefs = {
    context: [],
    input: [],
    slot: [],
  };
  if (!template || !Array.isArray(template.messages)) {
    return refs;
  }
  for (const message of template.messages) {
    const content = typeof message.content === "string" ? message.content : "";
    for (const match of content.matchAll(TOKEN_PATTERN)) {
      const token = tokenParts(match[1]);
      if (!token) {
        continue;
      }
      if (token.namespace === "context") refs.context.push(token.key);
      if (token.namespace === "input") refs.input.push(token.key);
      if (token.namespace === "slot") refs.slot.push(token.key);
    }
  }
  return {
    context: unique(refs.context),
    input: unique(refs.input),
    slot: unique(refs.slot),
  };
}

export function assertPromptTemplateIsSavable(input: {
  template: PromptTemplateJson;
  allowedContextGroups: string[];
  slotDefs: PromptSlotDef[];
}): PromptTemplateDiagnostics {
  const diagnostics = createEmptyPromptTemplateDiagnostics();
  diagnostics.invalidMessages.push(...validateTemplateShape(input.template));
  const allowedContextGroups = new Set(input.allowedContextGroups);
  const slotKeys = new Set(input.slotDefs.map((slot) => slot.key));
  const refs = extractPromptTemplateContextRefs(input.template);
  diagnostics.referencedContextGroups.push(...refs.context);
  diagnostics.referencedInputFields.push(...refs.input);
  diagnostics.referencedSlotKeys.push(...refs.slot);

  for (const token of collectMalformedTokens(input.template)) {
    appendDiagnostic(diagnostics, "unknownTokens", token);
  }

  for (const group of refs.context) {
    if (!allowedContextGroups.has(group)) {
      appendDiagnostic(diagnostics, "unknownTokens", `context.${group}`);
    }
  }
  for (const key of refs.slot) {
    if (!slotKeys.has(key)) {
      appendDiagnostic(diagnostics, "unknownTokens", `slot.${key}`);
    }
  }
  return cloneDiagnostics(diagnostics);
}

export function compilePromptTemplate(input: {
  template: PromptTemplateJson;
  promptInput: unknown;
  context: PromptRenderContext;
  slotDefs: PromptSlotDef[];
  slots?: ResolvedSlots;
  allowedContextGroups: string[];
  requiredContextGroups?: string[];
}): {
  messages: BaseMessage[];
  diagnostics: PromptTemplateDiagnostics;
} {
  const diagnostics = createEmptyPromptTemplateDiagnostics();
  diagnostics.invalidMessages.push(...validateTemplateShape(input.template));
  const contextByGroup = groupContextBlocks(input.context);
  const allowedContextGroups = new Set(input.allowedContextGroups);
  const slotKeys = new Set(input.slotDefs.map((slot) => slot.key));
  const requiredGroups = input.requiredContextGroups?.length
    ? input.requiredContextGroups
    : [...WRITER_REQUIRED_CONTEXT_GROUPS];
  const referencedContextGroups = new Set<string>();
  for (const token of collectMalformedTokens(input.template)) {
    appendDiagnostic(diagnostics, "unknownTokens", token);
  }

  function replaceToken(raw: string): string {
    const parsed = tokenParts(raw);
    if (!parsed) {
      appendDiagnostic(diagnostics, "unknownTokens", raw);
      return "";
    }
    if (parsed.namespace === "context") {
      referencedContextGroups.add(parsed.key);
      appendDiagnostic(diagnostics, "referencedContextGroups", parsed.key);
      if (!allowedContextGroups.has(parsed.key)) {
        appendDiagnostic(diagnostics, "unknownTokens", `context.${parsed.key}`);
        return "";
      }
      const content = contextByGroup.get(parsed.key);
      if (!content) {
        appendDiagnostic(diagnostics, "missingReferencedContextGroups", parsed.key);
        if (requiredGroups.includes(parsed.key)) {
          appendDiagnostic(diagnostics, "missingRequiredGroups", parsed.key);
        }
      }
      return content ?? "";
    }
    if (parsed.namespace === "input") {
      appendDiagnostic(diagnostics, "referencedInputFields", parsed.key);
      const value = getPathValue(input.promptInput, parsed.key);
      if (value === undefined) {
        appendDiagnostic(diagnostics, "missingInputFields", parsed.key);
      }
      return stringifyInputValue(value);
    }
    if (parsed.namespace === "slot") {
      appendDiagnostic(diagnostics, "referencedSlotKeys", parsed.key);
      if (!slotKeys.has(parsed.key)) {
        appendDiagnostic(diagnostics, "unknownTokens", `slot.${parsed.key}`);
        return "";
      }
      return resolveSlotValue(parsed.key, input.slotDefs, input.slots) ?? "";
    }
    appendDiagnostic(diagnostics, "unknownTokens", raw);
    return "";
  }

  const renderedTemplate: PromptTemplateJson = {
    kind: "chat",
    messages: input.template.messages.map((message) => ({
      role: message.role,
      content: String(message.content ?? "").replace(TOKEN_PATTERN, (_match, token) => replaceToken(String(token))).trim(),
    })),
  };

  const fallbackGroups = requiredGroups.filter((group) => !referencedContextGroups.has(group));
  diagnostics.fallbackRequiredGroups.push(...fallbackGroups);
  const humanIndex = renderedTemplate.messages.findIndex((message) => message.role === "human");
  if (humanIndex >= 0) {
    renderedTemplate.messages[humanIndex] = {
      ...renderedTemplate.messages[humanIndex],
      content: renderedTemplate.messages[humanIndex].content + renderFallbackRequiredContext({
        groups: fallbackGroups,
        contextByGroup,
        diagnostics,
      }),
    };
  }

  for (const group of requiredGroups) {
    if (!contextByGroup.has(group)) {
      appendDiagnostic(diagnostics, "missingRequiredGroups", group);
    }
  }

  return {
    messages: renderedTemplate.messages.map(toBaseMessage),
    diagnostics: cloneDiagnostics(diagnostics),
  };
}

export function hasBlockingPromptTemplateDiagnostics(diagnostics: PromptTemplateDiagnostics): boolean {
  return diagnostics.invalidMessages.length > 0
    || diagnostics.unknownTokens.length > 0
    || diagnostics.missingRequiredGroups.length > 0;
}
