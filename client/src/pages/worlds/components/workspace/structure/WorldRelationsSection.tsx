import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
          <div className="font-medium">{t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_bb016fed")}</div>
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
              新增势力关系
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
              新增地点控制
            </Button>
          </div>
        </div>
        {draftStructure.relations.forceRelations.map((relation, index) => (
          <div key={relation.id || index} className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              {forceNameById.get(relation.sourceForceId) || relation.sourceForceId || t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_a4d80bf3")} {"->"}{" "}
              {forceNameById.get(relation.targetForceId) || relation.targetForceId || t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_e9107399")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_d7eeb58b")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_e416d85f")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_ed4fdfbc")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_7262d296")}
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
              placeholder={t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_3449d171")}
            />
          </div>
        ))}
        {draftStructure.relations.locationControls.map((relation, index) => (
          <div key={relation.id || index} className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              {(forceNameById.get(relation.forceId) || relation.forceId || t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_dcfe557b"))} 控制{" "}
              {(locationNameById.get(relation.locationId) || relation.locationId || t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_fc1a7d3c"))}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_792e0e0d")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_da2ee48f")}
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
              placeholder={t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_7bf6c4ee")}
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
              placeholder={t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_f411d0f1")}
            />
          </div>
        ))}
      </div>

      <div className="rounded-md border p-3 space-y-2">
        <div className="font-medium">{t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_5cdbaa25")}</div>
        <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_31d9207b")}</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_eba66266")}</div>
            <div className="mt-2 whitespace-pre-wrap">
              {draftBindingSupport.recommendedEntryPoints.join("\n") || t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_f61f4cf6")}
            </div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_64b79357")}</div>
            <div className="mt-2 whitespace-pre-wrap">
              {draftBindingSupport.highPressureForces.join("\n") || t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_f61f4cf6")}
            </div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_fb706d36")}</div>
            <div className="mt-2 whitespace-pre-wrap">
              {draftBindingSupport.compatibleConflicts.join("\n") || t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_f61f4cf6")}
            </div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_8deb5ccd")}</div>
            <div className="mt-2 whitespace-pre-wrap">
              {draftBindingSupport.forbiddenCombinations.join("\n") || t("gen.pages.worlds.components.workspace.structure.WorldRelationsSection.gen_f61f4cf6")}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
