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
        title="core rules"
        description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        count={draftStructure.rules.axioms.length}
      />
      <div className="mt-4 space-y-3">
        <HandbookField title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." hint="In one paragraph explain how power, resources, taboos, and consequences work together to limit the world.">
          <HandbookTextarea
            value={draftStructure.rules.summary}
            onChange={(value) =>
              setDraftStructure((prev) => (prev ? { ...prev, rules: { ...prev.rules, summary: value } } : prev))
            }
            placeholder="For example: All extraordinary powers come from star core loans. Use beyond the level will overdraw the lifespan and be recorded by Tianji Pavilion."
            minRows={3}
          />
        </HandbookField>
        <div className="grid gap-3 lg:grid-cols-2">
          {draftStructure.rules.axioms.map((rule: WorldRule, index) => (
            <div key={rule.id || index} className="rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">rule {index + 1}</div>
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
                  Remove
                                          </Button>
              </div>
              <div className="mt-3 grid gap-3">
                <HandbookField title="Rule name" hint="A short sentence is sufficient so that the author can quote it repeatedly when writing.">
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
                    placeholder="Star core loan, bloodline is irreversible, and spells cannot be cast in the forbidden city."
                  />
                </HandbookField>
                <HandbookField title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." hint="Write out how the characters, factions, and chapter events will be affected by this rule.">
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
                    placeholder="What does this rule mean in the story?"
                    minRows={3}
                  />
                </HandbookField>
                <HandbookField title="cost" hint="The price you have to pay for using, breaking or circumventing the rules.">
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
                    placeholder="Lifespan, memory, identity, resources, camp trust..."
                  />
                </HandbookField>
                <HandbookField title="Boundaries that cannot be breached at will" hint="Prevent subsequent plots from destroying the credibility of the world in order to solve the problem.">
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
                    placeholder="No one can be resurrected without paying a price; low-level characters cannot exceed the sealing rules."
                  />
                </HandbookField>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={addRule}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add core rules
                          </Button>
      </div>
    </section>
  );
}
