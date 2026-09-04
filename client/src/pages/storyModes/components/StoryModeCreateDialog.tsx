import { Check, Layers3, RotateCcw, Sparkles } from "lucide-react";
import type { StoryModeTreeDraft } from "@/api/storyMode";
import LLMSelector from "@/components/common/LLMSelector";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import StoryModeProfileFields from "./StoryModeProfileFields";

interface StoryModeCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCreatingChild: boolean;
  selectedParentLabel: string;
  generationPrompt: string;
  onGenerationPromptChange: (value: string) => void;
  childDerivationCount: number;
  onChildDerivationCountChange: (value: number) => void;
  draft: StoryModeTreeDraft;
  onDraftChange: (updater: (draft: StoryModeTreeDraft) => StoryModeTreeDraft) => void;
  generatedChildCandidates: StoryModeTreeDraft[];
  selectedGeneratedChildIndexes: number[];
  activeGeneratedChildIndex: number | null;
  onApplyGeneratedChild: (draft: StoryModeTreeDraft, index: number) => void;
  onToggleGeneratedChildSelection: (index: number) => void;
  onGenerate: () => void;
  onReset: () => void;
  isGenerating: boolean;
  onSaveCurrent: () => void;
  isSavingCurrent: boolean;
  onSaveSelectedChildren: () => void;
  isSavingSelectedChildren: boolean;
}

function fieldClassName(): string {
  return "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
}

export default function StoryModeCreateDialog({
  open,
  onOpenChange,
  isCreatingChild,
  selectedParentLabel,
  generationPrompt,
  onGenerationPromptChange,
  childDerivationCount,
  onChildDerivationCountChange,
  draft,
  onDraftChange,
  generatedChildCandidates,
  selectedGeneratedChildIndexes,
  activeGeneratedChildIndex,
  onApplyGeneratedChild,
  onToggleGeneratedChildSelection,
  onGenerate,
  onReset,
  isGenerating,
  onSaveCurrent,
  isSavingCurrent,
  onSaveSelectedChildren,
  isSavingSelectedChildren,
}: StoryModeCreateDialogProps) {
  const hasGeneratedCandidates = isCreatingChild && generatedChildCandidates.length > 0;
  const canGenerate = isCreatingChild || generationPrompt.trim().length > 0;
  const saveDisabled = isSavingCurrent || isSavingSelectedChildren || !draft.name.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="h-[min(90vh,840px)] max-w-6xl"
        bodyClassName="overflow-y-auto p-0 lg:overflow-hidden"
        headerClassName="px-5 py-4 sm:px-6"
        title={isCreatingChild ? "新增推进模式子类" : "新建推进模式"}
        description={isCreatingChild
          ? "基于当前父类创建一个或多个细分推进方式，AI 可以先给出候选，你再决定保存哪些。"
          : "定义这本书靠什么持续推进和兑现。可以直接填写，也可以先让 AI 起草。"}
        footerClassName="flex-col-reverse gap-2 px-5 py-3 sm:flex-row sm:px-6"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            {hasGeneratedCandidates ? (
              <Button
                type="button"
                variant="outline"
                onClick={onSaveSelectedChildren}
                disabled={isSavingSelectedChildren || selectedGeneratedChildIndexes.length === 0}
              >
                {isSavingSelectedChildren
                  ? "保存中..."
                  : `保存选中子类 (${selectedGeneratedChildIndexes.length})`}
              </Button>
            ) : null}
            <Button type="button" onClick={onSaveCurrent} disabled={saveDisabled}>
              {isSavingCurrent ? "保存中..." : isCreatingChild ? "保存当前子类" : "保存推进模式"}
            </Button>
          </>
        )}
      >
        <div className="grid min-h-full lg:h-full lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="border-b border-border bg-muted/20 px-5 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Layers3 className="h-4 w-4" aria-hidden="true" />
                  创建位置
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">{selectedParentLabel}</div>
              </div>

              <div className="border-t border-border pt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  让 AI 起草
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {isCreatingChild
                    ? "补充想要的细分方向，也可以留空让 AI 根据父类自动衍生。"
                    : "描述这种模式如何持续制造目标、阻力和阶段回报。"}
                </p>
              </div>

              <LLMSelector
                compact={false}
                showBadge={false}
                showHelperText={false}
                className="[&>div:first-child]:grid [&>div:first-child]:grid-cols-1 [&>div:first-child>*]:!w-full"
              />

              {isCreatingChild ? (
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">候选数量</span>
                  <SelectControl
                    className="w-full"
                    value={childDerivationCount}
                    onChange={(event) => onChildDerivationCountChange(Number(event.target.value))}
                  >
                    <option value={1}>1 个</option>
                    <option value={2}>2 个</option>
                    <option value={3}>3 个</option>
                    <option value={4}>4 个</option>
                    <option value={5}>5 个</option>
                  </SelectControl>
                </label>
              ) : null}

              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">起草要求</span>
                <textarea
                  rows={6}
                  className={fieldClassName()}
                  value={generationPrompt}
                  onChange={(event) => onGenerationPromptChange(event.target.value)}
                  placeholder={isCreatingChild
                    ? "例如：增加偏经营建设的细分方向，回报来自势力扩张和资源积累。"
                    : "例如：主角通过经营据点持续获得资源，每个阶段都要完成建设目标并兑现势力成长。"}
                />
              </label>

              <div className="flex gap-2">
                <Button
                  type="button"
                  className="min-w-0 flex-1"
                  onClick={onGenerate}
                  disabled={!canGenerate || isGenerating}
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {isGenerating ? "正在起草..." : "生成草稿"}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  title="清空当前草稿"
                  aria-label="清空当前草稿"
                  onClick={onReset}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {hasGeneratedCandidates ? (
                <div className="border-t border-border pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">AI 候选</div>
                    <div className="text-xs text-muted-foreground">
                      已选 {selectedGeneratedChildIndexes.length}/{generatedChildCandidates.length}
                    </div>
                  </div>
                  <div className="mt-3 divide-y divide-border border-y border-border">
                    {generatedChildCandidates.map((candidate, index) => {
                      const selected = selectedGeneratedChildIndexes.includes(index);
                      const active = activeGeneratedChildIndex === index;
                      return (
                        <div key={`${candidate.name}-${index}`} className="flex items-start gap-3 py-3">
                          <button
                            type="button"
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                              selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
                            }`}
                            aria-label={`${selected ? "取消选择" : "选择"}${candidate.name}`}
                            aria-pressed={selected}
                            onClick={() => onToggleGeneratedChildSelection(index)}
                          >
                            {selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                          </button>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => onApplyGeneratedChild(candidate, index)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium text-foreground">{candidate.name}</span>
                              {active ? <span className="shrink-0 text-xs text-primary">编辑中</span> : null}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {candidate.description?.trim() || candidate.profile.coreDrive}
                            </p>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>

          <main className="min-w-0 px-5 py-5 lg:min-h-0 lg:overflow-y-auto lg:px-7 lg:py-6">
            <div className="mx-auto max-w-3xl space-y-7">
              <section>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">内容草稿</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      名称和核心驱动决定 AI 如何识别并使用这种推进方式。
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={onReset}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    清空
                  </Button>
                </div>

                <div className="mt-5 grid gap-4">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">名称</span>
                    <Input
                      value={draft.name}
                      placeholder="例如：势力经营"
                      onChange={(event) => onDraftChange((previous) => ({ ...previous, name: event.target.value }))}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">一句话定位</span>
                    <textarea
                      rows={2}
                      className={fieldClassName()}
                      value={draft.description ?? ""}
                      placeholder="说明这种模式靠什么持续推进，以及读者会获得什么体验。"
                      onChange={(event) => onDraftChange((previous) => ({ ...previous, description: event.target.value }))}
                    />
                  </label>
                </div>
              </section>

              {!isCreatingChild && draft.children.length > 0 ? (
                <section className="border-t border-border pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">同时创建的子类</h3>
                    <span className="text-xs text-muted-foreground">{draft.children.length} 个</span>
                  </div>
                  <div className="mt-3 divide-y divide-border border-y border-border">
                    {draft.children.map((child, index) => (
                      <div key={`${child.name}-${index}`} className="grid gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
                        <div className="text-sm font-medium text-foreground">{child.name || `未命名子类 ${index + 1}`}</div>
                        <div className="text-sm leading-5 text-muted-foreground">
                          {child.description?.trim() || child.profile.coreDrive || "等待补充说明"}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <StoryModeProfileFields
                value={draft.profile}
                onChange={(profile) => onDraftChange((previous) => ({ ...previous, profile }))}
              />

              <details className="border-t border-border pt-5">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  高级设置：人工提示补充
                </summary>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  仅在需要补充特殊写作约束时填写，普通推进模式可以留空。
                </p>
                <textarea
                  rows={4}
                  className={`mt-3 ${fieldClassName()}`}
                  value={draft.template ?? ""}
                  placeholder="补充仅适用于该模式的写作要求。"
                  onChange={(event) => onDraftChange((previous) => ({ ...previous, template: event.target.value }))}
                />
              </details>
            </div>
          </main>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
