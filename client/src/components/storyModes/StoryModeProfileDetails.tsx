import { BookOpen, CircleGauge, Workflow } from "lucide-react";
import type { NovelStoryMode } from "@ai-novel/shared/types/storyMode";
import { cn } from "@/lib/utils";

const conflictCeilingLabel = {
  low: "低强度",
  medium: "中等强度",
  high: "高强度",
} as const;

function ContractList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {items.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item} className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 text-xs text-foreground">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-sm text-muted-foreground">{emptyText}</div>
      )}
    </div>
  );
}

export default function StoryModeProfileDetails({
  node,
  eyebrow = "推进模式",
  className,
  titleId,
}: {
  node: Pick<NovelStoryMode, "name" | "description" | "template" | "profile">;
  eyebrow?: string;
  className?: string;
  titleId?: string;
}) {
  const { profile } = node;

  return (
    <div className={cn("max-w-4xl", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium tracking-[0.16em] text-muted-foreground">{eyebrow}</div>
          <h2 id={titleId} className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{node.name}</h2>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground">
          <CircleGauge className="h-4 w-4" aria-hidden="true" />
          冲突上限：{conflictCeilingLabel[profile.conflictCeiling]}
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        {node.description?.trim() || profile.coreDrive}
      </p>

      <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 md:grid-cols-2">
        <div className="bg-background p-4">
          <Workflow className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="mt-3 text-xs font-medium text-muted-foreground">核心驱动</div>
          <div className="mt-1 text-sm leading-6 text-foreground">{profile.coreDrive}</div>
        </div>
        <div className="bg-background p-4">
          <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="mt-3 text-xs font-medium text-muted-foreground">读者回报</div>
          <div className="mt-1 text-sm leading-6 text-foreground">{profile.readerReward}</div>
        </div>
        <div className="bg-background p-4">
          <div className="text-xs font-medium text-muted-foreground">章节推进单位</div>
          <div className="mt-1 text-sm leading-6 text-foreground">{profile.chapterUnit}</div>
        </div>
        <div className="bg-background p-4">
          <div className="text-xs font-medium text-muted-foreground">阶段回报</div>
          <div className="mt-1 text-sm leading-6 text-foreground">{profile.volumeReward}</div>
        </div>
      </div>

      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <ContractList title="推进单元" items={profile.progressionUnits} emptyText="尚未定义推进单元" />
        <ContractList title="适合的冲突" items={profile.allowedConflictForms} emptyText="尚未定义适合的冲突" />
        <ContractList title="必须出现的信号" items={profile.mandatorySignals} emptyText="尚未定义必须信号" />
        <ContractList title="需要避免的信号" items={profile.antiSignals} emptyText="尚未定义规避信号" />
      </div>

      <div className="mt-7 border-l-2 border-foreground/20 pl-4">
        <div className="text-sm font-semibold text-foreground">解决方式</div>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{profile.resolutionStyle}</p>
        {profile.forbiddenConflictForms.length > 0 ? (
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            不适合：{profile.forbiddenConflictForms.join("、")}
          </p>
        ) : null}
      </div>

      {node.template?.trim() ? (
        <div className="mt-7 border-t border-border/70 pt-6">
          <div className="text-sm font-semibold text-foreground">AI 使用补充</div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{node.template}</p>
        </div>
      ) : null}
    </div>
  );
}
