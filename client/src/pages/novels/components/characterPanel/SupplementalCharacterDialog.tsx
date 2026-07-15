import { useState } from "react";
import type {
  Character,
  CharacterCastRole,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerationMode,
  SupplementalCharacterGenerationResult,
} from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCastRoleLabel,
  getCharacterGenderLabel,
  getSupplementalRelationLabel,
  SUPPLEMENTAL_MODE_LABELS,
} from "./characterPanel.labels";
import type { SupplementalCharacterDialogActions } from "./characterPanel.types";

interface SupplementalCharacterDialogProps extends SupplementalCharacterDialogActions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characters: Character[];
  selectedCharacterId: string;
  isGeneratingSupplementalCharacters: boolean;
  isApplyingSupplementalCharacter: boolean;
}

export default function SupplementalCharacterDialog(props: SupplementalCharacterDialogProps) {
  const {
    open,
    onOpenChange,
    characters,
    selectedCharacterId,
    onGenerateSupplementalCharacters,
    isGeneratingSupplementalCharacters,
    onApplySupplementalCharacter,
    isApplyingSupplementalCharacter,
  } = props;
  const [supplementalMode, setSupplementalMode] = useState<SupplementalCharacterGenerationMode>("auto");
  const [supplementalAnchorIds, setSupplementalAnchorIds] = useState<string[]>([]);
  const [supplementalTargetRole, setSupplementalTargetRole] = useState<CharacterCastRole | "auto">("auto");
  const [supplementalCount, setSupplementalCount] = useState<"auto" | "1" | "2" | "3">("auto");
  const [supplementalPrompt, setSupplementalPrompt] = useState("");
  const [supplementalUseWorldContext, setSupplementalUseWorldContext] = useState(true);
  const [supplementalStatusMessage, setSupplementalStatusMessage] = useState("");
  const [supplementalResult, setSupplementalResult] = useState<SupplementalCharacterGenerationResult | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen && selectedCharacterId && supplementalAnchorIds.length === 0) {
      setSupplementalAnchorIds([selectedCharacterId]);
    }
  };

  const toggleSupplementalAnchor = (characterId: string) => {
    setSupplementalAnchorIds((prev) =>
      prev.includes(characterId)
        ? prev.filter((item) => item !== characterId)
        : [...prev, characterId],
    );
  };

  const handleGenerateSupplementalCharacters = async () => {
    if (supplementalMode === "linked" && characters.length === 0) {
      setSupplementalStatusMessage("当前还没有已建角色，不能基于关系补充角色。可以先建一个核心角色，或改用独立补位。");
      return;
    }

    try {
      const response = await onGenerateSupplementalCharacters({
        mode: supplementalMode,
        anchorCharacterIds: supplementalMode === "independent" ? [] : supplementalAnchorIds,
        targetCastRole: supplementalTargetRole,
        count: supplementalCount === "auto" ? undefined : Number(supplementalCount),
        userPrompt: supplementalPrompt.trim() || undefined,
        useWorldContext: supplementalUseWorldContext,
        worldFocusHints: supplementalUseWorldContext
          ? { forceCompliance: true }
          : undefined,
      });
      setSupplementalResult(response.data ?? null);
      setSupplementalStatusMessage(response.message ?? "补充角色候选已生成。");
    } catch (error) {
      setSupplementalStatusMessage(error instanceof Error ? error.message : "补充角色生成失败。");
    }
  };

  const handleApplySupplementalCharacter = async (candidate: SupplementalCharacterCandidate) => {
    try {
      const response = await onApplySupplementalCharacter(candidate);
      const createdName = response.data?.character?.name ?? candidate.name;
      const relationCount = response.data?.relationCount ?? 0;
      setSupplementalResult((prev) => prev
        ? {
          ...prev,
          candidates: prev.candidates.filter((item) => item.name !== candidate.name),
        }
        : prev);
      setSupplementalStatusMessage(
        response.message
        ?? `${createdName} 已加入当前小说${relationCount > 0 ? `，并同步 ${relationCount} 条关系` : ""}。`,
      );
    } catch (error) {
      setSupplementalStatusMessage(error instanceof Error ? error.message : "应用补充角色失败。");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pb-0 pt-6">
          <DialogTitle>补充角色</DialogTitle>
          <DialogDescription>
            适合补齐对手、同盟、压力源或关键关系人物。AI 会结合现有阵容给出可创建候选。
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-6 pt-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)] xl:overflow-hidden">
          <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4 xl:min-h-0 xl:overflow-y-auto">
            <div className="space-y-1">
              <div className="font-medium">补位方式</div>
              <div className="text-xs text-muted-foreground">
                默认交给 AI 判断；只有明确知道要补哪类人物时再手动指定。
              </div>
            </div>
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={supplementalMode}
              onChange={(event) => setSupplementalMode(event.target.value as SupplementalCharacterGenerationMode)}
            >
              <option value="auto">AI 判断当前更需要哪种补位</option>
              <option value="linked">基于现有角色衍生关系角色</option>
              <option value="independent">生成相对独立角色</option>
            </SelectControl>

            {characters.length > 0 && supplementalMode !== "independent" ? (
              <div className="space-y-2">
                <div className="font-medium">参考已有角色</div>
                <div className="text-xs text-muted-foreground">
                  可不选；不选时 AI 会自己判断应该围绕谁补位。
                </div>
                <div className="max-h-40 space-y-2 overflow-auto rounded-xl border bg-background/70 p-3">
                  {characters.map((character) => (
                    <label key={character.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={supplementalAnchorIds.includes(character.id)}
                        onChange={() => toggleSupplementalAnchor(character.id)}
                      />
                      <span>
                        {character.name}
                        <span className="ml-1 text-xs text-muted-foreground">({character.role})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="font-medium">期望角色功能</div>
                <SelectControl
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={supplementalTargetRole}
                  onChange={(event) => setSupplementalTargetRole(event.target.value as CharacterCastRole | "auto")}
                >
                  <option value="auto">AI 判断</option>
                  <option value="protagonist">主角</option>
                  <option value="antagonist">主对手</option>
                  <option value="ally">同盟</option>
                  <option value="foil">镜像角色</option>
                  <option value="mentor">导师</option>
                  <option value="love_interest">情感牵引</option>
                  <option value="pressure_source">压力源</option>
                  <option value="catalyst">催化者</option>
                </SelectControl>
              </div>
              <div className="space-y-2">
                <div className="font-medium">生成数量</div>
                <SelectControl
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={supplementalCount}
                  onChange={(event) => setSupplementalCount(event.target.value as "auto" | "1" | "2" | "3")}
                >
                  <option value="auto">AI 判断</option>
                  <option value="1">1 个</option>
                  <option value="2">2 个</option>
                  <option value="3">3 个</option>
                </SelectControl>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">额外说明</div>
              <textarea
                className="min-h-[140px] w-full rounded-xl border bg-background p-3 text-sm"
                placeholder="例如：补一个能持续给主角施压、但又不是纯反派的人；或补一个和母亲线相关的旧识。"
                value={supplementalPrompt}
                onChange={(event) => setSupplementalPrompt(event.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={supplementalUseWorldContext}
                onChange={(event) => setSupplementalUseWorldContext(event.target.checked)}
              />
              基于本书世界生成
            </label>

            <div className="flex flex-wrap gap-2">
              <AiButton
                onClick={handleGenerateSupplementalCharacters}
                disabled={isGeneratingSupplementalCharacters || (supplementalMode === "linked" && characters.length === 0)}
              >
                {isGeneratingSupplementalCharacters ? "生成中..." : "生成补充角色候选"}
              </AiButton>
              <Badge variant="outline">数量不选时由 AI 判断</Badge>
              <Badge variant="outline">关系角色会优先围绕现有角色补位</Badge>
            </div>

            {supplementalStatusMessage ? (
              <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
                {supplementalStatusMessage}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-background p-4 xl:min-h-0 xl:overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium">候选结果</div>
              {supplementalResult ? <Badge variant="outline">{supplementalResult.candidates.length} 个候选</Badge> : null}
              {supplementalResult?.mode ? <Badge variant="outline">本轮模式：{SUPPLEMENTAL_MODE_LABELS[supplementalResult.mode]}</Badge> : null}
            </div>
            {supplementalResult?.planningSummary ? (
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs text-muted-foreground">
                AI 判断：{supplementalResult.planningSummary}
              </div>
            ) : null}

            {isGeneratingSupplementalCharacters ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                正在分析当前角色网并生成补位候选...
              </div>
            ) : supplementalResult?.candidates.length ? (
              <div className="space-y-3">
                {supplementalResult.candidates.map((candidate) => (
                  <SupplementalCandidateCard
                    key={candidate.name}
                    candidate={candidate}
                    isApplyingSupplementalCharacter={isApplyingSupplementalCharacter}
                    onApply={() => void handleApplySupplementalCharacter(candidate)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
                先说明你想补哪类角色，或直接交给 AI 判断，再生成候选。
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SupplementalCandidateCard(props: {
  candidate: SupplementalCharacterCandidate;
  isApplyingSupplementalCharacter: boolean;
  onApply: () => void;
}) {
  const { candidate, isApplyingSupplementalCharacter, onApply } = props;

  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{candidate.name}</div>
            <Badge variant="outline">{candidate.role}</Badge>
            <Badge variant="secondary">{getCastRoleLabel(candidate.castRole)}</Badge>
            <Badge variant="outline">性别：{getCharacterGenderLabel(candidate.gender)}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">{candidate.summary}</div>
        </div>
        <Button size="sm" onClick={onApply} disabled={isApplyingSupplementalCharacter}>
          {isApplyingSupplementalCharacter ? "创建中..." : "创建这个角色"}
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          <div>故事作用：{candidate.storyFunction}</div>
          <div>与主角关系：{candidate.relationToProtagonist || "AI 未指定"}</div>
          <div>外在目标：{candidate.outerGoal || "待补全"}</div>
          <div>当前目标：{candidate.currentGoal || "待补全"}</div>
        </div>
        <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          <div>第一印象：{candidate.firstImpression || "待补全"}</div>
          <div>核心恐惧：{candidate.fear || "待补全"}</div>
          <div>错误信念：{candidate.misbelief || "待补全"}</div>
          <div>补位原因：{candidate.whyNow || "AI 未额外说明"}</div>
        </div>
      </div>

      {candidate.relations.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">建议同步的关系</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {candidate.relations.map((relation, index) => (
              <div key={`${candidate.name}-${relation.sourceName}-${relation.targetName}-${index}`} className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{getSupplementalRelationLabel(candidate, relation)}</div>
                <div>表层关系：{relation.surfaceRelation}</div>
                {relation.hiddenTension ? <div>隐藏张力：{relation.hiddenTension}</div> : null}
                {relation.conflictSource ? <div>冲突来源：{relation.conflictSource}</div> : null}
                {relation.nextTurnPoint ? <div>下一反转点：{relation.nextTurnPoint}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          这名角色更偏向独立补位，不强制写入角色关系。
        </div>
      )}
    </div>
  );
}
