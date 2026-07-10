import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Plus, WandSparkles } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { WorldRule, WorldStructuredData } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HandbookField, HandbookTextarea, SectionHeader } from "./HandbookPrimitives";
import { makeId, removeItem, updateItem } from "./handbookEditorUtils";

export default function WorldHandbookRuleSection(props: {
  draftStructure: WorldStructuredData;
  setDraftStructure: Dispatch<SetStateAction<WorldStructuredData | null>>;
}) {
  const { draftStructure, setDraftStructure } = props;

  const addRule = () => {
    setDraftStructure((prev) =>
      prev
        ? {
          ...prev,
          rules: {
            ...prev.rules,
            axioms: [
              ...prev.rules.axioms,
              {
                id: makeId("rule", prev.rules.axioms.length),
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
    );
  };

  return (
    <section className="rounded-md border p-4">
      <SectionHeader
        icon={WandSparkles}
        title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_0a431a82")}
        description={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_c5c8c56a")}
        count={draftStructure.rules.axioms.length}
      />
      <div className="mt-4 space-y-3">
        <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_9c10e19a")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_07fef44f")}>
          <HandbookTextarea
            value={draftStructure.rules.summary}
            onChange={(value) =>
              setDraftStructure((prev) => (prev ? { ...prev, rules: { ...prev.rules, summary: value } } : prev))
            }
            placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.exampleAllSupernaturalPowerFromStellarLoanOveruseDrainsLifespanRecordedByOracleHall")}
            minRows={3}
          />
        </HandbookField>
        <div className="grid gap-3 lg:grid-cols-2">
          {draftStructure.rules.axioms.map((rule: WorldRule, index) => (
            <div key={rule.id || index} className="rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_8f26801b")}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, rules: { ...prev.rules, axioms: removeItem(prev.rules.axioms, index) } } : prev,
                    )
                  }
                >
                  移除
                </Button>
              </div>
              <div className="mt-3 grid gap-3">
                <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_87080256")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_357e0b0c")}>
                  <Input
                    value={rule.name}
                    onChange={(event) =>
                      setDraftStructure((prev) =>
                        prev
                          ? {
                            ...prev,
                            rules: {
                              ...prev.rules,
                              axioms: updateItem(prev.rules.axioms, index, { name: event.target.value }),
                            },
                          }
                          : prev,
                      )
                    }
                    placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_ad19045f")}
                  />
                </HandbookField>
                <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_fda6e32b")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_ab0b3fa3")}>
                  <HandbookTextarea
                    value={rule.summary}
                    onChange={(value) =>
                      setDraftStructure((prev) =>
                        prev
                          ? {
                            ...prev,
                            rules: { ...prev.rules, axioms: updateItem(prev.rules.axioms, index, { summary: value }) },
                          }
                          : prev,
                      )
                    }
                    placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_2463cba5")}
                    minRows={3}
                  />
                </HandbookField>
                <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.cost")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_使用违反或绕开规则时_xd66")}>
                  <Input
                    value={rule.cost}
                    onChange={(event) =>
                      setDraftStructure((prev) =>
                        prev
                          ? {
                            ...prev,
                            rules: {
                              ...prev.rules,
                              axioms: updateItem(prev.rules.axioms, index, { cost: event.target.value }),
                            },
                          }
                          : prev,
                      )
                    }
                    placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_608c6ca1")}
                  />
                </HandbookField>
                <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.boundaryLimit")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_f0cedcf9")}>
                  <Input
                    value={rule.boundary}
                    onChange={(event) =>
                      setDraftStructure((prev) =>
                        prev
                          ? {
                            ...prev,
                            rules: {
                              ...prev.rules,
                              axioms: updateItem(prev.rules.axioms, index, { boundary: event.target.value }),
                            },
                          }
                          : prev,
                      )
                    }
                    placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookRuleSection.gen_6fdc2189")}
                  />
                </HandbookField>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={addRule}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          增加核心规则
        </Button>
      </div>
    </section>
  );
}
