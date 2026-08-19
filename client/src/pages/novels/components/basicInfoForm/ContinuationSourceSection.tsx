import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { Button } from "@/components/ui/button";
import {
  BASIC_INFO_FIELD_HINTS,
  type NovelBasicFormState,
} from "../../novelBasicInfo.shared";
import {
  FieldLabel,
  HelpHint,
  SectionBlock,
  SelectionCard,
} from "./BasicInfoFormPrimitives";
import SelectControl from "@/components/common/SelectControl";

interface ContinuationSourceSectionProps {
  basicForm: NovelBasicFormState;
  sourceNovelOptions: Array<{ id: string; title: string }>;
  sourceKnowledgeOptions: Array<{ id: string; title: string }>;
  sourceNovelBookAnalysisOptions: Array<{
    id: string;
    title: string;
    documentTitle: string;
    documentVersionNumber: number;
  }>;
  isLoadingSourceNovelBookAnalyses: boolean;
  availableBookAnalysisSections: Array<{ key: BookAnalysisSectionKey; title: string }>;
  hasSelectedContinuationSource: boolean;
  onFormChange: (patch: Partial<NovelBasicFormState>) => void;
}

export function ContinuationSourceSection(props: ContinuationSourceSectionProps) {
  const {
    basicForm,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses,
    availableBookAnalysisSections,
    hasSelectedContinuationSource,
    onFormChange,
  } = props;

  return (
    <SectionBlock
      title={i18next.t("dict.gen_30a3cbb1")}
      description={i18next.t("dict.gen_03c72dde")}
      surface="none"
    >
      <div className="space-y-2">
        <FieldLabel hint={BASIC_INFO_FIELD_HINTS.continuationSourceType}>{i18next.t("dict.gen_72eddec1")}</FieldLabel>
        <div className="grid gap-3 md:grid-cols-2">
          <SelectionCard
            option={{
              value: "novel",
              label: i18next.t("dict.gen_ec8327f5"),
              summary: i18next.t("dict.gen_058e1074"),
            }}
            selected={basicForm.continuationSourceType === "novel"}
            onSelect={(value) => onFormChange({ continuationSourceType: value })}
          />
          <SelectionCard
            option={{
              value: "knowledge_document",
              label: i18next.t("dict.gen_ecfe57c7"),
              summary: i18next.t("dict.gen_3e0dbf84"),
            }}
            selected={basicForm.continuationSourceType === "knowledge_document"}
            onSelect={(value) => onFormChange({ continuationSourceType: value })}
          />
        </div>
      </div>

      {basicForm.continuationSourceType === "novel" ? (
        <div className="space-y-2">
          <FieldLabel htmlFor="basic-source-novel">{i18next.t("dict.gen_f9418451")}</FieldLabel>
          <SelectControl
            id="basic-source-novel"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.sourceNovelId}
            onChange={(event) => onFormChange({ sourceNovelId: event.target.value })}
          >
            <option value="">{i18next.t("dict.gen_725b9d46")}</option>
            {sourceNovelOptions.map((novel) => (
              <option key={novel.id} value={novel.id}>{novel.title}</option>
            ))}
          </SelectControl>
        </div>
      ) : (
        <div className="space-y-2">
          <FieldLabel htmlFor="basic-source-knowledge">{i18next.t("dict.gen_ecfe57c7")}</FieldLabel>
          <SelectControl
            id="basic-source-knowledge"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.sourceKnowledgeDocumentId}
            onChange={(event) => onFormChange({ sourceKnowledgeDocumentId: event.target.value })}
          >
            <option value="">{i18next.t("dict.gen_50fc44ac")}</option>
            {sourceKnowledgeOptions.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.title}</option>
            ))}
          </SelectControl>
        </div>
      )}

      {hasSelectedContinuationSource ? (
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">{i18next.t("novels.continuationSourceSection.csfxub")}<HelpHint text={BASIC_INFO_FIELD_HINTS.continuationBookAnalysis} />
            </div>
            <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_70c11809")}</div>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-book-analysis">{i18next.t("dict.gen_64d477d1")}</FieldLabel>
            <SelectControl
              id="basic-book-analysis"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.continuationBookAnalysisId}
              onChange={(event) => {
                const nextAnalysisId = event.target.value;
                onFormChange({
                  continuationBookAnalysisId: nextAnalysisId,
                  continuationBookAnalysisSections: nextAnalysisId
                    ? (
                      basicForm.continuationBookAnalysisSections.length > 0
                        ? basicForm.continuationBookAnalysisSections
                        : availableBookAnalysisSections.map((item) => item.key)
                    )
                    : [],
                });
              }}
            >
              <option value="">{i18next.t("dict.noReferenceBook")}</option>
              {sourceNovelBookAnalysisOptions.map((analysis) => (
                <option key={analysis.id} value={analysis.id}>
                  {analysis.title} | {analysis.documentTitle} v{analysis.documentVersionNumber}
                </option>
              ))}
            </SelectControl>
          </div>

          {isLoadingSourceNovelBookAnalyses ? (
            <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_1432dcb3")}</div>
          ) : null}
          {!isLoadingSourceNovelBookAnalyses && sourceNovelBookAnalysisOptions.length === 0 ? (
            <div className="text-xs text-muted-foreground">{i18next.t("novels.continuationSourceSection.r831ir")}</div>
          ) : null}

          {basicForm.continuationBookAnalysisId ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{i18next.t("dict.gen_0175207d")}</span>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => onFormChange({
                    continuationBookAnalysisSections: availableBookAnalysisSections.map((item) => item.key),
                  })}
                >{i18next.t("novels.continuationSourceSection.emxt")}</Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => onFormChange({ continuationBookAnalysisSections: [] })}
                >{i18next.t("image.imageGenerationConfirmDialog.jdw5")}</Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableBookAnalysisSections.map((section) => (
                  <label key={section.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={basicForm.continuationBookAnalysisSections.includes(section.key)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        const next = checked
                          ? [...basicForm.continuationBookAnalysisSections, section.key]
                          : basicForm.continuationBookAnalysisSections.filter((item) => item !== section.key);
                        onFormChange({
                          continuationBookAnalysisSections: Array.from(new Set(next)),
                        });
                      }}
                    />
                    <span>{section.title}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionBlock>
  );
}
