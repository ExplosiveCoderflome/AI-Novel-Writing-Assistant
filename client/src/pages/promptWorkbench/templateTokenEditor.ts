import type { Descendant, Value } from "platejs";
import type { PromptTemplateReferenceCatalog, PromptTemplateReferenceItem } from "@/api/promptWorkbench";
import { CONTEXT_GROUP_LABELS } from "./promptWorkbenchLabels.ts";

export const PROMPT_TOKEN_ELEMENT_TYPE = "prompt-token";
export const PROMPT_TOKEN_PARAGRAPH_TYPE = "p";

export type PromptTemplateTokenKind = "context" | "input" | "slot" | "unknown";

export interface PromptTemplateTokenNode {
  type: typeof PROMPT_TOKEN_ELEMENT_TYPE;
  kind: PromptTemplateTokenKind;
  key: string;
  token: string;
  label: string;
  description?: string;
  referenceGroup?: PromptTemplateReferenceItem["group"];
  required?: boolean;
  hasPreviewBlock?: boolean;
  unknown?: boolean;
  children: [{ text: "" }];
}

export interface PromptTemplateParagraphNode {
  type: typeof PROMPT_TOKEN_PARAGRAPH_TYPE;
  children: Array<{ text: string } | PromptTemplateTokenNode>;
}

export type PromptTemplateEditorValue = PromptTemplateParagraphNode[];

const TEMPLATE_TOKEN_PATTERN = /\{\{\s*([a-zA-Z_][\w-]*)\.([^{}]+?)\s*\}\}/g;

function normalizeTokenKey(rawKey: string) {
  return rawKey.trim();
}

export function parseTemplateToken(rawToken: string): {
  kind: PromptTemplateTokenKind;
  key: string;
} | null {
  const match = rawToken.match(/^\{\{\s*([a-zA-Z_][\w-]*)\.([^{}]+?)\s*\}\}$/);
  if (!match) {
    return null;
  }
  const namespace = match[1];
  const key = normalizeTokenKey(match[2]);
  if (namespace === "context" || namespace === "input" || namespace === "slot") {
    return { kind: namespace, key };
  }
  return { kind: "unknown", key: `${namespace}.${key}` };
}

export function buildTemplateReferenceMap(
  catalog: PromptTemplateReferenceCatalog | null | undefined,
): Map<string, PromptTemplateReferenceItem> {
  const references = new Map<string, PromptTemplateReferenceItem>();
  for (const item of catalog?.items ?? []) {
    references.set(item.token, item);
  }
  return references;
}

export function labelTemplateToken(input: {
  kind: PromptTemplateTokenKind;
  key: string;
  reference?: PromptTemplateReferenceItem;
}): string {
  const { key, kind, reference } = input;
  if (kind === "context") {
    return CONTEXT_GROUP_LABELS[key] ?? reference?.label ?? key;
  }
  if (reference?.label) {
    return reference.label;
  }
  return key;
}

export function labelTemplateReferenceItem(item: PromptTemplateReferenceItem): string {
  const parsed = parseTemplateToken(item.token);
  const kind = parsed?.kind ?? (item.group === "input" || item.group === "slot" ? item.group : "context");
  const key = parsed?.key ?? item.key;
  return labelTemplateToken({ kind, key, reference: item });
}

function createTokenNode(
  rawToken: string,
  references: Map<string, PromptTemplateReferenceItem>,
  hasReferenceCatalog: boolean,
): PromptTemplateTokenNode {
  const parsed = parseTemplateToken(rawToken);
  const reference = references.get(rawToken);
  const kind = parsed?.kind ?? "unknown";
  const key = parsed?.key ?? rawToken;
  const unknown = kind === "unknown" || (hasReferenceCatalog && !reference);

  return {
    type: PROMPT_TOKEN_ELEMENT_TYPE,
    kind,
    key,
    token: rawToken,
    label: labelTemplateToken({ kind, key, reference }),
    description: reference?.description,
    referenceGroup: reference?.group,
    required: reference?.required,
    hasPreviewBlock: reference?.hasPreviewBlock,
    unknown,
    children: [{ text: "" }],
  };
}

function parseLineToChildren(
  line: string,
  references: Map<string, PromptTemplateReferenceItem>,
  hasReferenceCatalog: boolean,
): PromptTemplateParagraphNode["children"] {
  const children: PromptTemplateParagraphNode["children"] = [];
  let cursor = 0;
  TEMPLATE_TOKEN_PATTERN.lastIndex = 0;

  for (const match of line.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      children.push({ text: line.slice(cursor, index) });
    }
    children.push(createTokenNode(match[0], references, hasReferenceCatalog));
    cursor = index + match[0].length;
  }

  if (cursor < line.length) {
    children.push({ text: line.slice(cursor) });
  }
  if (children.length === 0) {
    children.push({ text: "" });
  }
  return children;
}

export function parseTemplateToEditorValue(
  text: string,
  catalog?: PromptTemplateReferenceCatalog | null,
): PromptTemplateEditorValue {
  const references = buildTemplateReferenceMap(catalog);
  const hasReferenceCatalog = Boolean(catalog);
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [""];
  return lines.map((line) => ({
    type: PROMPT_TOKEN_PARAGRAPH_TYPE,
    children: parseLineToChildren(line, references, hasReferenceCatalog),
  })) as PromptTemplateEditorValue;
}

function nodeToTemplateText(node: Descendant): string {
  if ("text" in node && typeof node.text === "string") {
    return node.text;
  }
  if ("type" in node && node.type === PROMPT_TOKEN_ELEMENT_TYPE) {
    const token = (node as Partial<PromptTemplateTokenNode>).token;
    return typeof token === "string" ? token : "";
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => nodeToTemplateText(child as Descendant)).join("");
  }
  return "";
}

export function serializeEditorValueToTemplate(value: Value | PromptTemplateEditorValue): string {
  return (value as Descendant[]).map((node) => nodeToTemplateText(node)).join("\n");
}

export function createTemplateTokenNode(
  item: PromptTemplateReferenceItem,
): PromptTemplateTokenNode {
  const parsed = parseTemplateToken(item.token);
  const kind = parsed?.kind ?? "unknown";
  const key = parsed?.key ?? item.key;
  return {
    type: PROMPT_TOKEN_ELEMENT_TYPE,
    kind,
    key,
    token: item.token,
    label: labelTemplateToken({ kind, key, reference: item }),
    description: item.description,
    referenceGroup: item.group,
    required: item.required,
    hasPreviewBlock: item.hasPreviewBlock,
    unknown: false,
    children: [{ text: "" }],
  };
}

export function normalizeEditorValuePayload(payload: unknown): Value {
  if (Array.isArray(payload)) {
    return payload as Value;
  }
  if (payload && typeof payload === "object" && "value" in payload) {
    const value = (payload as { value?: unknown }).value;
    if (Array.isArray(value)) {
      return value as Value;
    }
  }
  return [];
}
