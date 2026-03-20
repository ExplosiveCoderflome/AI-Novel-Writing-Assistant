import { useEffect, useMemo, useState } from "react";
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
            <CardTitle>这本书会用到的世界设定</CardTitle>
            <div className="text-sm leading-6 text-muted-foreground">
              系统会自动从已绑定的世界里裁出当前这本书真正会用到的组织、地点和规则。你通常只需要确认主舞台和少量必须保留项。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {props.view?.isStale ? <Badge variant="secondary">需要刷新</Badge> : null}
            {slice ? <Badge variant="outline">已生成</Badge> : null}
            <Button type="button" variant="outline" onClick={props.onRefresh} disabled={!hasWorld || props.isRefreshing}>
              {props.isRefreshing ? "正在刷新..." : "重新整理世界设定"}
            </Button>
            <Button type="button" onClick={() => props.onSave(savePayload)} disabled={!canSave || props.isSaving}>
              {props.isSaving ? "正在保存..." : "保存这本书的保留项"}
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
            这本小说还没有绑定世界观。先在上面的“基本信息”里选择一个世界，系统才会帮你整理可用设定。
          </div>
        ) : null}

        {hasWorld ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 px-4 py-3">
              <div className="text-sm font-medium text-foreground">已绑定世界</div>
              <div className="mt-1 text-sm text-muted-foreground">{props.view?.worldName ?? "未命名世界"}</div>
            </div>
            <div className="rounded-lg border border-border/70 px-4 py-3">
              <div className="text-sm font-medium text-foreground">当前故事想法来源</div>
              <div className="mt-1 text-sm text-muted-foreground">{labelStoryInputSource(props.view?.storyInputSource)}</div>
            </div>
          </div>
        ) : null}

        {slice ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border/70 px-4 py-4">
              <div className="text-sm font-medium text-foreground">这本书当前会用到的内容</div>
              <div className="mt-3 space-y-4 text-sm">
                <div>
                  <div className="font-medium text-foreground">世界底色</div>
                  <div className="mt-1 leading-6 text-muted-foreground">{slice.coreWorldFrame || "暂无"}</div>
                </div>
                <div>
                  <div className="font-medium text-foreground">当前会用到的组织</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {slice.activeForces.length > 0 ? slice.activeForces.map((item) => (
                      <Badge key={item.id} variant="secondary">{item.name}</Badge>
                    )) : <span className="text-muted-foreground">暂无</span>}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-foreground">当前会用到的地点</div>
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
              <div className="text-sm font-medium text-foreground">如果你想手动指定，只改这几项就够了</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                主舞台 = 故事最常发生的地点。必须保留 = 无论系统怎么裁剪，都要强制带进来的组织、地点或规则。
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

                <div>
                  <div className="text-sm font-medium text-foreground">必须保留的组织</div>
                  <div className="mt-2 grid gap-2">
                    {props.view?.availableForces.length ? props.view.availableForces.map((item) => (
                      <label key={item.id} className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={requiredForceIds.includes(item.id)}
                          onChange={(event) => setRequiredForceIds((prev) => toggleId(prev, item.id, event.target.checked))}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-medium text-foreground">{item.name}</span>
                          <span className="block text-muted-foreground">{item.summary}</span>
                        </span>
                      </label>
                    )) : <div className="text-sm text-muted-foreground">当前世界里还没有可选组织。</div>}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground">必须保留的地点</div>
                  <div className="mt-2 grid gap-2">
                    {props.view?.availableLocations.length ? props.view.availableLocations.map((item) => (
                      <label key={item.id} className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={requiredLocationIds.includes(item.id)}
                          onChange={(event) => setRequiredLocationIds((prev) => toggleId(prev, item.id, event.target.checked))}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-medium text-foreground">{item.name}</span>
                          <span className="block text-muted-foreground">{item.summary}</span>
                        </span>
                      </label>
                    )) : <div className="text-sm text-muted-foreground">当前世界里还没有可选地点。</div>}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground">必须保留的规则</div>
                  <div className="mt-2 grid gap-2">
                    {props.view?.availableRules.length ? props.view.availableRules.map((item) => (
                      <label key={item.id} className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={requiredRuleIds.includes(item.id)}
                          onChange={(event) => setRequiredRuleIds((prev) => toggleId(prev, item.id, event.target.checked))}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-medium text-foreground">{item.name}</span>
                          <span className="block text-muted-foreground">{item.summary}</span>
                        </span>
                      </label>
                    )) : <div className="text-sm text-muted-foreground">当前世界里还没有可选规则。</div>}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground" htmlFor="story-world-scope-note">
                    额外说明
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
            系统还没有整理出这本书会用到的世界设定。点击“重新整理世界设定”后，会根据当前世界和故事想法自动生成一版可用结果。
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
