import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
          <CardTitle>{t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_eea623bc")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm leading-6 text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_39aa5d99")}</div>
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
            {backfillPending ? t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_d92453f0") : t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_51ce33d5")}
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
            <CardTitle>{t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_eea623bc")}</CardTitle>
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
              {savePending ? t("gen.pages.worlds.components.workspace.WorldHandbookEditor.savingInProgressDotDotDot") : t("gen.pages.worlds.components.workspace.WorldHandbookEditor.saveManual")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md border-l-2 border-primary bg-muted/30 p-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{t("gen.pages.worlds.components.workspace.WorldHandbookEditor.worldSample")}</Badge>
            {draftStructure.profile.tone ? <Badge variant="outline">{draftStructure.profile.tone}</Badge> : null}
            {draftStructure.profile.themes.slice(0, 4).map((theme) => (
              <Badge key={theme} variant="outline">
                {theme}
              </Badge>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[0.75fr_1.25fr]">
            <HandbookPreviewLine
              label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.worldImpressionOneLine")}
              value={draftStructure.profile.identity}
              fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_0ba6d7d0")}
            />
            <HandbookPreviewLine
              label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_084e6625")}
              value={draftStructure.profile.summary}
              fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_afbe6065")}
            />
            <HandbookPreviewLine
              label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_01dae5b3")}
              value={draftStructure.profile.tone || draftStructure.profile.themes.join("、")}
              fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_fc96ad78")}
            />
            <HandbookPreviewLine
              label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_3eb3923f")}
              value={draftStructure.profile.coreConflict}
              fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_5beda83e")}
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
              <HandbookField title={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.worldImpressionOneLine")} hint={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_5ad88891")}>
                <Input
                  value={draftStructure.profile.identity}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, profile: { ...prev.profile, identity: event.target.value } } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.exampleStarcoreDepletedXianxiaDynasty")}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_01dae5b3")} hint={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_69eb351c")}>
                <Input
                  value={draftStructure.profile.tone}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, profile: { ...prev.profile, tone: event.target.value } } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_9e048955")}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.topicKeywords")} hint={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_5dd14adf")}>
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_0b3cf1b3")}
                />
              </HandbookField>
            </div>
            <div className="space-y-3">
              <HandbookField title={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.firstImpressionReader")} hint={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_7aecbf8a")}>
                <HandbookTextarea
                  value={draftStructure.profile.summary}
                  onChange={(value) =>
                    setDraftStructure((prev) => (prev ? { ...prev, profile: { ...prev.profile, summary: value } } : prev))
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_d7766537")}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_7b07c1da")} hint={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_80773d95")}>
                <HandbookTextarea
                  value={draftStructure.profile.coreConflict}
                  onChange={(value) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, profile: { ...prev.profile, coreConflict: value } } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.exampleStarcoreDepletedFightingForLifeLingeringEmpireWantToSuppressTruthBorderMagicExploitingOpportunity")}
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
              <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.WorldHandbookEditor.aiAssistOrganize")}</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                让 AI 根据已有内容补齐一个手册区块；你可以继续改写后再保存。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "profile", label: t("gen.pages.worlds.components.workspace.WorldHandbookEditor.worldOverview") },
                { key: "rules", label: t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_b0fae043") },
                { key: "factions", label: t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_dcfe557b") },
                { key: "locations", label: t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_fc1a7d3c") },
                { key: "relations", label: t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_cbfbefb4") },
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
                {generatePending ? t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_00bf5f5e") : t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_18f9853a")}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <HandbookPreviewCard
            icon={ScrollText}
            title={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_0a431a82")}
            description={`${draftStructure.rules.axioms.length} 条规则会限制力量、资源、禁忌和代价。`}
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection("rules")}>
                整理规则
              </Button>
            }
          >
            <div className="space-y-3">
              <HandbookPreviewLine
                label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_9c10e19a")}
                value={draftStructure.rules.summary}
                fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_7d4f0c01")}
              />
              <HandbookPreviewLine
                label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.representativeRules")}
                value={joinPreview(
                  draftStructure.rules.axioms.map((rule) => [rule.name, rule.summary].filter(Boolean).join("：")),
                  t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_135d43cb"),
                )}
                fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_135d43cb")}
              />
            </div>
          </HandbookPreviewCard>

          <HandbookPreviewCard
            icon={Castle}
            title={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.majorForce")}
            description={`${draftStructure.forces.length} 个势力决定角色归属、阵营压力和资源争夺。`}
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection("forces")}>
                整理势力
              </Button>
            }
          >
            <div className="space-y-3">
              <HandbookPreviewLine
                label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_26f05301")}
                value={joinPreview(
                  draftStructure.forces.map((force) => [force.name, force.currentObjective].filter(Boolean).join("：")),
                  t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_cd6a3272"),
                )}
                fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_cd6a3272")}
              />
              <HandbookPreviewLine
                label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_f969b6a0")}
                value={joinPreview(
                  draftStructure.forces.map((force) => force.pressure),
                  t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_1ee22ee9"),
                )}
                fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_1ee22ee9")}
              />
            </div>
          </HandbookPreviewCard>

          <HandbookPreviewCard
            icon={MapPinned}
            title={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_bf876a86")}
            description={`${draftStructure.locations.length} 个地点承载开局、升级、转折、决战和地图资产。`}
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection("locations")}>
                整理地点
              </Button>
            }
          >
            <div className="space-y-3">
              <HandbookPreviewLine
                label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_07f8d201")}
                value={joinPreview(
                  draftStructure.locations.map((location) =>
                    [location.name, location.narrativeFunction || location.terrain].filter(Boolean).join("："),
                  ),
                  t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_4b0b9d23"),
                )}
                fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_4b0b9d23")}
              />
              <HandbookPreviewLine
                label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_f9bc7abf")}
                value={joinPreview(
                  draftStructure.locations.map((location) => location.risk),
                  t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_4631316b"),
                )}
                fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_4631316b")}
              />
            </div>
          </HandbookPreviewCard>

          <HandbookPreviewCard
            icon={GitBranch}
            title={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_078a38b4")}
            description={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_e53479a1")}
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingSection("relations")}>
                整理张力
              </Button>
            }
          >
            <div className="space-y-3">
              <HandbookPreviewLine
                label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_ef535ae0")}
                value={joinPreview(
                  draftStructure.relations.forceRelations.map((relation) =>
                    [relation.relation, relation.tension || relation.detail].filter(Boolean).join("："),
                  ),
                  t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_e22baf77"),
                )}
                fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_e22baf77")}
              />
              <HandbookPreviewLine
                label={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_8ef6f2f5")}
                value={joinPreview(
                  draftStructure.rules.sharedConsequences,
                  t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_02a2379e"),
                )}
                fallback={t("gen.pages.worlds.components.workspace.WorldHandbookEditor.gen_02a2379e")}
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
