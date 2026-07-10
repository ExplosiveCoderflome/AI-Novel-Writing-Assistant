import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { MapPinned, Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { WorldLocation, WorldStructuredData } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HandbookField, HandbookTextarea, SectionHeader } from "./HandbookPrimitives";
import { makeId, removeItem, updateItem } from "./handbookEditorUtils";

export default function WorldHandbookLocationSection(props: {
  draftStructure: WorldStructuredData;
  setDraftStructure: Dispatch<SetStateAction<WorldStructuredData | null>>;
}) {
  const { draftStructure, setDraftStructure } = props;

  const addLocation = () => {
    setDraftStructure((prev) =>
      prev
        ? {
          ...prev,
          locations: [
            ...prev.locations,
            {
              id: makeId("location", prev.locations.length),
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
    );
  };

  return (
    <section className="rounded-md border p-4">
      <SectionHeader
        icon={MapPinned}
        title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_bf876a86")}
        description={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_5eab593a")}
        count={draftStructure.locations.length}
      />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {draftStructure.locations.map((location: WorldLocation, index) => (
          <div key={location.id || index} className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_8ad26930")}</div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDraftStructure((prev) =>
                    prev ? { ...prev, locations: removeItem(prev.locations, index) } : prev,
                  )
                }
              >
                移除
              </Button>
            </div>
            <div className="mt-3 grid gap-3">
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_6608b1e8")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_4c64c523")}>
                <Input
                  value={location.name}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, locations: updateItem(prev.locations, index, { name: event.target.value }) } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_bf68522b")}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_8a9c3f14")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_62ed5e07")}>
                <Input
                  value={location.terrain}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? { ...prev, locations: updateItem(prev.locations, index, { terrain: event.target.value }) }
                        : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_03d029f6")}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_051e077a")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_4bb9a973")}>
                <HandbookTextarea
                  value={location.summary}
                  onChange={(value) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, locations: updateItem(prev.locations, index, { summary: value }) } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_a9cad450")}
                  minRows={3}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_b4406c09")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_8187b5cf")}>
                <Input
                  value={location.narrativeFunction}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev
                        ? {
                          ...prev,
                          locations: updateItem(prev.locations, index, { narrativeFunction: event.target.value }),
                        }
                        : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_a28adf5e")}
                />
              </HandbookField>
              <HandbookField title={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_fd11c0b0")} hint={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_ed9089b3")}>
                <Input
                  value={location.risk}
                  onChange={(event) =>
                    setDraftStructure((prev) =>
                      prev ? { ...prev, locations: updateItem(prev.locations, index, { risk: event.target.value }) } : prev,
                    )
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.handbook.WorldHandbookLocationSection.gen_21edf84f")}
                />
              </HandbookField>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" className="mt-3" variant="outline" onClick={addLocation}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        增加故事地点
      </Button>
    </section>
  );
}
