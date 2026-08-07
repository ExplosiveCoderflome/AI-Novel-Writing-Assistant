import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Castle, ChevronDown, Compass, GitBranch, LibraryBig, MapPin, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { WorldStructuredData } from "@ai-novel/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.07] text-primary">
            <LibraryBig className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">世界样本库</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              浏览可复用的世界设定，从中寻找适合新故事的规则、势力、舞台和冲突线索。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {featureFlags.worldWizardEnabled ? (
            <Button asChild className="rounded-full">
              <Link to="/worlds/generator">生成世界样本</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <details className="group rounded-2xl bg-muted/20 px-5 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm marker:hidden">
          <span className="font-medium">如何把样本用于小说</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 grid gap-3 border-t border-border/30 pt-3 text-sm leading-6 text-muted-foreground md:grid-cols-3">
          <div><span className="mr-2 font-medium text-foreground">1</span>整理可复用的世界规则、势力、地点和张力。</div>
          <div><span className="mr-2 font-medium text-foreground">2</span>从小说基础信息页导入，小说会建立自己的世界副本。</div>
          <div><span className="mr-2 font-medium text-foreground">3</span>样本和本书世界有差异时，再决定推送或拉取。</div>
        </div>
      </details>

      {worldListQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3" aria-label="正在加载世界样本">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-80 animate-pulse rounded-3xl bg-muted/30" />
          ))}
        </div>
      ) : worldListQuery.isError ? (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-3xl bg-destructive/[0.04] px-6 text-center">
          <div className="font-medium">世界样本加载失败</div>
          <div className="mt-1 text-sm text-muted-foreground">请检查网络连接后重试。</div>
          <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={() => void worldListQuery.refetch()}>
            重新加载
          </Button>
        </div>
      ) : worlds.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl bg-muted/20 px-6 text-center">
          <BookOpen className="h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
          <div className="mt-3 font-medium">还没有世界样本</div>
          <div className="mt-1 text-sm text-muted-foreground">生成一个可复用世界，为后续小说准备规则、舞台和冲突来源。</div>
          {featureFlags.worldWizardEnabled ? (
            <Button asChild className="mt-5 rounded-full">
              <Link to="/worlds/generator">生成第一个世界样本</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {worlds.map((world) => {
            const preview = buildWorldLibraryProjection(world);

            return (
              <article
                key={world.id}
                className="flex min-h-[390px] flex-col rounded-3xl border border-border/35 bg-card/70 p-5 transition-all hover:border-border/60 hover:shadow-[0_14px_36px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-lg font-semibold tracking-tight">{world.name}</h2>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {world.worldType ? <Badge variant="secondary" className="border-0 bg-muted/60 font-normal">{world.worldType}</Badge> : null}
                      {preview.tone ? <Badge variant="secondary" className="border-0 bg-primary/[0.06] font-normal text-primary">{preview.tone}</Badge> : null}
                    </div>
                  </div>
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-primary/[0.07] text-primary">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{preview.summary}</p>

                {preview.identity || preview.coreConflict ? (
                  <div className="mt-4 rounded-2xl bg-muted/25 px-4 py-3 text-sm leading-6">
                    {preview.identity ? <div className="line-clamp-2 font-medium text-foreground">{preview.identity}</div> : null}
                    {preview.coreConflict ? (
                      <div className="mt-1 line-clamp-2 text-muted-foreground">{preview.coreConflict}</div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  <span><strong className="font-semibold tabular-nums text-foreground">{preview.ruleCount}</strong> 条规则</span>
                  <span><strong className="font-semibold tabular-nums text-foreground">{preview.forceCount}</strong> 个势力</span>
                  <span><strong className="font-semibold tabular-nums text-foreground">{preview.locationCount}</strong> 个地点</span>
                  <span><strong className="font-semibold tabular-nums text-foreground">{preview.relationCount}</strong> 条关系</span>
                </div>

                <details className="group mt-4 border-t border-border/30 pt-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-xs text-muted-foreground marker:hidden">
                    <span>展开创作线索</span>
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                    <WorldSampleLine
                      icon={GitBranch}
                      label="可抽取的冲突线"
                      items={preview.tensions}
                      fallback="进入工作台整理世界矛盾，供小说生成使用。"
                    />
                  </div>
                  <div className="mt-4 text-[11px] text-muted-foreground">版本 v{world.version} · {world.status}</div>
                </details>

                <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-border/30 pt-4">
                  <Button asChild size="sm" className="rounded-full">
                    <Link to={`/worlds/${world.id}/workspace`}>
                      <Compass className="mr-1 h-4 w-4" aria-hidden="true" />
                      查看世界手册
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="rounded-full text-muted-foreground">
                    <Link to={`/worlds/${world.id}/workspace`}>
                      <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                      整理样本
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto rounded-full px-2 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(world.id, world.name)}
                    disabled={deleteWorldMutation.isPending && deleteWorldMutation.variables === world.id}
                    aria-label={`删除世界样本 ${world.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {deleteWorldMutation.isPending && deleteWorldMutation.variables === world.id ? "删除中..." : "删除"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
