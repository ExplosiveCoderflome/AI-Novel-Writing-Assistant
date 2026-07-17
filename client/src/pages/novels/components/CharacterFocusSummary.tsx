import type { Character } from "@ai-novel/shared/types/novel";
import type { ReactNode } from "react";
import { Activity, BookOpen, Crown, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCastRoleLabel, getCharacterGenderLabel, isProtagonistCharacter } from "./characterAssetWorkspace.helpers";

interface CharacterFocusSummaryProps {
  selectedCharacter: Character;
  lastAppearanceChapter?: number | null;
}

export default function CharacterFocusSummary(props: CharacterFocusSummaryProps) {
  const { selectedCharacter, lastAppearanceChapter } = props;
  const isProtagonist = isProtagonistCharacter(selectedCharacter);
  const primaryLine = isProtagonist
    ? selectedCharacter.currentGoal || selectedCharacter.storyFunction || "待补全主角目标"
    : selectedCharacter.relationToProtagonist || selectedCharacter.role || "待补全与主角关系";
  const avatarText = selectedCharacter.name.trim().slice(0, 2) || "角";

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-w-0 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted)/0.55)_100%)] p-5">
          <div className="absolute inset-y-5 left-0 w-1 rounded-r-full bg-emerald-500" />
          <div className="flex min-w-0 gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-lg font-semibold text-emerald-900">
              {avatarText}
            </div>
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold tracking-normal">{selectedCharacter.name}</h2>
                {isProtagonist ? (
                  <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                    <Crown className="h-3 w-3" />
                    主角
                  </Badge>
                ) : (
                  <Badge variant="outline">{getCastRoleLabel(selectedCharacter.castRole)}</Badge>
                )}
                <Badge variant="secondary">{getCharacterGenderLabel(selectedCharacter.gender)}</Badge>
              </div>
              <div className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {isProtagonist ? "当前目标" : "关系锚点"}：<span className="font-medium text-foreground">{primaryLine}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <SignalPill icon={<BookOpen className="h-3.5 w-3.5" />} label="身份" value={selectedCharacter.role || "未定义"} />
                <SignalPill icon={<Activity className="h-3.5 w-3.5" />} label="状态" value={selectedCharacter.currentState || "待补全"} />
                <SignalPill icon={<Target className="h-3.5 w-3.5" />} label="最近出场" value={lastAppearanceChapter ? `第${lastAppearanceChapter}章` : "暂无"} />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border/60 bg-muted/15 p-5 lg:border-l lg:border-t-0">
          <div className="text-xs font-medium text-muted-foreground">故事作用</div>
          <div className="mt-2 line-clamp-3 text-sm leading-6">
            {selectedCharacter.storyFunction || "待补全"}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <MiniMetric label="当前目标" value={selectedCharacter.currentGoal || "待补全"} />
            <MiniMetric label="出场状态" value={selectedCharacter.currentState || "待补全"} />
          </div>
        </div>
      </div>
    </section>
  );
}

function SignalPill(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-1">
      {props.icon}
      <span>{props.label}</span>
      <span className="max-w-[220px] truncate font-medium text-foreground">{props.value}</span>
    </span>
  );
}

function MiniMetric(props: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-background px-3 py-2">
      <div className="text-muted-foreground">{props.label}</div>
      <div className="mt-1 truncate font-medium">{props.value}</div>
    </div>
  );
}
