import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
    ? selectedCharacter.currentGoal || selectedCharacter.storyFunction || t("gen.pages.novels.components.CharacterFocusSummary.gen_9a0efb70")
    : selectedCharacter.relationToProtagonist || selectedCharacter.role || t("gen.pages.novels.components.CharacterFocusSummary.gen_e6c6b262");

  return (
    <div className={`rounded-xl border p-4 ${isProtagonist ? "border-primary/30 bg-primary/5" : "bg-muted/10"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold">{focusTitle}</div>
            {isProtagonist ? (
              <Badge variant="secondary">{t("gen.pages.novels.components.CharacterFocusSummary.mainCharacter")}</Badge>
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
          <div>{t("gen.pages.novels.components.CharacterFocusSummary.gen_2adcb049")}</div>
          <div>最近出场：{lastAppearanceChapter ? `第${lastAppearanceChapter}章` : t("gen.pages.novels.components.CharacterFocusSummary.gen_f61f4cf6")}</div>
          <div>{t("gen.pages.novels.components.CharacterFocusSummary.gen_7e669142")}</div>
          <div>{t("gen.pages.novels.components.CharacterFocusSummary.gen_a4b217b8")}</div>
        </div>
      </div>
    </div>
  );
}
