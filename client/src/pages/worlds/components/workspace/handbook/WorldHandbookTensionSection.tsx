import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { GitBranch } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { WorldStructuredData } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { HandbookField, HandbookTextarea, SectionHeader } from "./HandbookPrimitives";
import { listToText, textToList } from "./handbookEditorUtils";

export default function WorldHandbookTensionSection(props: {
  draftStructure: WorldStructuredData;
  setDraftStructure: Dispatch<SetStateAction<WorldStructuredData | null>>;
  onOpenDeepening: () => void;
  onOpenLayers: () => void;
  onOpenAdvanced: () => void;
}) {
  const { draftStructure, setDraftStructure, onOpenDeepening, onOpenLayers, onOpenAdvanced } = props;

  return (
    <section className="rounded-md border p-4">
      <SectionHeader
        icon={GitBranch}
        title={i18next.t("dict.gen_b7cadb8f")}
        description={i18next.t("dict.gen_341fa0a6")}
      />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <HandbookField title={i18next.t("dict.worldCoreConflict")} hint={i18next.t("dict.gen_ef6e11f7")}>
          <HandbookTextarea
            value={draftStructure.profile.coreConflict}
            onChange={(value) =>
              setDraftStructure((prev) => (prev ? { ...prev, profile: { ...prev.profile, coreConflict: value } } : prev))
            }
            placeholder={i18next.t("dict.exampleResourcesDepletedOrderCollapsedTwoForceSystemsCompete")}
          />
        </HandbookField>
        <HandbookField title={i18next.t("dict.gen_8ef6f2f5")} hint={i18next.t("dict.oneLinePolicy")}>
          <HandbookTextarea
            value={listToText(draftStructure.rules.sharedConsequences)}
            onChange={(value) =>
              setDraftStructure((prev) =>
                prev ? { ...prev, rules: { ...prev.rules, sharedConsequences: textToList(value) } } : prev,
              )
            }
            placeholder={i18next.t("dict.gen_c46e3820")}
          />
        </HandbookField>
        <HandbookField title={i18next.t("dict.gen_9d4a3def")} hint={i18next.t("dict.oneLineRestrictions")}>
          <HandbookTextarea
            value={listToText(draftStructure.rules.taboo)}
            onChange={(value) =>
              setDraftStructure((prev) => (prev ? { ...prev, rules: { ...prev.rules, taboo: textToList(value) } } : prev))
            }
            placeholder={i18next.t("dict.gen_b1303b9e")}
          />
        </HandbookField>
        <div className="rounded-md border border-dashed p-3 text-sm leading-6 text-muted-foreground">{i18next.t("worlds.worldHandbookTensionSection.f6kf15")}<div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onOpenDeepening}>{i18next.t("worlds.worldHandbookTensionSection.jfi88h")}</Button>
            <Button type="button" variant="outline" size="sm" onClick={onOpenLayers}>{i18next.t("dict.gen_89b03150")}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onOpenAdvanced}>{i18next.t("dict.gen_6d58393f")}</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
