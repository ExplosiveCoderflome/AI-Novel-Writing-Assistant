import { useMemo, useState } from "react";
import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import { BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS } from "@ai-novel/shared/types/bookAnalysisCharacter";
import { CHARACTER_PROFILE_FIELD_LABELS } from "@ai-novel/shared/types/characterProfile";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import BookAnalysisCharacterImagePanel from "./BookAnalysisCharacterImagePanel";

const DEFAULT_DIMENSIONS: BookAnalysisCharacterDimension[] = [
  "basic",
  "appearance",
  "personality",
  "motivation",
  "arc",
  "relations",
  "scenes",
];

const PROFILE_TEXT_FIELDS: Array<keyof CharacterProfile> = [
  "appearance",
  "personality",
  "outerGoal",
  "innerNeed",
  "speakingStyle",
  "growthTrajectory",
];

interface CharacterEditDraft {
  name: string;
  role: string;
  personality: string;
}

interface BookAnalysisCharacterPanelProps {
  analysisId: string;
  characters: BookAnalysisCharacter[];
  disabled: boolean;
  isLoading: boolean;
  pending: {
    generate: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  onGenerate: (input: {
    generationDepth: BookAnalysisCharacterGenerationDepth;
    selectedDimensions: BookAnalysisCharacterDimension[];
    characterNames?: string[];
  }) => Promise<void>;
  onCreate: (input: {
    name: string;
    role: string;
    profile?: Partial<CharacterProfile>;
    generationDepth?: BookAnalysisCharacterGenerationDepth;
    selectedDimensions?: BookAnalysisCharacterDimension[];
  }) => Promise<void>;
  onUpdate: (
    characterId: string,
    input: {
      name?: string;
      role?: string;
      profile?: Partial<CharacterProfile>;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    },
  ) => Promise<void>;
  onDelete: (characterId: string) => Promise<void>;
}

function splitCharacterNames(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function toggleDimension(
  dimensions: BookAnalysisCharacterDimension[],
  dimension: BookAnalysisCharacterDimension,
): BookAnalysisCharacterDimension[] {
  if (dimensions.includes(dimension)) {
    const next = dimensions.filter((item) => item !== dimension);
    return next.length > 0 ? next : ["basic"];
  }
  return [...dimensions, dimension];
}

function buildEditDraft(character: BookAnalysisCharacter): CharacterEditDraft {
  return {
    name: character.name,
    role: character.role,
    personality: character.profile.personality ?? "",
  };
}

export default function BookAnalysisCharacterPanel(props: BookAnalysisCharacterPanelProps) {
  const {
    characters,
    analysisId,
    disabled,
    isLoading,
    pending,
    onGenerate,
    onCreate,
    onUpdate,
    onDelete,
  } = props;
  const [generationDepth, setGenerationDepth] = useState<BookAnalysisCharacterGenerationDepth>("standard");
  const [selectedDimensions, setSelectedDimensions] = useState<BookAnalysisCharacterDimension[]>(DEFAULT_DIMENSIONS);
  const [characterNamesText, setCharacterNamesText] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualRole, setManualRole] = useState("");
  const [manualPersonality, setManualPersonality] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState<CharacterEditDraft | null>(null);

  const generateDisabled = disabled || pending.generate || selectedDimensions.length === 0;
  const createDisabled = disabled || pending.create || !manualName.trim() || !manualRole.trim();
  const characterNames = useMemo(() => splitCharacterNames(characterNamesText), [characterNamesText]);

  const handleGenerate = async () => {
    if (generateDisabled) {
      return;
    }
    await onGenerate({
      generationDepth,
      selectedDimensions,
      characterNames: characterNames.length > 0 ? characterNames : undefined,
    });
  };

  const handleCreate = async () => {
    if (createDisabled) {
      return;
    }
    await onCreate({
      name: manualName.trim(),
      role: manualRole.trim(),
      profile: manualPersonality.trim() ? { personality: manualPersonality.trim() } : undefined,
      generationDepth: "quick",
      selectedDimensions: ["basic", "personality"],
    });
    setManualName("");
    setManualRole("");
    setManualPersonality("");
  };

  const startEdit = (character: BookAnalysisCharacter) => {
    setEditingId(character.id);
    setEditDraft(buildEditDraft(character));
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditDraft(null);
  };

  const saveEdit = async (characterId: string) => {
    if (!editDraft?.name.trim() || !editDraft.role.trim()) {
      return;
    }
    await onUpdate(characterId, {
      name: editDraft.name.trim(),
      role: editDraft.role.trim(),
      profile: editDraft.personality.trim() ? { personality: editDraft.personality.trim() } : { personality: "" },
    });
    cancelEdit();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>角色档案</CardTitle>
          <Badge variant="outline">{characters.length} 位</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={generationDepth}
                onChange={(event) => setGenerationDepth(event.target.value as BookAnalysisCharacterGenerationDepth)}
                disabled={disabled || pending.generate}
              >
                <option value="quick">快速</option>
                <option value="standard">标准</option>
                <option value="deep">深入</option>
              </select>
              <Input
                value={characterNamesText}
                onChange={(event) => setCharacterNamesText(event.target.value)}
                placeholder="可指定角色名，用逗号分隔"
                disabled={disabled || pending.generate}
              />
              <Button size="sm" onClick={() => void handleGenerate()} disabled={generateDisabled}>
                {pending.generate ? "生成中..." : "生成角色档案"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_DIMENSIONS.map((dimension) => (
                <Button
                  key={dimension}
                  size="sm"
                  variant={selectedDimensions.includes(dimension) ? "default" : "outline"}
                  onClick={() => setSelectedDimensions((current) => toggleDimension(current, dimension))}
                  disabled={disabled || pending.generate}
                >
                  {BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS[dimension]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <Input
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              placeholder="角色名"
              disabled={disabled || pending.create}
            />
            <Input
              value={manualRole}
              onChange={(event) => setManualRole(event.target.value)}
              placeholder="角色定位"
              disabled={disabled || pending.create}
            />
            <textarea
              className="min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={manualPersonality}
              onChange={(event) => setManualPersonality(event.target.value)}
              placeholder="性格或关键表现"
              disabled={disabled || pending.create}
            />
            <Button size="sm" variant="outline" onClick={() => void handleCreate()} disabled={createDisabled}>
              手动添加
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">正在读取角色档案。</div>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-2">
          {characters.map((character) => {
            const isEditing = editingId === character.id && editDraft;
            return (
              <div key={character.id} className="rounded-md border p-3 text-sm">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editDraft.name}
                      onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                      disabled={pending.update}
                    />
                    <Input
                      value={editDraft.role}
                      onChange={(event) => setEditDraft({ ...editDraft, role: event.target.value })}
                      disabled={pending.update}
                    />
                    <textarea
                      className="min-h-[84px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={editDraft.personality}
                      onChange={(event) => setEditDraft({ ...editDraft, personality: event.target.value })}
                      disabled={pending.update}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void saveEdit(character.id)} disabled={pending.update}>
                        保存
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit} disabled={pending.update}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-base font-medium">{character.name}</div>
                        <div className="mt-1 text-muted-foreground">{character.role}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(character)} disabled={disabled}>
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void onDelete(character.id)}
                          disabled={disabled || pending.delete}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {PROFILE_TEXT_FIELDS.map((field) => {
                        const value = character.profile[field];
                        return typeof value === "string" && value.trim() ? (
                          <div key={field} className="rounded-md bg-muted/30 p-2">
                            <div className="text-xs text-muted-foreground">{CHARACTER_PROFILE_FIELD_LABELS[field]}</div>
                            <div className="mt-1 whitespace-pre-wrap">{value}</div>
                          </div>
                        ) : null;
                      })}
                    </div>
                    {character.arcs.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="font-medium">弧线节点</div>
                        {character.arcs.map((arc) => (
                          <div key={arc.id} className="rounded-md border bg-background p-2">
                            <div>{arc.stageLabel}</div>
                            {arc.chapterIndex !== null && arc.chapterIndex !== undefined ? (
                              <div className="mt-1 text-xs text-muted-foreground">第 {arc.chapterIndex + 1} 章</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {character.scenes.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="font-medium">场景表现</div>
                        {character.scenes.map((scene) => (
                          <div key={scene.id} className="rounded-md border bg-background p-2">
                            <div>{scene.sceneLabel}</div>
                            {scene.sceneType ? (
                              <div className="mt-1 text-xs text-muted-foreground">{scene.sceneType}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <BookAnalysisCharacterImagePanel
                      analysisId={analysisId}
                      character={character}
                      disabled={disabled}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {!isLoading && characters.length === 0 ? (
          <div className="text-sm text-muted-foreground">可从人物系统生成角色档案，或先手动添加一个角色。</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
