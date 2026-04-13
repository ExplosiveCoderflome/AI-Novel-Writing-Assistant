import { useEffect, useMemo, useState } from "react";
import type {
  WorldBindingSupport,
  WorldFaction,
  WorldForce,
  WorldForceRelation,
  WorldLocation,
  WorldLocationControlRelation,
  WorldRule,
  WorldStructuredData,
  WorldStructureSectionKey,
} from "@ai-novel/shared/types/world";
import type { WorldStructurePayload } from "@/api/world";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SECTION_OPTIONS: Array<{ value: WorldStructureSectionKey; label: string }> = [
  { value: "profile", label: "世界概要" },
  { value: "rules", label: "规则中心" },
  { value: "factions", label: "阵营与势力" },
  { value: "locations", label: "地点与地形" },
  { value: "relations", label: "关系网络" },
];

function updateArrayItem<T>(items: T[], index: number, nextItem: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

function parseTextList(value: string): string[] {
  return value
    .split(/[\n,，;；、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function WorldStructureTab(props: {
  initialPayload?: WorldStructurePayload;
  savePending: boolean;
  backfillPending: boolean;
  generatePending: boolean;
  onSave: (structure: WorldStructuredData, bindingSupport: WorldBindingSupport) => Promise<void>;
  onBackfill: () => Promise<{ structure: WorldStructuredData; bindingSupport: WorldBindingSupport } | undefined>;
  onGenerate: (
    section: WorldStructureSectionKey,
    structure: WorldStructuredData,
    bindingSupport: WorldBindingSupport,
  ) => Promise<{ structure: WorldStructuredData; bindingSupport: WorldBindingSupport } | undefined>;
}) {
  const { initialPayload, savePending, backfillPending, generatePending, onSave, onBackfill, onGenerate } = props;
  const [activeSection, setActiveSection] = useState<WorldStructureSectionKey>("profile");
  const [draftStructure, setDraftStructure] = useState<WorldStructuredData | null>(initialPayload?.structure ?? null);
  const [draftBindingSupport, setDraftBindingSupport] = useState<WorldBindingSupport | null>(
    initialPayload?.bindingSupport ?? null,
  );

  useEffect(() => {
    if (!initialPayload) {
      return;
    }
    setDraftStructure(initialPayload.structure);
    setDraftBindingSupport(initialPayload.bindingSupport);
  }, [initialPayload]);

  const hasStructuredData = Boolean(initialPayload?.hasStructuredData);
  const factionNameById = useMemo(
    () => new Map((draftStructure?.factions ?? []).map((item) => [item.id, item.name])),
    [draftStructure?.factions],
  );
  const forceNameById = useMemo(
    () => new Map((draftStructure?.forces ?? []).map((item) => [item.id, item.name])),
    [draftStructure?.forces],
  );
  const locationNameById = useMemo(
    () => new Map((draftStructure?.locations ?? []).map((item) => [item.id, item.name])),
    [draftStructure?.locations],
  );

  if (!draftStructure || !draftBindingSupport) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>结构化设定</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">正在加载结构化世界数据...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>结构化设定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {SECTION_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={activeSection === option.value ? "default" : "outline"}
                onClick={() => setActiveSection(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const result = await onBackfill();
                if (result) {
                  setDraftStructure(result.structure);
                  setDraftBindingSupport(result.bindingSupport);
                }
              }}
              disabled={backfillPending}
            >
              {backfillPending ? "提取中..." : hasStructuredData ? "重新从现有设定提取" : "从现有设定提取结构"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const result = await onGenerate(activeSection, draftStructure, draftBindingSupport);
                if (result) {
                  setDraftStructure(result.structure);
                  setDraftBindingSupport(result.bindingSupport);
                }
              }}
              disabled={generatePending}
            >
              {generatePending ? "补全中..." : "AI 补全当前区块"}
            </Button>
            <Button onClick={() => void onSave(draftStructure, draftBindingSupport)} disabled={savePending}>
              {savePending ? "保存中..." : "保存结构"}
            </Button>
          </div>
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="font-medium">世界概要</div>
          <Input
            value={draftStructure.profile.identity}
            onChange={(event) =>
              setDraftStructure((prev) =>
                prev
                  ? { ...prev, profile: { ...prev.profile, identity: event.target.value } }
                  : prev,
              )
            }
            placeholder="世界身份 / 类型气质"
          />
          <Input
            value={draftStructure.profile.tone}
            onChange={(event) =>
              setDraftStructure((prev) =>
                prev
                  ? { ...prev, profile: { ...prev.profile, tone: event.target.value } }
                  : prev,
              )
            }
            placeholder="整体调性"
          />
          <textarea
            className="min-h-[100px] w-full rounded-md border bg-background p-2 text-sm"
            value={draftStructure.profile.summary}
            onChange={(event) =>
              setDraftStructure((prev) =>
                prev
                  ? { ...prev, profile: { ...prev.profile, summary: event.target.value } }
                  : prev,
              )
            }
            placeholder="世界摘要"
          />
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
            value={draftStructure.profile.coreConflict}
            onChange={(event) =>
              setDraftStructure((prev) =>
                prev
                  ? { ...prev, profile: { ...prev.profile, coreConflict: event.target.value } }
                  : prev,
              )
            }
            placeholder="核心冲突"
          />
          <Input
            value={draftStructure.profile.themes.join("、")}
            onChange={(event) =>
              setDraftStructure((prev) =>
                prev
                  ? {
                    ...prev,
                    profile: {
                      ...prev.profile,
                      themes: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
                    },
                  }
                  : prev,
              )
            }
            placeholder="主题关键词，使用顿号或逗号分隔"
          />
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">规则中心</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      rules: {
                        ...prev.rules,
                        axioms: [
                          ...prev.rules.axioms,
                          {
                            id: `rule-${prev.rules.axioms.length + 1}`,
                            name: "",
                            summary: "",
                            cost: "",
                            boundary: "",
                            enforcement: "",
                          },
                        ],
                      },
                    }
                    : prev,
                )
              }
            >
              新增规则
            </Button>
          </div>
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
            value={draftStructure.rules.summary}
            onChange={(event) =>
              setDraftStructure((prev) =>
                prev
                  ? { ...prev, rules: { ...prev.rules, summary: event.target.value } }
                  : prev,
              )
            }
            placeholder="世界级规则总结"
          />
          {draftStructure.rules.axioms.map((rule, index) => (
            <div key={rule.id || index} className="rounded-md border p-3 space-y-2">
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={rule.name}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          rules: {
                            ...prev.rules,
                            axioms: updateArrayItem<WorldRule>(prev.rules.axioms, index, {
                              ...rule,
                              name: event.target.value,
                            }),
                          },
                        }
                        : prev,
                    )
                  }
                  placeholder="规则名称"
                />
                <Input
                  value={rule.cost}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          rules: {
                            ...prev.rules,
                            axioms: updateArrayItem<WorldRule>(prev.rules.axioms, index, {
                              ...rule,
                              cost: event.target.value,
                            }),
                          },
                        }
                        : prev,
                    )
                  }
                  placeholder="代价"
                />
              </div>
              <textarea
                className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                value={rule.summary}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        rules: {
                          ...prev.rules,
                          axioms: updateArrayItem<WorldRule>(prev.rules.axioms, index, {
                            ...rule,
                            summary: event.target.value,
                          }),
                        },
                      }
                      : prev,
                  )
                }
                placeholder="规则说明"
              />
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={rule.boundary}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          rules: {
                            ...prev.rules,
                            axioms: updateArrayItem<WorldRule>(prev.rules.axioms, index, {
                              ...rule,
                              boundary: event.target.value,
                            }),
                          },
                        }
                        : prev,
                    )
                  }
                  placeholder="边界条件"
                />
                <Input
                  value={rule.enforcement}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          rules: {
                            ...prev.rules,
                            axioms: updateArrayItem<WorldRule>(prev.rules.axioms, index, {
                              ...rule,
                              enforcement: event.target.value,
                            }),
                          },
                        }
                        : prev,
                    )
                  }
                  placeholder="约束/执行后果"
                />
              </div>
            </div>
          ))}
        </div>

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

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">地点与地形</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraftStructure((prev) =>
                  prev
                    ? {
                      ...prev,
                      locations: [
                        ...prev.locations,
                        {
                          id: `location-${prev.locations.length + 1}`,
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
                )
              }
            >
              新增地点
            </Button>
          </div>
          {draftStructure.locations.map((location, index) => (
            <div key={location.id || index} className="rounded-md border p-3 space-y-2">
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={location.name}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          locations: updateArrayItem<WorldLocation>(prev.locations, index, {
                            ...location,
                            name: event.target.value,
                          }),
                        }
                        : prev,
                    )
                  }
                  placeholder="地点名称"
                />
                <Input
                  value={location.terrain}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          locations: updateArrayItem<WorldLocation>(prev.locations, index, {
                            ...location,
                            terrain: event.target.value,
                          }),
                        }
                        : prev,
                    )
                  }
                  placeholder="地形 / 地貌"
                />
              </div>
              <textarea
                className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                value={location.summary}
                onChange={(event) =>
                  setDraftStructure((prev) =>
                    prev
                      ? {
                        ...prev,
                        locations: updateArrayItem<WorldLocation>(prev.locations, index, {
                          ...location,
                          summary: event.target.value,
                        }),
                      }
                      : prev,
                  )
                }
                placeholder="地点概述"
              />
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={location.narrativeFunction}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          locations: updateArrayItem<WorldLocation>(prev.locations, index, {
                            ...location,
                            narrativeFunction: event.target.value,
                          }),
                        }
                        : prev,
                    )
                  }
                  placeholder="叙事功能"
                />
                <Input
                  value={location.risk}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          locations: updateArrayItem<WorldLocation>(prev.locations, index, {
                            ...location,
                            risk: event.target.value,
                          }),
                        }
                        : prev,
                    )
                  }
                  placeholder="风险"
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={location.entryConstraint}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          locations: updateArrayItem<WorldLocation>(prev.locations, index, {
                            ...location,
                            entryConstraint: event.target.value,
                          }),
                        }
                        : prev,
                    )
                  }
                  placeholder="进入限制"
                />
                <Input
                  value={location.exitCost}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          locations: updateArrayItem<WorldLocation>(prev.locations, index, {
                            ...location,
                            exitCost: event.target.value,
                          }),
                        }
                        : prev,
                    )
                  }
                  placeholder="离开代价"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">关系网络</div>
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
                {forceNameById.get(relation.sourceForceId) || relation.sourceForceId || "源势力"} {"->"}{" "}
                {forceNameById.get(relation.targetForceId) || relation.targetForceId || "目标势力"}
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
                  placeholder="源势力 ID"
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
                  placeholder="目标势力 ID"
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
                  placeholder="关系类型"
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
                  placeholder="张力 / 压力"
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
                placeholder="关系说明"
              />
            </div>
          ))}
          {draftStructure.relations.locationControls.map((relation, index) => (
            <div key={relation.id || index} className="rounded-md border p-3 space-y-2">
              <div className="text-xs text-muted-foreground">
                {(forceNameById.get(relation.forceId) || relation.forceId || "势力")} 控制{" "}
                {(locationNameById.get(relation.locationId) || relation.locationId || "地点")}
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
                  placeholder="势力 ID"
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
                  placeholder="地点 ID"
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
                placeholder="控制关系"
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
                placeholder="说明"
              />
            </div>
          ))}
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium">绑定建议</div>
          <div className="text-xs text-muted-foreground">当前阶段只读展示，不接入小说绑定。</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">推荐进入点</div>
              <div className="mt-2 whitespace-pre-wrap">
                {draftBindingSupport.recommendedEntryPoints.join("\n") || "暂无"}
              </div>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">高压势力</div>
              <div className="mt-2 whitespace-pre-wrap">
                {draftBindingSupport.highPressureForces.join("\n") || "暂无"}
              </div>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">可兼容冲突</div>
              <div className="mt-2 whitespace-pre-wrap">
                {draftBindingSupport.compatibleConflicts.join("\n") || "暂无"}
              </div>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">禁止组合</div>
              <div className="mt-2 whitespace-pre-wrap">
                {draftBindingSupport.forbiddenCombinations.join("\n") || "暂无"}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
