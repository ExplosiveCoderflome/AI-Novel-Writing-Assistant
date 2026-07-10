import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Castle, Plus } from "lucide-react";
import type { WorldForce, WorldStructuredData } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HandbookField, HandbookTextarea, SectionHeader } from "./HandbookPrimitives";
import { makeId, removeItem, updateItem } from "./handbookEditorUtils";

export default function WorldHandbookForceSection(props: {
  draftStructure: WorldStructuredData;
  setDraftStructure: Dispatch<SetStateAction<WorldStructuredData | null>>;
}) {
  const { draftStructure, setDraftStructure } = props;
  const forceSummary = useMemo(() => {
    const forceNames = draftStructure.forces.map((force) => force.name).filter(Boolean).slice(0, 4);
    return forceNames.length > 0 ? forceNames.join(" / ") : t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_55512ee4");
  }, [draftStructure.forces]);

  const addForce = () => {
    setDraftStructure((prev) =>
      prev
        ? {
          ...prev,
          forces: [
            ...prev.forces,
            {
              id: makeId("force", prev.forces.length),
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
    );
  };

  return (
    <section className="rounded-md border p-4">
      <SectionHeader
        icon={Castle}
        title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.majorForce")}
        description={`让作者先看懂谁在争夺资源、谁会制造阻力、角色可能从哪里来。${forceSummary}`}
        count={draftStructure.forces.length}
      />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {draftStructure.forces.map((force: WorldForce, index) => (
          <div key={force.id || index} className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_467a3d1a")}</div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDraftStructure((prev) => (prev ? { ...prev, forces: removeItem(prev.forces, index) } : prev))
                }
              >
                移除
              </Button>
            </div>
            <div className="mt-3 grid gap-3">
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_e548e9c0")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_ee03f569")}>
                <Input
                  value={force.name}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, forces: updateItem(prev.forces, index, { name: event.target.value }) } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_695b5835")}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_f81810c7")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_c5bf3f2c")}>
                <Input
                  value={force.type}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, forces: updateItem(prev.forces, index, { type: event.target.value }) } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_bc47188f")}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_de605aaa")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_400e88de")}>
                <HandbookTextarea
                  value={force.summary}
                  onChange={(value) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, forces: updateItem(prev.forces, index, { summary: value }) } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_d8420eef")}
                  minRows={3}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_deb979f8")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_92320747")}>
                <Input
                  value={force.currentObjective}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? { ...prev, forces: updateItem(prev.forces, index, { currentObjective: event.target.value }) }
                        : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.claimMineralsBlockTruthSeekLostHeir")}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_e2f7b24d")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.forcedChoiceConsequences")}>
                <Input
                  value={force.pressure}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, forces: updateItem(prev.forces, index, { pressure: event.target.value }) } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookForceSection.gen_0d057321")}
                />
              </HandbookField>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" className="mt-3" variant="outline" onClick={addForce}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        增加主要势力
      </Button>
    </section>
  );
}
