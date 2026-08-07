import type { Dispatch, SetStateAction } from "react";
import type { WorldFaction, WorldForce, WorldStructuredData } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function updateArrayItem<T>(items: T[], index: number, nextItem: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

function parseTextList(value: string): string[] {
  return value
    .split(/[\n,，;；、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function WorldFactionsSection(props: {
  draftStructure: WorldStructuredData;
  setDraftStructure: Dispatch<SetStateAction<WorldStructuredData | null>>;
  factionNameById: Map<string, string>;
  forceNameById: Map<string, string>;
}) {
  const { draftStructure, setDraftStructure, factionNameById, forceNameById } = props;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Factions and forces</div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraftStructure((prev) =>
                prev
                  ? {
                    ...prev,
                    factions: [
                      ...prev.factions,
                      {
                        id: `faction-${prev.factions.length + 1}`,
                        name: "",
                        position: "",
                        doctrine: "",
                        goals: [],
                        methods: [],
                        representativeForceIds: [],
                      },
                    ],
                  }
                  : prev,
              )
            }
          >
            Add new camp
                                </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraftStructure((prev) =>
                prev
                  ? {
                    ...prev,
                    forces: [
                      ...prev.forces,
                      {
                        id: `force-${prev.forces.length + 1}`, name: "", type: "", factionId: null, summary: "", baseOfPower: "", currentObjective: "", pressure: "", leader: null, narrativeRole: "", }, ], } : prev, ) } > Add Faction</Button> </div> </div> <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground space-y-1"> <div>Alliance = abstract stance, route, or world alignment; Faction = specific organization, circle, network, or institution.</div> <div>World-class default rules such as "social pressure mechanisms," "industry operating rules," and "interpersonal network rules" should be written in the "rule center" first, and not stuffed into the faction card.</div> <div>Current faction ID: { draftStructure.factions.length > 0 ? draftStructure.factions.map((item) => `${item.id}（${item.name || "Unnamed"}）`).join("、") : "None available" } </div> <div> Current faction ID: { draftStructure.forces.length > 0 ? draftStructure.forces.map((item) => `${item.id}（${item.name || "Unnamed"}）`).join("、")
              : "None yet"
          }
        </div>
      </div>
      <div className="space-y-3">
        {draftStructure.factions.map((faction, index) => (
          <div key={faction.id || index} className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              Faction cards describe abstract alignments, not specific companies, departments, or networks.
                                </div>
            <Input
              value={faction.name}
              onChange={(event) =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      factions: updateArrayItem<WorldFaction>(prev.factions, index, {
                        ...faction,
                        name: event.target.value,
                      }),
                    }
                    : prev,
                )
              }
              placeholder="Camp name, for example: Stability within the system / Market profit-seeking faction / Relationship network pragmatist faction"
            />
            <Input
              value={faction.position}
              onChange={(event) =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      factions: updateArrayItem<WorldFaction>(prev.factions, index, {
                        ...faction,
                        position: event.target.value,
                      }),
                    }
                    : prev,
                )
              }
              placeholder="Standpoint/World Team"
            />
            <textarea
              className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
              value={faction.doctrine}
              onChange={(event) =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      factions: updateArrayItem<WorldFaction>(prev.factions, index, {
                        ...faction,
                        doctrine: event.target.value,
                      }),
                    }
                    : prev,
                )
              }
              placeholder="Faction philosophy / creed / proposition"
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                value={faction.goals.join("、")}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        factions: updateArrayItem<WorldFaction>(prev.factions, index, {
                          ...faction,
                          goals: parseTextList(event.target.value),
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Long-term goals, separated by commas or commas"
              />
              <Input
                value={faction.methods.join("、")}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        factions: updateArrayItem<WorldFaction>(prev.factions, index, {
                          ...faction,
                          methods: parseTextList(event.target.value),
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Commonly used means, use commas or commas to separate"
              />
            </div>
            <Input
              value={faction.representativeForceIds.join("、")}
              onChange={(event) =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      factions: updateArrayItem<WorldFaction>(prev.factions, index, {
                        ...faction,
                        representativeForceIds: parseTextList(event.target.value),
                      }),
                    }
                    : prev,
                )
              }
              placeholder="Represents the faction ID, separated by commas or commas"
            />
            {faction.representativeForceIds.length > 0 ? (
              <div className="text-xs text-muted-foreground">
                Representative forces:{faction.representativeForceIds.map((id) => forceNameById.get(id) || id).join("、")}
              </div>
            ) : null}
          </div>
        ))}
        {draftStructure.forces.map((force, index) => (
          <div key={force.id || index} className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              The power card describes a specific organization or circle that can exert pressure, occupy a location, and participate in a network of relationships.
                                </div>
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                value={force.name}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        forces: updateArrayItem<WorldForce>(prev.forces, index, {
                          ...force,
                          name: event.target.value,
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
              />
              <Input
                value={force.type}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        forces: updateArrayItem<WorldForce>(prev.forces, index, {
                          ...force,
                          type: event.target.value,
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Type of power, such as: company/department/intermediary network/business circle"
              />
              <Input
                value={force.factionId ?? ""}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        forces: updateArrayItem<WorldForce>(prev.forces, index, {
                          ...force,
                          factionId: event.target.value || null,
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Faction ID (can be empty)"
              />
            </div>
            {force.factionId ? (
              <div className="text-xs text-muted-foreground">
                Belong to the camp:{factionNameById.get(force.factionId) || force.factionId}
              </div>
            ) : null}
            <textarea
              className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
              value={force.summary}
              onChange={(event) =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      forces: updateArrayItem<WorldForce>(prev.forces, index, {
                        ...force,
                        summary: event.target.value,
                      }),
                    }
                    : prev,
                )
              }
              placeholder="Overview of forces / external identity / role in the world"
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                value={force.baseOfPower}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        forces: updateArrayItem<WorldForce>(prev.forces, index, {
                          ...force,
                          baseOfPower: event.target.value,
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
              />
              <Input
                value={force.currentObjective}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        forces: updateArrayItem<WorldForce>(prev.forces, index, {
                          ...force,
                          currentObjective: event.target.value,
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Current goals/what you want to advance now"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                value={force.leader ?? ""}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        forces: updateArrayItem<WorldForce>(prev.forces, index, {
                          ...force,
                          leader: event.target.value || null,
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Leader/Key Person (optional)"
              />
              <Input
                value={force.pressure}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        forces: updateArrayItem<WorldForce>(prev.forces, index, {
                          ...force,
                          pressure: event.target.value,
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Ways of applying pressure / Sources of pressure / How it forces the character"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-1">
              <Input
                value={force.narrativeRole}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        forces: updateArrayItem<WorldForce>(prev.forces, index, {
                          ...force,
                          narrativeRole: event.target.value,
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="Narrative roles, such as: source of oppression/inducer/gatekeeper/buffer zone"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
