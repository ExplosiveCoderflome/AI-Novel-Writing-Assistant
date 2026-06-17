import { createHash } from "node:crypto";
import { createContextBlock } from "../core/contextBudget";
import type {
  PromptSlotDef,
  PromptSlotDefChoiceOption,
  PromptSlotOverrideMap,
  ResolvedSlotOverlays,
  ResolvedSlots,
} from "./slotTypes";

export const CUSTOM_SLOT_CONTEXT_GROUP = "custom_slot";

export function hashSlotDefault(value: string | boolean): string {
  return createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
}

function getDefaultHash(def: PromptSlotDef): string {
  return hashSlotDefault(def.kind === "toggle" ? def.default : def.default);
}

export function resolvePromptOverlays(input: {
  slotDefs: PromptSlotDef[];
  globalOverrides: PromptSlotOverrideMap;
  novelOverrides: PromptSlotOverrideMap;
}): ResolvedSlotOverlays {
  const { slotDefs, globalOverrides, novelOverrides } = input;

  const mergedOverrides: PromptSlotOverrideMap = { ...globalOverrides };
  for (const [key, entry] of Object.entries(novelOverrides)) {
    mergedOverrides[key] = entry;
  }

  const drift: string[] = [];
  const resolvedValues: Record<string, string | boolean> = {};
  const appendBlocks = [];
  let appendIdx = 0;

  for (const def of slotDefs) {
    const override = mergedOverrides[def.key];
    const currentDefaultHash = getDefaultHash(def);

    if (override && override.baseHash !== currentDefaultHash) {
      drift.push(def.key);
    }

    const raw: string | boolean = override
      ? override.value
      : def.kind === "toggle"
        ? def.default
        : def.default;
    resolvedValues[def.key] = raw;

    if (def.kind === "append") {
      const text = typeof raw === "string" ? raw.trim() : "";
      if (text) {
        const isNovel = Boolean(novelOverrides[def.key]);
        const isGlobal = Boolean(globalOverrides[def.key]) && !isNovel;
        const scopeTag = isNovel
          ? "【本书文案调整】"
          : isGlobal
            ? "【全局文案调整】"
            : "【默认补充】";
        appendBlocks.push(
          createContextBlock({
            id: `custom_slot:${def.key}:${appendIdx}`,
            group: CUSTOM_SLOT_CONTEXT_GROUP,
            priority: isGlobal ? 999 - appendIdx : 899 - appendIdx,
            required: true,
            allowSummary: true,
            content: [scopeTag, def.label, text].join("\n"),
          }),
        );
        appendIdx++;
      }
    }
  }

  const inlineSlots: ResolvedSlots = {
    text(key: string): string {
      const val = resolvedValues[key];
      if (typeof val === "string") return val;
      const def = slotDefs.find((d) => d.key === key);
      if (def && def.kind !== "toggle") return String(def.default);
      return "";
    },
    choiceCopy(key: string): string {
      const def = slotDefs.find((d) => d.key === key && d.kind === "choice");
      if (!def || def.kind !== "choice") return "";
      const selectedValue = String(resolvedValues[key] ?? def.default);
      const option = def.options.find((o: PromptSlotDefChoiceOption) => o.value === selectedValue);
      return (
        option?.copy
        ?? def.options.find((o: PromptSlotDefChoiceOption) => o.value === def.default)?.copy
        ?? ""
      );
    },
    enabled(key: string): boolean {
      const val = resolvedValues[key];
      if (typeof val === "boolean") return val;
      const def = slotDefs.find((d) => d.key === key && d.kind === "toggle");
      return def && def.kind === "toggle" ? def.default : false;
    },
    token(key: string): string {
      const val = resolvedValues[key];
      if (typeof val === "string") return val;
      const def = slotDefs.find((d) => d.key === key && d.kind === "token");
      return def && def.kind === "token" ? def.default : "";
    },
    append(key: string): string {
      const val = resolvedValues[key];
      return typeof val === "string" ? val : "";
    },
  };

  return { inlineSlots, appendBlocks, drift };
}

export function validateSlotValue(def: PromptSlotDef, value: unknown): string | null {
  if (def.kind === "toggle") {
    if (typeof value !== "boolean") return `${def.label}：值必须为 true 或 false。`;
    return null;
  }

  if (typeof value !== "string") return `${def.label}：值必须为字符串。`;
  const str = value.trim();

  switch (def.kind) {
    case "replace": {
      if (!str) return `${def.label} 不能为空。`;
      if (str.length > def.maxLength) return `${def.label} 不得超过 ${def.maxLength} 字。`;
      if (def.requiredTokens) {
        for (const token of def.requiredTokens) {
          if (!str.includes(token)) return `${def.label} 必须包含"${token}"。`;
        }
      }
      return null;
    }
    case "append": {
      if (str.length > def.maxLength) return `${def.label} 不得超过 ${def.maxLength} 字。`;
      return null;
    }
    case "choice": {
      if (!def.options.some((o) => o.value === str)) {
        return `${def.label} 的值"${str}"不在可选项中。`;
      }
      return null;
    }
    case "token": {
      if (str.length > def.maxLength) return `${def.label} 不得超过 ${def.maxLength} 字。`;
      return null;
    }
    default:
      return null;
  }
}
