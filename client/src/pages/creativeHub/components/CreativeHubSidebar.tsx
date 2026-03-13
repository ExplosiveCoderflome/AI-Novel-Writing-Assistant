import { useState } from "react";
import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type {
  CreativeHubInterrupt,
  CreativeHubProductionStatus,
  CreativeHubResourceBinding,
  CreativeHubThread,
} from "@ai-novel/shared/types/creativeHub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import NovelProductionStarterCard from "./NovelProductionStarterCard";

interface CreativeHubSidebarProps {
  thread?: CreativeHubThread;
  bindings: CreativeHubResourceBinding;
  novels: Array<{ id: string; title: string }>;
  interrupt?: CreativeHubInterrupt;
  diagnostics?: FailureDiagnostic;
  productionStatus?: CreativeHubProductionStatus | null;
  modelSummary: {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  approvalNote: string;
  onApprovalNoteChange: (value: string) => void;
  onNovelChange: (novelId: string) => void;
  onResolveInterrupt: (action: "approve" | "reject") => void;
  onQuickAction?: (prompt: string) => void;
  onCreateNovel?: (title: string) => void;
  onStartProduction?: (prompt: string) => void;
}

function bindingValue(value: string | null | undefined): string {
  return value?.trim() || "未绑定";
}

export default function CreativeHubSidebar({
  thread,
  bindings,
  novels,
  interrupt,
  diagnostics,
  productionStatus,
  modelSummary,
  approvalNote,
  onApprovalNoteChange,
  onNovelChange,
  onResolveInterrupt,
  onQuickAction,
  onCreateNovel,
  onStartProduction,
}: CreativeHubSidebarProps) {
  const [novelTitleDraft, setNovelTitleDraft] = useState("");
  const currentNovelTitle = novels.find((item) => item.id === bindings.novelId)?.title ?? null;

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <CardTitle className="text-base">中枢状态</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm pr-1">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-medium text-slate-500">资源绑定</div>
          <div className="space-y-3 text-xs text-slate-700">
            <div>线程: {thread?.title ?? "未选择"}</div>
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-slate-500">当前小说</div>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-700"
                value={bindings.novelId ?? ""}
                onChange={(event) => onNovelChange(event.target.value)}
              >
                <option value="">未绑定小说</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title}
                  </option>
                ))}
              </select>
              {!bindings.novelId ? (
                <div className="mt-2 space-y-2 rounded-lg border border-dashed border-slate-200 bg-white p-2">
                  <input
                    className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
                    value={novelTitleDraft}
                    onChange={(event) => setNovelTitleDraft(event.target.value)}
                    placeholder="输入新小说标题"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onQuickAction?.("列出当前的小说列表")}
                    >
                      列出小说
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const title = novelTitleDraft.trim();
                        if (!title) {
                          return;
                        }
                        onCreateNovel?.(title);
                        setNovelTitleDraft("");
                      }}
                    >
                      创建新小说
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            <div>章节: {bindingValue(bindings.chapterId)}</div>
            <div>世界观: {bindingValue(bindings.worldId)}</div>
            <div>任务: {bindingValue(bindings.taskId)}</div>
            <div>拆书分析: {bindingValue(bindings.bookAnalysisId)}</div>
            <div>写作公式: {bindingValue(bindings.formulaId)}</div>
            <div>基础角色: {bindingValue(bindings.baseCharacterId)}</div>
            <div>知识文档: {bindings.knowledgeDocumentIds?.length ?? 0} 个</div>
          </div>
        </div>

        <NovelProductionStarterCard
          currentNovelId={bindings.novelId ?? null}
          currentNovelTitle={currentNovelTitle}
          productionStatus={productionStatus}
          onQuickAction={onQuickAction}
          onSubmit={(prompt) => onStartProduction?.(prompt)}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-medium text-slate-500">整本生产状态</div>
          {productionStatus ? (
            <div className="space-y-2 text-xs text-slate-700">
              <div>当前阶段：{productionStatus.currentStage}</div>
              <div>资产完成度：{productionStatus.assetStages.filter((item) => item.status === "completed").length}/{productionStatus.assetStages.length}</div>
              <div>章节目录：{productionStatus.chapterCount}/{productionStatus.targetChapterCount} 章</div>
              <div>整本写作：{productionStatus.pipelineStatus ?? "未启动"}</div>
              {productionStatus.failureSummary ? <div>失败摘要：{productionStatus.failureSummary}</div> : null}
              {productionStatus.recoveryHint ? <div>恢复建议：{productionStatus.recoveryHint}</div> : null}
            </div>
          ) : (
            <div className="text-xs text-slate-500">当前线程还没有整本生产状态。</div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-medium text-slate-500">模型路由摘要</div>
          <div className="space-y-1 text-xs text-slate-700">
            <div>提供方: {modelSummary.provider}</div>
            <div>模型: {modelSummary.model}</div>
            <div>温度: {modelSummary.temperature}</div>
            <div>最大输出: {modelSummary.maxTokens}</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-medium text-slate-500">审批 / Interrupt</div>
          {interrupt ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-sm font-medium text-slate-900">{interrupt.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {interrupt.targetType ?? "未知目标"}:{interrupt.targetId ?? "未提供"}
                </div>
                <div className="mt-2 text-sm text-slate-700">{interrupt.summary}</div>
              </div>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm"
                value={approvalNote}
                onChange={(event) => onApprovalNoteChange(event.target.value)}
                placeholder="审批备注（可选）"
              />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => onResolveInterrupt("approve")}>
                  同意
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => onResolveInterrupt("reject")}>
                  拒绝
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              当前没有待处理 interrupt。
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-medium text-slate-500">失败诊断</div>
          {diagnostics?.failureSummary ? (
            <div className="space-y-1 text-xs text-slate-700">
              <div>摘要: {diagnostics.failureSummary}</div>
              {diagnostics.failureCode ? <div>代码: {diagnostics.failureCode}</div> : null}
              {diagnostics.recoveryHint ? <div>建议: {diagnostics.recoveryHint}</div> : null}
            </div>
          ) : (
            <div className="text-xs text-slate-500">当前线程没有失败诊断信息。</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
