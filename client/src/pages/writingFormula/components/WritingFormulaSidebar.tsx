import { useMemo, useState } from "react";
import type { AntiAiRule, StyleProfile, StyleTemplate } from "@ai-novel/shared/types/styleEngine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WritingFormulaRulesPanel from "./WritingFormulaRulesPanel";

const STARTER_STYLE_PROFILE_SOURCE_PREFIX = "starter-style-profile:";
const AI_STYLE_BRIEF_SOURCE_PREFIX = "ai-style-brief:";

export interface WritingFormulaCreateFormState {
  manualName: string;
  briefName: string;
  briefCategory: string;
  briefPrompt: string;
  extractName: string;
  extractCategory: string;
  extractSourceText: string;
}

interface WritingFormulaSidebarProps {
  createForm: WritingFormulaCreateFormState;
  onCreateFormChange: (patch: Partial<WritingFormulaCreateFormState>) => void;
  onCreateManual: () => void;
  onCreateFromBrief: () => void;
  onExtractFromText: () => void;
  onCreateFromTemplate: (templateId: string) => void;
  createManualPending: boolean;
  createFromBriefPending: boolean;
  extractFromTextPending: boolean;
  createFromTemplatePending: boolean;
  templates: StyleTemplate[];
  antiAiRules: AntiAiRule[];
  profiles: StyleProfile[];
  selectedProfileId: string;
  onSelectProfile: (profileId: string) => void;
  onToggleRule: (rule: AntiAiRule, enabled: boolean) => void;
}

function isStarterProfile(profile: StyleProfile): boolean {
  return profile.sourceRefId?.startsWith(STARTER_STYLE_PROFILE_SOURCE_PREFIX) ?? false;
}

function getProfileOriginLabel(profile: StyleProfile): string {
  if (isStarterProfile(profile)) {
    return "预置";
  }
  if (profile.sourceRefId?.startsWith(AI_STYLE_BRIEF_SOURCE_PREFIX)) {
    return "AI生成";
  }
  if (profile.sourceType === "from_text") {
    return "文本提取";
  }
  if (profile.sourceType === "from_book_analysis") {
    return "拆书生成";
  }
  if (profile.sourceType === "from_current_work") {
    return "当前作品";
  }
  return "手动创建";
}

export default function WritingFormulaSidebar(props: WritingFormulaSidebarProps) {
  const {
    createForm,
    onCreateFormChange,
    onCreateManual,
    onCreateFromBrief,
    onExtractFromText,
    onCreateFromTemplate,
    createManualPending,
    createFromBriefPending,
    extractFromTextPending,
    createFromTemplatePending,
    templates,
    antiAiRules,
    profiles,
    selectedProfileId,
    onSelectProfile,
    onToggleRule,
  } = props;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeCreateTab, setActiveCreateTab] = useState("quick_start");

  const { starterProfiles, customProfiles } = useMemo(() => {
    const starters = profiles.filter((profile) => isStarterProfile(profile));
    const custom = profiles.filter((profile) => !isStarterProfile(profile));
    return {
      starterProfiles: starters,
      customProfiles: custom,
    };
  }, [profiles]);

  return (
    <div className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
      <Card>
        <CardHeader>
          <CardTitle>先选一套写法再微调</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm leading-6 text-muted-foreground">
            第一次使用时，不用先理解所有规则字段。先从预置写法里挑一套最像你想写的感觉，再进去改名字、标签和规则，会顺很多。
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground">可直接编辑的我的写法</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{profiles.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                其中预置 {starterProfiles.length} 套，适合直接复制思路后再改。
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground">内置模板</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{templates.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                适合快速新建一套新写法，不必从空白开始。
              </div>
            </div>
          </div>
          <Button className="w-full" onClick={() => setCreateDialogOpen(true)}>
            新建或导入写法
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>我的写法</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {starterProfiles.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">推荐起步</div>
              {starterProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`w-full rounded-md border p-3 text-left transition ${
                    profile.id === selectedProfileId ? "border-primary bg-primary/5" : "hover:border-primary/40"
                  }`}
                  onClick={() => onSelectProfile(profile.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-foreground">{profile.name}</div>
                    <Badge variant="outline">预置</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{profile.description || "可直接编辑的默认写法。"}</div>
                </button>
              ))}
            </div>
          ) : null}

          {customProfiles.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">你自己创建的写法</div>
              {customProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`w-full rounded-md border p-3 text-left transition ${
                    profile.id === selectedProfileId ? "border-primary bg-primary/5" : "hover:border-primary/40"
                  }`}
                  onClick={() => onSelectProfile(profile.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-foreground">{profile.name}</div>
                    <Badge variant="secondary">{getProfileOriginLabel(profile)}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{profile.description || "暂无简介"}</div>
                </button>
              ))}
            </div>
          ) : null}

          {profiles.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              当前还没有写法资产。点上方“新建或导入写法”，先从模板快速起一套最省心。
            </div>
          ) : null}
        </CardContent>
      </Card>

      <WritingFormulaRulesPanel antiAiRules={antiAiRules} onToggleRule={onToggleRule} />

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>新建或导入写法</DialogTitle>
            <DialogDescription>
              推荐先走“快速开始”或“空白 / AI”里的句子生成。只有你已经准备好样本文本，才建议使用“从文本提取”。
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeCreateTab} onValueChange={setActiveCreateTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="quick_start">快速开始</TabsTrigger>
              <TabsTrigger value="blank">空白 / AI</TabsTrigger>
              <TabsTrigger value="extract">从文本提取</TabsTrigger>
            </TabsList>

            <TabsContent value="quick_start" className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                左侧已经预置了几套可直接修改的“我的写法”。如果你想再新开一套，最省心的方式还是从模板快速生成，再按自己的项目做微调。
              </div>
              <div className="grid max-h-[58vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {templates.map((template) => (
                  <div key={template.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-foreground">{template.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{template.category}</div>
                      </div>
                      <Badge variant="outline">模板</Badge>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-muted-foreground">{template.description}</div>
                    {template.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {template.tags.slice(0, 4).map((tag) => (
                          <Badge key={`${template.id}-${tag}`} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    ) : null}
                    {template.applicableGenres.length > 0 ? (
                      <div className="mt-3 text-xs text-muted-foreground">
                        适合：{template.applicableGenres.join(" / ")}
                      </div>
                    ) : null}
                    <Button
                      size="sm"
                      className="mt-4 w-full"
                      onClick={() => onCreateFromTemplate(template.id)}
                      disabled={createFromTemplatePending}
                    >
                      {createFromTemplatePending ? "创建中..." : "基于这套快速新建"}
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="blank" className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                这里有两种轻量起步方式：如果你已经知道自己要维护一套规则，就手动建空白；如果你只知道“想写成什么感觉”，直接写一句话交给 AI 先搭骨架。
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-foreground">手动空白创建</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      适合你已经知道自己要维护一套什么风格规则，只想先建一个空壳再慢慢补。
                    </div>
                  </div>
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-md border p-2 text-sm"
                      placeholder="例如：我的女频都市关系写法"
                      value={createForm.manualName}
                      onChange={(event) => onCreateFormChange({ manualName: event.target.value })}
                    />
                    <Button
                      className="w-full"
                      onClick={onCreateManual}
                      disabled={!createForm.manualName.trim() || createManualPending}
                    >
                      {createManualPending ? "创建中..." : "创建空白写法"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-foreground">AI 帮我先搭一套</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      不想先研究规则字段时，直接描述你想要的读感、气质或参考方向，AI 会先生成一套可编辑写法。
                    </div>
                  </div>
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-md border p-2 text-sm"
                      placeholder="写法名称（可选，不填就让 AI 来取）"
                      value={createForm.briefName}
                      onChange={(event) => onCreateFormChange({ briefName: event.target.value })}
                    />
                    <input
                      className="w-full rounded-md border p-2 text-sm"
                      placeholder="分类（可选）"
                      value={createForm.briefCategory}
                      onChange={(event) => onCreateFormChange({ briefCategory: event.target.value })}
                    />
                    <textarea
                      className="min-h-[180px] w-full rounded-md border p-2 text-sm"
                      placeholder="例如：类似于《遥远的救世主》的写法，整体克制、思辨感强，对话带锋芒，少鸡汤，多现实摩擦。"
                      value={createForm.briefPrompt}
                      onChange={(event) => onCreateFormChange({ briefPrompt: event.target.value })}
                    />
                    <Button
                      className="w-full"
                      onClick={onCreateFromBrief}
                      disabled={!createForm.briefPrompt.trim() || createFromBriefPending}
                    >
                      {createFromBriefPending ? "AI 生成中..." : "AI 生成一套写法"}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="extract" className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                适合你手里已经有一段很确定的参考文本，想让系统先帮你提取特征再进入编辑。没有现成样本时，不建议把它当第一步。
              </div>
              <div className="rounded-lg border p-4">
                <div className="space-y-3">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="写法名称"
                    value={createForm.extractName}
                    onChange={(event) => onCreateFormChange({ extractName: event.target.value })}
                  />
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="分类（可选）"
                    value={createForm.extractCategory}
                    onChange={(event) => onCreateFormChange({ extractCategory: event.target.value })}
                  />
                  <textarea
                    className="min-h-[220px] w-full rounded-md border p-2 text-sm"
                    placeholder="粘贴参考文本"
                    value={createForm.extractSourceText}
                    onChange={(event) => onCreateFormChange({ extractSourceText: event.target.value })}
                  />
                  <Button
                    className="w-full"
                    onClick={onExtractFromText}
                    disabled={!createForm.extractName.trim() || !createForm.extractSourceText.trim() || extractFromTextPending}
                  >
                    {extractFromTextPending ? "提取中..." : "AI 提取特征并创建"}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
