import { Check, Layers3, Sparkles } from "lucide-react";
import type { StoryModeOption, StoryModeTreeDraft } from "@/api/storyMode";
import LLMSelector from "@/components/common/LLMSelector";
import SelectControl from "@/components/common/SelectControl";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

interface StoryModeExpansionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootOptions: StoryModeOption[];
  parentId: string;
  onParentIdChange: (id: string) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  count: number;
  onCountChange: (value: number) => void;
  candidates: StoryModeTreeDraft[];
  selectedIndexes: number[];
  onToggle: (index: number) => void;
  onGenerate: () => void;
  onSave: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

export default function StoryModeExpansionDialog({
  open,
  onOpenChange,
  rootOptions,
  parentId,
  onParentIdChange,
  prompt,
  onPromptChange,
  count,
  onCountChange,
  candidates,
  selectedIndexes,
  onToggle,
  onGenerate,
  onSave,
  isGenerating,
  isSaving,
}: StoryModeExpansionDialogProps) {
  const canGenerate = !isGenerating;
  const canSave = selectedIndexes.length > 0 && !isSaving;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="max-w-3xl"
        title="扩展推进模式"
        description="从现有模式出发，补充玩法不同、可以直接用于创作的新方向。"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="button" onClick={onSave} disabled={!canSave}>
              {isSaving ? "保存中..." : `加入模式库${selectedIndexes.length ? `（${selectedIndexes.length}）` : ""}`}
            </Button>
          </>
        )}
      >
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-5 border-b border-border pb-5 lg:border-b-0 lg:border-r lg:pr-6 lg:pb-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Layers3 className="h-4 w-4 text-primary" aria-hidden="true" />
              扩展范围
            </div>
            <p className="text-xs leading-5 text-muted-foreground">不选择根模式时，AI 会从整套模式库中寻找空缺，推荐全新的根推进模式。</p>
            <SelectControl value={parentId} onChange={(event) => onParentIdChange(event.target.value)} className="w-full">
              <option value="">整个模式库（推荐新根模式）</option>
              {rootOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </SelectControl>
            <LLMSelector compact={false} showBadge={false} showHelperText={false} className="[&>div:first-child]:grid [&>div:first-child]:grid-cols-1 [&>div:first-child>*]:!w-full" />
            <label className="space-y-2 text-sm">
              <span className="font-medium">推荐数量</span>
              <SelectControl value={count} onChange={(event) => onCountChange(Number(event.target.value))} className="w-full">
                <option value={2}>2 个方向</option><option value={3}>3 个方向</option><option value={4}>4 个方向</option><option value={5}>5 个方向</option>
              </SelectControl>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">扩展偏好（可选）</span>
              <textarea
                rows={5}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                placeholder="例如：增加更强的经营回报，减少单纯战斗。"
              />
            </label>
            <Button type="button" className="w-full" onClick={onGenerate} disabled={!canGenerate}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {isGenerating ? "正在推荐..." : "推荐新方向"}
            </Button>
          </aside>
          <main className="min-w-0">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">候选推进模式</h3>
                <p className="mt-1 text-xs text-muted-foreground">选择想加入模式库的方向，保存后会挂在所选根模式下。</p>
              </div>
              {candidates.length ? <span className="text-xs text-muted-foreground">已选 {selectedIndexes.length}/{candidates.length}</span> : null}
            </div>
            {candidates.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">选择一个根模式，或保留“整个模式库”，再点击“推荐新方向”。</div>
            ) : (
              <div className="mt-5 space-y-3">
                {candidates.map((candidate, index) => {
                  const selected = selectedIndexes.includes(index);
                  return (
                    <button key={`${candidate.name}-${index}`} type="button" onClick={() => onToggle(index)} className={`w-full rounded-xl border p-4 text-left transition ${selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`} aria-pressed={selected}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                          {selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{candidate.name}</span>
                          <span className="mt-1 block text-sm leading-5 text-muted-foreground">{candidate.description || candidate.profile.coreDrive}</span>
                          <span className="mt-2 block text-xs leading-5 text-muted-foreground">推进单元：{candidate.profile.progressionUnits.join("、") || "待补充"} · 回报：{candidate.profile.readerReward || "待补充"}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
