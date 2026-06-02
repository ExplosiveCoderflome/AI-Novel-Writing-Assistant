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
        <div className="font-medium">阵营与势力</div>
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
        <div>阵营 = 抽象立场、路线或世界站队；势力 = 具体组织、圈层、网络或机构。</div>
        <div>像“社会压力机制”“行业运作规则”“人际网络法则”这类世界级默认规则，应优先写到“规则中心”，不要塞进阵营卡。</div>
        <div>
          当前阵营 ID：{
            draftStructure.factions.length > 0
              ? draftStructure.factions.map((item) => `${item.id}（${item.name || "未命名"}）`).join("、")
              : "暂无"
          }
        </div>
        <div>
          当前势力 ID：{
            draftStructure.forces.length > 0
              ? draftStructure.forces.map((item) => `${item.id}（${item.name || "未命名"}）`).join("、")
              : "暂无"
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
              placeholder="阵营名称，例如：体制内求稳派 / 市场逐利派 / 关系网络实用派"
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
              placeholder="立场 / 世界站队"
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
              placeholder="阵营理念 / 信条 / 主张"
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
                placeholder="长期目标，使用顿号或逗号分隔"
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
                placeholder="常用手段，使用顿号或逗号分隔"
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
              placeholder="代表势力 ID，使用顿号或逗号分隔"
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
                placeholder="势力名称，例如：广告公司管理层 / 房屋中介链 / 地方商业圈人脉网"
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
                placeholder="势力类型，例如：公司 / 部门 / 中介网络 / 商业圈层"
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
                placeholder="所属阵营 ID（可空）"
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
              placeholder="势力概述 / 对外身份 / 在世界中的作用"
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
                placeholder="权力基础 / 资源来源 / 控制抓手"
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
                placeholder="当前目标 / 眼下想推进什么"
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
                placeholder="领导者 / 关键人物（可空）"
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
                placeholder="施压方式 / 高压来源 / 它如何逼迫角色"
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
                placeholder="叙事角色，例如：压迫源 / 诱导者 / 守门人 / 缓冲带"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
