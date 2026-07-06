import { useCallback, useEffect, useMemo, useState } from "react";
import type { Descendant, Value } from "platejs";
import { ParagraphPlugin, Plate, PlateContent, usePlateEditor } from "platejs/react";
import { CheckCircle2, LockKeyhole, MapPin, RotateCcw } from "lucide-react";
import type {
  PromptCatalogItem,
  PromptPreviewResult,
  PromptSlotDefChoice,
  PromptSlotDefToggle,
  PromptSlotReconcileItem,
} from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  CONTEXT_GROUP_LABELS,
  LOCKED_CONTEXT_GROUPS,
  SLOT_KIND_LABELS,
} from "../promptWorkbenchLabels";
import type { PromptEditorSection, PromptSlotValue } from "../promptWorkbenchTypes";
import { PromptPreviewPanel } from "./PromptPreviewPanel";

function toPlateValue(text: string): Value {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [""];
  return lines.map((line) => ({
    type: "p",
    children: [{ text: line }],
  }));
}

function nodeToText(node: Descendant): string {
  if ("text" in node && typeof node.text === "string") {
    return node.text;
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => nodeToText(child as Descendant)).join("");
  }
  return "";
}

function toPlainText(value: Value): string {
  return (value as Descendant[]).map((node) => nodeToText(node)).join("\n");
}

function normalizeValuePayload(payload: unknown): Value {
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

function getMaxLength(section: PromptEditorSection): number | undefined {
  if ("maxLength" in section.slot) {
    return section.slot.maxLength;
  }
  return undefined;
}

function PromptSlotTextEditor(props: {
  value: string;
  maxLength?: number;
  placeholder?: string;
  minHeightClassName?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const {
    disabled,
    maxLength,
    minHeightClassName = "min-h-[150px]",
    onChange,
    placeholder,
    value,
  } = props;
  const [editorSeed, setEditorSeed] = useState(0);
  const [internalText, setInternalText] = useState(value);

  const editor = usePlateEditor(
    {
      plugins: [ParagraphPlugin],
      value: toPlateValue(internalText),
    },
    [editorSeed],
  );

  useEffect(() => {
    if (value === internalText) {
      return;
    }
    setInternalText(value);
    setEditorSeed((current) => current + 1);
  }, [internalText, value]);

  const handleValueChange = useCallback((payload: unknown) => {
    const nextText = toPlainText(normalizeValuePayload(payload));
    const normalized = maxLength ? nextText.slice(0, maxLength) : nextText;
    if (normalized === internalText) {
      return;
    }
    setInternalText(normalized);
    if (normalized !== nextText) {
      setEditorSeed((current) => current + 1);
    }
    onChange(normalized);
  }, [internalText, maxLength, onChange]);

  const lineCount = Math.max(1, internalText.replace(/\r\n/g, "\n").split("\n").length);
  const remaining = typeof maxLength === "number" ? maxLength - internalText.length : null;

  return (
    <div className="rounded-md border bg-background">
      <div className="flex min-h-0">
        <div className="w-12 shrink-0 select-none border-r bg-muted/30 py-3 pr-2 text-right font-mono text-[11px] leading-6 text-muted-foreground">
          {Array.from({ length: lineCount }).map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          {editor ? (
            <Plate editor={editor} onValueChange={handleValueChange}>
              <PlateContent
                readOnly={disabled}
                placeholder={placeholder}
                className={cn(
                  "prose prose-sm max-w-none rounded-r-md px-3 py-3 text-sm leading-6 outline-none dark:prose-invert",
                  "break-words [&_p]:m-0 [&_p]:min-h-6 [&_p]:text-foreground",
                  disabled && "cursor-not-allowed opacity-70",
                  minHeightClassName,
                )}
              />
            </Plate>
          ) : null}
        </div>
      </div>
      {remaining !== null ? (
        <div className="border-t px-3 py-1.5 text-right text-xs text-muted-foreground">
          {remaining < 0 ? <span className="text-destructive">{remaining}</span> : remaining} 字剩余
        </div>
      ) : null}
    </div>
  );
}

function SlotBadges({ section }: { section: PromptEditorSection }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline">{SLOT_KIND_LABELS[section.kind] ?? section.kind}</Badge>
      {section.isDirty ? (
        <Badge variant="secondary" className="border-blue-200 bg-blue-100 text-blue-700">未保存</Badge>
      ) : null}
      {section.isSavedOverride ? <Badge variant="secondary">已覆盖</Badge> : null}
      {section.isInheritedFromGlobal ? <Badge variant="outline">继承全局</Badge> : null}
    </div>
  );
}

function ReconcileMiniBadge({ item }: { item?: PromptSlotReconcileItem }) {
  if (!item || item.state === "unchanged") {
    return null;
  }
  const label = item.state === "drifted"
    ? "出厂文案已更新"
    : item.state === "new"
      ? "新增槽位"
      : "槽位已移除";
  return (
    <Badge variant="secondary" className="border-amber-200 bg-amber-100 text-amber-800">
      {label}
    </Badge>
  );
}

function PromptSlotSection(props: {
  section: PromptEditorSection;
  reconcileItem?: PromptSlotReconcileItem;
  disabled?: boolean;
  onChange: (key: string, value: PromptSlotValue) => void;
  onReset: (key: string) => void;
}) {
  const { disabled, onChange, onReset, reconcileItem, section } = props;
  const canReset = section.isDirty || section.isSavedOverride;
  const maxLength = getMaxLength(section);

  return (
    <section className={cn(
      "rounded-md border bg-card",
      reconcileItem?.state === "drifted" && "border-amber-300 bg-amber-50/35",
      reconcileItem?.state === "orphaned" && "border-red-200 bg-red-50/30 opacity-80",
    )}>
      <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{section.label}</h4>
            <SlotBadges section={section} />
            <ReconcileMiniBadge item={reconcileItem} />
          </div>
          {section.description ? (
            <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
          ) : null}
          {"anchor" in section.slot && section.slot.anchor ? (
            <p className="mt-1 text-xs text-muted-foreground">
              锚点：<code className="rounded bg-muted px-1">{section.slot.anchor}</code>
            </p>
          ) : null}
        </div>
        {canReset ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onReset(section.slotKey)}
            disabled={disabled}
            title="清除当前层覆盖"
            className="h-8 w-8 shrink-0 p-0"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="p-4">
        {section.kind === "choice" ? (
          <ChoiceSlotControl
            section={section}
            disabled={disabled}
            onChange={(value) => onChange(section.slotKey, value)}
          />
        ) : section.kind === "toggle" ? (
          <ToggleSlotControl
            section={section}
            disabled={disabled}
            onChange={(value) => onChange(section.slotKey, value)}
          />
        ) : section.kind === "token" ? (
          <TokenSlotControl
            section={section}
            disabled={disabled}
            onChange={(value) => onChange(section.slotKey, value)}
          />
        ) : (
          <PromptSlotTextEditor
            value={String(section.value)}
            maxLength={maxLength}
            disabled={disabled}
            placeholder={section.kind === "append" && "placeholderHint" in section.slot
              ? section.slot.placeholderHint
              : undefined}
            minHeightClassName={section.kind === "append" ? "min-h-[180px]" : "min-h-[138px]"}
            onChange={(value) => onChange(section.slotKey, value)}
          />
        )}

        {"requiredTokens" in section.slot && section.slot.requiredTokens?.length ? (
          <div className="mt-2 text-xs text-muted-foreground">
            需保留：{section.slot.requiredTokens.join("、")}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ChoiceSlotControl(props: {
  section: PromptEditorSection;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { disabled, onChange, section } = props;
  const slot = section.slot as PromptSlotDefChoice;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {slot.options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
            section.value === option.value
              ? "border-primary bg-primary/8 text-foreground ring-1 ring-primary"
              : "border-border bg-background hover:bg-muted/50",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <div className="font-medium">{option.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">{option.copy}</div>
        </button>
      ))}
    </div>
  );
}

function ToggleSlotControl(props: {
  section: PromptEditorSection;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const { disabled, onChange, section } = props;
  const slot = section.slot as PromptSlotDefToggle;
  const checked = Boolean(section.value);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
        <span className="text-sm font-medium text-foreground">{checked ? "已启用" : "已关闭"}</span>
      </div>
      {checked ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          启用后追加：{slot.copy}
        </div>
      ) : null}
    </div>
  );
}

function TokenSlotControl(props: {
  section: PromptEditorSection;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { disabled, onChange, section } = props;
  const maxLength = getMaxLength(section);
  return (
    <div className="space-y-2">
      <Input
        value={String(section.value)}
        onChange={(event) => onChange(maxLength ? event.target.value.slice(0, maxLength) : event.target.value)}
        disabled={disabled}
        placeholder={"patternHint" in section.slot ? section.slot.patternHint : undefined}
        className="font-mono"
      />
      {"patternHint" in section.slot && section.slot.patternHint ? (
        <div className="text-xs text-muted-foreground">期望格式：{section.slot.patternHint}</div>
      ) : null}
    </div>
  );
}

function ContextReferenceChips(props: {
  prompt: PromptCatalogItem;
  preview: PromptPreviewResult | null;
  onContextSelect: (blockId: string) => void;
}) {
  const { onContextSelect, preview, prompt } = props;
  const firstBlockByGroup = useMemo(() => {
    const map = new Map<string, string>();
    preview?.context.blocks.forEach((block) => {
      if (!map.has(block.group)) {
        map.set(block.group, block.id);
      }
    });
    return map;
  }, [preview?.context.blocks]);

  if (prompt.contextRequirements.length === 0) {
    return null;
  }

  return (
    <section className="rounded-md border bg-muted/20 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <MapPin className="h-4 w-4 text-primary" />
        上下文引用
      </div>
      <div className="flex flex-wrap gap-2">
        {prompt.contextRequirements.map((requirement) => {
          const blockId = firstBlockByGroup.get(requirement.group);
          const locked = LOCKED_CONTEXT_GROUPS.has(requirement.group) || requirement.required;
          return (
            <button
              key={requirement.group}
              type="button"
              disabled={!blockId}
              onClick={() => blockId && onContextSelect(blockId)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                blockId ? "bg-background hover:border-primary/60" : "cursor-not-allowed bg-muted/40 text-muted-foreground",
              )}
              title={requirement.group}
            >
              {locked ? <LockKeyhole className="h-3 w-3" /> : null}
              {CONTEXT_GROUP_LABELS[requirement.group] ?? requirement.group}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PromptBodyEditor(props: {
  prompt: PromptCatalogItem;
  preview: PromptPreviewResult | null;
  sections: PromptEditorSection[];
  reconcileMap: Record<string, PromptSlotReconcileItem>;
  disabled?: boolean;
  onSlotChange: (key: string, value: PromptSlotValue) => void;
  onSlotReset: (key: string) => void;
  onContextSelect: (blockId: string) => void;
}) {
  const {
    disabled,
    onContextSelect,
    onSlotChange,
    onSlotReset,
    preview,
    prompt,
    reconcileMap,
    sections,
  } = props;
  const controlSections = sections.filter((section) => section.placement === "control");
  const bodySections = sections.filter((section) => section.placement === "body");
  const appendSections = sections.filter((section) => section.placement === "append");
  const hasEditableSlots = sections.length > 0;

  return (
    <div className="space-y-5">
      <ContextReferenceChips
        prompt={prompt}
        preview={preview}
        onContextSelect={onContextSelect}
      />

      {!hasEditableSlots ? (
        <div className="rounded-md border border-dashed bg-background p-5 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <LockKeyhole className="h-4 w-4 text-primary" />
            提示词只读
          </div>
          该提示词没有声明可编辑槽位。可以查看最终 messages 与上下文注入，但不能直接替换 system prompt 或修改上下文策略。
        </div>
      ) : (
        <>
          {controlSections.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">运行控制</h3>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {controlSections.map((section) => (
                  <PromptSlotSection
                    key={section.slotKey}
                    section={section}
                    reconcileItem={reconcileMap[section.slotKey]}
                    disabled={disabled}
                    onChange={onSlotChange}
                    onReset={onSlotReset}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {bodySections.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Prompt 主体槽位</h3>
              <div className="space-y-3">
                {bodySections.map((section) => (
                  <PromptSlotSection
                    key={section.slotKey}
                    section={section}
                    reconcileItem={reconcileMap[section.slotKey]}
                    disabled={disabled}
                    onChange={onSlotChange}
                    onReset={onSlotReset}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {appendSections.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">自定义补充规则</h3>
              <div className="space-y-3">
                {appendSections.map((section) => (
                  <PromptSlotSection
                    key={section.slotKey}
                    section={section}
                    reconcileItem={reconcileMap[section.slotKey]}
                    disabled={disabled}
                    onChange={onSlotChange}
                    onReset={onSlotReset}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">最终消息预览</h3>
        <PromptPreviewPanel preview={preview} />
      </section>
    </div>
  );
}
