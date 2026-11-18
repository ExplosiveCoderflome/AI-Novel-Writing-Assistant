import { AlertTriangle, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HomeAttentionItem } from "../homeViewModel";
import { toneTextClass } from "./homeTone";

export function HomeAttentionQueue({ items, onReload }: { items: HomeAttentionItem[]; onReload: () => void }) {
  return (
    <Card className="home-attention-queue border-0 bg-muted/35 shadow-none">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base tracking-normal"><ListChecks className="h-4 w-4 text-info" aria-hidden="true" />创作提醒</CardTitle></CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-3 py-3">
              <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", toneTextClass(item.tone))} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-medium">{item.title}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </div>
              {item.to ? (
                <Button asChild size="sm" variant="outline"><Link to={item.to}>{item.actionLabel}</Link></Button>
              ) : (
                <Button size="sm" variant="outline" onClick={onReload}>重新读取创作入口</Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
