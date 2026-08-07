import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Castle, Plus } from "lucide-react";
import type { WorldForce, WorldStructuredData } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HandbookField, HandbookTextarea, SectionHeader } from "./HandbookPrimitives";
import { makeId, removeItem, updateItem } from "./handbookEditorUtils";

export default function WorldHandbookForceSection(props: {
  draftStructure: WorldStructuredData;
  setDraftStructure: Dispatch<SetStateAction<WorldStructuredData | null>>;
}) {
  const { draftStructure, setDraftStructure } = props;
  const forceSummary = useMemo(() => {
    const forceNames = draftStructure.forces.map((force) => force.name).filter(Boolean).slice(0, 4);
    return forceNames.length > 0 ? forceNames.join(" / ") : "After replenishing the main forces, character identities, camp conflicts and chapter pressure will be more stable.";
  }, [draftStructure.forces]);

  const addForce = () => {
    setDraftStructure((prev) =>
      prev
        ? {
          ...prev,
          forces: [
            ...prev.forces,
            {
              id: makeId("force", prev.forces.length),
              name: "",
              type: "",
              factionId: null,
              summary: "",
              baseOfPower: "",
              currentObjective: "",
              pressure: "",
              leader: null,
              narrativeRole: "",
            },
          ],
        }
        : prev,
    );
  };

  return (
    <section className="rounded-md border p-4">
      <SectionHeader
        icon={Castle}
        title="main forces"
        description={`让作者先看懂谁在争夺资源、谁会制造阻力、角色可能从哪里来。${forceSummary}`}
        count={draftStructure.forces.length}
      />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {draftStructure.forces.map((force: WorldForce, index) => (
          <div key={force.id || index} className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know. {index + 1}</div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDraftStructure((prev) => (prev ? { ...prev, forces: removeItem(prev.forces, index) } : prev))
                }
              >
                Remove
                                      </Button>
            </div>
            <div className="mt-3 grid gap-3">
              <HandbookField title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." hint="An organization that a character may originate from, join, betray, or fight against.">
                <Input
                  value={force.name}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, forces: updateItem(prev.forces, index, { name: event.target.value }) } : prev,
                    )
                  }
                  placeholder="Star Emperor Court, Tianji Pavilion, Alien Demon Alliance"
                />
              </HandbookField>
              <HandbookField title="Force type" hint="Help the AI ​​judge its behavior and texture.">
                <Input
                  value={force.type}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, forces: updateItem(prev.forces, index, { type: event.target.value }) } : prev,
                    )
                  }
                  placeholder="Dynasties, sects, companies, underground organizations..."
                />
              </HandbookField>
              <HandbookField title="what does it mean in the world" hint="Write out its position, resources, and characteristics that readers should remember.">
                <HandbookTextarea
                  value={force.summary}
                  onChange={(value) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, forces: updateItem(prev.forces, index, { summary: value }) } : prev,
                    )
                  }
                  placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                  minRows={3}
                />
              </HandbookField>
              <HandbookField title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." hint="Objectives translate into chapter events and character conflicts.">
                <Input
                  value={force.currentObjective}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? { ...prev, forces: updateItem(prev.forces, index, { currentObjective: event.target.value }) }
                        : prev,
                    )
                  }
                  placeholder="Fight for mineral veins, seal the truth, and find the lost heir."
                />
              </HandbookField>
              <HandbookField title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." hint="The protagonist or other forces will be forced to choose, escape, trade, or go to war.">
                <Input
                  value={force.pressure}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, forces: updateItem(prev.forces, index, { pressure: event.target.value }) } : prev,
                    )
                  }
                  placeholder="Hunt down the protagonist, control resources, create war, and trigger a crisis of trust"
                />
              </HandbookField>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" className="mt-3" variant="outline" onClick={addForce}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Increase major forces
                    </Button>
    </section>
  );
}
