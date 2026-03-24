import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { BaseCharacter, Character, CharacterTimeline } from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import CharacterAssetWorkspace from "./CharacterAssetWorkspace";
import CharacterCastOptionsSection from "./CharacterCastOptionsSection";
import type { QuickCharacterCreatePayload } from "./characterPanel.utils";

interface QuickCharacterFormState {
  name: string;
  role: string;
}

interface CharacterFormState {
  name: string;
  role: string;
  personality: string;
  background: string;
  development: string;
  currentState: string;
  currentGoal: string;
}

interface NovelCharacterPanelProps {
  novelId: string;
  llmProvider?: LLMProvider;
  llmModel?: string;
  characterMessage: string;
  quickCharacterForm: QuickCharacterFormState;
  onQuickCharacterFormChange: (field: keyof QuickCharacterFormState, value: string) => void;
  onQuickCreateCharacter: (payload: QuickCharacterCreatePayload) => void;
  isQuickCreating: boolean;
  characters: Character[];
  coreCharacterCount: number;
  baseCharacters: BaseCharacter[];
  selectedBaseCharacterId: string;
  onSelectedBaseCharacterChange: (id: string) => void;
  selectedBaseCharacter?: BaseCharacter;
  importedBaseCharacterIds: Set<string>;
  onImportBaseCharacter: () => void;
  isImportingBaseCharacter: boolean;
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  onDeleteCharacter: (characterId: string) => void;
  isDeletingCharacter: boolean;
  deletingCharacterId: string;
  onSyncTimeline: () => void;
  isSyncingTimeline: boolean;
  onSyncAllTimeline: () => void;
  isSyncingAllTimeline: boolean;
  onEvolveCharacter: () => void;
  isEvolvingCharacter: boolean;
  onWorldCheck: () => void;
  isCheckingWorld: boolean;
  selectedCharacter?: Character;
  characterForm: CharacterFormState;
  onCharacterFormChange: (field: keyof CharacterFormState, value: string) => void;
  onSaveCharacter: () => void;
  isSavingCharacter: boolean;
  timelineEvents: CharacterTimeline[];
}

export default function NovelCharacterPanel(props: NovelCharacterPanelProps) {
  const {
    novelId,
    llmProvider,
    llmModel,
    characterMessage,
    quickCharacterForm,
    onQuickCharacterFormChange,
    onQuickCreateCharacter,
    isQuickCreating,
    characters,
    coreCharacterCount,
    baseCharacters,
    selectedBaseCharacterId,
    onSelectedBaseCharacterChange,
    selectedBaseCharacter,
    importedBaseCharacterIds,
    onImportBaseCharacter,
    isImportingBaseCharacter,
    selectedCharacterId,
    onSelectedCharacterChange,
    onDeleteCharacter,
    isDeletingCharacter,
    deletingCharacterId,
    onSyncTimeline,
    isSyncingTimeline,
    onSyncAllTimeline,
    isSyncingAllTimeline,
    onEvolveCharacter,
    isEvolvingCharacter,
    onWorldCheck,
    isCheckingWorld,
    selectedCharacter,
    characterForm,
    onCharacterFormChange,
    onSaveCharacter,
    isSavingCharacter,
    timelineEvents,
  } = props;

  const [isCharacterEntryOpen, setIsCharacterEntryOpen] = useState(false);
  const [relationToProtagonist, setRelationToProtagonist] = useState("");
  const [storyFunction, setStoryFunction] = useState("");
  const [wizardKeywords, setWizardKeywords] = useState("");
  const [autoGenerateProfile, setAutoGenerateProfile] = useState(true);
  const previousQuickCreating = useRef(isQuickCreating);

  useEffect(() => {
    if (previousQuickCreating.current && !isQuickCreating && !quickCharacterForm.name.trim()) {
      setIsCharacterEntryOpen(false);
      setRelationToProtagonist("");
      setStoryFunction("");
      setWizardKeywords("");
      setAutoGenerateProfile(true);
    }
    previousQuickCreating.current = isQuickCreating;
  }, [isQuickCreating, quickCharacterForm.name]);

  const handleQuickCreate = () => {
    const payload: QuickCharacterCreatePayload = {
      name: quickCharacterForm.name,
      role: quickCharacterForm.role,
      relationToProtagonist,
      storyFunction,
      keywords: wizardKeywords,
      autoGenerateProfile,
    };
    onQuickCreateCharacter(payload);
  };

  return (
    <div className="space-y-5">
      {characterMessage ? <div className="text-sm text-muted-foreground">{characterMessage}</div> : null}

      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/30">
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Character Prep
              </div>
              <div className="text-2xl font-semibold tracking-tight text-foreground">
                日常主区只保留角色资产
              </div>
              <div className="max-w-2xl text-sm leading-6 text-muted-foreground">
                新增角色和阵容重建都属于阶段性动作，不应该长期挤占角色页主区。这里把它们降成按需入口，把主要空间还给角色资产编辑。
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">已建角色</div>
                <div className="mt-2 text-2xl font-semibold">{characters.length}</div>
                <div className="mt-1 text-xs text-muted-foreground">先把推动主线的人物占位补齐。</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">核心角色</div>
                <div className="mt-2 text-2xl font-semibold">{coreCharacterCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">至少明确主角与主要对手。</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">当前焦点</div>
                <div className="mt-2 text-base font-semibold">{selectedCharacter?.name ?? "尚未选择角色"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedCharacter?.role || `${baseCharacters.length} 个基础角色可导入`}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-background/70 p-3">
            <Button onClick={() => setIsCharacterEntryOpen(true)}>新增角色</Button>
            <Button
              variant="secondary"
              onClick={onEvolveCharacter}
              disabled={isEvolvingCharacter || !selectedCharacterId}
            >
              {isEvolvingCharacter ? "补全中..." : "AI 补全当前角色"}
            </Button>
            <Badge variant="outline">低频入口：新增角色 / 导入角色</Badge>
            <div className="text-xs text-muted-foreground">
              日常编辑建议直接在下方“角色资产工作台”里处理。
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCharacterEntryOpen} onOpenChange={setIsCharacterEntryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增角色</DialogTitle>
            <DialogDescription>
              只有在新建角色或从基础角色库导入时才需要打开这里。日常维护请直接使用角色资产工作台。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="space-y-3 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="font-medium">快速创建</div>
                <div className="text-xs text-muted-foreground">
                  适合临时补一个新人物占位，再交给下方工作台慢慢打磨。
                </div>
              </div>
              <Input
                placeholder="角色名称（必填）"
                value={quickCharacterForm.name}
                onChange={(event) => onQuickCharacterFormChange("name", event.target.value)}
              />
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={quickCharacterForm.role}
                onChange={(event) => onQuickCharacterFormChange("role", event.target.value)}
              >
                <option value="主角">主角</option>
                <option value="配角">配角</option>
                <option value="反派">反派</option>
                <option value="导师">导师</option>
                <option value="情感线">情感线</option>
                <option value="功能角色">功能角色</option>
              </select>
              <Input
                placeholder="与主角关系（如：试探合作）"
                value={relationToProtagonist}
                onChange={(event) => setRelationToProtagonist(event.target.value)}
              />
              <Input
                placeholder="在故事中的作用（如：推动真相线）"
                value={storyFunction}
                onChange={(event) => setStoryFunction(event.target.value)}
              />
              <Input
                placeholder="角色关键词（逗号分隔）"
                value={wizardKeywords}
                onChange={(event) => setWizardKeywords(event.target.value)}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoGenerateProfile}
                  onChange={(event) => setAutoGenerateProfile(event.target.checked)}
                />
                自动补齐性格、背景、成长弧和当前状态
              </label>
              <Button onClick={handleQuickCreate} disabled={isQuickCreating || !quickCharacterForm.name.trim()}>
                {isQuickCreating ? "生成中..." : "AI 生成角色卡"}
              </Button>
            </div>

            <div className="space-y-3 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="font-medium">从基础角色库导入</div>
                <div className="text-xs text-muted-foreground">
                  适合快速引入成熟模板，再按当前小说需求继续微调。
                </div>
              </div>
              {baseCharacters.length > 0 ? (
                <>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={selectedBaseCharacterId}
                    onChange={(event) => onSelectedBaseCharacterChange(event.target.value)}
                  >
                    {baseCharacters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}（{character.role}）
                      </option>
                    ))}
                  </select>
                  {selectedBaseCharacter ? (
                    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{selectedBaseCharacter.name}</span>
                        <Badge variant={importedBaseCharacterIds.has(selectedBaseCharacter.id) ? "outline" : "secondary"}>
                          {importedBaseCharacterIds.has(selectedBaseCharacter.id) ? "已关联" : "未关联"}
                        </Badge>
                      </div>
                      <div className="line-clamp-3 text-xs text-muted-foreground">
                        性格：{selectedBaseCharacter.personality || "暂无"}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={onImportBaseCharacter}
                      disabled={
                        isImportingBaseCharacter
                        || !selectedBaseCharacter
                        || importedBaseCharacterIds.has(selectedBaseCharacter.id)
                      }
                    >
                      {isImportingBaseCharacter ? "导入中..." : "导入为小说角色"}
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/base-characters">管理基础角色库</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  基础角色库为空，请先创建。
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CharacterCastOptionsSection
        novelId={novelId}
        characters={characters}
        selectedCharacter={selectedCharacter}
        onSelectedCharacterChange={onSelectedCharacterChange}
        llmProvider={llmProvider}
        llmModel={llmModel}
      />

      <CharacterAssetWorkspace
        characters={characters}
        selectedCharacterId={selectedCharacterId}
        onSelectedCharacterChange={onSelectedCharacterChange}
        onDeleteCharacter={onDeleteCharacter}
        isDeletingCharacter={isDeletingCharacter}
        deletingCharacterId={deletingCharacterId}
        selectedCharacter={selectedCharacter}
        characterForm={characterForm}
        onCharacterFormChange={onCharacterFormChange}
        onSaveCharacter={onSaveCharacter}
        isSavingCharacter={isSavingCharacter}
        timelineEvents={timelineEvents}
        onSyncTimeline={onSyncTimeline}
        isSyncingTimeline={isSyncingTimeline}
        onSyncAllTimeline={onSyncAllTimeline}
        isSyncingAllTimeline={isSyncingAllTimeline}
        onWorldCheck={onWorldCheck}
        isCheckingWorld={isCheckingWorld}
      />
    </div>
  );
}
