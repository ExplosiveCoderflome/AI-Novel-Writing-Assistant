import { useMemo } from "react";
import type { Character, CharacterCastRole, CharacterGender, CharacterTimeline } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLastAppearanceChapter } from "./characterPanel.utils";

interface CharacterFormState {
  name: string;
  role: string;
  gender: CharacterGender;
  personality: string;
  background: string;
  development: string;
  currentState: string;
  currentGoal: string;
}

interface CharacterAssetWorkspaceProps {
  characters: Character[];
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  onDeleteCharacter: (characterId: string) => void;
  isDeletingCharacter: boolean;
  deletingCharacterId: string;
  selectedCharacter?: Character;
  characterForm: CharacterFormState;
  onCharacterFormChange: (field: keyof CharacterFormState, value: string) => void;
  onSaveCharacter: () => void;
  isSavingCharacter: boolean;
  timelineEvents: CharacterTimeline[];
  onSyncTimeline: () => void;
  isSyncingTimeline: boolean;
  onSyncAllTimeline: () => void;
  isSyncingAllTimeline: boolean;
  onWorldCheck: () => void;
  isCheckingWorld: boolean;
}

const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = {
  protagonist: "主角",
  antagonist: "主对手",
  ally: "同盟",
  foil: "镜像角色",
  mentor: "导师",
  love_interest: "情感牵引",
  pressure_source: "压力源",
  catalyst: "催化者",
};

const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: "男",
  female: "女",
  other: "其他",
  unknown: "未知",
};

function getCastRoleLabel(castRole?: CharacterCastRole | null): string {
  if (!castRole) {
    return "未定义";
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return "未知";
  }
  return CHARACTER_GENDER_LABELS[gender] ?? gender;
}

function getSecretStatus(selectedCharacter?: Character): string {
  if (!selectedCharacter) {
    return "暂无";
  }
  if (selectedCharacter.secret?.trim()) {
    return "存在明确秘密";
  }
  const runtimeSignal = `${selectedCharacter.currentState ?? ""} ${selectedCharacter.currentGoal ?? ""}`;
  return /秘密|隐瞒|卧底|伪装/.test(runtimeSignal) ? "已隐藏关键信息" : "暂无显性秘密";
}

function getEmotionSignal(selectedCharacter?: Character): string {
  const runtimeSignal = `${selectedCharacter?.currentState ?? ""} ${selectedCharacter?.currentGoal ?? ""}`;
  if (/愤|怒|焦虑|崩溃|绝望/.test(runtimeSignal)) {
    return "高压";
  }
  if (/平静|稳|冷静|从容/.test(runtimeSignal)) {
    return "平稳";
  }
  return "待观察";
}

export default function CharacterAssetWorkspace(props: CharacterAssetWorkspaceProps) {
  const {
    characters,
    selectedCharacterId,
    onSelectedCharacterChange,
    onDeleteCharacter,
    isDeletingCharacter,
    deletingCharacterId,
    selectedCharacter,
    characterForm,
    onCharacterFormChange,
    onSaveCharacter,
    isSavingCharacter,
    timelineEvents,
    onSyncTimeline,
    isSyncingTimeline,
    onSyncAllTimeline,
    isSyncingAllTimeline,
    onWorldCheck,
    isCheckingWorld,
  } = props;

  const lastAppearanceChapter = useMemo(
    () => getLastAppearanceChapter(timelineEvents),
    [timelineEvents],
  );
  const emotionSignal = getEmotionSignal(selectedCharacter);
  const secretStatus = getSecretStatus(selectedCharacter);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <CardTitle>角色资产工作台</CardTitle>
            <div className="text-sm text-muted-foreground">
              左侧负责切换角色，右侧集中处理当前角色的状态、动机、成长弧和时间线。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{characters.length} 个已建角色</Badge>
            {selectedCharacter ? <Badge variant="secondary">当前聚焦：{selectedCharacter.name}</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Character List
          </div>
          {characters.length > 0 ? (
            <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
              {characters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => onSelectedCharacterChange(character.id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                    selectedCharacterId === character.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/70 hover:border-primary/30 hover:bg-muted/30"
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
                      const confirmed = window.confirm(`确认删除角色“${character.name}”？此操作不可恢复。`);
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
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              当前小说还没有角色，先在上方向导里创建或导入角色。
            </div>
          )}
        </div>

        {!selectedCharacter ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
            先从左侧选择一个角色，再进入详细资产编辑。
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">基础身份</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="font-medium">{selectedCharacter.name}</div>
                  <Badge variant="outline">{getCastRoleLabel(selectedCharacter.castRole)}</Badge>
                  <Badge variant="secondary">{getCharacterGenderLabel(selectedCharacter.gender)}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">身份：{selectedCharacter.role || "未定义"}</div>
                <div className="text-xs text-muted-foreground">
                  最近出场章节：{lastAppearanceChapter ? `第${lastAppearanceChapter}章` : "暂无"}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">运行状态</div>
                <div className="mt-2 text-xs text-muted-foreground">当前状态：{selectedCharacter.currentState || "待补全"}</div>
                <div className="text-xs text-muted-foreground">当前目标：{selectedCharacter.currentGoal || "待补全"}</div>
                <div className="text-xs text-muted-foreground">情绪基调：{emotionSignal}</div>
                <div className="text-xs text-muted-foreground">秘密状态：{secretStatus}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">戏剧蓝图</div>
                <div className="mt-2 text-xs text-muted-foreground">故事作用：{selectedCharacter.storyFunction || "待补全"}</div>
                <div className="text-xs text-muted-foreground">
                  与主角关系：{selectedCharacter.relationToProtagonist || "待补全"}
                </div>
                <div className="text-xs text-muted-foreground">外在目标：{selectedCharacter.outerGoal || "待补全"}</div>
                <div className="text-xs text-muted-foreground">内在需求：{selectedCharacter.innerNeed || "待补全"}</div>
                <div className="text-xs text-muted-foreground">
                  恐惧 / 伤口：{selectedCharacter.fear || selectedCharacter.wound || "待补全"}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">性格与成长弧</div>
                <div className="mt-2 text-xs text-muted-foreground">核心性格：{selectedCharacter.personality || "待补全"}</div>
                <div className="text-xs text-muted-foreground">背景：{selectedCharacter.background || "待补全"}</div>
                <div className="text-xs text-muted-foreground">成长弧：{selectedCharacter.development || "待补全"}</div>
                <div className="text-xs text-muted-foreground">错误信念：{selectedCharacter.misbelief || "待补全"}</div>
                <div className="text-xs text-muted-foreground">道德底线：{selectedCharacter.moralLine || "待补全"}</div>
              </div>
            </div>

            <details className="rounded-xl border p-3" open>
              <summary className="cursor-pointer font-medium">完整设定与编辑</summary>
              <div className="mt-3 space-y-2">
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
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={characterForm.gender}
                    onChange={(event) => onCharacterFormChange("gender", event.target.value)}
                  >
                    <option value="unknown">性别：未知</option>
                    <option value="male">性别：男</option>
                    <option value="female">性别：女</option>
                    <option value="other">性别：其他</option>
                  </select>
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
                  className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="性格补充"
                  value={characterForm.personality}
                  onChange={(event) => onCharacterFormChange("personality", event.target.value)}
                />
                <textarea
                  className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="背景补充"
                  value={characterForm.background}
                  onChange={(event) => onCharacterFormChange("background", event.target.value)}
                />
                <textarea
                  className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onSyncAllTimeline}
                    disabled={isSyncingAllTimeline}
                  >
                    {isSyncingAllTimeline ? "同步中..." : "同步全部角色时间线"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onWorldCheck} disabled={isCheckingWorld}>
                    {isCheckingWorld ? "检查中..." : "检查世界一致性"}
                  </Button>
                </div>
              </div>
            </details>

            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer font-medium">成长弧节点</summary>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>起点：{selectedCharacter.arcStart || "待补全"}</div>
                <div>中段转折：{selectedCharacter.arcMidpoint || "待补全"}</div>
                <div>高潮选择：{selectedCharacter.arcClimax || "待补全"}</div>
                <div>终点状态：{selectedCharacter.arcEnd || "待补全"}</div>
                <div>首次印象：{selectedCharacter.firstImpression || "待补全"}</div>
                <div>隐藏秘密：{selectedCharacter.secret || "待补全"}</div>
              </div>
            </details>

            <div className="space-y-2">
              <div className="text-sm font-medium">角色事件流（最近 12 条）</div>
              {timelineEvents.length > 0 ? (
                timelineEvents.slice(-12).reverse().map((event) => (
                  <div key={event.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{event.title}</div>
                      <Badge variant="outline">{event.source}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {event.chapterOrder ? `章节 ${event.chapterOrder}` : "无章节归属"} ·{" "}
                      {new Date(event.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{event.content}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  暂无事件，先点击“同步角色时间线”。
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
