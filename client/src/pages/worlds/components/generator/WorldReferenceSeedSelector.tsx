import type {
  WorldReferenceSeedBundle,
  WorldReferenceSeedSelection,
} from "@ai-novel/shared/types/worldWizard";
import { Button } from "@/components/ui/button";

type GroupKey = keyof WorldReferenceSeedBundle;

const GROUP_META: Record<
  GroupKey,
  {
    title: string;
    description: string;
    selectionKey: keyof WorldReferenceSeedSelection;
  }
> = {
  rules: {
    title: "原作规则",
    description: "这个世界默认怎么运转，后面自动生成会参考这些底层规则。",
    selectionKey: "ruleIds",
  },
  factions: {
    title: "阵营立场",
    description: "谁站哪边、信什么、想推动什么。适合保留原作里的大方向。",
    selectionKey: "factionIds",
  },
  forces: {
    title: "组织与势力",
    description: "具体公司、部门、帮派、人脉圈这类可直接上场的组织。",
    selectionKey: "forceIds",
  },
  locations: {
    title: "地点与场景",
    description: "城市、街区、公司、住处等可以直接拿来用的场景。",
    selectionKey: "locationIds",
  },
};

function summarizeSeed(group: GroupKey, item: Record<string, unknown>): string {
  if (group === "rules") {
    return [item.summary, item.boundary, item.enforcement].filter(Boolean).join(" | ");
  }
  if (group === "factions") {
    return [item.position, item.doctrine].filter(Boolean).join(" | ");
  }
  if (group === "forces") {
    return [item.type, item.summary, item.pressure].filter(Boolean).join(" | ");
  }
  return [item.terrain, item.summary, item.narrativeFunction].filter(Boolean).join(" | ");
}

export default function WorldReferenceSeedSelector(props: {
  seeds: WorldReferenceSeedBundle;
  selectedIds: WorldReferenceSeedSelection;
  onToggle: (group: GroupKey, id: string, checked: boolean) => void;
  onToggleAll: (group: GroupKey, checked: boolean) => void;
}) {
  const { seeds, selectedIds, onToggle, onToggleAll } = props;

  const visibleGroups = (Object.keys(GROUP_META) as GroupKey[]).filter((group) => seeds[group].length > 0);
  if (visibleGroups.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        这次没有从参考作品里稳定提取出可直接沿用的组织、地点或规则，后面会继续按你的改造方向生成。
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 text-sm space-y-4">
      <div className="space-y-1">
        <div className="font-medium">直接沿用原作设定</div>
        <div className="text-xs text-muted-foreground">
          系统已经从参考作品里提取出一批现成设定，默认勾选。保留它们可以明显减少你后面手动填写。
        </div>
      </div>

      {visibleGroups.map((group) => {
        const items = seeds[group];
        const selectionKey = GROUP_META[group].selectionKey;
        const currentSelectedIds = selectedIds[selectionKey];
        const allSelected = items.length > 0 && items.every((item) => currentSelectedIds.includes(item.id));
        return (
          <div key={group} className="rounded-md border p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="font-medium">{GROUP_META[group].title}</div>
                <div className="text-xs text-muted-foreground">{GROUP_META[group].description}</div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onToggleAll(group, !allSelected)}
              >
                {allSelected ? "全部取消" : "全部保留"}
              </Button>
            </div>

            <div className="space-y-2">
              {items.map((item) => {
                const checked = currentSelectedIds.includes(item.id);
                const summary = summarizeSeed(group, item as Record<string, unknown>);
                return (
                  <label key={item.id} className="flex items-start gap-3 rounded-md border p-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(event) => onToggle(group, item.id, event.target.checked)}
                    />
                    <div className="space-y-1">
                      <div className="font-medium">{item.name}</div>
                      {summary ? (
                        <div className="text-xs text-muted-foreground">{summary}</div>
                      ) : (
                        <div className="text-xs text-muted-foreground">已识别为可直接沿用的原作设定。</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
