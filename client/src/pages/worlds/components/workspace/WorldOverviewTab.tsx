import i18next from "i18next";
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
    <div className={accent === "primary" ? "rounded-2xl bg-primary/[0.055] p-4" : "rounded-2xl bg-muted/20 p-4"}>
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
    <div className="rounded-2xl border border-dashed border-border/45 bg-background/70 p-4">
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
    <div className="rounded-2xl border border-dashed border-border/45 bg-background/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </div>
        <Badge variant="secondary" className="border-0 bg-muted/60 font-normal">{status}</Badge>
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
    summary ?? "补齐世界手册后，这里会形成一份可被小说复用的世界样本。",
    120,
  );
  const coreRules = listText(
    structure?.rules?.axioms.map((rule) => [rule.name, rule.summary].filter(Boolean).join("：")) ?? [],
    "进入手册编修补充本世界必须遵守的规则。",
  );
  const majorForces = listText(
    [
      ...(structure?.forces ?? []).map((force) => [force.name, force.summary || force.currentObjective].filter(Boolean).join("：")),
      ...(structure?.factions ?? []).map((faction) => [faction.name, faction.position || faction.doctrine].filter(Boolean).join("：")),
    ],
    "进入手册编修补充会推动剧情的势力与阵营。",
  );
  const storyLocations = listText(
    structure?.locations.map((location) =>
      [location.name, location.narrativeFunction || location.risk || location.summary].filter(Boolean).join("："),
    ) ?? [],
    "进入手册编修补充适合开局、升级和转折的故事地点。",
  );
  const tensions = listText(
    [
      profile?.coreConflict,
      ...(structure?.relations.forceRelations ?? []).map((relation) =>
        [relation.relation, relation.tension || relation.detail].filter(Boolean).join("："),
      ),
      ...(structure?.rules.sharedConsequences ?? []),
    ],
    "进入手册编修补充能持续制造剧情压力的世界矛盾。",
  );

  return (
    <section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{featureFlags.worldVisEnabled ? "阅读世界与图谱" : "阅读世界手册"}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{i18next.t("worlds.worldOverviewTab.cg8eeg")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" className="rounded-full" onClick={onOpenStructure}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />{i18next.t("worlds.worldOverviewTab.gd8e2h")}</Button>
            <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onOpenLayers}>
              <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              AI 构建
            </Button>
          </div>
        </div>
        {hasHandbook ? (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
              <div className="rounded-3xl bg-muted/20 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="border-0 bg-primary/[0.07] font-normal text-primary">{i18next.t("dict.worldSample")}</Badge>
                  {profile?.tone ? <Badge variant="secondary" className="border-0 bg-muted/60 font-normal">{profile.tone}</Badge> : null}
                  {profile?.themes?.slice(0, 4).map((theme) => (
                    <Badge key={theme} variant="secondary" className="border-0 bg-muted/60 font-normal">
                      {theme}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 text-lg font-semibold leading-7">
                  {worldPromise}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  {compactText(profile?.summary, summary ?? "补充一句能让创作者快速理解的世界概要。", 180)}
                </div>
                <div className="mt-3 text-sm leading-6">
                  {compactText(profile?.coreConflict, "补充核心冲突后，系统会更容易把世界转化为持续推动剧情的压力。", 160)}
                </div>
              </div>

              <div className="rounded-3xl border border-border/35 bg-card/70 p-5">
                <div className="text-sm font-medium">{i18next.t("dict.worldSampleProvidable")}</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <div>{i18next.t("dict.gen_65f41c26")}</div>
                  <div>{i18next.t("dict.gen_58a218ff")}</div>
                  <div>{i18next.t("dict.gen_205239e3")}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-7 gap-y-2 px-1 text-sm text-muted-foreground">
              <span><strong className="font-semibold tabular-nums text-foreground">{structure?.rules.axioms.length ?? 0}</strong>{i18next.t("worlds.worldOverviewTab.8f8kfz")}</span>
              <span><strong className="font-semibold tabular-nums text-foreground">{(structure?.forces.length ?? 0) + (structure?.factions.length ?? 0)}</strong>{i18next.t("worlds.worldOverviewTab.68kgs8")}</span>
              <span><strong className="font-semibold tabular-nums text-foreground">{structure?.locations.length ?? 0}</strong>{i18next.t("worlds.worldOverviewTab.ylm9zt")}</span>
              <span><strong className="font-semibold tabular-nums text-foreground">{(structure?.relations.forceRelations.length ?? 0) + (structure?.relations.locationControls.length ?? 0)}</strong>{i18next.t("worlds.worldOverviewTab.b6e3g4")}</span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <HandbookBlock icon={Sparkles} title={i18next.t("dict.gen_3da452ba")} items={coreRules} accent="primary" />
              <HandbookBlock icon={Castle} title={i18next.t("dict.majorForce")} items={majorForces} />
              <HandbookBlock icon={MapPinned} title={i18next.t("dict.gen_bf876a86")} items={storyLocations} />
              <HandbookBlock icon={GitBranch} title={i18next.t("dict.gen_b7cadb8f")} items={tensions} />
            </div>

            <HandbookBlock
              icon={ShieldAlert}
              title={i18next.t("dict.gen_dd94b30a")}
              items={[
                compactText(structure?.rules.summary, "核心规则会约束角色身份、冲突来源和世界一致性。", 150),
                ...listText(structure?.rules.taboo ?? [], "没有记录禁忌组合。需要强约束时，在手册编修中补充。", 2),
              ]}
            />
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <div className="rounded-3xl bg-muted/20 p-5">
                <Badge variant="secondary" className="border-0 bg-primary/[0.07] font-normal text-primary">{i18next.t("dict.worldManualPending")}</Badge>
                <div className="mt-3 text-lg font-semibold leading-7">
                  {compactText(summary, "先让 AI 或手册编修整理世界骨架，再把它作为可复用世界样本。", 160)}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">{i18next.t("worlds.worldOverviewTab.u5u6eg")}</div>
              </div>

              <div className="rounded-3xl border border-border/35 bg-card/70 p-5">
                <div className="text-sm font-medium">{i18next.t("dict.gen_fdf768b1")}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={onOpenLayers}>
                    <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                    AI 构建世界
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onOpenStructure}>
                    <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />{i18next.t("worlds.worldOverviewTab.gd8e2h")}</Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <EmptyHandbookBlock icon={Sparkles} title={i18next.t("dict.gen_3da452ba")} description={i18next.t("dict.gen_31fc6a72")} />
              <EmptyHandbookBlock icon={Castle} title={i18next.t("dict.majorForce")} description={i18next.t("dict.gen_1d0fedb4")} />
              <EmptyHandbookBlock icon={MapPinned} title={i18next.t("dict.gen_bf876a86")} description={i18next.t("dict.gen_3add34f1")} />
              <EmptyHandbookBlock icon={GitBranch} title={i18next.t("dict.gen_b7cadb8f")} description={i18next.t("dict.gen_711803e2")} />
            </div>

            {sections.length > 0 ? (
              <div className="rounded-3xl border border-border/35 p-4">
                <div className="mb-2 text-sm font-medium">{i18next.t("dict.gen_a3ee60d1")}</div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {sections.map((section) => (
                    <div key={section.key} className="rounded-2xl bg-muted/20 p-4 text-sm">
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
          <div className="rounded-3xl border border-border/35 p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Map className="h-4 w-4 text-primary" aria-hidden="true" />{i18next.t("worlds.worldOverviewTab.2t3y6h")}</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">{i18next.t("worlds.worldOverviewTab.ora1hw")}</div>
              </div>
              <Badge variant="secondary" className="border-0 bg-muted/60 font-normal">{i18next.t("dict.gen_6a6b9478")}</Badge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <WorldAssetPreviewBlock
                icon={MapPinned}
                title={i18next.t("dict.worldMap")}
                description={i18next.t("dict.gen_64bf02d8")}
                status={(structure?.locations.length ?? 0) > 0 ? "可整理" : "待补地点"}
              />
              <WorldAssetPreviewBlock
                icon={Network}
                title={i18next.t("dict.gen_de942453")}
                description={i18next.t("dict.gen_8283f155")}
                status={(structure?.forces.length ?? 0) + (structure?.factions.length ?? 0) > 0 ? "可整理" : "待补势力"}
              />
              <WorldAssetPreviewBlock
                icon={Clock3}
                title={i18next.t("dict.worldTimeline")}
                description={i18next.t("dict.gen_7cbdcaee")}
                status={profile?.coreConflict ? "可整理" : "待补张力"}
              />
              <WorldAssetPreviewBlock
                icon={Workflow}
                title={i18next.t("dict.gen_3e265312")}
                description={i18next.t("dict.gen_1a6b348d")}
                status={(structure?.rules.axioms.length ?? 0) > 0 ? "可整理" : "待补规则"}
              />
            </div>
          </div>
        )}
    </section>
  );
}
