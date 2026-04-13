import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset, PromptRenderContext } from "./promptTypes";

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_ARRAY_ITEM_COUNT = 1;
const MAX_EXACT_ARRAY_EXAMPLE_ITEMS = 2;
const MANUAL_STRUCTURED_HINT_PATTERNS = [
  "输出结构必须严格为",
  "json 结构必须严格为",
  "json 结构：",
  "结构固定如下",
  "输出格式必须严格为",
  "结构只能是 {",
];

type AnySchema = z.ZodType<unknown>;

function tryUnwrapSchema(schema: AnySchema): AnySchema | null {
  const candidate = schema as AnySchema & {
    unwrap?: () => AnySchema;
    removeDefault?: () => AnySchema;
    _def?: {
      innerType?: AnySchema;
      schema?: AnySchema;
      out?: AnySchema;
      getter?: () => AnySchema;
    };
  };

  if (typeof candidate.unwrap === "function") {
    return candidate.unwrap();
  }
  if (typeof candidate.removeDefault === "function") {
    return candidate.removeDefault();
  }
  if (candidate._def?.innerType) {
    return candidate._def.innerType;
  }
  if (candidate._def?.schema) {
    return candidate._def.schema;
  }
  if (candidate._def?.out) {
    return candidate._def.out;
  }
  if (typeof candidate._def?.getter === "function") {
    return candidate._def.getter();
  }

  return null;
}

function unwrapSchema(schema: AnySchema): AnySchema {
  let current = schema;
  let guard = 0;

  while (guard < 16) {
    guard += 1;
    const next = tryUnwrapSchema(current);
    if (!next || next === current) {
      return current;
    }
    current = next;
  }

  return current;
}

function resolveArrayExampleLength(schema: AnySchema): number {
  const exactLength = (schema as AnySchema & {
    _def?: {
      exactLength?: {
        value?: number;
      };
    };
  })._def?.exactLength?.value;

  if (typeof exactLength === "number") {
    return Math.max(0, Math.min(MAX_EXACT_ARRAY_EXAMPLE_ITEMS, exactLength));
  }

  return DEFAULT_ARRAY_ITEM_COUNT;
}

function cloneExample<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneExample(item)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, cloneExample(nestedValue)]),
  ) as T;
}

function buildDepthFallback(schema: AnySchema): unknown {
  if (schema instanceof z.ZodArray) {
    return [];
  }
  if (schema instanceof z.ZodObject || schema instanceof z.ZodRecord) {
    return {};
  }
  return "示例值";
}

function buildNativeEnumExample(schema: AnySchema): string | number {
  const enumRecord = (schema as AnySchema & { enum?: Record<string, string | number> }).enum;
  const values = Object.values(enumRecord ?? {}).filter((value) => typeof value === "string" || typeof value === "number");
  const preferred = values.find((value) => typeof value === "string") ?? values[0];
  return preferred ?? "示例枚举值";
}

function buildObjectExample(
  schema: z.ZodObject<z.ZodRawShape>,
  depth: number,
  seen: Set<AnySchema>,
): Record<string, unknown> {
  const shapeSource = schema as z.ZodObject<z.ZodRawShape> & {
    shape: z.ZodRawShape | (() => z.ZodRawShape);
  };
  const rawShape = typeof shapeSource.shape === "function" ? shapeSource.shape() : shapeSource.shape;
  return Object.fromEntries(
    Object.keys(rawShape).map((key) => [key, buildExampleFromSchema(rawShape[key] as AnySchema, depth + 1, seen)]),
  );
}

function buildRecordExample(schema: AnySchema, depth: number, seen: Set<AnySchema>): Record<string, unknown> {
  const valueSchema = (schema as AnySchema & {
    _def?: {
      valueType?: AnySchema;
      valueSchema?: AnySchema;
    };
  })._def?.valueType ?? (schema as AnySchema & {
    _def?: {
      valueType?: AnySchema;
      valueSchema?: AnySchema;
    };
  })._def?.valueSchema;

  return {
    exampleKey: valueSchema ? buildExampleFromSchema(valueSchema, depth + 1, seen) : "示例值",
  };
}

function buildMapExample(schema: AnySchema, depth: number, seen: Set<AnySchema>): unknown[] {
  const valueSchema = (schema as AnySchema & {
    _def?: {
      valueType?: AnySchema;
      value?: AnySchema;
    };
  })._def?.valueType ?? (schema as AnySchema & {
    _def?: {
      valueType?: AnySchema;
      value?: AnySchema;
    };
  })._def?.value;

  return [["exampleKey", valueSchema ? buildExampleFromSchema(valueSchema, depth + 1, seen) : "示例值"]];
}

function buildSetExample(schema: AnySchema, depth: number, seen: Set<AnySchema>): unknown[] {
  const valueSchema = (schema as AnySchema & {
    _def?: {
      valueType?: AnySchema;
      type?: AnySchema;
    };
  })._def?.valueType ?? (schema as AnySchema & {
    _def?: {
      valueType?: AnySchema;
      type?: AnySchema;
    };
  })._def?.type;

  return [valueSchema ? buildExampleFromSchema(valueSchema, depth + 1, seen) : "示例值"];
}

function buildTupleExample(schema: AnySchema, depth: number, seen: Set<AnySchema>): unknown[] {
  const tupleItems = (schema as AnySchema & {
    items?: AnySchema[];
    _def?: {
      items?: AnySchema[];
    };
  }).items ?? (schema as AnySchema & {
    items?: AnySchema[];
    _def?: {
      items?: AnySchema[];
    };
  })._def?.items ?? [];

  return tupleItems.map((item) => buildExampleFromSchema(item, depth + 1, seen));
}

function buildUnionExample(schema: AnySchema, depth: number, seen: Set<AnySchema>): unknown {
  const options = (schema as AnySchema & {
    options?: AnySchema[];
    _def?: {
      options?: AnySchema[];
    };
  }).options ?? (schema as AnySchema & {
    options?: AnySchema[];
    _def?: {
      options?: AnySchema[];
    };
  })._def?.options ?? [];

  const [firstOption] = options;
  return firstOption ? buildExampleFromSchema(firstOption, depth + 1, seen) : "示例值";
}

function buildDiscriminatedUnionExample(schema: AnySchema, depth: number, seen: Set<AnySchema>): unknown {
  const options = (schema as AnySchema & {
    options?: Map<string, AnySchema> | Set<AnySchema> | AnySchema[];
    _def?: {
      options?: Map<string, AnySchema> | Set<AnySchema> | AnySchema[];
    };
  }).options ?? (schema as AnySchema & {
    options?: Map<string, AnySchema> | Set<AnySchema> | AnySchema[];
    _def?: {
      options?: Map<string, AnySchema> | Set<AnySchema> | AnySchema[];
    };
  })._def?.options;

  const normalizedOptions = options instanceof Map
    ? [...options.values()]
    : options instanceof Set
      ? [...options.values()]
      : Array.isArray(options)
        ? options
        : [];

  const [firstOption] = normalizedOptions;
  return firstOption ? buildExampleFromSchema(firstOption, depth + 1, seen) : {};
}

function buildExampleFromSchema(
  schema: AnySchema,
  depth = 0,
  seen = new Set<AnySchema>(),
): unknown {
  const current = unwrapSchema(schema);

  if (depth >= DEFAULT_MAX_DEPTH || seen.has(current)) {
    return buildDepthFallback(current);
  }

  seen.add(current);

  try {
    if (current instanceof z.ZodObject) {
      return buildObjectExample(current as z.ZodObject<z.ZodRawShape>, depth, seen);
    }
    if (current instanceof z.ZodArray) {
      const itemExample = buildExampleFromSchema(current.element as AnySchema, depth + 1, seen);
      return Array.from({ length: resolveArrayExampleLength(current as AnySchema) }, () => cloneExample(itemExample));
    }
    if (current instanceof z.ZodTuple) {
      return buildTupleExample(current as AnySchema, depth, seen);
    }
    if (current instanceof z.ZodRecord) {
      return buildRecordExample(current as AnySchema, depth, seen);
    }
    if (current instanceof z.ZodMap) {
      return buildMapExample(current as AnySchema, depth, seen);
    }
    if (current instanceof z.ZodSet) {
      return buildSetExample(current as AnySchema, depth, seen);
    }
    if (current instanceof z.ZodDiscriminatedUnion) {
      return buildDiscriminatedUnionExample(current as AnySchema, depth, seen);
    }
    if (current instanceof z.ZodUnion) {
      return buildUnionExample(current as AnySchema, depth, seen);
    }
    if (current instanceof z.ZodLiteral) {
      return (current as AnySchema & { value?: unknown; _def?: { value?: unknown } }).value
        ?? (current as AnySchema & { value?: unknown; _def?: { value?: unknown } })._def?.value
        ?? "示例值";
    }
    if (current instanceof z.ZodEnum) {
      const options = (current as AnySchema & { options?: string[] }).options ?? [];
      return options[0] ?? "示例枚举值";
    }
    if ((current as AnySchema & { enum?: Record<string, string | number> }).enum) {
      return buildNativeEnumExample(current);
    }
    if (current instanceof z.ZodString) {
      return "示例文本";
    }
    if (current instanceof z.ZodNumber) {
      return 1;
    }
    if (current instanceof z.ZodBigInt) {
      return 1;
    }
    if (current instanceof z.ZodBoolean) {
      return true;
    }
    if (current instanceof z.ZodDate) {
      return "2026-01-01T00:00:00.000Z";
    }
    if (current instanceof z.ZodNull) {
      return null;
    }
    if (current instanceof z.ZodUndefined || current instanceof z.ZodVoid) {
      return null;
    }
    if (current instanceof z.ZodAny || current instanceof z.ZodUnknown || current instanceof z.ZodNever) {
      return "示例值";
    }
    if (current instanceof z.ZodNaN) {
      return 0;
    }

    return "示例值";
  } finally {
    seen.delete(current);
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function readMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return JSON.stringify(content ?? "");
  }

  return content.map((part) => {
    if (typeof part === "string") {
      return part;
    }
    if (part && typeof part === "object" && "text" in part) {
      return typeof part.text === "string" ? part.text : JSON.stringify(part.text ?? "");
    }
    return JSON.stringify(part);
  }).join("");
}

function hasManualStructuredExample(messages: BaseMessage[]): boolean {
  const combinedText = messages
    .map((message) => readMessageContent(message.content))
    .join("\n")
    .toLowerCase();

  return MANUAL_STRUCTURED_HINT_PATTERNS.some((pattern) => combinedText.includes(pattern));
}

function resolveStructuredOutputExample<I, O, R>(
  asset: PromptAsset<I, O, R>,
  promptInput: I,
  context: PromptRenderContext,
): unknown {
  const customExample = asset.structuredOutputHint?.example;
  if (typeof customExample === "function") {
    return customExample(promptInput, context);
  }
  if (customExample !== undefined) {
    return customExample;
  }
  if (!asset.outputSchema) {
    return {};
  }
  return buildExampleFromSchema(asset.outputSchema as AnySchema);
}

function resolveStructuredOutputNote<I, O, R>(
  asset: PromptAsset<I, O, R>,
  promptInput: I,
  context: PromptRenderContext,
): string {
  const customNote = asset.structuredOutputHint?.note;
  if (typeof customNote === "function") {
    return customNote(promptInput, context) ?? "";
  }
  return customNote ?? "";
}

function buildStructuredOutputHintText(example: unknown, customNote: string): string {
  const noteLine = customNote.trim()
    ? `- ${customNote.trim()}`
    : "";

  return [
    "结构化输出骨架：",
    "- 下方 JSON 只用于演示字段名、层级、数组/对象位置与基础类型。",
    "- 所有占位内容都必须替换成符合当前任务的真实结果，不能原样照抄。",
    "- 如果任务正文里对数组数量、枚举取值、空数组、必填字段有更具体要求，以任务正文为准。",
    noteLine,
    "示例：",
    safeJsonStringify(example),
  ].filter(Boolean).join("\n");
}

export function appendStructuredOutputHintMessages<I, O, R>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  context: PromptRenderContext;
  messages: BaseMessage[];
}): BaseMessage[] {
  if (input.asset.mode !== "structured" || !input.asset.outputSchema) {
    return input.messages;
  }
  if (input.asset.structuredOutputHint?.mode === "off") {
    return input.messages;
  }
  if (hasManualStructuredExample(input.messages)) {
    return input.messages;
  }

  const example = resolveStructuredOutputExample(input.asset, input.promptInput, input.context);
  const note = resolveStructuredOutputNote(input.asset, input.promptInput, input.context);

  return [
    ...input.messages,
    new HumanMessage(buildStructuredOutputHintText(example, note)),
  ];
}
