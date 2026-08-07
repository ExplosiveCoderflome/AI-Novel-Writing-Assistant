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
    title: "original rules",
    description: "This world operates by default, and subsequent automatic generation will refer to these underlying rules.",
    selectionKey: "ruleIds",
  },
  factions: {
    title: "camp position",
    description: "Who is on which side, what you believe in, what you want to promote. Suitable for retaining the general direction of the original work.",
    selectionKey: "factionIds",
  },
  forces: {
    title: "Organization and power",
    description: "Specific companies, departments, gangs, and networks are organizations that can be directly involved.",
    selectionKey: "forceIds",
  },
  locations: {
    title: "Places and Scenes",
    description: "Scenarios that can be used directly in cities, neighborhoods, companies, residences, etc.",
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
        This time, no organizations, locations or rules have been stably extracted from the reference works that can be directly used. They will continue to be generated according to your transformation direction later.
                  </div>
    );
  }

  return (
    <div className="rounded-md border p-3 text-sm space-y-4">
      <div className="space-y-1">
        <div className="font-medium">Directly use the original settings</div>
        <div className="text-xs text-muted-foreground">
          The system will extract a batch of inheritable settings from the reference works and check them by default. Keeping them can significantly reduce subsequent manual filling.
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
                {allSelected ? "Cancel all" : "keep all"}
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
                        <div className="text-xs text-muted-foreground">Identified settings from the original that can be directly inherited.</div>
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
