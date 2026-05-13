import type { Character } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isProtagonistCharacter } from "./characterAssetWorkspace.helpers";

interface CharacterAssetSidebarProps {
  characters: Character[];
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  onDeleteCharacter: (characterId: string) => void;
  isDeletingCharacter: boolean;
  deletingCharacterId: string;
}

function getCharacterCardClass(isSelected: boolean, isProtagonist: boolean): string {
  const selectedClass = isProtagonist
    ? "border-primary bg-primary/10 shadow-sm"
    : "border-primary bg-primary/5 shadow-sm";
  const idleClass = isProtagonist
    ? "border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10"
    : "border-border/70 hover:border-primary/30 hover:bg-muted/30";
  return `flex w-full items-stretch gap-2 rounded-xl border p-3 text-left transition ${
    isSelected ? selectedClass : idleClass
  }`;
}

function confirmDeleteCharacter(character: Character, onDeleteCharacter: (characterId: string) => void) {
  const confirmed = window.confirm(`确认删除角色“${character.name}”？此操作不可恢复。`);
  if (!confirmed) {
    return;
  }
  onDeleteCharacter(character.id);
}

function CharacterCard(props: {
  character: Character;
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  onDeleteCharacter: (characterId: string) => void;
  isDeletingCharacter: boolean;
  deletingCharacterId: string;
  isProtagonist?: boolean;
}) {
  const {
    character,
    selectedCharacterId,
    onSelectedCharacterChange,
    onDeleteCharacter,
    isDeletingCharacter,
    deletingCharacterId,
    isProtagonist = false,
  } = props;
  const isSelected = selectedCharacterId === character.id;
  const isDeletingThis = isDeletingCharacter && deletingCharacterId === character.id;
  const supportingLine = isProtagonist
    ? character.currentGoal || character.storyFunction || character.role || "待补全主角目标"
    : character.relationToProtagonist || character.role || "待补全角色定位";
  const supportingLabel = character.relationToProtagonist ? "与主角关系" : "定位";

  return (
    <div className={getCharacterCardClass(isSelected, isProtagonist)}>
      <button
        type="button"
        onClick={() => onSelectedCharacterChange(character.id)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate font-medium">{character.name}</div>
          {isProtagonist ? <Badge variant="secondary">主角</Badge> : null}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {isProtagonist ? `身份：${character.role || "待补全"}` : `${supportingLabel}：${supportingLine}`}
        </div>
        {isProtagonist ? (
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            当前目标：{supportingLine}
          </div>
        ) : null}
      </button>
      <Button
        size="sm"
        variant="destructive"
        disabled={isDeletingThis}
        onClick={() => confirmDeleteCharacter(character, onDeleteCharacter)}
        className="shrink-0 self-center"
      >
        {isDeletingThis ? "删除中..." : "删除"}
      </Button>
    </div>
  );
}

export default function CharacterAssetSidebar(props: CharacterAssetSidebarProps) {
  const {
    characters,
    selectedCharacterId,
    onSelectedCharacterChange,
    onDeleteCharacter,
    isDeletingCharacter,
    deletingCharacterId,
  } = props;
  const protagonist = characters.find(isProtagonistCharacter);
  const supportingCharacters = characters.filter((character) => !isProtagonistCharacter(character));

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Protagonist</div>
          {protagonist ? <Badge variant="outline">主角</Badge> : null}
        </div>
        {protagonist ? (
          <CharacterCard
            character={protagonist}
            selectedCharacterId={selectedCharacterId}
            onSelectedCharacterChange={onSelectedCharacterChange}
            onDeleteCharacter={onDeleteCharacter}
            isDeletingCharacter={isDeletingCharacter}
            deletingCharacterId={deletingCharacterId}
            isProtagonist
          />
        ) : (
          <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
            当前阵容还没有标记主角，可在角色定位中补充主角信息。
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          配角与关系角色
        </div>
        {characters.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            当前小说还没有角色，先在上方向导里创建或导入角色。
          </div>
        ) : supportingCharacters.length > 0 ? (
          <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
            {supportingCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                selectedCharacterId={selectedCharacterId}
                onSelectedCharacterChange={onSelectedCharacterChange}
                onDeleteCharacter={onDeleteCharacter}
                isDeletingCharacter={isDeletingCharacter}
                deletingCharacterId={deletingCharacterId}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            当前阵容只有主角，后续可补充对手、同盟或关系压力角色。
          </div>
        )}
      </section>
    </div>
  );
}
