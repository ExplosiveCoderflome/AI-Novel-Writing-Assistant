import { Boxes, Globe2, PlusCircle, ScrollText, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DIRECTOR_CREATE_LINK,
  MANUAL_CREATE_LINK,
  type HomeAssetHealthItem,
} from "../homeViewModel";
import { toneBorderClass, toneTextClass } from "./homeTone";

const iconById: Record<string, typeof Boxes> = {
  world: Globe2,
  characters: Users,
  chapters: ScrollText,
  readiness: Boxes,
};

export function HomeAssetHealth(props: {
  items: HomeAssetHealthItem[];
  showStarterActions?: boolean;
}) {
  return (
    <Card className="home-asset-health">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg tracking-normal">角色与世界观资产</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {props.items.map((item) => {
            const Icon = iconById[item.id] ?? Boxes;
            return (
              <div key={item.id} className={cn("rounded-lg border p-4", toneBorderClass(item.tone))}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-muted-foreground">{item.title}</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</div>
                  </div>
                  <Icon className={cn("h-4 w-4", toneTextClass(item.tone))} aria-hidden="true" />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.description}</p>
              </div>
            );
          })}
        </div>

        {props.showStarterActions ? (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <PlusCircle className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <div className="text-sm font-medium">开始新项目</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    有新灵感时，可以直接交给自动导演整理方向、角色、世界观和章节准备。
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <Button asChild size="sm">
                    <Link to={DIRECTOR_CREATE_LINK}>AI 自动导演开书</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
