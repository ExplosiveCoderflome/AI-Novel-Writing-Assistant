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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{featureFlags.worldVisEnabled ? "世界手册与可视化" : "世界手册"}</CardTitle>
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
                  <Badge variant="secondary">世界样本</Badge>
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
                  {compactText(profile?.summary, summary ?? "补充一句能让创作者快速理解的世界概要。", 180)}
                </div>
                <div className="mt-3 text-sm leading-6">
                  {compactText(profile?.coreConflict, "补充核心冲突后，系统会更容易把世界转化为持续推动剧情的压力。", 160)}
                </div>
              </div>

              <div className="rounded-md border bg-background p-4">
                <div className="text-sm font-medium">作为世界样本可提供</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <div>角色身份边界、势力归属与禁忌组合。</div>
                  <div>开局地点、升级路径与冲突来源。</div>
                  <div>写作时需要持续遵守的规则。</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">{structure?.rules.axioms.length ?? 0}</div>
                <div className="text-muted-foreground">核心规则</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">{(structure?.forces.length ?? 0) + (structure?.factions.length ?? 0)}</div>
                <div className="text-muted-foreground">势力与阵营</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">{structure?.locations.length ?? 0}</div>
                <div className="text-muted-foreground">故事地点</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">
                  {(structure?.relations.forceRelations.length ?? 0) + (structure?.relations.locationControls.length ?? 0)}
                </div>
                <div className="text-muted-foreground">关系线索</div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <HandbookBlock icon={Sparkles} title="力量与规则" items={coreRules} accent="primary" />
              <HandbookBlock icon={Castle} title="主要势力" items={majorForces} />
              <HandbookBlock icon={MapPinned} title="故事舞台" items={storyLocations} />
              <HandbookBlock icon={GitBranch} title="关键张力" items={tensions} />
            </div>

            <HandbookBlock
              icon={ShieldAlert}
              title="本书使用时应优先遵守"
              items={[
                compactText(structure?.rules.summary, "核心规则会约束角色身份、冲突来源和世界一致性。", 150),
                ...listText(structure?.rules.taboo ?? [], "没有记录禁忌组合。需要强约束时，在手册编修中补充。", 2),
              ]}
            />
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <div className="rounded-md border-l-2 border-primary bg-muted/30 p-4">
                <Badge variant="secondary">世界手册待成型</Badge>
                <div className="mt-3 text-lg font-semibold leading-7">
                  {compactText(summary, "先让 AI 或手册编修整理世界骨架，再把它作为可复用世界样本。", 160)}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  世界手册会把零散设定整理成规则、势力、地点和剧情压力，方便作者理解，也方便本书使用。
                </div>
              </div>

              <div className="rounded-md border bg-background p-4">
                <div className="text-sm font-medium">建议下一步</div>
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
              <EmptyHandbookBlock icon={Sparkles} title="力量与规则" description="记录世界不能随意打破的底层规则、代价和禁忌组合。" />
              <EmptyHandbookBlock icon={Castle} title="主要势力" description="整理会推动剧情的组织、阵营、利益集团和压力来源。" />
              <EmptyHandbookBlock icon={MapPinned} title="故事舞台" description="标出开局、升级、冲突爆发和转折发生的关键地点。" />
              <EmptyHandbookBlock icon={GitBranch} title="关键张力" description="沉淀能反复制造冲突的资源矛盾、阵营冲突和规则代价。" />
            </div>

            {sections.length > 0 ? (
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">已有设定片段</div>
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
              <Badge variant="outline">预留入口</Badge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <WorldAssetPreviewBlock
                icon={MapPinned}
                title="世界地图"
                description="承载区域、地点连通、故事发生地和冲突热度。"
                status={(structure?.locations.length ?? 0) > 0 ? "可整理" : "待补地点"}
              />
              <WorldAssetPreviewBlock
                icon={Network}
                title="势力图谱"
                description="承载势力节点、盟友敌对、控制关系和力量对比。"
                status={(structure?.forces.length ?? 0) + (structure?.factions.length ?? 0) > 0 ? "可整理" : "待补势力"}
              />
              <WorldAssetPreviewBlock
                icon={Clock3}
                title="世界时间线"
                description="承载历史事件、局势变化和小说推进中的世界进展。"
                status={profile?.coreConflict ? "可整理" : "待补张力"}
              />
              <WorldAssetPreviewBlock
                icon={Workflow}
                title="力量体系树"
                description="承载等级、资源、代价、禁忌和突破边界。"
                status={(structure?.rules.axioms.length ?? 0) > 0 ? "可整理" : "待补规则"}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
