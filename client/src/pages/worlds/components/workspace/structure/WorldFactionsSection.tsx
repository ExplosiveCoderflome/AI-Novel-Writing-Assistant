import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
        <div className="font-medium">{t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_e87fe613")}</div>
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
            新增阵营
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
                        id: `force-${prev.forces.length + 1}`,
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
              )
            }
          >
            新增势力
          </Button>
        </div>
      </div>
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground space-y-1">
        <div>{t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_952bc134")}</div>
        <div>{t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_e25af270")}</div>
        <div>
          当前阵营 ID：{
            draftStructure.factions.length > 0
              ? draftStructure.factions.map((item) => `${item.id}（${item.name || t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_7f0425a8")}）`).join("、")
              : t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_f61f4cf6")
          }
        </div>
        <div>
          当前势力 ID：{
            draftStructure.forces.length > 0
              ? draftStructure.forces.map((item) => `${item.id}（${item.name || t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_7f0425a8")}）`).join("、")
              : t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_f61f4cf6")
          }
        </div>
      </div>
      <div className="space-y-3">
        {draftStructure.factions.map((faction, index) => (
          <div key={faction.id || index} className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              阵营卡描述的是抽象站队，不是具体公司、部门或人脉网络。
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
              placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_e0be4457")}
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
              placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_14c7f185")}
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
              placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_135b5e9c")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_aa014c30")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_579a5778")}
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
              placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.representativePowerIDCommaOrPeriodSeparated")}
            />
            {faction.representativeForceIds.length > 0 ? (
              <div className="text-xs text-muted-foreground">
                代表势力：{faction.representativeForceIds.map((id) => forceNameById.get(id) || id).join("、")}
              </div>
            ) : null}
          </div>
        ))}
        {draftStructure.forces.map((force, index) => (
          <div key={force.id || index} className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              势力卡描述的是能施压、能占据地点、能参与关系网络的具体组织或圈层。
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_6efbdb31")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_92794258")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_4e7dbc51")}
              />
            </div>
            {force.factionId ? (
              <div className="text-xs text-muted-foreground">
                所属阵营：{factionNameById.get(force.factionId) || force.factionId}
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
              placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_0a9c554c")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_e6b04ed6")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_7c7eddf5")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_de392f35")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_eb1c0ced")}
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
                placeholder={t("gen.pages.worlds.components.workspace.structure.WorldFactionsSection.gen_08f0ced5")}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
