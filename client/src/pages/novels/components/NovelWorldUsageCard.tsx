import { useEffect, useMemo, useState } from "react";
import { Castle, MapPinned, ShieldAlert } from "lucide-react";
import type { StoryWorldSliceOverrides, StoryWorldSliceView } from "@ai-novel/shared/types/storyWorldSlice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NovelWorldUsageCardProps {
  view?: StoryWorldSliceView | null;
  message: string;
  isRefreshing: boolean;
  isSaving: boolean;
  onRefresh: () => void;
  onSave: (patch: StoryWorldSliceOverrides) => void;
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
    <div className="rounded-md border border-border/70 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.map((item) => (
          <label key={item.id} className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={(event) => onToggle(item.id, event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">{item.name}</span>
              <span className="block text-muted-foreground">{item.summary}</span>
            </span>
          </label>
        )) : <div className="text-sm text-muted-foreground">{emptyText}</div>}
      </div>
    </div>
  );
}

export default function NovelWorldUsageCard(props: NovelWorldUsageCardProps) {
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

  const slice = props.view?.slice ?? null;
  const hasWorld = props.view?.hasWorld ?? false;
  const hasSlice = Boolean(slice);
  const canSave = hasWorld && Boolean(props.view);
  const savePayload = useMemo<StoryWorldSliceOverrides>(() => ({
    primaryLocationId: primaryLocationId === "__none__" ? null : primaryLocationId,
    requiredForceIds,
    requiredLocationIds,
    requiredRuleIds,
    scopeNote: scopeNote.trim() || null,
  }), [primaryLocationId, requiredForceIds, requiredLocationIds, requiredRuleIds, scopeNote]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>围绕这本书的世界边界</CardTitle>
            <div className="text-sm leading-6 text-muted-foreground">
              结合这本书的目标读者、卖点和前期承诺，从本书世界里裁出当前故事真正会用到的组织、地点和规则。你通常只需要确认主舞台、前期必须保留项和不要越界的边界说明。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {props.view?.isStale ? <Badge variant="secondary">需要刷新</Badge> : null}
            {slice ? <Badge variant="outline">写作可用</Badge> : null}
            <Button type="button" variant="outline" onClick={props.onRefresh} disabled={!hasWorld || props.isRefreshing}>
              {props.isRefreshing ? "整理中..." : "整理本书使用范围"}
            </Button>
            <Button type="button" onClick={() => props.onSave(savePayload)} disabled={!canSave || props.isSaving}>
              {props.isSaving ? "保存中..." : "保存这本书的保留项"}
            </Button>
          </div>
        </div>
        {props.message ? (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {props.message}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasWorld ? (
          <div className="rounded-md border border-dashed border-border/70 px-4 py-4 text-sm leading-6 text-muted-foreground">
            这本小说还没有本书世界。先在“本书世界”卡片中从世界库导入，或根据本书主题生成一套世界，再整理当前故事会重点使用的规则、势力和地点。
          </div>
        ) : null}

        {hasWorld ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 px-4 py-3">
              <div className="text-sm font-medium text-foreground">本书世界</div>
              <div className="mt-1 text-sm text-muted-foreground">{props.view?.worldName ?? "未命名世界"}</div>
            </div>
            <div className="rounded-lg border border-border/70 px-4 py-3">
              <div className="text-sm font-medium text-foreground">故事想法来源</div>
              <div className="mt-1 text-sm text-muted-foreground">{labelStoryInputSource(props.view?.storyInputSource)}</div>
            </div>
          </div>
        ) : null}

        {slice ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border/70 px-4 py-4">
              <div className="text-sm font-medium text-foreground">这本书会用到的内容</div>
              <div className="mt-3 space-y-4 text-sm">
                <div>
                  <div className="font-medium text-foreground">世界底色</div>
                  <div className="mt-1 leading-6 text-muted-foreground">{slice.coreWorldFrame || "暂无"}</div>
                </div>
                <div>
                  <div className="font-medium text-foreground">会用到的组织</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {slice.activeForces.length > 0 ? slice.activeForces.map((item) => (
                      <Badge key={item.id} variant="secondary">{item.name}</Badge>
                    )) : <span className="text-muted-foreground">暂无</span>}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-foreground">会用到的地点</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {slice.activeLocations.length > 0 ? slice.activeLocations.map((item) => (
                      <Badge key={item.id} variant="secondary">{item.name}</Badge>
                    )) : <span className="text-muted-foreground">暂无</span>}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-foreground">核心规则</div>
                  <div className="mt-2 space-y-2">
                    {slice.appliedRules.length > 0 ? slice.appliedRules.map((item) => (
                      <div key={item.id} className="rounded-md bg-muted/30 px-3 py-2 text-muted-foreground">
                        <div className="font-medium text-foreground">{item.name}</div>
                        <div className="mt-1 leading-6">{item.summary}</div>
                      </div>
                    )) : <div className="text-muted-foreground">暂无</div>}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-foreground">主要压力来源</div>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {slice.pressureSources.length > 0 ? slice.pressureSources.map((item) => (
                      <div key={item}>{item}</div>
                    )) : <div>暂无</div>}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-foreground">这本书先不要越过的边界</div>
                  <div className="mt-1 leading-6 text-muted-foreground">{slice.storyScopeBoundary || "暂无"}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 px-4 py-4">
              <div className="text-sm font-medium text-foreground">手动保留项</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                这里不是让你重填世界，只是给本书加几条保留要求。主舞台决定开局落点，保留项会强制带进本书范围。
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">主舞台</label>
                  <Select value={primaryLocationId} onValueChange={setPrimaryLocationId}>
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

                <OverrideGroup
                  icon={Castle}
                  title="必须保留的组织"
                  description="适合主角出身、主要敌人、关键盟友这类前期不能漏掉的势力。"
                  emptyText="本书世界里还没有可选组织。"
                  items={props.view?.availableForces ?? []}
                  selectedIds={requiredForceIds}
                  onToggle={(id, checked) => setRequiredForceIds((prev) => toggleId(prev, id, checked))}
                />

                <OverrideGroup
                  icon={MapPinned}
                  title="必须保留的地点"
                  description="适合开局地点、试炼地、冲突爆发地和读者需要反复记住的舞台。"
                  emptyText="本书世界里还没有可选地点。"
                  items={props.view?.availableLocations ?? []}
                  selectedIds={requiredLocationIds}
                  onToggle={(id, checked) => setRequiredLocationIds((prev) => toggleId(prev, id, checked))}
                />

                <OverrideGroup
                  icon={ShieldAlert}
                  title="必须遵守的规则"
                  description="适合力量代价、身份禁忌和不能被剧情随意突破的边界。"
                  emptyText="本书世界里还没有可选规则。"
                  items={props.view?.availableRules ?? []}
                  selectedIds={requiredRuleIds}
                  onToggle={(id, checked) => setRequiredRuleIds((prev) => toggleId(prev, id, checked))}
                />

                <div>
                  <label className="text-sm font-medium text-foreground" htmlFor="story-world-scope-note">
                    前期不要越界的边界说明
                  </label>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">
                    如果你想补一句边界说明，比如“保留现实都市基底，不要转成玄幻升级文”，写在这里。
                  </div>
                  <textarea
                    id="story-world-scope-note"
                    value={scopeNote}
                    onChange={(event) => setScopeNote(event.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="例如：保留原作的现实商业环境和人物压迫感，不要引入超自然体系。"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {hasWorld && !hasSlice ? (
          <div className="rounded-md border border-dashed border-border/70 px-4 py-4 text-sm leading-6 text-muted-foreground">
            这本书还没有整理出当前故事会用到的世界范围。点击“整理本书使用范围”后，会根据本书世界和故事想法生成一版可确认的规则、势力和地点范围。
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
