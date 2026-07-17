import { Boxes, Globe2, ScrollText, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type HomeAssetHealthItem } from "../homeViewModel";
import { toneTextClass } from "./homeTone";

const iconById: Record<string, typeof Boxes> = { world: Globe2, characters: Users, chapters: ScrollText, readiness: Boxes };

export function HomeAssetHealth(props: { items: HomeAssetHealthItem[]; showStarterActions?: boolean }) {
  return (
    <Card className="home-asset-health border-border/80 shadow-none">
      <CardHeader className="pb-3"><CardTitle className="text-base tracking-normal">创作资产概览</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-1">
          {props.items.map((item) => {
            const Icon = iconById[item.id] ?? Boxes;
            return (
              <div key={item.id} className="flex items-center gap-3 rounded-md px-2 py-2.5">
                <Icon className={cn("h-4 w-4 shrink-0", toneTextClass(item.tone))} aria-hidden="true" />
                <div className="min-w-0 flex-1"><div className="text-sm">{item.title}</div><p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.description}</p></div>
                <div className="text-lg font-semibold tabular-nums">{item.value}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
