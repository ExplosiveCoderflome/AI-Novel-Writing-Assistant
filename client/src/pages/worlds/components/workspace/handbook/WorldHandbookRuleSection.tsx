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
        title="核心规则"
        description="这些规则会约束角色身份、力量边界和冲突来源，属于本书写作时最需要遵守的底层设定。"
        count={draftStructure.rules.axioms.length}
      />
      <div className="mt-4 space-y-3">
        <HandbookField title="规则总纲" hint="用一段话说明力量、资源、禁忌和后果如何共同限制这个世界。">
          <HandbookTextarea
            value={draftStructure.rules.summary}
            onChange={(value) =>
              setDraftStructure((prev) => (prev ? { ...prev, rules: { ...prev.rules, summary: value } } : prev))
            }
            placeholder="例如：所有超凡力量都来自星核借贷，越级使用会透支寿命，并被天机阁记录。"
            minRows={3}
          />
        </HandbookField>
        <div className="grid gap-3 lg:grid-cols-2">
          {draftStructure.rules.axioms.map((rule: WorldRule, index) => (
            <div key={rule.id || index} className="rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">规则 {index + 1}</div>
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
                <HandbookField title="规则名称" hint="短句即可，方便作者在写作时反复引用。">
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
                    placeholder="星核借贷、血脉不可逆、禁城不得施法"
                  />
                </HandbookField>
                <HandbookField title="故事含义" hint="写清角色、势力和章节事件会怎样被这条规则影响。">
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
                    placeholder="这条规则在故事里意味着什么？"
                    minRows={3}
                  />
                </HandbookField>
                <HandbookField title="代价" hint="使用、违反或绕开规则时必须付出的代价。">
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
                    placeholder="寿命、记忆、身份、资源、阵营信任..."
                  />
                </HandbookField>
                <HandbookField title="不可随意突破的边界" hint="防止后续剧情为了解决问题而破坏世界可信度。">
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
                    placeholder="谁也不能无代价复活；低阶角色不能越过封印规则。"
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
