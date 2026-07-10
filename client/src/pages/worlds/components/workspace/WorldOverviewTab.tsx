import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import {
  BookOpen,
  Castle,
  Clock3,
  GitBranch,
  Map,
  MapPinned,
  Network,
  Pencil,
  ShieldAlert,
  Sparkles,
  WandSparkles,
  Workflow,
} from "lucide-react";
import type { WorldStructuredData, WorldVisualizationPayload } from "@ai-novel/shared/types/world";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { featureFlags } from "@/config/featureFlags";
import WorldVisualizationBoard from "../WorldVisualizationBoard";

interface WorldOverviewTabProps {
  summary?: string;
  sections: Array<{ key: string; title: string; content: string }>;
  structure?: WorldStructuredData;
  visualization?: WorldVisualizationPayload;
  onOpenStructure?: () => void;
  onOpenLayers?: () => void;
}

function compactText(value: string | null | undefined, fallback: string, limit = 120) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) {
    return fallback;
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function listText(items: Array<string | null | undefined>, fallback: string, limit = 3) {
  const visible = items.map((item) => compactText(item, "", 96)).filter(Boolean).slice(0, limit);
  return visible.length > 0 ? visible : [fallback];
}

function HandbookBlock({
  icon: Icon,
  title,
  items,
  accent = "default",
}: {
  icon: typeof BookOpen;
  title: string;
  items: string[];
  accent?: "default" | "primary";
}) {
  return (
    <div className={accent === "primary" ? "rounded-md border border-primary/30 bg-primary/5 p-3" : "rounded-md border bg-background p-3"}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <div key={item} className="line-clamp-3">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyHandbookBlock({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-dashed bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
    </div>
  );
}

function WorldAssetPreviewBlock({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div className="rounded-md border border-dashed bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </div>
        <Badge variant="outline">{status}</Badge>
      </div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}

export default function WorldOverviewTab(props: WorldOverviewTabProps) {
  const { summary, sections, structure, visualization, onOpenStructure, onOpenLayers } = props;
  const profile = structure?.profile;
  const hasHandbook = Boolean(structure);
  const worldPromise = compactText(
    profile?.identity || profile?.summary,
    summary ?? t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_9beae3c8"),
    120,
  );
  const coreRules = listText(
    structure?.rules?.axioms.map((rule) => [rule.name, rule.summary].filter(Boolean).join("：")) ?? [],
    t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_498734e3"),
  );
  const majorForces = listText(
    [
      ...(structure?.forces ?? []).map((force) => [force.name, force.summary || force.currentObjective].filter(Boolean).join("：")),
      ...(structure?.factions ?? []).map((faction) => [faction.name, faction.position || faction.doctrine].filter(Boolean).join("：")),
    ],
    t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_346ade5d"),
  );
  const storyLocations = listText(
    structure?.locations.map((location) =>
      [location.name, location.narrativeFunction || location.risk || location.summary].filter(Boolean).join("："),
    ) ?? [],
    t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_e4f27447"),
  );
  const tensions = listText(
    [
      profile?.coreConflict,
      ...(structure?.relations.forceRelations ?? []).map((relation) =>
        [relation.relation, relation.tension || relation.detail].filter(Boolean).join("："),
      ),
      ...(structure?.rules.sharedConsequences ?? []),
    ],
    t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_fb44d287"),
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("gen.pages.worlds.components.workspace.WorldOverviewTab.worldManual")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onOpenStructure}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              编修手册
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onOpenLayers}>
              <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              AI 构建
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasHandbook ? (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
              <div className="rounded-md border-l-2 border-primary bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.worldSample")}</Badge>
                  {profile?.tone ? <Badge variant="outline">{profile.tone}</Badge> : null}
                  {profile?.themes?.slice(0, 4).map((theme) => (
                    <Badge key={theme} variant="outline">
                      {theme}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 text-lg font-semibold leading-7">
                  {worldPromise}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  {compactText(profile?.summary, summary ?? t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_ec83e9c7"), 180)}
                </div>
                <div className="mt-3 text-sm leading-6">
                  {compactText(profile?.coreConflict, t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_84a4265a"), 160)}
                </div>
              </div>

              <div className="rounded-md border bg-background p-4">
                <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.worldSampleProvidable")}</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <div>{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_65f41c26")}</div>
                  <div>{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_58a218ff")}</div>
                  <div>{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_205239e3")}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">{structure?.rules.axioms.length ?? 0}</div>
                <div className="text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_0a431a82")}</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">{(structure?.forces.length ?? 0) + (structure?.factions.length ?? 0)}</div>
                <div className="text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_f97816dc")}</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">{structure?.locations.length ?? 0}</div>
                <div className="text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_3fd96627")}</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">
                  {(structure?.relations.forceRelations.length ?? 0) + (structure?.relations.locationControls.length ?? 0)}
                </div>
                <div className="text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_3e69a8fb")}</div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <HandbookBlock icon={Sparkles} title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_3da452ba")} items={coreRules} accent="primary" />
              <HandbookBlock icon={Castle} title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.majorForce")} items={majorForces} />
              <HandbookBlock icon={MapPinned} title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_bf876a86")} items={storyLocations} />
              <HandbookBlock icon={GitBranch} title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_b7cadb8f")} items={tensions} />
            </div>

            <HandbookBlock
              icon={ShieldAlert}
              title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_dd94b30a")}
              items={[
                compactText(structure?.rules.summary, t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_8cf4c303"), 150),
                ...listText(structure?.rules.taboo ?? [], t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_05d4b3ae"), 2),
              ]}
            />
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <div className="rounded-md border-l-2 border-primary bg-muted/30 p-4">
                <Badge variant="secondary">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.worldManualPending")}</Badge>
                <div className="mt-3 text-lg font-semibold leading-7">
                  {compactText(summary, t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_73b0d57c"), 160)}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  世界手册会把零散设定整理成规则、势力、地点和剧情压力，方便作者理解，也方便本书使用。
                </div>
              </div>

              <div className="rounded-md border bg-background p-4">
                <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_fdf768b1")}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={onOpenLayers}>
                    <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                    AI 构建世界
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onOpenStructure}>
                    <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                    编修手册
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <EmptyHandbookBlock icon={Sparkles} title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_3da452ba")} description={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_31fc6a72")} />
              <EmptyHandbookBlock icon={Castle} title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.majorForce")} description={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_1d0fedb4")} />
              <EmptyHandbookBlock icon={MapPinned} title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_bf876a86")} description={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_3add34f1")} />
              <EmptyHandbookBlock icon={GitBranch} title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_b7cadb8f")} description={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_711803e2")} />
            </div>

            {sections.length > 0 ? (
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_a3ee60d1")}</div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {sections.map((section) => (
                    <div key={section.key} className="rounded-md border bg-background p-3 text-sm">
                      <div className="mb-1 font-medium">{section.title}</div>
                      <div className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">{section.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
        {featureFlags.worldVisEnabled ? (
          <WorldVisualizationBoard payload={visualization} />
        ) : (
          <div className="rounded-md border p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Map className="h-4 w-4 text-primary" aria-hidden="true" />
                  世界资产入口
                </div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  地图和图谱是世界手册的可视化资产，不参与自动同步覆盖，也不替代世界手册的规则来源。
                </div>
              </div>
              <Badge variant="outline">{t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_6a6b9478")}</Badge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <WorldAssetPreviewBlock
                icon={MapPinned}
                title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.worldMap")}
                description={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_64bf02d8")}
                status={(structure?.locations.length ?? 0) > 0 ? t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_f4b3b085") : t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_67114ac1")}
              />
              <WorldAssetPreviewBlock
                icon={Network}
                title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_de942453")}
                description={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_8283f155")}
                status={(structure?.forces.length ?? 0) + (structure?.factions.length ?? 0) > 0 ? t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_f4b3b085") : t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_9319c358")}
              />
              <WorldAssetPreviewBlock
                icon={Clock3}
                title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.worldTimeline")}
                description={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_7cbdcaee")}
                status={profile?.coreConflict ? t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_f4b3b085") : t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_5e668eba")}
              />
              <WorldAssetPreviewBlock
                icon={Workflow}
                title={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_3e265312")}
                description={t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_1a6b348d")}
                status={(structure?.rules.axioms.length ?? 0) > 0 ? t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_f4b3b085") : t("gen.pages.worlds.components.workspace.WorldOverviewTab.gen_483498d1")}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
