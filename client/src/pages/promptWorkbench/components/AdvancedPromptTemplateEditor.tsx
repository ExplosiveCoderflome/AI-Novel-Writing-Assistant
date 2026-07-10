import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
import { GitBranch, History, RotateCcw, Save, ShieldCheck } from "lucide-react";
import type {
  PromptPreviewResult,
  PromptTemplateVersionView,
} from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { usePromptTemplateEditor } from "../hooks/usePromptTemplateEditor";
import { labelTemplateToken, type PromptTemplateTokenKind } from "../templateTokenEditor";
import { VisualTemplateEditor, type TemplateRole } from "./VisualTemplateEditor";

type TemplateState = ReturnType<typeof usePromptTemplateEditor>;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatDiagnosticKeys(
  keys: string[],
  kind: Extract<PromptTemplateTokenKind, "context" | "input" | "slot">,
) {
  return keys.map((key) => labelTemplateToken({ kind, key })).join("、") || t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_d81bb206");
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
          {active ? <Badge className="bg-[#0f766e] text-white hover:bg-[#0f766e]">{t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_c16e2ef8")}</Badge> : null}
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
  const modeLabel = view?.mode === "custom" ? t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_d328cfb5") : t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_9ca25cc5");
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

      <VisualTemplateEditor
        role="system"
        label={t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_31f0b930")}
        value={templateState.systemContent}
        disabled={disabled || isBusy}
        textareaRef={templateState.systemRef}
        tokenItems={tokenItems}
        tokenMenuRole={tokenMenuRole}
        tokenQuery={tokenQuery}
        references={templateState.references}
        onTokenQueryChange={setTokenQuery}
        onOpenTokenMenu={openTokenMenu}
        onCloseTokenMenu={() => setTokenMenuRole(null)}
        onFocusRole={templateState.setFocusedRole}
        onInsertToken={templateState.insertToken}
        onChange={templateState.setSystemContent}
      />

      <VisualTemplateEditor
        role="human"
        label={t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_87e01c13")}
        value={templateState.humanContent}
        disabled={disabled || isBusy}
        textareaRef={templateState.humanRef}
        tokenItems={tokenItems}
        tokenMenuRole={tokenMenuRole}
        tokenQuery={tokenQuery}
        references={templateState.references}
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
          placeholder={t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_dc7b50a7")}
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
            <div>{t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_ee92a103")}</div>
            <div>{t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_d181d9be")}</div>
            <div>{t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_885594d5")}</div>
            <div>{t("gen.pages.promptWorkbench.components.AdvancedPromptTemplateEditor.gen_3b9d0252")}</div>
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
