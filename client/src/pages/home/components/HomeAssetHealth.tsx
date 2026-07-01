import { Boxes, Globe2, ScrollText, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HomeAssetHealthItem } from "../homeViewModel";
import { toneBorderClass, toneTextClass } from "./homeTone";

const iconById: Record<string, typeof Boxes> = {
  world: Globe2,
  characters: Users,
  chapters: ScrollText,
  readiness: Boxes,
};

export function HomeAssetHealth(props: {
  items: HomeAssetHealthItem[];
}) {
  return (
    <Card className="home-asset-health">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg tracking-normal">角色与世界观资产</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
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
      </CardContent>
    </Card>
  );
}
