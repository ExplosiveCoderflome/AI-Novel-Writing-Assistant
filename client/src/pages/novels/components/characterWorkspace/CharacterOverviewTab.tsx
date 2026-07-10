import type { ReactNode } from "react";
import type { Character } from "@ai-novel/shared/types/novel";
import { Activity, AlertTriangle, Box, EyeOff, HeartPulse, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getEmotionSignal, getSecretStatus } from "./characterWorkspace.helpers";

interface CharacterOverviewTabProps {
  selectedCharacter: Character;
  lastAppearanceChapter?: number | null;
  resourceCount: number;
  pendingCharacterResourceCount: number;
}

export default function CharacterOverviewTab(props: CharacterOverviewTabProps) {
  const { selectedCharacter, lastAppearanceChapter, resourceCount, pendingCharacterResourceCount } = props;
  const emotionSignal = getEmotionSignal(selectedCharacter);
  const secretStatus = getSecretStatus(selectedCharacter);
  const arcItems = [
    { label: "起点", value: selectedCharacter.arcStart },
    { label: "中段", value: selectedCharacter.arcMidpoint },
    { label: "高潮", value: selectedCharacter.arcClimax },
    { label: "终点", value: selectedCharacter.arcEnd },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">角色运行状态</div>
                <div className="mt-1 text-xs text-muted-foreground">先看角色下一章能做什么、想要什么、受什么限制。</div>
              </div>
              <Badge variant="outline">最近出场：{lastAppearanceChapter ? `第${lastAppearanceChapter}章` : "暂无"}</Badge>
            </div>
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            <StatusPanel
              icon={<Activity className="h-4 w-4" />}
              label="当前状态"
              value={selectedCharacter.currentState || "待补全"}
              tone="emerald"
            />
            <StatusPanel
              icon={<Target className="h-4 w-4" />}
              label="当前目标"
              value={selectedCharacter.currentGoal || "待补全"}
              tone="sky"
            />
            <StatusPanel
              icon={<HeartPulse className="h-4 w-4" />}
              label="情绪信号"
              value={emotionSignal}
              tone="rose"
            />
            <StatusPanel
              icon={<EyeOff className="h-4 w-4" />}
              label="秘密状态"
              value={secretStatus}
              tone="amber"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted)/0.45)_100%)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">行动边界</div>
            <Badge variant={pendingCharacterResourceCount > 0 ? "secondary" : "outline"}>
              {pendingCharacterResourceCount > 0 ? `${pendingCharacterResourceCount} 条资源待确认` : "资源已同步"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <BoundaryMetric icon={<Box className="h-4 w-4" />} label="关键资源" value={`${resourceCount} 条`} />
            <BoundaryMetric icon={<AlertTriangle className="h-4 w-4" />} label="风险提示" value={pendingCharacterResourceCount > 0 ? "先核对资源变更" : "可继续推进"} />
          </div>
          <div className="mt-4 rounded-xl border border-border/70 bg-background/80 p-3">
            <div className="text-xs font-medium text-muted-foreground">与主角关系</div>
            <div className="mt-2 text-sm leading-6">{selectedCharacter.relationToProtagonist || "待补全"}</div>
          </div>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium">戏剧引擎</div>
            <Badge variant="outline">角色功能</Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <NarrativeBlock label="故事作用" value={selectedCharacter.storyFunction} />
            <NarrativeBlock label="外在目标" value={selectedCharacter.outerGoal} />
            <NarrativeBlock label="内在需求" value={selectedCharacter.innerNeed} />
            <NarrativeBlock label="恐惧 / 伤口" value={selectedCharacter.fear || selectedCharacter.wound} />
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">成长轨道</div>
            <Badge variant="outline">可后续接入思路线</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {arcItems.map((item, index) => (
              <div key={item.label} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-muted/25 text-xs font-medium">
                    {index + 1}
                  </div>
                  {index < arcItems.length - 1 ? <div className="mt-1 h-7 w-px bg-border/70" /> : null}
                </div>
                <div className="min-w-0 pb-2">
                  <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
                  <div className="mt-1 line-clamp-2 text-sm leading-6">{item.value || "待补全"}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <NarrativeBlock label="错误信念" value={selectedCharacter.misbelief} compact />
            <NarrativeBlock label="道德底线" value={selectedCharacter.moralLine} compact />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusPanel(props: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "emerald" | "sky" | "rose" | "amber";
}) {
  const toneClass = {
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    sky: "text-sky-700 bg-sky-50 border-sky-100",
    rose: "text-rose-700 bg-rose-50 border-rose-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
  }[props.tone];

  return (
    <div className="min-w-0 border-b border-border/60 p-4 md:border-r odd:md:border-r">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${toneClass}`}>
        {props.icon}
        {props.label}
      </div>
      <div className="mt-3 line-clamp-3 min-h-[3rem] text-sm leading-6">{props.value}</div>
    </div>
  );
}

function BoundaryMetric(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/80 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {props.icon}
        {props.label}
      </div>
      <div className="mt-2 text-base font-semibold">{props.value}</div>
    </div>
  );
}

function NarrativeBlock(props: { label: string; value?: string | null; compact?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border border-border/70 bg-muted/10 p-3 ${props.compact ? "" : "min-h-[96px]"}`}>
      <div className="text-xs font-medium text-muted-foreground">{props.label}</div>
      <div className="mt-2 text-sm leading-6">{props.value || "待补全"}</div>
    </div>
  );
}
