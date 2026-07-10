import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import {
  BASIC_INFO_FIELD_HINTS,
  DEFAULT_ESTIMATED_CHAPTER_COUNT,
  EMOTION_OPTIONS,
  PACE_OPTIONS,
  POV_OPTIONS,
  READER_CHANNEL_OPTIONS,
} from "../novelBasicInfo.shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import { BookFramingQuickFillButton } from "../components/basicInfoForm/BookFramingQuickFillButton";
import {
  FieldLabel,
  findOptionSummary,
} from "../components/basicInfoForm/BasicInfoFormPrimitives";
import SelectControl from "@/components/common/SelectControl";

interface StageBasicSetupProps {
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; path: string; label: string }>;
  idea: string;
  onBasicFormChange: (patch: Partial<NovelBasicFormState>) => void;
  onBack: () => void;
  onConfirm: () => void;
}

export default function StageBasicSetup({
  basicForm,
  genreOptions,
  idea,
  onBasicFormChange,
  onBack,
  onConfirm,
}: StageBasicSetupProps) {
  const hasLargeChapterPlan = basicForm.estimatedChapterCount > 200;
  const controlClassName = "w-full rounded-lg border-0 bg-muted/40 px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition hover:bg-muted/55 focus:bg-background focus:ring-2 focus:ring-primary/25";

  return (
    <section className="mx-auto w-full max-w-5xl space-y-7 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-normal text-foreground">{t("gen.pages.novels.autoDirector.StageBasicSetup.gen_094ca830")}</div>
          <div className={`mt-2 max-w-2xl text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            这里只确认影响整本书阅读感的基础参数。不确定时保持默认，AI 会继续根据你的起始想法判断。
          </div>
        </div>
        <div className="rounded-full bg-muted/55 px-3 py-1 text-xs text-muted-foreground">
          约 1 分钟
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-reader-channel" hint={BASIC_INFO_FIELD_HINTS.readerChannelPreference}>{t("gen.pages.novels.autoDirector.StageBasicSetup.gen_988f6935")}</FieldLabel>
          <SelectControl
            id="director-basic-reader-channel"
            className={controlClassName}
            value={basicForm.readerChannelPreference}
            onChange={(event) => onBasicFormChange({
              readerChannelPreference: event.target.value as NovelBasicFormState["readerChannelPreference"],
            })}
          >
            {READER_CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectControl>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {findOptionSummary(READER_CHANNEL_OPTIONS, basicForm.readerChannelPreference)}
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-pov" hint={BASIC_INFO_FIELD_HINTS.narrativePov}>{t("gen.pages.novels.autoDirector.StageBasicSetup.gen_15dd65d3")}</FieldLabel>
          <SelectControl
            id="director-basic-pov"
            className={controlClassName}
            value={basicForm.narrativePov}
            onChange={(event) => onBasicFormChange({
              narrativePov: event.target.value as NovelBasicFormState["narrativePov"],
            })}
          >
            {POV_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectControl>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {findOptionSummary(POV_OPTIONS, basicForm.narrativePov)}
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-pace" hint={BASIC_INFO_FIELD_HINTS.pacePreference}>{t("gen.pages.novels.autoDirector.StageBasicSetup.gen_d9dab569")}</FieldLabel>
          <SelectControl
            id="director-basic-pace"
            className={controlClassName}
            value={basicForm.pacePreference}
            onChange={(event) => onBasicFormChange({
              pacePreference: event.target.value as NovelBasicFormState["pacePreference"],
            })}
          >
            {PACE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectControl>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {findOptionSummary(PACE_OPTIONS, basicForm.pacePreference)}
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-emotion" hint={BASIC_INFO_FIELD_HINTS.emotionIntensity}>{t("gen.pages.novels.autoDirector.StageBasicSetup.gen_7c4d3215")}</FieldLabel>
          <SelectControl
            id="director-basic-emotion"
            className={controlClassName}
            value={basicForm.emotionIntensity}
            onChange={(event) => onBasicFormChange({
              emotionIntensity: event.target.value as NovelBasicFormState["emotionIntensity"],
            })}
          >
            {EMOTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectControl>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {findOptionSummary(EMOTION_OPTIONS, basicForm.emotionIntensity)}
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-estimated" hint={BASIC_INFO_FIELD_HINTS.estimatedChapterCount}>{t("gen.pages.novels.autoDirector.StageBasicSetup.gen_c8ac2fad")}</FieldLabel>
          <Input
            id="director-basic-estimated"
            type="number"
            min={1}
            max={2000}
            className={controlClassName}
            value={basicForm.estimatedChapterCount}
            onChange={(event) => onBasicFormChange({
              estimatedChapterCount: Math.max(
                1,
                Math.min(2000, Number(event.target.value || 0) || DEFAULT_ESTIMATED_CHAPTER_COUNT),
              ),
            })}
          />
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            会作为整书结构密度和后续卷章规划的参考，不是硬性上限。
          </div>
          {hasLargeChapterPlan ? (
            <div className={`rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              建议先小范围尝试：先查看规划和前期章节方向，确认符合想法后再扩大产出范围。
            </div>
          ) : null}
        </div>
      </div>

      <details className="group pt-2">
        <summary className="cursor-pointer list-none">
          <div>
            <div className="text-base font-semibold text-foreground">{t("gen.pages.novels.autoDirector.StageBasicSetup.gen_976a1cb1")}</div>
            <div className={`mt-1 max-w-3xl text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              不确定可以先跳过。补充后，AI 会更清楚这本书写给谁、前 30 章要给读者什么。
            </div>
          </div>
        </summary>

        <div className="mt-5 flex justify-start">
          <BookFramingQuickFillButton
            basicForm={basicForm}
            genreOptions={genreOptions}
            descriptionOverride={idea}
            onApplySuggestion={onBasicFormChange}
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="director-basic-target-audience" hint={BASIC_INFO_FIELD_HINTS.targetAudience}>
              目标读者
            </FieldLabel>
            <Input
              id="director-basic-target-audience"
              className={controlClassName}
              value={basicForm.targetAudience}
              placeholder={t("gen.pages.novels.autoDirector.StageBasicSetup.exampleReadersWhoLoveUrbanPressureReverseRelationshipAndContinuedChasingNewHooks")}
              onChange={(event) => onBasicFormChange({ targetAudience: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="director-basic-commercial-tags" hint={BASIC_INFO_FIELD_HINTS.commercialTagsText}>
              核心商业标签
            </FieldLabel>
            <Input
              id="director-basic-commercial-tags"
              className={controlClassName}
              value={basicForm.commercialTagsText}
              placeholder={t("gen.pages.novels.autoDirector.StageBasicSetup.exampleRevengeStrongConflictTensionedNegotiationOfficeRivalry")}
              onChange={(event) => onBasicFormChange({ commercialTagsText: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="director-basic-competing-feel" hint={BASIC_INFO_FIELD_HINTS.competingFeel}>
              竞品感 / 熟悉阅读感
            </FieldLabel>
            <Input
              id="director-basic-competing-feel"
              className={controlClassName}
              value={basicForm.competingFeel}
              placeholder={t("gen.pages.novels.autoDirector.StageBasicSetup.exampleRealityWorkplacePressureWithSlightColdHumorAndHighDensityRelationshipTug")}
              onChange={(event) => onBasicFormChange({ competingFeel: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="director-basic-book-selling-point" hint={BASIC_INFO_FIELD_HINTS.bookSellingPoint}>
              本书核心卖点
            </FieldLabel>
            <textarea
              id="director-basic-book-selling-point"
              rows={3}
              className={`${controlClassName} min-h-[96px] resize-y`}
              value={basicForm.bookSellingPoint}
              placeholder={t("gen.pages.novels.autoDirector.StageBasicSetup.exampleMainTriggerBiggerRelationshipAndInterestLadderReaderExpectPressure")}
              onChange={(event) => onBasicFormChange({ bookSellingPoint: event.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-first30-promise" hint={BASIC_INFO_FIELD_HINTS.first30ChapterPromise}>
            前 30 章承诺
          </FieldLabel>
          <textarea
            id="director-basic-first30-promise"
            rows={4}
            className={`${controlClassName} min-h-[120px] resize-y`}
            value={basicForm.first30ChapterPromise}
            placeholder={t("gen.pages.novels.autoDirector.StageBasicSetup.exampleFirst30ChaptersEstablishMainStanceCoreOpponentRelationshipReverseCliffHanger")}
            onChange={(event) => onBasicFormChange({ first30ChapterPromise: event.target.value })}
          />
        </div>
      </details>

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>{t("gen.pages.novels.autoDirector.StageBasicSetup.gen_17301063")}</Button>
        <Button type="button" onClick={onConfirm}>{t("gen.pages.novels.autoDirector.StageBasicSetup.gen_35fa1889")}</Button>
      </div>
    </section>
  );
}
