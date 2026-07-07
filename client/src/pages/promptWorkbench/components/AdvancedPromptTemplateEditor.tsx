import { useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import { GitBranch, History, RotateCcw, Save, ShieldCheck, Sparkles } from "lucide-react";
import type {
  PromptPreviewResult,
  PromptTemplateReferenceItem,
  PromptTemplateVersionView,
} from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { usePromptTemplateEditor } from "../hooks/usePromptTemplateEditor";

type TemplateState = ReturnType<typeof usePromptTemplateEditor>;
type TemplateRole = "system" | "human";

const REFERENCE_GROUP_LABELS: Record<PromptTemplateReferenceItem["group"], string> = {
  required_context: "必需上下文",
  optional_context: "可选上下文",
  input: "运行变量",
  slot: "槽位",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function groupReferences(items: PromptTemplateReferenceItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (!normalized) return true;
    return [item.key, item.label, item.token, item.description ?? ""]
      .join("\n")
      .toLowerCase()
      .includes(normalized);
  });
  return (["required_context", "optional_context", "input", "slot"] as const).map((group) => ({
    group,
    items: filtered.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);
}

function TokenMenu(props: {
  items: PromptTemplateReferenceItem[];
  query: string;
  onQueryChange: (value: string) => void;
  onInsert: (token: string) => void;
  onClose: () => void;
}) {
  const grouped = groupReferences(props.items, props.query);
  return (
    <div className="rounded-md border border-[#cbdad6] bg-white shadow-[0_18px_40px_rgba(20,54,48,0.16)]">
      <div className="border-b border-[#dce8e4] p-2">
        <Input
          autoFocus
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="搜索上下文、变量或槽位"
          className="h-8 border-[#cbdad6]"
        />
      </div>
      <div className="max-h-80 overflow-auto p-2">
        {grouped.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">没有可插入的引用。</div>
        ) : grouped.map((section) => (
          <div key={section.group} className="mb-2 last:mb-0">
            <div className="px-2 pb-1 text-[11px] font-semibold text-[#52606d]">
              {REFERENCE_GROUP_LABELS[section.group]}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <button
                  key={`${section.group}:${item.key}`}
                  type="button"
                  onClick={() => props.onInsert(item.token)}
                  className="w-full rounded-md px-2 py-2 text-left hover:bg-[#eef7f4]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[#25443f]">{item.label}</span>
                    {item.required ? (
                      <span className="rounded-md bg-[#eaf7f2] px-1.5 py-0.5 text-[11px] text-[#0f766e]">
                        必需
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">{item.token}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#dce8e4] p-2 text-right">
        <Button type="button" variant="ghost" size="sm" onClick={props.onClose}>
          关闭
        </Button>
      </div>
    </div>
  );
}

function TemplateTextarea(props: {
  role: TemplateRole;
  label: string;
  value: string;
  disabled?: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  tokenItems: PromptTemplateReferenceItem[];
  tokenMenuRole: TemplateRole | null;
  tokenQuery: string;
  onTokenQueryChange: (value: string) => void;
  onOpenTokenMenu: (role: TemplateRole) => void;
  onCloseTokenMenu: () => void;
  onFocusRole: (role: TemplateRole) => void;
  onInsertToken: (token: string) => void;
  onChange: (value: string) => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "@") {
      event.preventDefault();
      props.onFocusRole(props.role);
      props.onOpenTokenMenu(props.role);
    }
  }

  return (
    <div className="relative rounded-md border border-[#d7e4e0] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e1ebe8] px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-[#25443f]">{props.label}</div>
          <div className="text-[11px] text-muted-foreground">输入 @ 可插入上下文、变量或槽位引用</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-[#b8d9d0] text-[#0f5f59]"
          onClick={() => props.onOpenTokenMenu(props.role)}
          disabled={props.disabled}
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          插入引用
        </Button>
      </div>
      <textarea
        ref={props.textareaRef}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onFocus={() => props.onFocusRole(props.role)}
        onKeyDown={handleKeyDown}
        disabled={props.disabled}
        spellCheck={false}
        className={cn(
          "min-h-[280px] w-full resize-y bg-white px-3 py-3 font-mono text-sm leading-6 outline-none",
          props.disabled && "cursor-not-allowed opacity-60",
        )}
      />
      {props.tokenMenuRole === props.role ? (
        <div className="absolute right-3 top-14 z-20 w-[360px] max-w-[calc(100%-24px)]">
          <TokenMenu
            items={props.tokenItems}
            query={props.tokenQuery}
            onQueryChange={props.onTokenQueryChange}
            onInsert={(token) => {
              props.onInsertToken(token);
              props.onCloseTokenMenu();
            }}
            onClose={props.onCloseTokenMenu}
          />
        </div>
      ) : null}
    </div>
  );
}

function VersionRow(props: {
  version: PromptTemplateVersionView;
  activeVersionId?: string | null;
  disabled?: boolean;
  onLoad: (version: PromptTemplateVersionView) => void;
  onActivate: (versionId: string) => void;
}) {
  const active = props.activeVersionId === props.version.id;
  return (
    <div className="grid gap-3 rounded-md border border-[#d7e4e0] bg-white px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#25443f]">v{props.version.versionNo}</span>
          {active ? <Badge className="bg-[#0f766e] text-white hover:bg-[#0f766e]">启用中</Badge> : null}
          <span className="font-mono text-[11px] text-muted-foreground">{props.version.compiledHash}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{formatDate(props.version.createdAt)}</div>
        {props.version.notes ? (
          <div className="mt-2 text-sm text-[#52606d]">{props.version.notes}</div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => props.onLoad(props.version)}>
          查看
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => props.onActivate(props.version.id)}
          disabled={props.disabled || active}
          className="border-[#b8d9d0] text-[#0f5f59]"
        >
          回滚
        </Button>
      </div>
    </div>
  );
}

export function AdvancedPromptTemplateEditor(props: {
  templateState: TemplateState;
  preview: PromptPreviewResult | null;
  disabled?: boolean;
}) {
  const { disabled, preview, templateState } = props;
  const [tokenMenuRole, setTokenMenuRole] = useState<TemplateRole | null>(null);
  const [tokenQuery, setTokenQuery] = useState("");
  const tokenItems = templateState.references?.items ?? [];
  const templateDiagnostics = preview?.diagnostics.template?.diagnostics;
  const view = templateState.view;
  const modeLabel = view?.mode === "custom" ? "本书自定义" : "官方模板";
  const isBusy = templateState.saveMutation.isPending
    || templateState.restoreMutation.isPending
    || templateState.activateMutation.isPending;

  const previewMessages = useMemo(() => preview?.messages ?? [], [preview]);

  function openTokenMenu(role: TemplateRole) {
    templateState.setFocusedRole(role);
    setTokenQuery("");
    setTokenMenuRole(role);
  }

  if (!templateState.enabled) {
    return (
      <div className="rounded-md border border-dashed border-[#cbdad6] bg-white/75 p-5 text-sm text-muted-foreground">
        选择正文写作提示词、本书范围和具体小说后可编辑高级模板。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[#d7e4e0] bg-[#fbfdfb] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn(
                view?.mode === "custom" ? "bg-[#0f766e]" : "bg-[#52606d]",
                "text-white hover:bg-[#0f766e]",
              )}>
                {modeLabel}
              </Badge>
              {view?.activeVersion ? (
                <span className="rounded-md bg-[#eef6f4] px-2 py-1 text-xs text-[#0f5f59]">
                  v{view.activeVersion.versionNo}
                </span>
              ) : null}
              <span className="rounded-md bg-[#eef3fb] px-2 py-1 text-xs text-[#385273]">
                {view?.basePromptVersion ?? "v5"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              高级模板会影响本书正文生成；必需上下文缺失时生成会停止。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => templateState.restoreMutation.mutate()}
              disabled={disabled || isBusy || view?.mode !== "custom"}
              className="border-[#b8d9d0] text-[#0f5f59]"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              恢复官方模板
            </Button>
            <Button
              type="button"
              onClick={() => templateState.saveMutation.mutate()}
              disabled={disabled || isBusy || !templateState.isDirty}
              className="bg-[#0f766e] text-white hover:bg-[#0b5f59]"
            >
              <Save className="mr-2 h-4 w-4" />
              保存为新版本
            </Button>
          </div>
        </div>
      </div>

      <TemplateTextarea
        role="system"
        label="System 模板"
        value={templateState.systemContent}
        disabled={disabled || isBusy}
        textareaRef={templateState.systemRef}
        tokenItems={tokenItems}
        tokenMenuRole={tokenMenuRole}
        tokenQuery={tokenQuery}
        onTokenQueryChange={setTokenQuery}
        onOpenTokenMenu={openTokenMenu}
        onCloseTokenMenu={() => setTokenMenuRole(null)}
        onFocusRole={templateState.setFocusedRole}
        onInsertToken={templateState.insertToken}
        onChange={templateState.setSystemContent}
      />

      <TemplateTextarea
        role="human"
        label="Human 模板"
        value={templateState.humanContent}
        disabled={disabled || isBusy}
        textareaRef={templateState.humanRef}
        tokenItems={tokenItems}
        tokenMenuRole={tokenMenuRole}
        tokenQuery={tokenQuery}
        onTokenQueryChange={setTokenQuery}
        onOpenTokenMenu={openTokenMenu}
        onCloseTokenMenu={() => setTokenMenuRole(null)}
        onFocusRole={templateState.setFocusedRole}
        onInsertToken={templateState.insertToken}
        onChange={templateState.setHumanContent}
      />

      <div className="rounded-md border border-[#d7e4e0] bg-white p-4">
        <label className="text-sm font-semibold text-[#25443f]" htmlFor="prompt-template-notes">
          版本说明
        </label>
        <Input
          id="prompt-template-notes"
          value={templateState.notes}
          onChange={(event) => templateState.setNotes(event.target.value)}
          placeholder="说明本次模板调整目标"
          className="mt-2 border-[#cbdad6]"
          disabled={disabled || isBusy}
        />
      </div>

      {templateDiagnostics ? (
        <div className="rounded-md border border-[#c8d8f0] bg-[#f5f8ff] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#344d7a]">
            <GitBranch className="h-4 w-4" />
            预览注入结果
          </div>
          <div className="grid gap-2 text-sm text-[#52606d] md:grid-cols-2">
            <div>显式上下文：{templateDiagnostics.referencedContextGroups.join("、") || "无"}</div>
            <div>保底追加：{templateDiagnostics.fallbackRequiredGroups.join("、") || "无"}</div>
            <div>运行变量：{templateDiagnostics.referencedInputFields.join("、") || "无"}</div>
            <div>槽位引用：{templateDiagnostics.referencedSlotKeys.join("、") || "无"}</div>
          </div>
        </div>
      ) : null}

      {previewMessages.length > 0 ? (
        <div className="rounded-md border border-[#d7e4e0] bg-white">
          <div className="border-b border-[#e1ebe8] px-4 py-3 text-sm font-semibold text-[#25443f]">
            最终 Messages
          </div>
          <div className="space-y-3 p-4">
            {previewMessages.map((message, index) => (
              <div key={`${message.role}:${index}`} className="rounded-md bg-[#f7faf9] p-3">
                <div className="mb-2 font-mono text-[11px] uppercase text-[#0f766e]">{message.role}</div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-[#1f2937]">
                  {message.content}
                </pre>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-[#d7e4e0] bg-[#fbfdfb] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#25443f]">
          <History className="h-4 w-4" />
          版本历史
        </div>
        {view?.versions.length ? (
          <div className="space-y-2">
            {view.versions.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                activeVersionId={view.activeVersionId}
                disabled={disabled || isBusy}
                onLoad={templateState.loadVersionToDraft}
                onActivate={(versionId) => templateState.activateMutation.mutate(versionId)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[#cbdad6] bg-white/75 p-4 text-sm text-muted-foreground">
            保存自定义模板后会生成版本历史。
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={templateState.resetDraft}
          disabled={!templateState.isDirty || isBusy}
          className="text-[#52606d] hover:bg-[#eef4ff] hover:text-[#344d7a]"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          放弃未保存修改
        </Button>
      </div>
    </div>
  );
}
