import type { Character } from "@ai-novel/shared/types/novel";
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-4">
        <SignalTile label="当前状态" value={selectedCharacter.currentState || "待补全"} />
        <SignalTile label="当前目标" value={selectedCharacter.currentGoal || "待补全"} />
        <SignalTile label="最近出场" value={lastAppearanceChapter ? `第${lastAppearanceChapter}章` : "暂无"} />
        <SignalTile label="关键资源" value={`${resourceCount} 条`} meta={pendingCharacterResourceCount > 0 ? `${pendingCharacterResourceCount} 条待确认` : "已同步"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-border/70 bg-muted/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium">叙事功能</div>
            <Badge variant="outline">情绪：{emotionSignal}</Badge>
            <Badge variant="outline">秘密：{secretStatus}</Badge>
          </div>
          <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            <InfoLine label="故事作用" value={selectedCharacter.storyFunction} />
            <InfoLine label="与主角关系" value={selectedCharacter.relationToProtagonist} />
            <InfoLine label="外在目标" value={selectedCharacter.outerGoal} />
            <InfoLine label="内在需求" value={selectedCharacter.innerNeed} />
            <InfoLine label="恐惧 / 伤口" value={selectedCharacter.fear || selectedCharacter.wound} />
          </div>
        </section>

        <section className="rounded-xl border border-border/70 bg-background p-4">
          <div className="text-sm font-medium">成长弧摘要</div>
          <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            <InfoLine label="起点" value={selectedCharacter.arcStart} />
            <InfoLine label="中段转折" value={selectedCharacter.arcMidpoint} />
            <InfoLine label="高潮选择" value={selectedCharacter.arcClimax} />
            <InfoLine label="终点状态" value={selectedCharacter.arcEnd} />
            <InfoLine label="错误信念" value={selectedCharacter.misbelief} />
            <InfoLine label="道德底线" value={selectedCharacter.moralLine} />
          </div>
        </section>
      </div>
    </div>
  );
}

function SignalTile(props: { label: string; value: string; meta?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-background p-3">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-2 line-clamp-2 text-sm font-medium leading-6">{props.value}</div>
      {props.meta ? <div className="mt-1 text-xs text-muted-foreground">{props.meta}</div> : null}
    </div>
  );
}

function InfoLine(props: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="text-foreground">{props.label}：</span>
      {props.value || "待补全"}
    </div>
  );
}
