import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HomeAttentionItem } from "../homeViewModel";
import { toneBorderClass, toneTextClass } from "./homeTone";

export function HomeAttentionQueue(props: {
  items: HomeAttentionItem[];
  hasNovels: boolean;
}) {
  return (
    <Card className="home-attention-queue">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg tracking-normal">
          <ListChecks className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          待处理事项
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.items.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" aria-hidden="true" />
              <div>
                <div className="text-sm font-medium text-emerald-800">
                  {props.hasNovels ? t("gen.pages.home.components.HomeAttentionQueue.gen_599afbac") : t("gen.pages.home.components.HomeAttentionQueue.gen_39595608")}
                </div>
                <p className="mt-1 text-sm leading-6 text-emerald-700/90">
                  {props.hasNovels
                    ? t("gen.pages.home.components.HomeAttentionQueue.gen_9d3d5b9e")
                    : t("gen.pages.home.components.HomeAttentionQueue.gen_5a5e0eee")}
                </p>
              </div>
            </div>
          </div>
        ) : (
          props.items.map((item) => (
            <div key={item.id} className={cn("rounded-lg border p-4", toneBorderClass(item.tone))}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={cn("mt-0.5 h-4 w-4", toneTextClass(item.tone))} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{item.title}</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
                {item.to && item.actionLabel ? (
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link to={item.to}>{item.actionLabel}</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
