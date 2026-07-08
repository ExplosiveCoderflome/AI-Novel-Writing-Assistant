import { useCallback, useEffect, useMemo, useState } from "react";
import type { Descendant, Value } from "platejs";
import { ParagraphPlugin, Plate, PlateContent, usePlateEditor } from "platejs/react";
import { CheckCircle2, LockKeyhole, MapPin, RotateCcw, ShieldCheck } from "lucide-react";
import type {
  PromptCatalogItem,
  PromptPreviewResult,
  PromptSlotDefChoice,
  PromptSlotDefToggle,
  PromptSlotReconcileItem,
  PromptSlotReconcileResult,
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
  immersive?: boolean;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const {
    disabled,
    immersive,
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
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-white shadow-[0_10px_28px_rgba(15,55,48,0.08)]",
        immersive ? "border-[#a9cfc4]" : "border-[#cbdad6]",
      )}
    >
      <div className="flex min-h-0">
        <div className="w-12 shrink-0 select-none border-r border-[#dce8e4] bg-[#eef7f3] py-3 pr-2 text-right font-mono text-[11px] leading-6 text-[#6f8d86]">
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
                  "prose prose-sm max-w-none rounded-r-md px-4 py-4 text-sm leading-7 outline-none dark:prose-invert",
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
        <div className="border-t border-[#dce8e4] bg-[#fbfdfb] px-3 py-1.5 text-right text-xs text-[#6f7f78]">
          {remaining < 0 ? <span className="text-destructive">{remaining}</span> : remaining} 字剩余
        </div>
      ) : null}
    </div>
  );
}

function SlotBadges({ section }: { section: PromptEditorSection }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline" className="border-[#cbdad6] bg-[#f7fbf9] text-[#315f58]">
        {SLOT_KIND_LABELS[section.kind] ?? section.kind}
      </Badge>
      <Badge
        variant={section.source === "official" ? "outline" : "secondary"}
        className={cn(
          section.source === "novel_official_default" && "border-[#a7d7ca] bg-[#eaf7f2] text-[#0f766e]",
          section.source === "global" && "border-[#c9d7ff] bg-[#eef3ff] text-[#344d7a]",
          section.source === "novel" && "border-[#e7c78f] bg-[#fff7e8] text-[#7a5620]",
        )}
      >
        {section.sourceLabel}
      </Badge>
      {section.isDirty ? (
        <Badge variant="secondary" className="border-[#b8d9d0] bg-[#eaf7f2] text-[#0f766e]">未保存</Badge>
      ) : null}
    </div>
  );
}

function ReconcileMiniBadge({ item }: { item?: PromptSlotReconcileItem }) {
  if (!item || item.state === "unchanged") {
    return null;
  }
  const label = item.state === "drifted"
    ? "官方已更新"
    : item.state === "new"
      ? "新增槽位"
      : "槽位已移除";
  return (
    <Badge variant="secondary" className="border-amber-200 bg-amber-50 text-amber-800">
      {label}
    </Badge>
  );
}

function PromptSlotSection(props: {
  section: PromptEditorSection;
  reconcileItem?: PromptSlotReconcileItem;
  immersive?: boolean;
  disabled?: boolean;
  onChange: (key: string, value: PromptSlotValue) => void;
  onReset: (key: string) => void;
}) {
  const { disabled, immersive, onChange, onReset, reconcileItem, section } = props;
  const canReset = section.isDirty || section.isSavedOverride;
  const maxLength = getMaxLength(section);

  return (
    <section className={cn(
      "overflow-hidden rounded-md border border-[#d8e2de] bg-white shadow-[0_8px_24px_rgba(20,54,48,0.06)]",
      immersive && "border-[#b8d9d0] shadow-[0_14px_36px_rgba(15,55,48,0.10)]",
      reconcileItem?.state === "drifted" && "border-amber-300 bg-amber-50/[0.25]",
      reconcileItem?.state === "orphaned" && "border-red-200 bg-red-50/30 opacity-80",
    )}>
      <div className="flex flex-col gap-3 border-b border-[#dce8e4] bg-[#fbfdfb] px-4 py-3 md:flex-row md:items-start md:justify-between">
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
            title={section.isOfficialDefaultOverride ? "清除本书官方默认标记，重新继承全局覆盖" : "清除当前层覆盖"}
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
            immersive={immersive}
            disabled={disabled}
            placeholder={section.kind === "append" && "placeholderHint" in section.slot
              ? section.slot.placeholderHint
              : undefined}
            minHeightClassName={immersive
              ? section.kind === "append" ? "min-h-[340px]" : "min-h-[280px]"
              : section.kind === "append" ? "min-h-[180px]" : "min-h-[138px]"}
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

function reconcileStateLabel(item: PromptSlotReconcileItem): string {
  if (item.state === "drifted") return "官方文案已更新";
  if (item.state === "new") return "官方新增槽位";
  return "槽位已移除";
}

function displaySlotValue(value: string | boolean | undefined): string {
  if (value === undefined) return "无";
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  const trimmed = value.trim();
  if (!trimmed) return "空";
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed;
}

function PromptOfficialVersionPanel(props: {
  reconcile: PromptSlotReconcileResult | null;
  isLoading?: boolean;
  pending?: boolean;
  onApplyOfficial: (slotKeys: string[]) => void;
  onKeepMine: (slotKeys: string[]) => void;
}) {
  const { isLoading, onApplyOfficial, onKeepMine, pending, reconcile } = props;
  const actionableItems = (reconcile?.items ?? []).filter((item) => item.state !== "unchanged");
  const restoreKeys = actionableItems.map((item) => item.key);
  const keepKeys = actionableItems
    .filter((item) => item.state === "drifted" || item.state === "orphaned")
    .map((item) => item.key);

  return (
    <section className="rounded-md border border-[#b8d9d0] bg-[#f7fbf9] px-4 py-4 shadow-[0_8px_24px_rgba(20,54,48,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#25443f]">
            <ShieldCheck className="h-4 w-4 text-[#0f766e]" />
            官方版本对齐
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[#52606d]">
            对照当前官方槽位，恢复可靠默认值，或保留你的设置并消除版本提醒。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || restoreKeys.length === 0}
            onClick={() => onApplyOfficial(restoreKeys)}
            className="border-[#b8d9d0] bg-white text-[#0f5f59] hover:bg-[#eaf7f2]"
          >
            恢复官方当前版
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || keepKeys.length === 0}
            onClick={() => onKeepMine(keepKeys)}
            className="text-[#52606d] hover:bg-white"
          >
            保留我的设置
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-md border border-dashed border-[#cbdad6] bg-white px-3 py-3 text-sm text-muted-foreground">
          正在读取官方版本...
        </div>
      ) : actionableItems.length === 0 ? (
        <div className="mt-4 rounded-md border border-[#d8e2de] bg-white px-3 py-3 text-sm text-[#315f58]">
          当前槽位与官方当前版一致。
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {actionableItems.map((item) => (
            <div key={item.key} className="rounded-md border border-[#d8e2de] bg-white px-3 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                    <Badge variant="secondary" className="border-amber-200 bg-amber-50 text-amber-800">
                      {reconcileStateLabel(item)}
                    </Badge>
                    {item.overrideMode === "official_default" ? (
                      <Badge variant="outline" className="border-[#a7d7ca] bg-[#eaf7f2] text-[#0f766e]">
                        本书使用官方默认
                      </Badge>
                    ) : null}
                  </div>
                  {item.changelog ? (
                    <p className="text-xs text-muted-foreground">{item.changelog}</p>
                  ) : null}
                  <div className="grid gap-2 text-xs text-[#52606d] md:grid-cols-2">
                    <div className="rounded-md bg-[#f7fbf9] px-2 py-2">
                      <div className="mb-1 font-medium text-[#25443f]">官方当前版</div>
                      <div className="whitespace-pre-wrap break-words">{displaySlotValue(item.defaultCurrent)}</div>
                    </div>
                    <div className="rounded-md bg-[#fffaf0] px-2 py-2">
                      <div className="mb-1 font-medium text-[#7a5620]">我的设置</div>
                      <div className="whitespace-pre-wrap break-words">{displaySlotValue(item.overrideValue)}</div>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onApplyOfficial([item.key])}
                    className="border-[#b8d9d0] bg-white text-[#0f5f59] hover:bg-[#eaf7f2]"
                  >
                    恢复官方当前版
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending || item.state === "new"}
                    onClick={() => onKeepMine([item.key])}
                    className="text-[#52606d] hover:bg-[#f4faf7]"
                  >
                    保留我的设置
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
              ? "border-[#0f766e] bg-[#eaf7f2] text-foreground"
              : "border-[#d7e2df] bg-white hover:bg-[#f4faf7]",
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
        <div className="rounded-md bg-[#eef7f3] px-3 py-2 text-xs leading-relaxed text-[#52746d]">
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
    <section className="rounded-md border border-[#d8e2de] bg-[#f8fbfa] px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#25443f]">
        <MapPin className="h-4 w-4 text-[#0f766e]" />
        上下文引用
      </div>
      <div className="flex flex-wrap gap-1.5">
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
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                blockId
                  ? "border-[#cbdad6] bg-white text-[#52606d] hover:border-[#0f766e] hover:bg-[#eaf7f2] hover:text-[#0f5f59]"
                  : "cursor-not-allowed border-transparent bg-muted/30 text-muted-foreground/70",
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
  immersive?: boolean;
  preview: PromptPreviewResult | null;
  sections: PromptEditorSection[];
  reconcile: PromptSlotReconcileResult | null;
  reconcileMap: Record<string, PromptSlotReconcileItem>;
  showReconcile: boolean;
  reconcileLoading?: boolean;
  reconcilePending?: boolean;
  disabled?: boolean;
  onSlotChange: (key: string, value: PromptSlotValue) => void;
  onSlotReset: (key: string) => void;
  onApplyOfficialSlots: (keys: string[]) => void;
  onKeepSlots: (keys: string[]) => void;
  onContextSelect: (blockId: string) => void;
}) {
  const {
    disabled,
    immersive,
    onApplyOfficialSlots,
    onContextSelect,
    onKeepSlots,
    onSlotChange,
    onSlotReset,
    preview,
    prompt,
    reconcile,
    reconcileLoading,
    reconcileMap,
    reconcilePending,
    sections,
    showReconcile,
  } = props;
  const controlSections = sections.filter((section) => section.placement === "control");
  const bodySections = sections.filter((section) => section.placement === "body");
  const appendSections = sections.filter((section) => section.placement === "append");
  const hasEditableSlots = sections.length > 0;

  return (
    <div className={cn("space-y-6", immersive && "mx-auto max-w-[1320px]")}>
      <ContextReferenceChips
        prompt={prompt}
        preview={preview}
        onContextSelect={onContextSelect}
      />

      {showReconcile ? (
        <PromptOfficialVersionPanel
          reconcile={reconcile}
          isLoading={reconcileLoading}
          pending={reconcilePending}
          onApplyOfficial={onApplyOfficialSlots}
          onKeepMine={onKeepSlots}
        />
      ) : null}

      {!hasEditableSlots ? (
        <div className="rounded-md border border-dashed bg-background/80 p-5 text-sm text-muted-foreground">
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
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">运行控制</h3>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {controlSections.map((section) => (
                  <PromptSlotSection
                    key={section.slotKey}
                    section={section}
                    immersive={immersive}
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
                    immersive={immersive}
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
                    immersive={immersive}
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
