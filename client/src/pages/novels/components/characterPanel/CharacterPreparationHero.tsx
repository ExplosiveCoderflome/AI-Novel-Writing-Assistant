import i18next from "i18next";
import type { Character } from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { StatusRail, StepActionBar, StepHero } from "../workspaceShell";

interface CharacterPreparationHeroProps {
  characters: Character[];
  coreCharacterCount: number;
  selectedCharacter?: Character;
  baseCharacterCount: number;
  pendingCharacterResourceCount: number;
  onOpenCreateDialog: () => void;
  onOpenSupplementalDialog: () => void;
  onEvolveCharacter: () => void;
  isEvolvingCharacter: boolean;
  selectedCharacterId: string;
}

export default function CharacterPreparationHero(props: CharacterPreparationHeroProps) {
  const {
    characters,
    coreCharacterCount,
    selectedCharacter,
    baseCharacterCount,
    pendingCharacterResourceCount,
    onOpenCreateDialog,
    onOpenSupplementalDialog,
    onEvolveCharacter,
    isEvolvingCharacter,
    selectedCharacterId,
  } = props;
  const recommendedAction = getRecommendedAction({
    characterCount: characters.length,
    coreCharacterCount,
    selectedCharacter,
    pendingCharacterResourceCount,
  });

  return (
    <StepHero
      eyebrow="角色阵容"
      title={i18next.t("home.characterPrep")}
      description={i18next.t("novels.characterPreparationHero.nnzsh3")}
      className="border border-border/60 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted))_100%)] shadow-sm"
    >
      <StatusRail
        items={[
          {
            label: i18next.t("dict.gen_4ffb3d3a"),
            value: characters.length,
            description: characters.length > 0 ? "阵容已开始成形。" : "先创建主角或导入基础角色。",
            tone: characters.length > 0 ? "success" : "warning",
          },
          {
            label: i18next.t("dict.gen_992862b2"),
            value: coreCharacterCount,
            description: coreCharacterCount > 0 ? "继续补足对手、同盟和压力源。" : "至少明确主角与主要对手。",
            tone: coreCharacterCount > 0 ? "success" : "warning",
          },
          {
            label: i18next.t("dict.gen_49f9d850"),
            value: selectedCharacter?.name ?? "尚未选择角色",
            description: selectedCharacter?.role || i18next.t("novels.characterPreparationHero.mtxnnc", { val1: baseCharacterCount }),
            tone: selectedCharacter ? "info" : "neutral",
          },
        ]}
      />
      <StepActionBar
        className="mt-4 border border-border/60 bg-background/80"
        label={i18next.t("novels.characterPreparationHero.vb6kkk")}
        description={recommendedAction}
        actions={(
          <>
            <Button onClick={onOpenCreateDialog}>{i18next.t("dict.gen_098d06b1")}</Button>
            <AiButton variant="outline" onClick={onOpenSupplementalDialog}>{i18next.t("dict.gen_d8d10894")}</AiButton>
            <AiButton
              variant="secondary"
              onClick={onEvolveCharacter}
              disabled={isEvolvingCharacter || !selectedCharacterId}
            >
              {isEvolvingCharacter ? "演进中..." : "AI 演进当前状态"}
            </AiButton>
          </>
        )}
      />
    </StepHero>
  );
}

function getRecommendedAction(input: {
  characterCount: number;
  coreCharacterCount: number;
  selectedCharacter?: Character;
  pendingCharacterResourceCount: number;
}): string {
  if (input.characterCount === 0) {
    return i18next.t("novels.characterPreparationHero.pf5yzd");
  }
  if (input.coreCharacterCount === 0) {
    return i18next.t("novels.characterPreparationHero.nbhff3");
  }
  if (input.pendingCharacterResourceCount > 0) {
    return i18next.t("novels.characterPreparationHero.ox81xv", { val1: input.pendingCharacterResourceCount });
  }
  if (!input.selectedCharacter) {
    return i18next.t("novels.characterPreparationHero.i0a8op");
  }
  return i18next.t("novels.characterPreparationHero.ruyund");
}
