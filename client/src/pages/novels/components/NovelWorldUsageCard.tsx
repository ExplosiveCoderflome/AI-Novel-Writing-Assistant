import { useEffect, useMemo, useState } from "react";
import { Castle, MapPinned, ShieldAlert, SlidersHorizontal } from "lucide-react";
import type { StoryWorldSliceOverrides, StoryWorldSliceView } from "@ai-novel/shared/types/storyWorldSlice";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailDisclosure } from "./workspaceShell";

export interface NovelWorldUsageCardProps {
  view?: StoryWorldSliceView | null;
  message: string;
  isRefreshing: boolean;
  isSaving: boolean;
  onRefresh: () => void;
  onSave: (patch: StoryWorldSliceOverrides) => void;
}

export interface NovelWorldUsageDraftState {
  primaryLocationId: string;
  setPrimaryLocationId: (value: string) => void;
  requiredForceIds: string[];
  setRequiredForceIds: (updater: (prev: string[]) => string[]) => void;
  requiredLocationIds: string[];
  setRequiredLocationIds: (updater: (prev: string[]) => string[]) => void;
  requiredRuleIds: string[];
  setRequiredRuleIds: (updater: (prev: string[]) => string[]) => void;
  scopeNote: string;
  setScopeNote: (value: string) => void;
  savePayload: StoryWorldSliceOverrides;
}

function toggleId(ids: string[], id: string, checked: boolean): string[] {
  const set = new Set(ids);
  if (checked) {
    set.add(id);
  } else {
    set.delete(id);
  }
  return Array.from(set);
}

function labelStoryInputSource(source: string | null | undefined): string {
  switch (source) {
    case "explicit":
      return "来自你这次手动输入的故事想法";
    case "story_macro":
      return "来自故事宏观规划里的故事想法";
    case "novel_description":
      return "来自小说简介";
    default:
      return "暂无";
  }
}

function namesLine(items: Array<{ name: string }>, fallback: string): string {
  if (!items.length) {
    return fallback;
  }
  return items.slice(0, 3).map((item) => item.name).join(" · ");
}

function findPrimaryLocation(view: StoryWorldSliceView | null | undefined, primaryLocationId: string): string {
  if (primaryLocationId === "__none__") {
    return view?.slice?.activeLocations[0]?.name ?? "未指定";
  }
  return view?.availableLocations.find((item) => item.id === primaryLocationId)?.name ?? "未指定";
}

function MetricItem(props: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{props.value}</div>
      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{props.detail}</div>
    </div>
  );
}

function OverrideGroup({
  icon: Icon,
  title,
  description,
  emptyText,
  items,
  selectedIds,
  onToggle,
}: {
  icon: typeof Castle;
  title: string;
  description: string;
  emptyText: string;
  items: Array<{ id: string; name: string; summary: string }>;
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="border-t border-border/60 pt-4">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.map((item) => (
          <label key={item.id} className="flex items-start gap-3 rounded-md bg-muted/20 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={(event) => onToggle(item.id, event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">{item.name}</span>
              <span className="block leading-6 text-muted-foreground">{item.summary}</span>
            </span>
          </label>
        )) : <div className="text-sm text-muted-foreground">{emptyText}</div>}
      </div>
    </div>
  );
}

export function useNovelWorldUsageDraft(props: NovelWorldUsageCardProps): NovelWorldUsageDraftState {
  const [primaryLocationId, setPrimaryLocationId] = useState<string>("__none__");
  const [requiredForceIds, setRequiredForceIds] = useState<string[]>([]);
  const [requiredLocationIds, setRequiredLocationIds] = useState<string[]>([]);
  const [requiredRuleIds, setRequiredRuleIds] = useState<string[]>([]);
  const [scopeNote, setScopeNote] = useState("");

  useEffect(() => {
    setPrimaryLocationId(props.view?.overrides.primaryLocationId ?? "__none__");
    setRequiredForceIds(props.view?.overrides.requiredForceIds ?? []);
    setRequiredLocationIds(props.view?.overrides.requiredLocationIds ?? []);
    setRequiredRuleIds(props.view?.overrides.requiredRuleIds ?? []);
    setScopeNote(props.view?.overrides.scopeNote ?? "");
  }, [props.view]);

  const savePayload = useMemo<StoryWorldSliceOverrides>(() => ({
    primaryLocationId: primaryLocationId === "__none__" ? null : primaryLocationId,
    requiredForceIds,
    requiredLocationIds,
    requiredRuleIds,
    scopeNote: scopeNote.trim() || null,
  }), [primaryLocationId, requiredForceIds, requiredLocationIds, requiredRuleIds, scopeNote]);

  return {
    primaryLocationId,
    setPrimaryLocationId,
    requiredForceIds,
    setRequiredForceIds,
    requiredLocationIds,
    setRequiredLocationIds,
    requiredRuleIds,
    setRequiredRuleIds,
    scopeNote,
    setScopeNote,
    savePayload,
  };
}

export function NovelWorldUsageSummary(props: NovelWorldUsageCardProps & {
  draft: NovelWorldUsageDraftState;
  onOpenDetails?: () => void;
}) {
  const slice = props.view?.slice ?? null;
  const hasWorld = props.view?.hasWorld ?? false;
  const primaryLocation = findPrimaryLocation(props.view, props.draft.primaryLocationId);
  const boundaryText = props.draft.scopeNote.trim() || slice?.storyScopeBoundary || "整理后会生成这本书的使用边界。";
  const canSave = hasWorld && Boolean(props.view);

  return (
    <section id="novel-world-usage" className="rounded-2xl bg-background/80 p-4 shadow-sm ring-1 ring-border/35">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            章节生成使用范围
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {slice
              ? "这些规则、势力和地点会优先进入角色、大纲和章节生成。"
              : hasWorld
                ? "先整理本书会实际使用的世界范围，避免章节生成读取过多无关设定。"
                : "先创建或导入本书世界，再整理生成会读取的范围。"}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={props.onRefresh} disabled={!hasWorld || props.isRefreshing}>
            {props.isRefreshing ? "整理中..." : "整理本书使用范围"}
          </Button>
          <Button type="button" variant="ghost" onClick={props.onOpenDetails} disabled={!hasWorld}>
            <SlidersHorizontal className="size-4" />
            调整保留项
          </Button>
        </div>
      </div>

      {props.message ? (
        <div className="mt-3 rounded-md bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          {props.message}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <MetricItem label="主舞台" value={primaryLocation} detail={props.view?.worldName ?? "等待本书世界"} />
        <MetricItem
          label="活跃势力"
          value={`${slice?.activeForces.length ?? 0} 个`}
          detail={namesLine(slice?.activeForces ?? [], "整理后显示")}
        />
        <MetricItem
          label="故事地点"
          value={`${slice?.activeLocations.length ?? 0} 处`}
          detail={namesLine(slice?.activeLocations ?? [], "整理后显示")}
        />
        <MetricItem
          label="硬规则"
          value={`${slice?.appliedRules.length ?? 0} 条`}
          detail={namesLine(slice?.appliedRules ?? [], "整理后显示")}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 text-sm leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">边界：</span>
          <span className="line-clamp-2">{boundaryText}</span>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!canSave || props.isSaving}
          onClick={() => props.onSave(props.draft.savePayload)}
        >
          {props.isSaving ? "保存中..." : "保存保留项"}
        </Button>
      </div>
    </section>
  );
}

export function NovelWorldUsageDetails(props: NovelWorldUsageCardProps & {
  draft: NovelWorldUsageDraftState;
}) {
  const slice = props.view?.slice ?? null;
  const hasWorld = props.view?.hasWorld ?? false;
  const hasSlice = Boolean(slice);
  const canSave = hasWorld && Boolean(props.view);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-lg font-semibold text-foreground">生成使用范围</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            这里确认章节生成实际会读取的规则、势力和地点。你可以只指定少量必须保留项，其余交给系统按本书方向裁剪。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={props.onRefresh} disabled={!hasWorld || props.isRefreshing}>
            {props.isRefreshing ? "整理中..." : "重新整理使用范围"}
          </Button>
          <Button type="button" onClick={() => props.onSave(props.draft.savePayload)} disabled={!canSave || props.isSaving}>
            {props.isSaving ? "保存中..." : "保存保留项"}
          </Button>
        </div>
      </div>

      {props.message ? (
        <div className="rounded-md bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          {props.message}
        </div>
      ) : null}

      {!hasWorld ? (
        <div className="rounded-md border border-dashed border-border/70 px-4 py-4 text-sm leading-6 text-muted-foreground">
          这本小说还没有本书世界。先从世界库导入，或根据本书主题生成一套世界，再整理当前故事会重点使用的规则、势力和地点。
        </div>
      ) : null}

      {hasWorld ? (
        <div className="grid gap-4 md:grid-cols-2">
          <MetricItem label="本书世界" value={props.view?.worldName ?? "未命名世界"} detail="章节生成读取的是这本书的世界副本。" />
          <MetricItem label="故事想法来源" value={labelStoryInputSource(props.view?.storyInputSource)} detail="使用范围会结合当前故事方向裁剪。" />
        </div>
      ) : null}

      {slice ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <section className="space-y-5">
            <div>
              <div className="text-sm font-medium text-foreground">世界底色</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{slice.coreWorldFrame || "暂无"}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">会用到的组织</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                {namesLine(slice.activeForces, "暂无")}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">会用到的地点</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                {namesLine(slice.activeLocations, "暂无")}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">核心规则</div>
              <div className="mt-2 space-y-3">
                {slice.appliedRules.length > 0 ? slice.appliedRules.map((item) => (
                  <div key={item.id} className="border-t border-border/50 pt-3 text-sm">
                    <div className="font-medium text-foreground">{item.name}</div>
                    <div className="mt-1 leading-6 text-muted-foreground">{item.summary}</div>
                  </div>
                )) : <div className="text-sm text-muted-foreground">暂无</div>}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">压力来源</div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {slice.pressureSources.length > 0 ? slice.pressureSources.map((item) => (
                  <div key={item}>{item}</div>
                )) : <div>暂无</div>}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">不要越过的边界</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{slice.storyScopeBoundary || "暂无"}</div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl bg-muted/15 p-4">
            <div>
              <div className="text-sm font-medium text-foreground">手动保留项</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                这里只指定必须出现或必须遵守的少量内容，不需要重填整套世界。
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">主舞台</label>
              <Select value={props.draft.primaryLocationId} onValueChange={props.draft.setPrimaryLocationId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="请选择主舞台" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不额外指定</SelectItem>
                  {props.view?.availableLocations.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DetailDisclosure title="必须保留的组织、地点和规则" description="适合开局地点、关键盟友、主要敌人和不能突破的力量代价。">
              <div className="space-y-4">
                <OverrideGroup
                  icon={Castle}
                  title="必须保留的组织"
                  description="主角出身、主要敌人、关键盟友这类前期不能漏掉的势力。"
                  emptyText="本书世界里还没有可选组织。"
                  items={props.view?.availableForces ?? []}
                  selectedIds={props.draft.requiredForceIds}
                  onToggle={(id, checked) => props.draft.setRequiredForceIds((prev) => toggleId(prev, id, checked))}
                />
                <OverrideGroup
                  icon={MapPinned}
                  title="必须保留的地点"
                  description="开局地点、试炼地、冲突爆发地和读者需要反复记住的舞台。"
                  emptyText="本书世界里还没有可选地点。"
                  items={props.view?.availableLocations ?? []}
                  selectedIds={props.draft.requiredLocationIds}
                  onToggle={(id, checked) => props.draft.setRequiredLocationIds((prev) => toggleId(prev, id, checked))}
                />
                <OverrideGroup
                  icon={ShieldAlert}
                  title="必须遵守的规则"
                  description="力量代价、身份禁忌和不能被剧情随意突破的边界。"
                  emptyText="本书世界里还没有可选规则。"
                  items={props.view?.availableRules ?? []}
                  selectedIds={props.draft.requiredRuleIds}
                  onToggle={(id, checked) => props.draft.setRequiredRuleIds((prev) => toggleId(prev, id, checked))}
                />
              </div>
            </DetailDisclosure>

            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="story-world-scope-note">
                前期不要越界的边界说明
              </label>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                可以补一句边界，例如“保留现实都市基底，不要转成玄幻升级文”。
              </div>
              <textarea
                id="story-world-scope-note"
                value={props.draft.scopeNote}
                onChange={(event) => props.draft.setScopeNote(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="例如：保留原作的现实商业环境和人物压迫感，不要引入超自然体系。"
              />
            </div>
          </section>
        </div>
      ) : null}

      {hasWorld && !hasSlice ? (
        <div className="rounded-md border border-dashed border-border/70 px-4 py-4 text-sm leading-6 text-muted-foreground">
          这本书还没有整理出当前故事会用到的世界范围。点击“整理本书使用范围”后，会根据本书世界和故事想法生成一版可确认的规则、势力和地点范围。
        </div>
      ) : null}
    </div>
  );
}

export default function NovelWorldUsageCard(props: NovelWorldUsageCardProps) {
  const draft = useNovelWorldUsageDraft(props);

  return (
    <div className="space-y-4">
      <NovelWorldUsageSummary {...props} draft={draft} />
      <DetailDisclosure title="使用范围详情" description="查看和调整本书前期必须保留的世界约束。">
        <NovelWorldUsageDetails {...props} draft={draft} />
      </DetailDisclosure>
    </div>
  );
}
