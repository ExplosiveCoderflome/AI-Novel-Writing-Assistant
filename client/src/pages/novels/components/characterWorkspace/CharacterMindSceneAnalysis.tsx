import { useState } from "react";
import type { CharacterMindSnapshot } from "@ai-novel/shared/types/characterMind";
import { Brain, ChevronDown, ChevronUp, CircleAlert, Lightbulb, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CharacterMindSceneAnalysisProps {
  characterName: string;
  mind: CharacterMindSnapshot;
}

export default function CharacterMindSceneAnalysis(props: CharacterMindSceneAnalysisProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <aside className="min-w-0 rounded-3xl border border-border/70 bg-background p-5 shadow-sm xl:sticky xl:top-0">
      <div className="flex items-center gap-2 text-sm font-semibold"><Brain className="h-4 w-4 text-primary" />角色场景分析</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">以下内容帮助理解 {props.characterName} 的回应逻辑，是 AI 推断，不会改写小说正史。</p>

      <section className="mt-5 rounded-2xl border border-primary/15 bg-primary/[0.045] p-4">
        <div className="text-xs font-medium text-primary">他如何看待眼前局面</div>
        <p className="mt-2 text-sm leading-7 text-foreground">{props.mind.currentInterpretation}</p>
      </section>

      <div className="mt-4 space-y-3">
        <AnalysisItem icon={Lightbulb} title="谈话中的关注点" value={props.mind.activePlan || props.mind.privateIntent || "AI 尚未判断出稳定关注点。"} />
        <AnalysisItem icon={CircleAlert} title="可能的误读" value={props.mind.misbeliefs[0] || "暂无明确误读。"} tone="warning" />
        <AnalysisItem icon={ShieldCheck} title="受压时的反应" value={props.mind.actionTendency || "AI 尚未判断出稳定反应。"} />
      </div>

      <Button className="mt-4 w-full justify-between" size="sm" variant="ghost" onClick={() => setIsExpanded((current) => !current)}>
        {isExpanded ? "收起完整分析" : "查看完整分析"}
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {isExpanded ? <div className="mt-3 space-y-3 border-t border-border/60 pt-4">
        <AnalysisItem title="当前情绪与立场" value={props.mind.emotionalStance || "未形成稳定判断。"} />
        <AnalysisItem title="什么会改变决定" value={props.mind.decisionTrigger || "未形成稳定判断。"} />
        <AnalysisItem title="当前相信" value={props.mind.beliefs.join("；") || "暂无需要特别追踪的判断。"} />
        <AnalysisItem title="推断依据" value={props.mind.evidence.join("；") || "暂无可展示依据。"} />
      </div> : null}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
        <Badge variant="outline">来源：{props.mind.sourceType === "artifact_delta" ? "章节定稿后的变化" : props.mind.sourceType === "bootstrap" ? "角色准备" : "手动整理"}</Badge>
        {typeof props.mind.confidence === "number" ? <Badge variant="outline">置信度 {Math.round(props.mind.confidence * 100)}%</Badge> : null}
      </div>
    </aside>
  );
}

function AnalysisItem(props: { icon?: typeof Brain; title: string; value: string; tone?: "warning" }) {
  const Icon = props.icon;
  return <section className="rounded-2xl border border-border/70 bg-muted/[0.16] p-3.5"><div className={`flex items-center gap-1.5 text-xs font-medium ${props.tone === "warning" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{Icon ? <Icon className="h-3.5 w-3.5" /> : null}{props.title}</div><p className="mt-1.5 text-sm leading-6 text-foreground">{props.value}</p></section>;
}
