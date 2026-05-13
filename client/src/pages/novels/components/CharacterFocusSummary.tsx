import type { Character } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { getCastRoleLabel, getCharacterGenderLabel, isProtagonistCharacter } from "./characterAssetWorkspace.helpers";

interface CharacterFocusSummaryProps {
  selectedCharacter: Character;
  lastAppearanceChapter?: number | null;
}

export default function CharacterFocusSummary(props: CharacterFocusSummaryProps) {
  const { selectedCharacter, lastAppearanceChapter } = props;
  const isProtagonist = isProtagonistCharacter(selectedCharacter);
  const focusTitle = isProtagonist
    ? `当前编辑主角：${selectedCharacter.name}`
    : `当前编辑角色：${selectedCharacter.name}`;
  const primaryLine = isProtagonist
    ? selectedCharacter.currentGoal || selectedCharacter.storyFunction || "待补全主角目标"
    : selectedCharacter.relationToProtagonist || selectedCharacter.role || "待补全与主角关系";

  return (
    <div className={`rounded-xl border p-4 ${isProtagonist ? "border-primary/30 bg-primary/5" : "bg-muted/10"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold">{focusTitle}</div>
            {isProtagonist ? (
              <Badge variant="secondary">主角</Badge>
            ) : (
              <Badge variant="outline">{getCastRoleLabel(selectedCharacter.castRole)}</Badge>
            )}
            <Badge variant="secondary">{getCharacterGenderLabel(selectedCharacter.gender)}</Badge>
          </div>
          <div className="text-sm leading-6 text-muted-foreground">
            {isProtagonist ? `当前目标：${primaryLine}` : `与主角关系：${primaryLine}`}
          </div>
        </div>
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:min-w-[320px]">
          <div>身份：{selectedCharacter.role || "未定义"}</div>
          <div>最近出场：{lastAppearanceChapter ? `第${lastAppearanceChapter}章` : "暂无"}</div>
          <div>故事作用：{selectedCharacter.storyFunction || "待补全"}</div>
          <div>当前状态：{selectedCharacter.currentState || "待补全"}</div>
        </div>
      </div>
    </div>
  );
}
