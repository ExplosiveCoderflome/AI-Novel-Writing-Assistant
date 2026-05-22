import { UsersRound } from "lucide-react";
import type { StoryStateSnapshot } from "@ai-novel/shared/types/novel";
import type {
  ParsedSnapshotData,
  SnapshotCharacterItem,
  SnapshotForeshadowItem,
  SnapshotRelationItem,
} from "./chapterInsights.types";
import { Badge } from "@/components/ui/badge";

function parseSnapshotData(snapshot?: StoryStateSnapshot | null): ParsedSnapshotData | null {
  if (!snapshot?.rawStateJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(snapshot.rawStateJson) as Partial<ParsedSnapshotData>;
    return {
      characterStates: Array.isArray(parsed.characterStates) ? parsed.characterStates : [],
      relationStates: Array.isArray(parsed.relationStates) ? parsed.relationStates : [],
      foreshadowStates: Array.isArray(parsed.foreshadowStates) ? parsed.foreshadowStates : [],
    };
  } catch {
    return null;
  }
}

function buildSnapshotCharacters(snapshot?: StoryStateSnapshot | null): SnapshotCharacterItem[] {
  if (!snapshot) {
    return [];
  }
  const parsed = parseSnapshotData(snapshot);
  return snapshot.characterStates.slice(0, 4).map((item, index) => {
    const parsedItem = parsed?.characterStates[index];
    return {
      label: parsedItem?.characterName?.trim() || item.characterId,
      summary: parsedItem?.summary?.trim() || item.summary?.trim() || "暂无摘要",
      currentGoal: parsedItem?.currentGoal?.trim() || item.currentGoal?.trim() || undefined,
      emotion: parsedItem?.emotion?.trim() || item.emotion?.trim() || undefined,
    };
  });
}

function buildSnapshotRelations(snapshot?: StoryStateSnapshot | null): SnapshotRelationItem[] {
  if (!snapshot) {
    return [];
  }
  const parsed = parseSnapshotData(snapshot);
  return snapshot.relationStates.slice(0, 3).map((item, index) => {
    const parsedItem = parsed?.relationStates[index];
    const left = parsedItem?.sourceCharacterName?.trim() || item.sourceCharacterId;
    const right = parsedItem?.targetCharacterName?.trim() || item.targetCharacterId;
    return {
      label: left && right ? `${left} → ${right}` : left || right || "关系",
      summary: parsedItem?.summary?.trim() || item.summary?.trim() || "暂无关系摘要",
    };
  });
}

function buildSnapshotForeshadows(snapshot?: StoryStateSnapshot | null): SnapshotForeshadowItem[] {
  if (!snapshot) {
    return [];
  }
  const parsed = parseSnapshotData(snapshot);
  return snapshot.foreshadowStates.slice(0, 3).map((item, index) => {
    const parsedItem = parsed?.foreshadowStates[index];
    return {
      label: parsedItem?.title?.trim() || item.title || "伏笔",
      summary: parsedItem?.summary?.trim() || item.summary?.trim() || "暂无说明",
      status: parsedItem?.status?.trim() || item.status || "unknown",
    };
  });
}

function CharacterSnapshotCard(props: {
  title: string;
  snapshot?: StoryStateSnapshot | null;
  emptyText: string;
}) {
  const { title, snapshot, emptyText } = props;
  const characters = buildSnapshotCharacters(snapshot);
  const relations = buildSnapshotRelations(snapshot);
  const foreshadows = buildSnapshotForeshadows(snapshot);

  return (
    <div className="rounded-xl border border-border/70 bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        {snapshot?.sourceChapterId ? <Badge variant="outline">来源章节</Badge> : null}
      </div>
      {snapshot ? (
        <div className="mt-2 space-y-3">
          <div className="text-xs leading-5 text-muted-foreground">{snapshot.summary || emptyText}</div>
          {characters.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">角色动态</div>
              {characters.map((item) => (
                <div key={`${title}-${item.label}`} className="rounded-lg border border-border/60 bg-muted/10 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-foreground">{item.label}</div>
                    {item.currentGoal ? <Badge variant="outline" className="text-[11px]">{item.currentGoal}</Badge> : null}
                    {item.emotion ? <Badge variant="secondary" className="text-[11px]">{item.emotion}</Badge> : null}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</div>
                </div>
              ))}
            </div>
          ) : null}
          {relations.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">关系变化</div>
              {relations.map((item) => (
                <div key={`${title}-${item.label}`} className="rounded-lg border border-border/60 bg-background p-2">
                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</div>
                </div>
              ))}
            </div>
          ) : null}
          {foreshadows.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">伏笔</div>
              {foreshadows.map((item) => (
                <div key={`${title}-${item.label}`} className="rounded-lg border border-border/60 bg-muted/10 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-foreground">{item.label}</div>
                    <Badge variant="outline" className="text-[11px]">{item.status}</Badge>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 text-xs leading-5 text-muted-foreground">{emptyText}</div>
      )}
    </div>
  );
}

export default function CharacterDynamicsPanel(props: {
  latestStateSnapshot?: StoryStateSnapshot | null;
  chapterStateSnapshot?: StoryStateSnapshot | null;
}) {
  const { latestStateSnapshot, chapterStateSnapshot } = props;
  const hasAnySnapshot = Boolean(latestStateSnapshot || chapterStateSnapshot);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-background p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <UsersRound className="h-4 w-4" />
          <span>角色动态</span>
        </div>
        <div className="mt-2 text-sm font-medium text-foreground">后续写作会受影响的角色状态、关系和伏笔</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">这里只看会影响下一步推进的信息，不在这里编辑。</div>
      </div>

      {hasAnySnapshot ? (
        <div className="space-y-3">
          <CharacterSnapshotCard title="本章后状态" snapshot={chapterStateSnapshot} emptyText="本章后状态暂无可展示内容。" />
          <CharacterSnapshotCard title="最新状态" snapshot={latestStateSnapshot} emptyText="最新状态暂无可展示内容。" />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
          选中章节后，这里显示角色状态变化、关系变化和关键伏笔。
        </div>
      )}
    </div>
  );
}
