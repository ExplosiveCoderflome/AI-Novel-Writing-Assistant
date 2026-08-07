import type { Dispatch, SetStateAction } from "react";
import type {
  WorldBindingSupport,
  WorldForceRelation,
  WorldLocationControlRelation,
  WorldStructuredData,
} from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function updateArrayItem<T>(items: T[], index: number, nextItem: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

export default function WorldRelationsSection(props: {
  draftStructure: WorldStructuredData;
  draftBindingSupport: WorldBindingSupport;
  setDraftStructure: Dispatch<SetStateAction<WorldStructuredData | null>>;
  forceNameById: Map<string, string>;
  locationNameById: Map<string, string>;
}) {
  const { draftStructure, draftBindingSupport, setDraftStructure, forceNameById, locationNameById } = props;

  return (
    <>
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Relationship network</div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      relations: {
                        ...prev.relations,
                        forceRelations: [
                          ...prev.relations.forceRelations,
                          {
                            id: `force-relation-${prev.relations.forceRelations.length + 1}`,
                            sourceForceId: "",
                            targetForceId: "",
                            relation: "",
                            tension: "",
                            detail: "",
                          },
                        ],
                      },
                    }
                    : prev,
                )
              }
            >
              Add new power relationship
                                      </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      relations: {
                        ...prev.relations,
                        locationControls: [
                          ...prev.relations.locationControls,
                          {
                            id: `location-control-${prev.relations.locationControls.length + 1}`,
                            forceId: "",
                            locationId: "",
                            relation: "",
                            detail: "",
                          },
                        ],
                      },
                    }
                    : prev,
                )
              }
            >
              Added location controls
                                      </Button>
          </div>
        </div>
        {draftStructure.relations.forceRelations.map((relation, index) => (
          <div key={relation.id || index} className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              {forceNameById.get(relation.sourceForceId) || relation.sourceForceId || "source power"} {"->"}{" "}
              {forceNameById.get(relation.targetForceId) || relation.targetForceId || "target power"}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                value={relation.sourceForceId}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        relations: {
                          ...prev.relations,
                          forceRelations: updateArrayItem<WorldForceRelation>(prev.relations.forceRelations, index, {
                            ...relation,
                            sourceForceId: event.target.value,
                          }),
                        },
                      }
                      : prev,
                  )
                }
                placeholder="Source force ID"
              />
              <Input
                value={relation.targetForceId}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        relations: {
                          ...prev.relations,
                          forceRelations: updateArrayItem<WorldForceRelation>(prev.relations.forceRelations, index, {
                            ...relation,
                            targetForceId: event.target.value,
                          }),
                        },
                      }
                      : prev,
                  )
                }
                placeholder="Target force ID"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                value={relation.relation}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        relations: {
                          ...prev.relations,
                          forceRelations: updateArrayItem<WorldForceRelation>(prev.relations.forceRelations, index, {
                            ...relation,
                            relation: event.target.value,
                          }),
                        },
                      }
                      : prev,
                  )
                }
                placeholder="Relationship type"
              />
              <Input
                value={relation.tension}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        relations: {
                          ...prev.relations,
                          forceRelations: updateArrayItem<WorldForceRelation>(prev.relations.forceRelations, index, {
                            ...relation,
                            tension: event.target.value,
                          }),
                        },
                      }
                      : prev,
                  )
                }
                placeholder="tension/pressure"
              />
            </div>
            <textarea
              className="min-h-[70px] w-full rounded-md border bg-background p-2 text-sm"
              value={relation.detail}
              onChange={(event) =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      relations: {
                        ...prev.relations,
                        forceRelations: updateArrayItem<WorldForceRelation>(prev.relations.forceRelations, index, {
                          ...relation,
                          detail: event.target.value,
                        }),
                      },
                    }
                    : prev,
                )
              }
              placeholder="Relationship description"
            />
          </div>
        ))}
        {draftStructure.relations.locationControls.map((relation, index) => (
          <div key={relation.id || index} className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              {(forceNameById.get(relation.forceId) || relation.forceId || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.")} control{" "}
              {(locationNameById.get(relation.locationId) || relation.locationId || "Place")}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                value={relation.forceId}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        relations: {
                          ...prev.relations,
                          locationControls: updateArrayItem<WorldLocationControlRelation>(
                            prev.relations.locationControls,
                            index,
                            { ...relation, forceId: event.target.value },
                          ),
                        },
                      }
                      : prev,
                  )
                }
                placeholder="Faction ID"
              />
              <Input
                value={relation.locationId}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        relations: {
                          ...prev.relations,
                          locationControls: updateArrayItem<WorldLocationControlRelation>(
                            prev.relations.locationControls,
                            index,
                            { ...relation, locationId: event.target.value },
                          ),
                        },
                      }
                      : prev,
                  )
                }
                placeholder="Point ID"
              />
            </div>
            <Input
              value={relation.relation}
              onChange={(event) =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      relations: {
                        ...prev.relations,
                        locationControls: updateArrayItem<WorldLocationControlRelation>(
                          prev.relations.locationControls,
                          index,
                          { ...relation, relation: event.target.value },
                        ),
                      },
                    }
                    : prev,
                )
              }
              placeholder="control relationship"
            />
            <textarea
              className="min-h-[70px] w-full rounded-md border bg-background p-2 text-sm"
              value={relation.detail}
              onChange={(event) =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      relations: {
                        ...prev.relations,
                        locationControls: updateArrayItem<WorldLocationControlRelation>(
                          prev.relations.locationControls,
                          index,
                          { ...relation, detail: event.target.value },
                        ),
                      },
                    }
                    : prev,
                )
              }
              placeholder="illustrate"
            />
          </div>
        ))}
      </div>

      <div className="rounded-md border p-3 space-y-2">
        <div className="font-medium">Suggestions for using novels</div>
        <div className="text-xs text-muted-foreground">Here is a read-only display of the directions available once the world sample enters the novel.</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">Recommended entry points</div>
            <div className="mt-2 whitespace-pre-wrap">
              {draftBindingSupport.recommendedEntryPoints.join("\n") || "None yet"}
            </div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">High pressure forces</div>
            <div className="mt-2 whitespace-pre-wrap">
              {draftBindingSupport.highPressureForces.join("\n") || "None yet"}
            </div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">Compatible conflicts</div>
            <div className="mt-2 whitespace-pre-wrap">
              {draftBindingSupport.compatibleConflicts.join("\n") || "None yet"}
            </div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">Prohibited combinations</div>
            <div className="mt-2 whitespace-pre-wrap">
              {draftBindingSupport.forbiddenCombinations.join("\n") || "None yet"}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
