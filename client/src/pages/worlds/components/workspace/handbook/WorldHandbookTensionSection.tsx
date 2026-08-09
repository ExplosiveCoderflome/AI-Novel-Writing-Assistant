import { useTranslation } from "react-i18next";
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
        title={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_b7cadb8f")}
        description={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_341fa0a6")}
      />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <HandbookField title={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.worldCoreConflict")} hint={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_ef6e11f7")}>
          <HandbookTextarea
            value={draftStructure.profile.coreConflict}
            onChange={(value) =>
              setDraftStructure((prev) => (prev ? { ...prev, profile: { ...prev.profile, coreConflict: value } } : prev))
            }
            placeholder={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.exampleResourcesDepletedOrderCollapsedTwoForceSystemsCompete")}
          />
        </HandbookField>
        <HandbookField title={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_8ef6f2f5")} hint={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.oneLinePolicy")}>
          <HandbookTextarea
            value={listToText(draftStructure.rules.sharedConsequences)}
            onChange={(value) =>
              setDraftStructure((prev) =>
                prev ? { ...prev, rules: { ...prev.rules, sharedConsequences: textToList(value) } } : prev,
              )
            }
            placeholder={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_c46e3820")}
          />
        </HandbookField>
        <HandbookField title={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_9d4a3def")} hint={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.oneLineRestrictions")}>
          <HandbookTextarea
            value={listToText(draftStructure.rules.taboo)}
            onChange={(value) =>
              setDraftStructure((prev) => (prev ? { ...prev, rules: { ...prev.rules, taboo: textToList(value) } } : prev))
            }
            placeholder={i18next.t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_b1303b9e")}
          />
        </HandbookField>
        <div className="rounded-md border border-dashed p-3 text-sm leading-6 text-muted-foreground">{t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_1b0251bd", "需要细调势力关系、地点控制权、导入结构数据时，再进入高级字段维护。普通作者只需要维护本页的手册内容。")}<div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onOpenDeepening}>{t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_52384c69", "问答补齐")}</Button>
            <Button type="button" variant="outline" size="sm" onClick={onOpenLayers}>{t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_89b03150", "分层草稿")}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onOpenAdvanced}>{t("gen.pages.worlds.components.workspace.handbook.WorldHandbookTensionSection.gen_6d58393f", "高级字段维护")}</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
