import { Link } from "react-router-dom";
import type { BaseCharacter, Character, CharacterTimeline } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface QuickCharacterFormState {
  name: string;
  role: string;
}

interface CharacterFormState {
  personality: string;
  background: string;
  development: string;
  currentState: string;
  currentGoal: string;
}

interface NovelCharacterPanelProps {
  characterMessage: string;
  quickCharacterForm: QuickCharacterFormState;
  onQuickCharacterFormChange: (field: keyof QuickCharacterFormState, value: string) => void;
  onQuickCreateCharacter: () => void;
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
  onSyncTimeline: () => void;
  isSyncingTimeline: boolean;
  onSyncAllTimeline: () => void;
  isSyncingAllTimeline: boolean;
  onEvolveCharacter: () => void;
  isEvolvingCharacter: boolean;
  selectedCharacter?: Character;
  characterForm: CharacterFormState;
  onCharacterFormChange: (field: keyof CharacterFormState, value: string) => void;
  onSaveCharacter: () => void;
  isSavingCharacter: boolean;
  timelineEvents: CharacterTimeline[];
}

export default function NovelCharacterPanel(props: NovelCharacterPanelProps) {
  const {
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
    onSyncTimeline,
    isSyncingTimeline,
    onSyncAllTimeline,
    isSyncingAllTimeline,
    onEvolveCharacter,
    isEvolvingCharacter,
    selectedCharacter,
    characterForm,
    onCharacterFormChange,
    onSaveCharacter,
    isSavingCharacter,
    timelineEvents,
  } = props;

  return (
    <div className="space-y-4">
      {characterMessage ? <div className="text-sm text-muted-foreground">{characterMessage}</div> : null}
      <Card>
        <CardHeader><CardTitle>快速创建小说角色</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              placeholder="角色名称（必填）"
              value={quickCharacterForm.name}
              onChange={(event) => onQuickCharacterFormChange("name", event.target.value)}
            />
            <Input
              placeholder="角色定位（如主角/反派）"
              value={quickCharacterForm.role}
              onChange={(event) => onQuickCharacterFormChange("role", event.target.value)}
            />
            <Button
              onClick={onQuickCreateCharacter}
              disabled={isQuickCreating || !quickCharacterForm.name.trim()}
            >
              {isQuickCreating ? "创建中..." : "创建角色"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            当前已关联角色：{characters.length}，主角/反派数量：{coreCharacterCount}。
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>基础角色关联到当前小说</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
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
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{selectedBaseCharacter.name}</div>
                    {importedBaseCharacterIds.has(selectedBaseCharacter.id) ? (
                      <Badge variant="outline">已关联</Badge>
                    ) : (
                      <Badge variant="secondary">未关联</Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground">定位：{selectedBaseCharacter.role}</div>
                  <div className="text-muted-foreground line-clamp-2">性格：{selectedBaseCharacter.personality || "暂无"}</div>
                </div>
              ) : null}
              <div className="flex gap-2">
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
                  <Link to="/base-characters">前往基础角色库管理</Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">
              当前基础角色库为空，请先到“基础角色库”创建角色后再关联。
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>角色时间线与信息演进</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {characters.length > 0 ? (
            <>
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={selectedCharacterId}
                onChange={(event) => onSelectedCharacterChange(event.target.value)}
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}（{character.role}）
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={onSyncTimeline}
                  disabled={isSyncingTimeline || !selectedCharacterId}
                >
                  {isSyncingTimeline ? "同步中..." : "同步角色时间线"}
                </Button>
                <Button
                  variant="outline"
                  onClick={onSyncAllTimeline}
                  disabled={isSyncingAllTimeline}
                >
                  {isSyncingAllTimeline ? "全量同步中..." : "同步全部角色时间线"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={onEvolveCharacter}
                  disabled={isEvolvingCharacter || !selectedCharacterId}
                >
                  {isEvolvingCharacter ? "更新中..." : "AI更新角色信息"}
                </Button>
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-1 font-medium">角色当前状态</div>
                {!selectedCharacter ? (
                  <div className="text-muted-foreground">未选择角色。</div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input
                        placeholder="当前状态（例如：重伤闭关）"
                        value={characterForm.currentState}
                        onChange={(event) => onCharacterFormChange("currentState", event.target.value)}
                      />
                      <Input
                        placeholder="当前目标（例如：三月内突破）"
                        value={characterForm.currentGoal}
                        onChange={(event) => onCharacterFormChange("currentGoal", event.target.value)}
                      />
                    </div>
                    <textarea
                      className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm"
                      placeholder="性格补充"
                      value={characterForm.personality}
                      onChange={(event) => onCharacterFormChange("personality", event.target.value)}
                    />
                    <textarea
                      className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm"
                      placeholder="背景补充"
                      value={characterForm.background}
                      onChange={(event) => onCharacterFormChange("background", event.target.value)}
                    />
                    <textarea
                      className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm"
                      placeholder="成长弧补充"
                      value={characterForm.development}
                      onChange={(event) => onCharacterFormChange("development", event.target.value)}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        最近演进时间：
                        {selectedCharacter.lastEvolvedAt
                          ? new Date(selectedCharacter.lastEvolvedAt).toLocaleString()
                          : "暂无"}
                      </div>
                      <Button
                        size="sm"
                        onClick={onSaveCharacter}
                        disabled={isSavingCharacter || !selectedCharacterId}
                      >
                        {isSavingCharacter ? "保存中..." : "保存角色信息"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="font-medium">时间线事件（最近 20 条）</div>
                {timelineEvents.slice(-20).reverse().map((event) => (
                  <div key={event.id} className="rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{event.title}</div>
                      <Badge variant="outline">{event.source}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {event.chapterOrder ? `章节 ${event.chapterOrder}` : "无章节归属"} · {new Date(event.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{event.content}</div>
                  </div>
                ))}
                {timelineEvents.length === 0 ? (
                  <div className="text-muted-foreground">暂无角色时间线事件，先点击“同步角色时间线”。</div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">当前小说还没有角色，先在角色管理里创建角色。</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
