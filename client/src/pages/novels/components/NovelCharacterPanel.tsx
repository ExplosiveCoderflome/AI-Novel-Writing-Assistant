import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { BaseCharacter, Character, CharacterTimeline } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  buildCharacterRelationRows,
  getLastAppearanceChapter,
  type QuickCharacterCreatePayload,
} from "./characterPanel.utils";

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

  const [relationToProtagonist, setRelationToProtagonist] = useState("");
  const [storyFunction, setStoryFunction] = useState("");
  const [wizardKeywords, setWizardKeywords] = useState("");
  const [autoGenerateProfile, setAutoGenerateProfile] = useState(true);
  const relationRows = useMemo(
    () => buildCharacterRelationRows(selectedCharacter, characters, timelineEvents),
    [characters, selectedCharacter, timelineEvents],
  );
  const lastAppearanceChapter = useMemo(
    () => getLastAppearanceChapter(timelineEvents),
    [timelineEvents],
  );
  const runtimeSignal = `${selectedCharacter?.currentState ?? ""} ${selectedCharacter?.currentGoal ?? ""}`;
  const secretStatus = /秘密|隐瞒|卧底|伪装/.test(runtimeSignal) ? "已隐藏关键信息" : "暂无显性秘密";
  const emotionSignal = /愤|怒|焦虑|崩溃|绝望/.test(runtimeSignal)
    ? "高压"
    : /平静|稳|冷静|从容/.test(runtimeSignal)
      ? "平稳"
      : "待观察";

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
    <div className="space-y-4">
      {characterMessage ? <div className="text-sm text-muted-foreground">{characterMessage}</div> : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>角色生成向导</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
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
              自动生成完整角色资产（性格/冲突点/伏笔点/状态）
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleQuickCreate} disabled={isQuickCreating || !quickCharacterForm.name.trim()}>
                {isQuickCreating ? "生成中..." : "AI生成角色卡"}
              </Button>
              <Button variant="secondary" onClick={onEvolveCharacter} disabled={isEvolvingCharacter || !selectedCharacterId}>
                {isEvolvingCharacter ? "补全中..." : "AI补全角色状态"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              当前已关联角色：{characters.length}，核心角色：{coreCharacterCount}。
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="font-medium">基础角色库导入</div>
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
                    <div className="space-y-1 rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{selectedBaseCharacter.name}</span>
                        <Badge variant={importedBaseCharacterIds.has(selectedBaseCharacter.id) ? "outline" : "secondary"}>
                          {importedBaseCharacterIds.has(selectedBaseCharacter.id) ? "已关联" : "未关联"}
                        </Badge>
                      </div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
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
                <div className="text-xs text-muted-foreground">基础角色库为空，请先创建。</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>角色资产面板</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {characters.length > 0 ? (
              <>
                <div className="max-h-40 space-y-2 overflow-auto">
                  {characters.map((character) => (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => onSelectedCharacterChange(character.id)}
                      className={`flex w-full items-center justify-between rounded-md border p-2 text-left ${
                        selectedCharacterId === character.id ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{character.name}</div>
                        <div className="text-xs text-muted-foreground">{character.role}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isDeletingCharacter && deletingCharacterId === character.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          const confirmed = window.confirm(`确认删除角色「${character.name}」？此操作不可恢复。`);
                          if (!confirmed) {
                            return;
                          }
                          onDeleteCharacter(character.id);
                        }}
                      >
                        {isDeletingCharacter && deletingCharacterId === character.id ? "删除中..." : "删除"}
                      </Button>
                    </button>
                  ))}
                </div>

                {!selectedCharacter ? (
                  <div className="text-muted-foreground">请选择一个角色查看资产。</div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-md border p-2">
                        <div className="text-xs text-muted-foreground">基础卡</div>
                        <div className="font-medium">{selectedCharacter.name}</div>
                        <div className="text-xs text-muted-foreground">身份：{selectedCharacter.role || "未定义"}</div>
                        <div className="text-xs text-muted-foreground">
                          最近出场章节：{lastAppearanceChapter ? `第${lastAppearanceChapter}章` : "暂无"}
                        </div>
                      </div>
                      <div className="rounded-md border p-2">
                        <div className="text-xs text-muted-foreground">运行状态卡</div>
                        <div className="text-xs text-muted-foreground">当前状态：{selectedCharacter.currentState || "待补全"}</div>
                        <div className="text-xs text-muted-foreground">当前目标：{selectedCharacter.currentGoal || "待补全"}</div>
                        <div className="text-xs text-muted-foreground">情绪基调：{emotionSignal}</div>
                        <div className="text-xs text-muted-foreground">秘密状态：{secretStatus}</div>
                      </div>
                    </div>

                    <div className="rounded-md border p-2">
                      <div className="text-xs text-muted-foreground">性格卡</div>
                      <div className="text-xs text-muted-foreground">核心性格：{selectedCharacter.personality || "待补全"}</div>
                      <div className="text-xs text-muted-foreground">
                        说话风格：{selectedCharacter.development?.includes("说话风格") ? "已定义" : "待补全"}
                      </div>
                      <div className="text-xs text-muted-foreground">行为偏好：{selectedCharacter.background || "待补全"}</div>
                      <div className="text-xs text-muted-foreground">禁止崩坏项：请在成长弧中明确约束。</div>
                    </div>

                    <details className="rounded-md border p-2">
                      <summary className="cursor-pointer font-medium">完整设定与编辑</summary>
                      <div className="mt-2 space-y-2">
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input
                            placeholder="角色名称"
                            value={characterForm.name}
                            onChange={(event) => onCharacterFormChange("name", event.target.value)}
                          />
                          <Input
                            placeholder="角色定位"
                            value={characterForm.role}
                            onChange={(event) => onCharacterFormChange("role", event.target.value)}
                          />
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input
                            placeholder="当前状态（例如：重伤闭关）"
                            value={characterForm.currentState}
                            onChange={(event) => onCharacterFormChange("currentState", event.target.value)}
                          />
                          <Input
                            placeholder="当前目标（例如：三个月内突破）"
                            value={characterForm.currentGoal}
                            onChange={(event) => onCharacterFormChange("currentGoal", event.target.value)}
                          />
                        </div>
                        <textarea
                          className="min-h-[70px] w-full rounded-md border bg-background p-2 text-sm"
                          placeholder="性格补充"
                          value={characterForm.personality}
                          onChange={(event) => onCharacterFormChange("personality", event.target.value)}
                        />
                        <textarea
                          className="min-h-[70px] w-full rounded-md border bg-background p-2 text-sm"
                          placeholder="背景补充"
                          value={characterForm.background}
                          onChange={(event) => onCharacterFormChange("background", event.target.value)}
                        />
                        <textarea
                          className="min-h-[70px] w-full rounded-md border bg-background p-2 text-sm"
                          placeholder="成长弧补充"
                          value={characterForm.development}
                          onChange={(event) => onCharacterFormChange("development", event.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={onSaveCharacter} disabled={isSavingCharacter}>
                            {isSavingCharacter ? "保存中..." : "保存角色资产"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={onSyncTimeline} disabled={isSyncingTimeline}>
                            {isSyncingTimeline ? "同步中..." : "同步角色时间线"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={onSyncAllTimeline} disabled={isSyncingAllTimeline}>
                            {isSyncingAllTimeline ? "同步中..." : "同步全部角色时间线"}
                          </Button>
                        </div>
                      </div>
                    </details>

                    <div className="space-y-2">
                      <div className="font-medium">角色事件流（最近 12 条）</div>
                      {timelineEvents.slice(-12).reverse().map((event) => (
                        <div key={event.id} className="rounded-md border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium">{event.title}</div>
                            <Badge variant="outline">{event.source}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {event.chapterOrder ? `章节 ${event.chapterOrder}` : "无章节归属"} · {new Date(event.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                      {timelineEvents.length === 0 ? (
                        <div className="text-muted-foreground">暂无事件，先点击“同步角色时间线”。</div>
                      ) : null}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-muted-foreground">当前小说还没有角色，先在左侧向导中创建。</div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>角色关系区</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onEvolveCharacter} disabled={isEvolvingCharacter || !selectedCharacterId}>
                {isEvolvingCharacter ? "分析中..." : "AI生成关系建议"}
              </Button>
              <Button variant="outline" onClick={onWorldCheck} disabled={isCheckingWorld || !selectedCharacterId}>
                {isCheckingWorld ? "检查中..." : "AI检查关系一致性"}
              </Button>
            </div>
            {!selectedCharacter ? (
              <div className="text-muted-foreground">请选择角色后查看关系表。</div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">
                  关系主角：{selectedCharacter.name}（{selectedCharacter.role}）
                </div>
                {relationRows.length > 0 ? (
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-2 py-2">角色A</th>
                          <th className="px-2 py-2">角色B</th>
                          <th className="px-2 py-2">当前关系</th>
                          <th className="px-2 py-2">趋势</th>
                          <th className="px-2 py-2">最近变化章节</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relationRows.map((row) => (
                          <tr key={row.targetCharacterId} className="border-b">
                            <td className="px-2 py-2">{selectedCharacter.name}</td>
                            <td className="px-2 py-2">{row.targetCharacterName}</td>
                            <td className="px-2 py-2">{row.currentRelation}</td>
                            <td className="px-2 py-2">{row.trend}</td>
                            <td className="px-2 py-2">
                              {row.lastChangedChapter ? `第${row.lastChangedChapter}章` : "暂无"}
                              <div className="line-clamp-2 text-[11px] text-muted-foreground">{row.evidence}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-muted-foreground">暂无可对照角色，请先新增至少 2 个角色。</div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
