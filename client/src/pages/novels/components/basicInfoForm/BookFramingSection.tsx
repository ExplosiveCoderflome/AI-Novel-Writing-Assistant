import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { BASIC_INFO_FIELD_HINTS, type NovelBasicFormState } from "../../novelBasicInfo.shared";
import { FieldLabel } from "./BasicInfoFormPrimitives";

interface BookFramingSectionProps {
  basicForm: NovelBasicFormState;
  onFormChange: (patch: Partial<NovelBasicFormState>) => void;
  quickFill?: ReactNode;
}

export function BookFramingSection(props: BookFramingSectionProps) {
  const { basicForm, onFormChange, quickFill } = props;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">{i18next.t("dict.gen_822ab1f4")}</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">{i18next.t("novels.bookFramingSection.d3fmi7")}</div>
        </div>
        {quickFill ? <div className="shrink-0">{quickFill}</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="basic-target-audience" hint={BASIC_INFO_FIELD_HINTS.targetAudience}>{i18next.t("novels.stageBasicSetup.ffxkar")}</FieldLabel>
          <Input
            id="basic-target-audience"
            value={basicForm.targetAudience}
            placeholder={i18next.t("dict.exampleReadersWhoLoveUrbanPressureReverseRelationshipAndContinuedChasingNewHooks")}
            onChange={(event) => onFormChange({ targetAudience: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-commercial-tags" hint={BASIC_INFO_FIELD_HINTS.commercialTagsText}>{i18next.t("novels.stageBasicSetup.j503cm")}</FieldLabel>
          <Input
            id="basic-commercial-tags"
            value={basicForm.commercialTagsText}
            placeholder={i18next.t("dict.exampleRevengeStrongConflictTensionedNegotiationOfficeRivalry")}
            onChange={(event) => onFormChange({ commercialTagsText: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-competing-feel" hint={BASIC_INFO_FIELD_HINTS.competingFeel}>{i18next.t("novels.stageBasicSetup.s4f5fa")}</FieldLabel>
          <Input
            id="basic-competing-feel"
            value={basicForm.competingFeel}
            placeholder={i18next.t("dict.exampleRealityWorkplacePressureWithSlightColdHumorAndHighDensityRelationshipTug")}
            onChange={(event) => onFormChange({ competingFeel: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-book-selling-point" hint={BASIC_INFO_FIELD_HINTS.bookSellingPoint}>{i18next.t("novels.stageBasicSetup.v4dly0")}</FieldLabel>
          <textarea
            id="basic-book-selling-point"
            rows={3}
            className="min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={basicForm.bookSellingPoint}
            placeholder={i18next.t("dict.exampleMainTriggerBiggerRelationshipAndInterestLadderReaderExpectPressure")}
            onChange={(event) => onFormChange({ bookSellingPoint: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="basic-first30-promise" hint={BASIC_INFO_FIELD_HINTS.first30ChapterPromise}>{i18next.t("novels.stageBasicSetup.o9l9nv")}</FieldLabel>
        <textarea
          id="basic-first30-promise"
          rows={5}
          className="min-h-[128px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={basicForm.first30ChapterPromise}
          placeholder={i18next.t("dict.exampleFirst30ChaptersEstablishMainStanceCoreOpponentRelationshipReverseCliffHanger")}
          onChange={(event) => onFormChange({ first30ChapterPromise: event.target.value })}
        />
      </div>
    </div>
  );
}
