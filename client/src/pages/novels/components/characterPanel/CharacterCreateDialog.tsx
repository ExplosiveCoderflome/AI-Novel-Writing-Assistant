import i18next from "i18next";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          <DialogTitle>{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_098d06b1", "新增角色")}</DialogTitle>
          <DialogDescription>{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_a06a1e92", "适合快速补齐阵容占位。创建后可在角色资产控制台继续完善档案、外显、资源和事件。")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
            <div className="space-y-1">
              <div className="font-medium">{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_433d87d0", "快速创建")}</div>
              <div className="text-xs text-muted-foreground">{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_cd90f0a3", "先建立可上场的人物，再让 AI 补齐性格、背景和当前目标。")}</div>
            </div>
            <Input
              placeholder={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_85c3b8ab", "角色名称（必填）")}
              value={quickCharacterForm.name}
              onChange={(event) => onQuickCharacterFormChange("name", event.target.value)}
            />
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={quickCharacterForm.role}
              onChange={(event) => onQuickCharacterFormChange("role", event.target.value)}
            >
              <option value={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_83b681f4", "主角")}>{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_83b681f4", "主角")}</option>
              <option value={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_f14665fc", "配角")}>{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_f14665fc", "配角")}</option>
              <option value={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_27dd76d8", "反派")}>{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_27dd76d8", "反派")}</option>
              <option value={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_d62518be", "导师")}>{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_d62518be", "导师")}</option>
              <option value={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_d56d71b4", "情感线")}>{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_d56d71b4", "情感线")}</option>
              <option value={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_813bdd02", "功能角色")}>{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_813bdd02", "功能角色")}</option>
            </SelectControl>
            <Input
              placeholder={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_c25eecba", "与主角关系（如：试探合作）")}
              value={relationToProtagonist}
              onChange={(event) => setRelationToProtagonist(event.target.value)}
            />
            <Input
              placeholder={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_80ee2781", "在故事中的作用（如：推动真相线）")}
              value={storyFunction}
              onChange={(event) => setStoryFunction(event.target.value)}
            />
            <Input
              placeholder={i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_4c09eaa7", "角色关键词（逗号分隔）")}
              value={wizardKeywords}
              onChange={(event) => setWizardKeywords(event.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoGenerateProfile}
                onChange={(event) => setAutoGenerateProfile(event.target.checked)}
              />{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_6b27e255", "自动补齐性格、背景、成长弧和当前状态")}</label>
            <AiButton onClick={handleQuickCreate} disabled={isQuickCreating || !quickCharacterForm.name.trim()}>
              {isQuickCreating ? "生成中..." : "AI 生成角色卡"}
            </AiButton>
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-background p-4">
            <div className="space-y-1">
              <div className="font-medium">{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_695cd6ed", "从基础角色库导入")}</div>
              <div className="text-xs text-muted-foreground">{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_17134c0d", "适合复用已有模板，再按当前小说需求继续调整。")}</div>
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
                    <Link to="/base-characters">{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_c8ac8a1b", "管理基础角色库")}</Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{i18next.t("gen.pages.novels.components.characterPanel.CharacterCreateDialog.gen_b080f029", "基础角色库为空，请先创建。")}</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
