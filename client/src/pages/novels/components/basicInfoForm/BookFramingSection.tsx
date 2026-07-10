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
          <div className="text-sm font-semibold text-foreground">{t("gen.pages.novels.components.basicInfoForm.BookFramingSection.gen_822ab1f4")}</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            用最直白的话说清楚：这本书写给谁、卖点是什么、读者前 30 章会得到什么。不会写专业策划词也没关系，按你的直觉描述即可。
          </div>
        </div>
        {quickFill ? <div className="shrink-0">{quickFill}</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="basic-target-audience" hint={BASIC_INFO_FIELD_HINTS.targetAudience}>
            目标读者
          </FieldLabel>
          <Input
            id="basic-target-audience"
            value={basicForm.targetAudience}
            placeholder={t("gen.pages.novels.components.basicInfoForm.BookFramingSection.exampleReadersWhoLoveUrbanPressureReverseRelationshipAndContinuedChasingNewHooks")}
            onChange={(event) => onFormChange({ targetAudience: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-commercial-tags" hint={BASIC_INFO_FIELD_HINTS.commercialTagsText}>
            核心商业标签
          </FieldLabel>
          <Input
            id="basic-commercial-tags"
            value={basicForm.commercialTagsText}
            placeholder={t("gen.pages.novels.components.basicInfoForm.BookFramingSection.exampleRevengeStrongConflictTensionedNegotiationOfficeRivalry")}
            onChange={(event) => onFormChange({ commercialTagsText: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-competing-feel" hint={BASIC_INFO_FIELD_HINTS.competingFeel}>
            竞品感 / 熟悉阅读感
          </FieldLabel>
          <Input
            id="basic-competing-feel"
            value={basicForm.competingFeel}
            placeholder={t("gen.pages.novels.components.basicInfoForm.BookFramingSection.exampleRealityWorkplacePressureWithSlightColdHumorAndHighDensityRelationshipTug")}
            onChange={(event) => onFormChange({ competingFeel: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-book-selling-point" hint={BASIC_INFO_FIELD_HINTS.bookSellingPoint}>
            本书核心卖点
          </FieldLabel>
          <textarea
            id="basic-book-selling-point"
            rows={3}
            className="min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={basicForm.bookSellingPoint}
            placeholder={t("gen.pages.novels.components.basicInfoForm.BookFramingSection.exampleMainTriggerBiggerRelationshipAndInterestLadderReaderExpectPressure")}
            onChange={(event) => onFormChange({ bookSellingPoint: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="basic-first30-promise" hint={BASIC_INFO_FIELD_HINTS.first30ChapterPromise}>
          前 30 章承诺
        </FieldLabel>
        <textarea
          id="basic-first30-promise"
          rows={5}
          className="min-h-[128px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={basicForm.first30ChapterPromise}
          placeholder={t("gen.pages.novels.components.basicInfoForm.BookFramingSection.exampleFirst30ChaptersEstablishMainStanceCoreOpponentRelationshipReverseCliffHanger")}
          onChange={(event) => onFormChange({ first30ChapterPromise: event.target.value })}
        />
      </div>
    </div>
  );
}
