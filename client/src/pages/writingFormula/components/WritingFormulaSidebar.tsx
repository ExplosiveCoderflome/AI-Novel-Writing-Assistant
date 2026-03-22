import { useState } from "react";
import type { AntiAiRule, StyleProfile, StyleTemplate } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import WritingFormulaRulesPanel from "./WritingFormulaRulesPanel";

export interface WritingFormulaCreateFormState {
  manualName: string;
  extractName: string;
  extractCategory: string;
  extractSourceText: string;
}

interface WritingFormulaSidebarProps {
  createForm: WritingFormulaCreateFormState;
  onCreateFormChange: (patch: Partial<WritingFormulaCreateFormState>) => void;
  onCreateManual: () => void;
  onCreateFromText: () => void;
  onCreateFromTemplate: (templateId: string) => void;
  createManualPending: boolean;
  createFromTextPending: boolean;
  createFromTemplatePending: boolean;
  templates: StyleTemplate[];
  antiAiRules: AntiAiRule[];
  profiles: StyleProfile[];
  selectedProfileId: string;
  onSelectProfile: (profileId: string) => void;
  onToggleRule: (rule: AntiAiRule, enabled: boolean) => void;
}

export default function WritingFormulaSidebar(props: WritingFormulaSidebarProps) {
  const {
    createForm,
    onCreateFormChange,
    onCreateManual,
    onCreateFromText,
    onCreateFromTemplate,
    createManualPending,
    createFromTextPending,
    createFromTemplatePending,
    templates,
    antiAiRules,
    profiles,
    selectedProfileId,
    onSelectProfile,
    onToggleRule,
  } = props;
  const [templatesOpen, setTemplatesOpen] = useState(false);

  return (
    <div className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
      <Card>
        <CardHeader>
          <CardTitle>新建写法</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            className="w-full rounded-md border p-2 text-sm"
            placeholder="手动创建名称"
            value={createForm.manualName}
            onChange={(event) => onCreateFormChange({ manualName: event.target.value })}
          />
          <Button className="w-full" onClick={onCreateManual} disabled={!createForm.manualName.trim() || createManualPending}>
            创建空白资产
          </Button>

          <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">从文本提取</div>
            <input
              className="mb-2 w-full rounded-md border p-2 text-sm"
              placeholder="写法名称"
              value={createForm.extractName}
              onChange={(event) => onCreateFormChange({ extractName: event.target.value })}
            />
            <input
              className="mb-2 w-full rounded-md border p-2 text-sm"
              placeholder="分类（可选）"
              value={createForm.extractCategory}
              onChange={(event) => onCreateFormChange({ extractCategory: event.target.value })}
            />
            <textarea
              className="min-h-[160px] w-full rounded-md border p-2 text-sm"
              placeholder="粘贴参考文本"
              value={createForm.extractSourceText}
              onChange={(event) => onCreateFormChange({ extractSourceText: event.target.value })}
            />
            <Button
              className="mt-2 w-full"
              onClick={onCreateFromText}
              disabled={!createForm.extractName.trim() || !createForm.extractSourceText.trim() || createFromTextPending}
            >
              AI 提取写法
            </Button>
          </div>
        </CardContent>
      </Card>

      <WritingFormulaRulesPanel antiAiRules={antiAiRules} onToggleRule={onToggleRule} />

      <Card>
        <CardHeader>
          <CardTitle>内置模板</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            把模板收进弹窗里后，主页面会更干净，适合先浏览再选择创建。
          </div>
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            当前内置模板 {templates.length} 套
          </div>
          <Button className="w-full" variant="secondary" onClick={() => setTemplatesOpen(true)}>
            浏览内置模板
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>我的写法资产</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={`w-full rounded-md border p-3 text-left ${profile.id === selectedProfileId ? "border-primary bg-primary/5" : ""}`}
              onClick={() => onSelectProfile(profile.id)}
            >
              <div className="font-medium">{profile.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{profile.description || "暂无简介"}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>内置模板</DialogTitle>
            <DialogDescription>
              先浏览，再选择一套模板快速生成写法资产。
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border p-4">
                <div className="text-base font-semibold">{template.name}</div>
                <div className="mt-2 text-sm text-muted-foreground">{template.description}</div>
                {template.tags.length > 0 ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    标签：{template.tags.join(" / ")}
                  </div>
                ) : null}
                {template.applicableGenres.length > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    适用：{template.applicableGenres.join(" / ")}
                  </div>
                ) : null}
                <Button
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => {
                    onCreateFromTemplate(template.id);
                    setTemplatesOpen(false);
                  }}
                  disabled={createFromTemplatePending}
                >
                  基于模板新建
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
