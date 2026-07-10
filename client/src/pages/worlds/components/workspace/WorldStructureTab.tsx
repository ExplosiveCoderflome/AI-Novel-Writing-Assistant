import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
import WorldFactionsSection from "./structure/WorldFactionsSection";
import WorldRelationsSection from "./structure/WorldRelationsSection";

const SECTION_OPTIONS: Array<{ value: WorldStructureSectionKey; label: string }> = [
  { value: "profile", label: t("gen.pages.worlds.components.workspace.WorldStructureTab.worldOverview") },
  { value: "rules", label: t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_c1af372a") },
  { value: "factions", label: t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_e87fe613") },
  { value: "locations", label: t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_d528ae4b") },
  { value: "relations", label: t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_bb016fed") },
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
          <CardTitle>{t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_6d58393f")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_e8be0b1f")}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_6d58393f")}</CardTitle>
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
              {backfillPending ? t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_19b549e6") : hasStructuredData ? t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_a6c139b5") : t("gen.pages.worlds.components.workspace.WorldStructureTab.extractStructureFromExistingSettings")}
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
              {generatePending ? t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_b6c679e2") : t("gen.pages.worlds.components.workspace.WorldStructureTab.expandCurrentBlock")}
            </Button>
            <Button onClick={() => void onSave(draftStructure, draftBindingSupport)} disabled={savePending}>
              {savePending ? t("gen.pages.worlds.components.workspace.WorldStructureTab.savingInProgressDotDotDot") : t("gen.pages.worlds.components.workspace.WorldStructureTab.saveStructure")}
            </Button>
          </div>
        </div>

        <div className={activeSection === "profile" ? "rounded-md border p-3 space-y-3" : "hidden"}>
          <div className="font-medium">{t("gen.pages.worlds.components.workspace.WorldStructureTab.worldOverview")}</div>
          <Input
            value={draftStructure.profile.identity}
            onChange={(event) =>
              setDraftStructure((prev) =>
                prev
                  ? { ...prev, profile: { ...prev.profile, identity: event.target.value } }
                  : prev,
              )
            }
            placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.worldIdentityTypeAttire")}
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
            placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_a200ee45")}
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
            placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.worldSummary")}
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
            placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_ae5f3fde")}
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
            placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.topicKeywordSeparated")}
          />
        </div>

        <div className={activeSection === "rules" ? "rounded-md border p-3 space-y-3" : "hidden"}>
          <div className="flex items-center justify-between">
            <div className="font-medium">{t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_c1af372a")}</div>
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
            placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.worldRuleSummary")}
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_87080256")}
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.cost")}
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
                placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_cc807bdb")}
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_870f8e99")}
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_b1a87e08")}
                />
              </div>
            </div>
          ))}
        </div>

        {activeSection === "factions" ? (
          <WorldFactionsSection
            draftStructure={draftStructure}
            setDraftStructure={setDraftStructure}
            factionNameById={factionNameById}
            forceNameById={forceNameById}
          />
        ) : null}

        <div className={activeSection === "locations" ? "rounded-md border p-3 space-y-3" : "hidden"}>
          <div className="flex items-center justify-between">
            <div className="font-medium">{t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_d528ae4b")}</div>
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_6608b1e8")}
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_e99df637")}
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
                placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_ed96b49c")}
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_dfe66fd3")}
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_57846ffb")}
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_fbc2f117")}
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
                  placeholder={t("gen.pages.worlds.components.workspace.WorldStructureTab.gen_9eb03213")}
                />
              </div>
            </div>
          ))}
        </div>

        {activeSection === "relations" ? (
          <WorldRelationsSection
            draftStructure={draftStructure}
            draftBindingSupport={draftBindingSupport}
            setDraftStructure={setDraftStructure}
            forceNameById={forceNameById}
            locationNameById={locationNameById}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
