import type { Character } from "@ai-novel/shared/types/novel";
import type { CharacterResourceLedgerItem } from "@ai-novel/shared/types/characterResource";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getResourceDisplayMode,
  getResourceFunctionLabel,
  getResourceStatusLabel,
} from "./characterWorkspace.helpers";

interface CharacterResourceTabProps {
  selectedCharacter: Character;
  selectedCharacterResources: CharacterResourceLedgerItem[];
  pendingCharacterResourceCount: number;
  onBackfillCharacterResources?: () => void;
  isBackfillingCharacterResources: boolean;
}

export default function CharacterResourceTab(props: CharacterResourceTabProps) {
  const {
    selectedCharacter,
    selectedCharacterResources,
    pendingCharacterResourceCount,
    onBackfillCharacterResources,
    isBackfillingCharacterResources,
  } = props;
  const resourceDisplayMode = getResourceDisplayMode(selectedCharacter);
  const displayedResources = selectedCharacterResources
    .filter(resourceDisplayMode.shouldShowResource)
    .slice(0, resourceDisplayMode.limit);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">关键资源</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{resourceDisplayMode.helper}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onBackfillCharacterResources?.()}
              disabled={isBackfillingCharacterResources || !onBackfillCharacterResources}
            >
              {isBackfillingCharacterResources ? "回填中..." : "回填最近章节"}
            </Button>
            <Badge variant="outline">{resourceDisplayMode.label}</Badge>
            {pendingCharacterResourceCount > 0 ? (
              <Badge variant="secondary">{pendingCharacterResourceCount} 条资源变更待确认</Badge>
            ) : null}
          </div>
        </div>
      </section>

      {displayedResources.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {displayedResources.map((resource) => (
            <div key={resource.id} className="rounded-lg border border-border/70 bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{resource.name}</div>
                <Badge variant={resource.status === "available" || resource.status === "borrowed" ? "default" : "outline"}>
                  {getResourceStatusLabel(resource.status)}
                </Badge>
                <Badge variant="secondary">{getResourceFunctionLabel(resource.narrativeFunction)}</Badge>
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{resource.summary}</div>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div>持有者：{resource.holderCharacterName || selectedCharacter.name}</div>
                <div>读者知情：{resource.readerKnows ? "知情" : "未公开"}</div>
                {resource.expectedUseEndChapterOrder ? (
                  <div>使用窗口：第{resource.expectedUseStartChapterOrder ?? "?"}章至第{resource.expectedUseEndChapterOrder}章</div>
                ) : null}
                {resource.constraints.length > 0 ? (
                  <div>限制：{resource.constraints.slice(0, 2).join(" / ")}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          关键道具、线索、身份凭证或底牌会在章节写作后沉淀到这里；临时角色只保留会影响后续章节的资源。
        </div>
      )}
    </div>
  );
}
