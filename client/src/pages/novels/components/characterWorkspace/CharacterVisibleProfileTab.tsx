import { useState } from "react";
import type {
  Character,
  CharacterVisibleProfileBatchResult,
  CharacterVisibleProfileSuggestion,
} from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { VISIBLE_PROFILE_FIELDS } from "./characterWorkspace.helpers";

interface CharacterVisibleProfileTabProps {
  characters: Character[];
  selectedCharacter: Character;
  selectedCharacterId: string;
  onGenerateVisibleProfile: (userGuidance?: string) => void;
  isGeneratingVisibleProfile: boolean;
  visibleProfileSuggestion?: CharacterVisibleProfileSuggestion | null;
  onApplyVisibleProfile: () => void;
  isApplyingVisibleProfile: boolean;
  onGenerateBatchVisibleProfiles: (userGuidance?: string) => void;
  isGeneratingBatchVisibleProfiles: boolean;
  batchVisibleProfileResult?: CharacterVisibleProfileBatchResult | null;
  onApplyBatchVisibleProfiles: () => void;
  isApplyingBatchVisibleProfiles: boolean;
}

export default function CharacterVisibleProfileTab(props: CharacterVisibleProfileTabProps) {
  const {
    characters,
    selectedCharacter,
    selectedCharacterId,
    onGenerateVisibleProfile,
    isGeneratingVisibleProfile,
    visibleProfileSuggestion,
    onApplyVisibleProfile,
    isApplyingVisibleProfile,
    onGenerateBatchVisibleProfiles,
    isGeneratingBatchVisibleProfiles,
    batchVisibleProfileResult,
    onApplyBatchVisibleProfiles,
    isApplyingBatchVisibleProfiles,
  } = props;
  const [visibleProfileGuidance, setVisibleProfileGuidance] = useState("");
  const hasVisibleProfileSuggestionForSelected = Boolean(
    visibleProfileSuggestion
    && visibleProfileSuggestion.characterId === selectedCharacter.id,
  );
  const applicableVisibleProfileCount = Object.keys(visibleProfileSuggestion?.fields ?? {}).length;
  const batchApplicableCount = batchVisibleProfileResult?.results.filter((item) => item.hasApplicableChanges).length ?? 0;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium">外显资料生成</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              补齐外貌、体态、声音和登场记忆点，让角色在正文中更容易被读者识别。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AiButton
              size="sm"
              variant="outline"
              onClick={() => onGenerateVisibleProfile(visibleProfileGuidance)}
              disabled={isGeneratingVisibleProfile || !selectedCharacterId}
            >
              {isGeneratingVisibleProfile ? "生成中..." : "AI 补全外显资料"}
            </AiButton>
            <AiButton
              size="sm"
              variant="outline"
              onClick={() => onGenerateBatchVisibleProfiles(visibleProfileGuidance)}
              disabled={isGeneratingBatchVisibleProfiles || characters.length === 0}
            >
              {isGeneratingBatchVisibleProfiles ? "生成中..." : "批量补全角色外显资料"}
            </AiButton>
          </div>
        </div>
        <textarea
          className="mt-3 min-h-[72px] w-full rounded-md border bg-background p-2 text-sm"
          placeholder="补全倾向（可选）：例如更有压迫感、带一点病弱感、声音更温和、不要写成传统美人"
          value={visibleProfileGuidance}
          onChange={(event) => setVisibleProfileGuidance(event.target.value)}
        />
      </section>

      {isGeneratingVisibleProfile ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
          正在为“{selectedCharacter.name}”整理外貌、体态、声音和登场记忆点。
        </div>
      ) : null}

      {hasVisibleProfileSuggestionForSelected && visibleProfileSuggestion ? (
        <section className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">
                {applicableVisibleProfileCount > 0
                  ? `已为“${visibleProfileSuggestion.characterName}”生成 ${applicableVisibleProfileCount} 项可写入外显资料`
                  : `“${visibleProfileSuggestion.characterName}”当前没有可写入的外显资料`}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                请先看下面差异，确认后点击保存到角色卡。
              </div>
            </div>
            <Button
              size="sm"
              onClick={onApplyVisibleProfile}
              disabled={isApplyingVisibleProfile || applicableVisibleProfileCount === 0}
            >
              {isApplyingVisibleProfile ? "保存中..." : "保存到角色卡"}
            </Button>
          </div>
          {visibleProfileSuggestion.warnings.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">
              {visibleProfileSuggestion.warnings.map((warning) => (
                <div key={warning}>提醒：{warning}</div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {VISIBLE_PROFILE_FIELDS.map((field) => {
              const nextValue = visibleProfileSuggestion.fields[field.key];
              const skippedReason = visibleProfileSuggestion.skippedFields[field.key];
              return (
                <div key={field.key} className="rounded-md border bg-background/80 p-2 text-xs leading-5">
                  <div className="font-medium">{field.label}</div>
                  <div className="text-muted-foreground">当前：{selectedCharacter[field.key] || "待补全"}</div>
                  <div>建议：{nextValue || skippedReason || "暂不写入"}</div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {!isGeneratingVisibleProfile && !hasVisibleProfileSuggestionForSelected ? (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          点击“AI 补全外显资料”后，会先在这里显示即将保存的差异；确认后再保存到角色卡。
        </div>
      ) : null}

      {batchVisibleProfileResult ? (
        <section className="rounded-lg border border-border/70 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium">批量建议：{batchApplicableCount} 个角色可写入</div>
            <Button
              size="sm"
              onClick={onApplyBatchVisibleProfiles}
              disabled={isApplyingBatchVisibleProfiles || batchApplicableCount === 0}
            >
              {isApplyingBatchVisibleProfiles ? "写入中..." : "写入批量结果"}
            </Button>
          </div>
          <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
            {batchVisibleProfileResult.results.map((result) => (
              <div key={result.characterId} className="rounded-md border bg-muted/10 p-2 text-xs leading-5">
                <div className="font-medium">{result.characterName}</div>
                <div className="text-muted-foreground">
                  {result.hasApplicableChanges ? `可写入 ${Object.keys(result.fields).length} 项` : "没有可写入项"}
                </div>
                <div>{VISIBLE_PROFILE_FIELDS.map((field) => result.fields[field.key]).filter(Boolean).join(" / ")}</div>
              </div>
            ))}
            {batchVisibleProfileResult.skippedCharacters.map((item) => (
              <div key={item.characterId} className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                {item.characterName}：{item.reason}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-2 lg:grid-cols-2">
        {VISIBLE_PROFILE_FIELDS.map((field) => (
          <div key={field.key} className="rounded-lg border border-border/70 bg-muted/15 p-3">
            <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
            <div className="mt-1 text-sm leading-6">{selectedCharacter[field.key] || "待补全"}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
