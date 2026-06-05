import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Castle, GitBranch, MapPinned, Pencil, Save, ScrollText, WandSparkles } from "lucide-react";
import type {
  WorldBindingSupport,
  WorldStructuredData,
  WorldStructureSectionKey,
} from "@ai-novel/shared/types/world";
import type { WorldStructurePayload } from "@/api/world";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  HandbookField,
  HandbookPreviewCard,
  HandbookPreviewLine,
  HandbookTextarea,
} from "./handbook/HandbookPrimitives";
import WorldHandbookForceSection from "./handbook/WorldHandbookForceSection";
import WorldHandbookLocationSection from "./handbook/WorldHandbookLocationSection";
import WorldHandbookRuleSection from "./handbook/WorldHandbookRuleSection";
import WorldHandbookTensionSection from "./handbook/WorldHandbookTensionSection";

type EditableHandbookSection = "profile" | "rules" | "forces" | "locations" | "relations";

function compactText(value: string | null | undefined, fallback: string, limit = 120): string {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) {
    return fallback;
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function joinPreview(items: Array<string | null | undefined>, fallback: string): string {
  const text = items
    .map((item) => item?.replace(/\s+/g, " ").trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 3)
    .join(" / ");
  return text || fallback;
}

export default function WorldHandbookEditor(props: {
  initialPayload?: WorldStructurePayload;
  savePending: boolean;
  backfillPending: boolean;
  generatePending: boolean;
  onSave: (structure: WorldStructuredData, bindingSupport: WorldBindingSupport) => Promise<void>;
  onBackfill: () => Promise<{ structure: WorldStructuredData; bindingSupport: WorldBindingSupport } | undefined>;
  onGenerate: (
    section: WorldStructureSectionKey,
    structure: WorldStructuredData,
    bindingSupport: WorldBindingSupport,
  ) => Promise<{ structure: WorldStructuredData; bindingSupport: WorldBindingSupport } | undefined>;
  onOpenDeepening: () => void;
  onOpenLayers: () => void;
  onOpenOverview: () => void;
  onOpenAdvanced: () => void;
}) {
  const {
    initialPayload,
    savePending,
    backfillPending,
    generatePending,
    onSave,
    onBackfill,
    onGenerate,
    onOpenDeepening,
    onOpenLayers,
    onOpenOverview,
    onOpenAdvanced,
  } = props;
  const [draftStructure, setDraftStructure] = useState<WorldStructuredData | null>(initialPayload?.structure ?? null);
  const [draftBindingSupport, setDraftBindingSupport] = useState<WorldBindingSupport | null>(
    initialPayload?.bindingSupport ?? null,
  );
  const [activeAiSection, setActiveAiSection] = useState<WorldStructureSectionKey>("profile");
  const [editingSection, setEditingSection] = useState<EditableHandbookSection | null>(null);

  useEffect(() => {
    if (!initialPayload) {
      return;
    }
    setDraftStructure(initialPayload.structure);
    setDraftBindingSupport(initialPayload.bindingSupport);
  }, [initialPayload]);

  if (!draftStructure || !draftBindingSupport) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>整理世界手册</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm leading-6 text-muted-foreground">正在读取世界手册内容。</div>
          <Button
            variant="secondary"
            onClick={async () => {
              const result = await onBackfill();
              if (result) {
                setDraftStructure(result.structure);
                setDraftBindingSupport(result.bindingSupport);
              }
            }}
            disabled={backfillPending}
          >
            {backfillPending ? "整理中..." : "让 AI 整理世界手册"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const saveDraft = async () => {
    await onSave(draftStructure, draftBindingSupport);
  };

  const generateSection = async () => {
    const result = await onGenerate(activeAiSection, draftStructure, draftBindingSupport);
    if (result) {
      setDraftStructure(result.structure);
      setDraftBindingSupport(result.bindingSupport);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>整理世界手册</CardTitle>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              先看清这个世界的阅读印象、核心规则、主要势力、故事舞台和冲突张力；需要细调时再进入对应区块。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onOpenOverview}>
              <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
              查看手册
            </Button>
            <Button type="button" onClick={saveDraft} disabled={savePending}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {savePending ? "保存中..." : "保存手册"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md border-l-2 border-primary bg-muted/30 p-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">世界样本</Badge>
            {draftStructure.profile.tone ? <Badge variant="outline">{draftStructure.profile.tone}</Badge> : null}
            {draftStructure.profile.themes.slice(0, 4).map((theme) => (
              <Badge key={theme} variant="outline">
                {theme}
              </Badge>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[0.75fr_1.25fr]">
            <HandbookPreviewLine
              label="一句话世界印象"
              value={draftStructure.profile.identity}
              fallback="补充一句话世界印象，让作者一眼知道题材、时代感和核心奇观。"
            />
            <HandbookPreviewLine
              label="读者第一眼"
              value={draftStructure.profile.summary}
              fallback="补充这个世界的第一眼画面、秩序、危险或奇观。"
            />
            <HandbookPreviewLine
              label="阅读气质"
              value={draftStructure.profile.tone || draftStructure.profile.themes.join("、")}
              fallback="补充阅读气质，例如热血升级、黑暗史诗、轻喜冒险或权谋争霸。"
            />
            <HandbookPreviewLine
              label="持续推动剧情的矛盾"
              value={draftStructure.profile.coreConflict}
              fallback="补充一个会反复制造角色选择、势力冲突和章节事件的问题。"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection("profile")}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              整理世界概要
            </Button>
          </div>
          {editingSection === "profile" ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.4fr]">
            <div className="space-y-3">
              <HandbookField title="一句话世界印象" hint="让作者和 AI 一眼知道这个世界的类型、时代感和核心奇观。">
                <Input
                  value={draftStructure.profile.identity}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, profile: { ...prev.profile, identity: event.target.value } } : prev,
                    )
                  }
                  placeholder="例如：星核枯竭的仙侠王朝"
                />
              </HandbookField>
              <HandbookField title="阅读气质" hint="决定故事是黑暗、热血、轻喜、权谋，还是冒险探索。">
                <Input
                  value={draftStructure.profile.tone}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, profile: { ...prev.profile, tone: event.target.value } } : prev,
                    )
                  }
                  placeholder="黑暗史诗、轻喜冒险、权谋争霸..."
                />
              </HandbookField>
              <HandbookField title="主题关键词" hint="用顿号分隔，帮助后续角色、地点和冲突保持同一种题材方向。">
                <Input
                  value={draftStructure.profile.themes.join("、")}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          profile: {
                            ...prev.profile,
                            themes: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
                          },
                        }
                        : prev,
                    )
                  }
                  placeholder="复仇、王朝更替、异能觉醒"
                />
              </HandbookField>
            </div>
            <div className="space-y-3">
              <HandbookField title="世界给读者的第一眼" hint="写成作者能直接复述的短段落，不需要拆成地理、文化、历史字段。">
                <HandbookTextarea
                  value={draftStructure.profile.summary}
                  onChange={(value) =>
                    setDraftStructure((prev) => (prev ? { ...prev, profile: { ...prev.profile, summary: value } } : prev))
                  }
                  placeholder="用一段话让作者知道这个世界长什么样、故事会从哪里开始。"
                />
              </HandbookField>
              <HandbookField title="能持续推动剧情的矛盾" hint="这不是背景介绍，而是角色行动、势力冲突和章节事件反复围绕的问题。">
                <HandbookTextarea
                  value={draftStructure.profile.coreConflict}
                  onChange={(value) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, profile: { ...prev.profile, coreConflict: value } } : prev,
                    )
                  }
                  placeholder="例如：星核枯竭让修行者争夺寿命，朝廷想封锁真相，边境异魔趁机入侵。"
                  minRows={3}
                />
              </HandbookField>
            </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">AI 辅助整理</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                让 AI 根据已有内容补齐一个手册区块；你可以继续改写后再保存。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "profile", label: "世界概要" },
                { key: "rules", label: "规则" },
                { key: "factions", label: "势力" },
                { key: "locations", label: "地点" },
                { key: "relations", label: "张力" },
              ].map((item) => (
                <Button
                  key={item.key}
                  type="button"
                  size="sm"
                  variant={activeAiSection === item.key ? "default" : "outline"}
                  onClick={() => setActiveAiSection(item.key as WorldStructureSectionKey)}
                >
                  {item.label}
                </Button>
              ))}
              <Button type="button" size="sm" variant="secondary" onClick={generateSection} disabled={generatePending}>
                <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                {generatePending ? "补齐中..." : "补齐选中区块"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <HandbookPreviewCard
            icon={ScrollText}
            title="核心规则"
            description={`${draftStructure.rules.axioms.length} 条规则会限制力量、资源、禁忌和代价。`}
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection("rules")}>
                整理规则
              </Button>
            }
          >
            <div className="space-y-3">
              <HandbookPreviewLine
                label="规则总纲"
                value={draftStructure.rules.summary}
                fallback="补充世界运转的硬规则，避免角色能力和剧情解决方式失控。"
              />
              <HandbookPreviewLine
                label="代表性规则"
                value={joinPreview(
                  draftStructure.rules.axioms.map((rule) => [rule.name, rule.summary].filter(Boolean).join("：")),
                  "补充 2-3 条必须遵守的核心规则。",
                )}
                fallback="补充 2-3 条必须遵守的核心规则。"
              />
            </div>
          </HandbookPreviewCard>

          <HandbookPreviewCard
            icon={Castle}
            title="主要势力"
            description={`${draftStructure.forces.length} 个势力决定角色归属、阵营压力和资源争夺。`}
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection("forces")}>
                整理势力
              </Button>
            }
          >
            <div className="space-y-3">
              <HandbookPreviewLine
                label="活跃势力"
                value={joinPreview(
                  draftStructure.forces.map((force) => [force.name, force.currentObjective].filter(Boolean).join("：")),
                  "补充主要势力后，角色身份和阵营冲突会更清楚。",
                )}
                fallback="补充主要势力后，角色身份和阵营冲突会更清楚。"
              />
              <HandbookPreviewLine
                label="故事压力"
                value={joinPreview(
                  draftStructure.forces.map((force) => force.pressure),
                  "补充势力给主角和世界秩序造成的压力。",
                )}
                fallback="补充势力给主角和世界秩序造成的压力。"
              />
            </div>
          </HandbookPreviewCard>

          <HandbookPreviewCard
            icon={MapPinned}
            title="故事舞台"
            description={`${draftStructure.locations.length} 个地点承载开局、升级、转折、决战和地图资产。`}
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection("locations")}>
                整理地点
              </Button>
            }
          >
            <div className="space-y-3">
              <HandbookPreviewLine
                label="可用地点"
                value={joinPreview(
                  draftStructure.locations.map((location) =>
                    [location.name, location.narrativeFunction || location.terrain].filter(Boolean).join("："),
                  ),
                  "补充开局地点、试炼地点、冲突地点或真相地点。",
                )}
                fallback="补充开局地点、试炼地点、冲突地点或真相地点。"
              />
              <HandbookPreviewLine
                label="进入风险"
                value={joinPreview(
                  draftStructure.locations.map((location) => location.risk),
                  "补充进入地点会遇到的阻力、代价或身份风险。",
                )}
                fallback="补充进入地点会遇到的阻力、代价或身份风险。"
              />
            </div>
          </HandbookPreviewCard>

          <HandbookPreviewCard
            icon={GitBranch}
            title="冲突张力"
            description="记录势力关系、地点控制、共同后果和禁忌组合，帮助世界保持可写性。"
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection("relations")}>
                整理张力
              </Button>
            }
          >
            <div className="space-y-3">
              <HandbookPreviewLine
                label="势力关系"
                value={joinPreview(
                  draftStructure.relations.forceRelations.map((relation) =>
                    [relation.relation, relation.tension || relation.detail].filter(Boolean).join("："),
                  ),
                  "补充谁与谁结盟、敌对、竞争或互相利用。",
                )}
                fallback="补充谁与谁结盟、敌对、竞争或互相利用。"
              />
              <HandbookPreviewLine
                label="共同后果"
                value={joinPreview(
                  draftStructure.rules.sharedConsequences,
                  "补充违反规则或冲突升级后会影响全局的后果。",
                )}
                fallback="补充违反规则或冲突升级后会影响全局的后果。"
              />
            </div>
          </HandbookPreviewCard>
        </div>

        {editingSection ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" />
                正在整理选中区块，保存后会更新上方手册概览。
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection(null)}>
                收起编辑
              </Button>
            </div>
          </div>
        ) : null}

        {editingSection === "rules" ? (
          <WorldHandbookRuleSection draftStructure={draftStructure} setDraftStructure={setDraftStructure} />
        ) : null}
        {editingSection === "forces" ? (
          <WorldHandbookForceSection draftStructure={draftStructure} setDraftStructure={setDraftStructure} />
        ) : null}
        {editingSection === "locations" ? (
          <WorldHandbookLocationSection draftStructure={draftStructure} setDraftStructure={setDraftStructure} />
        ) : null}
        {editingSection === "relations" ? (
          <WorldHandbookTensionSection
            draftStructure={draftStructure}
            setDraftStructure={setDraftStructure}
            onOpenDeepening={onOpenDeepening}
            onOpenLayers={onOpenLayers}
            onOpenAdvanced={onOpenAdvanced}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
