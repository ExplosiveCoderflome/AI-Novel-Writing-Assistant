import {useMemo} from "react";
import {WorldVisualizationBoard} from "@/pages/worlds/components/visualization";
import type {WorkspaceBook} from "../model";
import {projectSavedWorldVisualization} from "./worldProjection";

export function WorldMapView({book, onOpenWorld}: {book:WorkspaceBook; onOpenWorld:()=>void}) {
  const world = book.materials.world;
  const payload = useMemo(()=>projectSavedWorldVisualization(world),[world]);
  return <div className="min-w-0 space-y-4 px-2 sm:px-6">
    <div>
      <p className="mb-2 text-xs text-muted-foreground">{world?.name ?? "本书世界"}</p>
      <h2 className="text-2xl font-semibold">世界地图</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">查看地点、路线与势力关系。拖动或缩放图谱，也可全屏查看；未设定坐标的地点按示意布局排列。</p>
    </div>
    {world?.warnings?.map((warning,index)=><p key={index} role="alert" className="text-sm text-destructive">{warning}</p>)}
    {!payload?.geographyMap.nodes.length ? <p className="py-3 text-sm text-muted-foreground">本书还没有可绘制的地点资料，可从世界设定查看保存的内容。</p> : null}
    <button type="button" className="text-sm text-primary hover:underline focus-visible:underline" onClick={onOpenWorld}>查看世界设定</button>
    {payload ? <WorldVisualizationBoard payload={payload} initialMode="geography"/> : null}
  </div>;
}
