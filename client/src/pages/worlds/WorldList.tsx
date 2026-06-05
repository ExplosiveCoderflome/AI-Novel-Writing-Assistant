import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Castle, Compass, GitBranch, MapPin, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { WorldStructuredData } from "@ai-novel/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteWorld, getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { featureFlags } from "@/config/featureFlags";
import { toast } from "@/components/ui/toast";

interface WorldLibraryCardProjection {
  summary: string;
  identity: string | null;
  tone: string | null;
  coreConflict: string | null;
  ruleCount: number;
  forceCount: number;
  locationCount: number;
  relationCount: number;
  coreRules: string[];
  majorForces: string[];
  storyLocations: string[];
  tensions: string[];
}

function extractStructuredPreview(raw: string): string | null {
  const text = raw.trim();
  if (!text || (!text.startsWith("[") && !text.startsWith("{"))) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      const parts = parsed
        .slice(0, 2)
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }
          if (!item || typeof item !== "object") {
            return "";
          }
          const record = item as Record<string, unknown>;
          const title = [record.name, record.title, record.label].find((value) => typeof value === "string");
          const description = [record.description, record.content, record.detail].find((value) => typeof value === "string");
          if (typeof title === "string" && typeof description === "string") {
            return `${title.trim()}：${description.trim()}`;
          }
          if (typeof title === "string") {
            return title.trim();
          }
          if (typeof description === "string") {
            return description.trim();
          }
          return "";
        })
        .filter(Boolean);
      if (parts.length > 0) {
        return parts.join("；");
      }
      return "包含世界手册内容，进入工作台查看详情。";
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const summary = [record.summary, record.description, record.content].find((value) => typeof value === "string");
      if (typeof summary === "string" && summary.trim()) {
        return summary.trim();
      }
      return "包含世界手册内容，进入工作台查看详情。";
    }
  } catch {
    return null;
  }

  return null;
}

function buildPreview(raw: string | null | undefined, fallback: string, limit: number): string {
  if (!raw?.trim()) {
    return fallback;
  }

  const normalized = raw.replace(/\s+/g, " ").trim();
  const structured = extractStructuredPreview(normalized);
  const preview = (structured ?? normalized).slice(0, limit);
  return preview.length < (structured ?? normalized).length ? `${preview}...` : preview;
}

function compactText(value: string | null | undefined, limit: number): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function parseStructuredWorldData(structureJson: string | null | undefined): WorldStructuredData | null {
  if (!structureJson?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(structureJson) as Partial<WorldStructuredData>;
    if (!parsed || typeof parsed !== "object" || !parsed.profile) {
      return null;
    }
    return parsed as WorldStructuredData;
  } catch {
    return null;
  }
}

function buildWorldLibraryProjection(world: {
  description?: string | null;
  overviewSummary?: string | null;
  conflicts?: string | null;
  geography?: string | null;
  background?: string | null;
  factions?: string | null;
  structureJson?: string | null;
}): WorldLibraryCardProjection {
  const structured = parseStructuredWorldData(world.structureJson);
  const legacySummary = buildPreview(world.description ?? world.overviewSummary, "等待补充世界概要", 120);
  const legacyDetail = buildPreview(
    world.conflicts ?? world.geography ?? world.background ?? world.factions,
    "进入工作台整理核心规则、主要势力和故事舞台。",
    160,
  );

  if (!structured) {
    return {
      summary: legacySummary,
      identity: legacyDetail,
      tone: null,
      coreConflict: null,
      ruleCount: 0,
      forceCount: 0,
      locationCount: 0,
      relationCount: 0,
      coreRules: [],
      majorForces: [],
      storyLocations: [],
      tensions: [legacyDetail],
    };
  }

  const coreRules = (structured.rules?.axioms ?? [])
    .map((rule) => compactText([rule.name, rule.summary].filter(Boolean).join("："), 72))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
  const majorForces = [...(structured.forces ?? []), ...(structured.factions ?? [])]
    .map((force) => compactText("name" in force ? [force.name, "summary" in force ? force.summary : force.position].filter(Boolean).join("：") : "", 64))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
  const storyLocations = (structured.locations ?? [])
    .map((location) => compactText([location.name, location.narrativeFunction || location.summary].filter(Boolean).join("："), 64))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
  const tensions = [
    compactText(structured.profile?.coreConflict, 80),
    ...(structured.relations?.forceRelations ?? []).map((relation) =>
      compactText([relation.relation, relation.tension || relation.detail].filter(Boolean).join("："), 72),
    ),
    ...(structured.rules?.sharedConsequences ?? []).map((item) => compactText(item, 72)),
  ]
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);

  return {
    summary: compactText(structured.profile?.summary, 130) ?? legacySummary,
    identity: compactText(structured.profile?.identity, 96),
    tone: compactText(structured.profile?.tone, 40),
    coreConflict: compactText(structured.profile?.coreConflict, 96),
    ruleCount: structured.rules?.axioms?.length ?? 0,
    forceCount: (structured.forces?.length ?? 0) + (structured.factions?.length ?? 0),
    locationCount: structured.locations?.length ?? 0,
    relationCount: (structured.relations?.forceRelations?.length ?? 0) + (structured.relations?.locationControls?.length ?? 0),
    coreRules,
    majorForces,
    storyLocations,
    tensions,
  };
}

function WorldSampleLine({
  icon: Icon,
  label,
  items,
  fallback,
}: {
  icon: typeof Sparkles;
  label: string;
  items: string[];
  fallback: string;
}) {
  return (
    <div className="flex gap-2">
      <Icon className="mt-0.5 h-4 w-4 flex-none text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
          {(items.length > 0 ? items : [fallback]).map((item) => (
            <div key={item} className="line-clamp-2">
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WorldList() {
  const queryClient = useQueryClient();
  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const deleteWorldMutation = useMutation({
    mutationFn: (id: string) => deleteWorld(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all });
      toast.success("世界样本已删除。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "删除世界样本失败。");
    },
  });

  const worlds = worldListQuery.data?.data ?? [];

  const handleDelete = (worldId: string, worldName: string) => {
    const confirmed = window.confirm(`确认删除世界样本「${worldName}」？此操作不可恢复。`);
    if (!confirmed) {
      return;
    }
    deleteWorldMutation.mutate(worldId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">世界样本库</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            这里保存可复用的世界样本。小说需要使用世界时，从小说基础信息页导入为本书世界副本，再决定是否手动同步。
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {featureFlags.worldWizardEnabled ? (
            <Button asChild>
              <Link to="/worlds/generator">生成世界样本</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {worlds.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>暂无世界样本</CardTitle>
            <CardDescription>先生成一个世界样本，后续可以导入到小说中作为本书世界副本。</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
        <div className="rounded-md border border-border/70 bg-muted/20 p-4">
          <div className="text-sm font-medium text-foreground">世界样本的使用方式</div>
          <div className="mt-2 grid gap-3 text-sm leading-6 text-muted-foreground md:grid-cols-3">
            <div>1. 在这里整理通用世界手册，让规则、势力、地点和张力清楚可复用。</div>
            <div>2. 在小说基础信息页导入为“本书世界”，小说会使用自己的副本。</div>
            <div>3. 本书副本和世界样本有差异时，由你手动决定推送或拉取。</div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {worlds.map((world) => {
            const preview = buildWorldLibraryProjection(world);

            return (
              <Card key={world.id} className="overflow-hidden">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="line-clamp-2 text-lg">{world.name}</CardTitle>
                      <CardDescription className="mt-2 line-clamp-3 text-sm leading-6">
                        {preview.summary}
                      </CardDescription>
                    </div>
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-primary/10 text-primary">
                      <BookOpen className="h-5 w-5" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {world.worldType ? <Badge variant="secondary">{world.worldType}</Badge> : null}
                    <Badge variant="outline">可复用样本</Badge>
                    {preview.tone ? <Badge variant="outline">{preview.tone}</Badge> : null}
                    <Badge variant="outline">v{world.version}</Badge>
                    <Badge variant="outline">{world.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded-md border bg-muted/30 px-2 py-2">
                      <div className="font-semibold text-foreground">{preview.ruleCount}</div>
                      <div className="mt-0.5 text-muted-foreground">核心规则</div>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-2 py-2">
                      <div className="font-semibold text-foreground">{preview.forceCount}</div>
                      <div className="mt-0.5 text-muted-foreground">势力</div>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-2 py-2">
                      <div className="font-semibold text-foreground">{preview.locationCount}</div>
                      <div className="mt-0.5 text-muted-foreground">地点</div>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-2 py-2">
                      <div className="font-semibold text-foreground">{preview.relationCount}</div>
                      <div className="mt-0.5 text-muted-foreground">关系</div>
                    </div>
                  </div>

                  {preview.identity || preview.coreConflict ? (
                    <div className="space-y-1 rounded-md border-l-2 border-primary bg-muted/30 px-3 py-2 text-sm leading-6">
                      {preview.identity ? <div className="line-clamp-2 text-foreground">{preview.identity}</div> : null}
                      {preview.coreConflict ? (
                        <div className="line-clamp-2 text-muted-foreground">关键张力：{preview.coreConflict}</div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <WorldSampleLine
                      icon={Sparkles}
                      label="力量与规则"
                      items={preview.coreRules}
                      fallback="进入工作台整理本世界必须遵守的规则。"
                    />
                    <WorldSampleLine
                      icon={Castle}
                      label="势力舞台"
                      items={preview.majorForces}
                      fallback="进入工作台补充会推动剧情的组织与阵营。"
                    />
                    <WorldSampleLine
                      icon={MapPin}
                      label="故事发生地"
                      items={preview.storyLocations}
                      fallback="进入工作台标记适合小说开局和冲突升级的地点。"
                    />
                  </div>

                  {preview.tensions.length > 0 ? (
                    <WorldSampleLine
                      icon={GitBranch}
                      label="可抽取的冲突线"
                      items={preview.tensions}
                      fallback="进入工作台整理世界矛盾，供小说生成使用。"
                    />
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button asChild size="sm">
                      <Link to={`/worlds/${world.id}/workspace`}>
                        <Compass className="mr-1 h-4 w-4" aria-hidden="true" />
                        查看世界手册
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/worlds/${world.id}/workspace`}>
                        <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                        整理样本
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(world.id, world.name)}
                      disabled={deleteWorldMutation.isPending && deleteWorldMutation.variables === world.id}
                    >
                      <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                      {deleteWorldMutation.isPending && deleteWorldMutation.variables === world.id ? "删除中..." : "删除"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
