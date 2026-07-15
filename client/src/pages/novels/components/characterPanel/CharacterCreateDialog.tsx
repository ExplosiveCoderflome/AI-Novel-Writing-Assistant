import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CharacterCreateDialogProps } from "./characterPanel.types";

interface CharacterCreateDialogFullProps extends CharacterCreateDialogProps {
  baseCharacters: BaseCharacter[];
  selectedBaseCharacterId: string;
  onSelectedBaseCharacterChange: (id: string) => void;
  selectedBaseCharacter?: BaseCharacter;
  importedBaseCharacterIds: Set<string>;
  onImportBaseCharacter: () => void;
  isImportingBaseCharacter: boolean;
}

export default function CharacterCreateDialog(props: CharacterCreateDialogFullProps) {
  const {
    open,
    onOpenChange,
    quickCharacterForm,
    onQuickCharacterFormChange,
    onQuickCreateCharacter,
    isQuickCreating,
    baseCharacters,
    selectedBaseCharacterId,
    onSelectedBaseCharacterChange,
    selectedBaseCharacter,
    importedBaseCharacterIds,
    onImportBaseCharacter,
    isImportingBaseCharacter,
  } = props;
  const [relationToProtagonist, setRelationToProtagonist] = useState("");
  const [storyFunction, setStoryFunction] = useState("");
  const [wizardKeywords, setWizardKeywords] = useState("");
  const [autoGenerateProfile, setAutoGenerateProfile] = useState(true);
  const previousQuickCreating = useRef(isQuickCreating);

  useEffect(() => {
    if (previousQuickCreating.current && !isQuickCreating && !quickCharacterForm.name.trim()) {
      onOpenChange(false);
      setRelationToProtagonist("");
      setStoryFunction("");
      setWizardKeywords("");
      setAutoGenerateProfile(true);
    }
    previousQuickCreating.current = isQuickCreating;
  }, [isQuickCreating, onOpenChange, quickCharacterForm.name]);

  const handleQuickCreate = () => {
    onQuickCreateCharacter({
      name: quickCharacterForm.name,
      role: quickCharacterForm.role,
      relationToProtagonist,
      storyFunction,
      keywords: wizardKeywords,
      autoGenerateProfile,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增角色</DialogTitle>
          <DialogDescription>
            适合快速补齐阵容占位。创建后可在角色资产控制台继续完善档案、外显、资源和事件。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
            <div className="space-y-1">
              <div className="font-medium">快速创建</div>
              <div className="text-xs text-muted-foreground">
                先建立可上场的人物，再让 AI 补齐性格、背景和当前目标。
              </div>
            </div>
            <Input
              placeholder="角色名称（必填）"
              value={quickCharacterForm.name}
              onChange={(event) => onQuickCharacterFormChange("name", event.target.value)}
            />
            <SelectControl
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
            </SelectControl>
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
            <AiButton onClick={handleQuickCreate} disabled={isQuickCreating || !quickCharacterForm.name.trim()}>
              {isQuickCreating ? "生成中..." : "AI 生成角色卡"}
            </AiButton>
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-background p-4">
            <div className="space-y-1">
              <div className="font-medium">从基础角色库导入</div>
              <div className="text-xs text-muted-foreground">
                适合复用已有模板，再按当前小说需求继续调整。
              </div>
            </div>
            {baseCharacters.length > 0 ? (
              <>
                <SelectControl
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={selectedBaseCharacterId}
                  onChange={(event) => onSelectedBaseCharacterChange(event.target.value)}
                >
                  {baseCharacters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}（{character.role}）
                    </option>
                  ))}
                </SelectControl>
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
  );
}
