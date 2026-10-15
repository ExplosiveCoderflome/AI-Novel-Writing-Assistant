import { useEffect, useState } from "react";
import type { PromptPreviewResult, PromptTestRunResult, PromptTemplateVersionView } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { usePromptTemplateEditor } from "../hooks/usePromptTemplateEditor";
import { labelTemplateToken, type PromptTemplateTokenKind } from "../templateTokenEditor";
import { PromptTestRunResultPanel } from "./PromptPreviewPanel";
import { VisualTemplateEditor, type TemplateRole } from "./VisualTemplateEditor";

type TemplateState = ReturnType<typeof usePromptTemplateEditor>;

function formatDiagnosticKeys(keys: string[], kind: Extract<PromptTemplateTokenKind, "context" | "input" | "slot">) {
  return keys.map((key) => labelTemplateToken({ kind, key })).join("、") || "无";
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3">
      <div>
        <span className="text-sm font-medium">版本 {props.version.versionNo}{active ? " · 使用中" : ""}</span>
        <span className="ml-3 text-xs text-muted-foreground">{new Date(props.version.createdAt).toLocaleString()}</span>
        {props.version.notes ? <p className="mt-1 text-sm text-muted-foreground">{props.version.notes}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={props.disabled} onClick={() => props.onLoad(props.version)}>载入编辑</Button>
        <Button variant="outline" size="sm" disabled={props.disabled || active} onClick={() => props.onActivate(props.version.id)}>应用此版本</Button>
      </div>
    </div>
  );
}

export function AdvancedPromptTemplateEditor(props: {
  templateState: TemplateState;
  preview: PromptPreviewResult | null;
  testRun?: PromptTestRunResult | null;
  testRunPending?: boolean;
  testRunError?: string | null;
  testRunStreamOutput?: string;
  disabled?: boolean;
  showTestResult?: boolean;
}) {
  const { templateState: state, preview } = props;
  const [role, setRole] = useState<TemplateRole>("system");
  const [tokenMenuRole, setTokenMenuRole] = useState<TemplateRole | null>(null);
  const [tokenQuery, setTokenQuery] = useState("");
  useEffect(() => state.setFocusedRole(role), [role, state.setFocusedRole]);
  const diagnostics = preview?.diagnostics.template?.diagnostics;
  const busy = props.disabled || state.saveMutation.isPending || state.restoreMutation.isPending || state.activateMutation.isPending;

  if (state.overrideQuery.isError) return (
    <div role="alert" className="rounded-md bg-destructive/10 p-4 text-sm">
      <p>模板读取失败，请重试。</p>
      <Button variant="outline" className="mt-2" onClick={() => void state.overrideQuery.refetch()}>重新读取</Button>
    </div>
  );
  if (!state.isReady) return <p role="status" className="py-6 text-sm text-muted-foreground">正在读取完整模板…</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-md bg-muted/40 px-4 py-3 text-sm">
        <p className="font-medium">{state.canPersist
          ? (state.view?.mode === "custom" ? "本书使用自定义模板" : "本书使用官方模板")
          : "从官方模板开始编辑"}</p>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          优先调整“写作规则”中的表达要求；“任务与资料”负责章节任务和背景引用。保留引用标签，让 AI 获得必要资料。
          {!state.canPersist ? " 草稿仅在当前页面保留，点击“保存到小说”后应用。" : " 保存后用于本书后续生成，不改动已有正文。"}
        </p>
      </div>
      <Tabs value={role} onValueChange={(value) => { setRole(value as TemplateRole); setTokenMenuRole(null); state.setFocusedRole(value as TemplateRole); }}>
        <TabsList>
          <TabsTrigger value="system">写作规则 · 主要调整</TabsTrigger>
          <TabsTrigger value="human">任务与资料</TabsTrigger>
        </TabsList>
      </Tabs>
      <VisualTemplateEditor
        key={role}
        role={role}
        label={role === "system" ? "写作规则（System）" : "任务与资料（User）"}
        value={role === "system" ? state.systemContent : state.humanContent}
        disabled={busy}
        textareaRef={role === "system" ? state.systemRef : state.humanRef}
        tokenItems={state.references?.items ?? []}
        tokenMenuRole={tokenMenuRole}
        tokenQuery={tokenQuery}
        references={state.references}
        onTokenQueryChange={setTokenQuery}
        onOpenTokenMenu={(nextRole) => { state.setFocusedRole(nextRole); setTokenQuery(""); setTokenMenuRole(nextRole); }}
        onCloseTokenMenu={() => setTokenMenuRole(null)}
        onFocusRole={state.setFocusedRole}
        onInsertToken={state.insertToken}
        onChange={role === "system" ? state.setSystemContent : state.setHumanContent}
      />
      {state.referenceQuery.isError ? <div role="alert" className="text-sm text-destructive">
        资料引用列表读取失败，模板内容仍可编辑。
        <Button variant="ghost" size="sm" onClick={() => void state.referenceQuery.refetch()}>重试引用列表</Button>
      </div> : null}
      <div>
        <label className="text-sm font-medium" htmlFor="prompt-template-notes">版本备注（选填）</label>
        <Input id="prompt-template-notes" value={state.notes} onChange={(event) => state.setNotes(event.target.value)}
          maxLength={2000} placeholder="例如：对白更简短，减少旁白解释" className="mt-2 shadow-none" disabled={busy} />
      </div>
      {props.showTestResult !== false ? <PromptTestRunResultPanel result={props.testRun ?? null}
        isPending={props.testRunPending} error={props.testRunError} streamOutput={props.testRunStreamOutput} /> : null}
      {preview ? (
        <details open className="border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium">预览内容与资料检查</summary>
          {diagnostics ? <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>引用资料：{formatDiagnosticKeys(diagnostics.referencedContextGroups, "context")}</p>
            <p>自动补齐的必需资料：{formatDiagnosticKeys(diagnostics.fallbackRequiredGroups, "context")}</p>
            <p>任务变量：{formatDiagnosticKeys(diagnostics.referencedInputFields, "input")}</p>
            <p>常用设置：{formatDiagnosticKeys(diagnostics.referencedSlotKeys, "slot")}</p>
            {diagnostics.unknownTokens.length ? <p className="text-destructive">无法识别的引用：{diagnostics.unknownTokens.join("、")}</p> : null}
          </div> : null}
          {preview.messages.map((message, index) => <div key={index} className="mt-3 rounded-md bg-muted/40 p-3">
            <div className="mb-2 text-xs font-medium">{message.role}</div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">{message.content}</pre>
          </div>)}
        </details>
      ) : null}
      {state.canPersist ? <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-medium">本书版本历史 · {state.view?.versions.length ?? 0} 个版本</summary>
        {state.view?.versions.length ? state.view.versions.map((version) => <VersionRow key={version.id}
          version={version} activeVersionId={state.view?.activeVersionId} disabled={busy}
          onLoad={state.loadVersionToDraft} onActivate={(id) => state.activateMutation.mutate(id)} />)
          : <p className="pt-3 text-sm text-muted-foreground">保存模板后，可在这里找回历史版本。</p>}
      </details> : null}
    </div>
  );
}
