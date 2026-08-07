import { MapPinned, Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { WorldLocation, WorldStructuredData } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HandbookField, HandbookTextarea, SectionHeader } from "./HandbookPrimitives";
import { makeId, removeItem, updateItem } from "./handbookEditorUtils";

export default function WorldHandbookLocationSection(props: {
  draftStructure: WorldStructuredData;
  setDraftStructure: Dispatch<SetStateAction<WorldStructuredData | null>>;
}) {
  const { draftStructure, setDraftStructure } = props;

  const addLocation = () => {
    setDraftStructure((prev) =>
      prev
        ? {
          ...prev,
          locations: [
            ...prev.locations,
            {
              id: makeId("location", prev.locations.length),
              name: "",
              terrain: "",
              summary: "",
              narrativeFunction: "",
              risk: "",
              entryConstraint: "",
              exitCost: "",
              controllingForceIds: [],
            },
          ],
        }
        : prev,
    );
  };

  return (
    <section className="rounded-md border p-4">
      <SectionHeader
        icon={MapPinned}
        title="story stage"
        description="Convert the world into a place where you can land: where to start, where to upgrade, and where to conflict."
        count={draftStructure.locations.length}
      />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {draftStructure.locations.map((location: WorldLocation, index) => (
          <div key={location.id || index} className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Place {index + 1}</div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDraftStructure((prev) =>
                    prev ? { ...prev, locations: removeItem(prev.locations, index) } : prev,
                  )
                }
              >
                Remove
                                      </Button>
            </div>
            <div className="mt-3 grid gap-3">
              <HandbookField title="Spot name" hint="Subsequent maps, force-controlled areas, and chapter locations will revolve around these locations.">
                <Input
                  value={location.name}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, locations: updateItem(prev.locations, index, { name: event.target.value }) } : prev,
                    )
                  }
                  placeholder="Northern Icefield, Star Market City, Kuroshio Port"
                />
              </HandbookField>
              <HandbookField title="environmental characteristics" hint="Give the place a sense of space that readers will remember, rather than just appearing as a name.">
                <Input
                  value={location.terrain}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? { ...prev, locations: updateItem(prev.locations, index, { terrain: event.target.value }) }
                        : prev,
                    )
                  }
                  placeholder="Snowfield border, floating city, underground mines, maritime fortress"
                />
              </HandbookField>
              <HandbookField title="Reader's first impression" hint="Describe the image, order, danger, or wonder of the place.">
                <HandbookTextarea
                  value={location.summary}
                  onChange={(value) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, locations: updateItem(prev.locations, index, { summary: value }) } : prev,
                    )
                  }
                  placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                  minRows={3}
                />
              </HandbookField>
              <HandbookField title="Suitable for plot functions" hint="Helps chapter planning to determine whether this is suitable for the beginning, trial, turning point or decisive battle.">
                <Input
                  value={location.narrativeFunction}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          locations: updateItem(prev.locations, index, { narrativeFunction: event.target.value }),
                        }
                        : prev,
                    )
                  }
                  placeholder="Beginning, trial, turning point, decisive battle, revealing the truth"
                />
              </HandbookField>
              <HandbookField title="Risks of entering here" hint="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.">
                <Input
                  value={location.risk}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, locations: updateItem(prev.locations, index, { risk: event.target.value }) } : prev,
                    )
                  }
                  placeholder="Being hunted, resources exhausted, identity exposed, rules invalidated"
                />
              </HandbookField>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" className="mt-3" variant="outline" onClick={addLocation}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Add story location
                    </Button>
    </section>
  );
}
