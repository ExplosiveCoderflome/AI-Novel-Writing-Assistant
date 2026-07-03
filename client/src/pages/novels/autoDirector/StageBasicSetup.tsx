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
import { BookFramingSection } from "../components/basicInfoForm/BookFramingSection";
import {
  FieldLabel,
  findOptionSummary,
} from "../components/basicInfoForm/BasicInfoFormPrimitives";

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

  return (
    <section className="space-y-4 rounded-xl border bg-background/95 p-4 shadow-sm">
      <div>
        <div className="text-lg font-semibold text-foreground">导演起始设置</div>
        <div className={`mt-1 text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          只确认影响整本书手感的基础参数。不确定时保持默认即可。
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-reader-channel" hint={BASIC_INFO_FIELD_HINTS.readerChannelPreference}>读者频道倾向</FieldLabel>
          <select
            id="director-basic-reader-channel"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.readerChannelPreference}
            onChange={(event) => onBasicFormChange({
              readerChannelPreference: event.target.value as NovelBasicFormState["readerChannelPreference"],
            })}
          >
            {READER_CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {findOptionSummary(READER_CHANNEL_OPTIONS, basicForm.readerChannelPreference)}
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-pov" hint={BASIC_INFO_FIELD_HINTS.narrativePov}>叙事视角</FieldLabel>
          <select
            id="director-basic-pov"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.narrativePov}
            onChange={(event) => onBasicFormChange({
              narrativePov: event.target.value as NovelBasicFormState["narrativePov"],
            })}
          >
            {POV_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {findOptionSummary(POV_OPTIONS, basicForm.narrativePov)}
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-pace" hint={BASIC_INFO_FIELD_HINTS.pacePreference}>节奏偏好</FieldLabel>
          <select
            id="director-basic-pace"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.pacePreference}
            onChange={(event) => onBasicFormChange({
              pacePreference: event.target.value as NovelBasicFormState["pacePreference"],
            })}
          >
            {PACE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {findOptionSummary(PACE_OPTIONS, basicForm.pacePreference)}
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-emotion" hint={BASIC_INFO_FIELD_HINTS.emotionIntensity}>情绪浓度</FieldLabel>
          <select
            id="director-basic-emotion"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={basicForm.emotionIntensity}
            onChange={(event) => onBasicFormChange({
              emotionIntensity: event.target.value as NovelBasicFormState["emotionIntensity"],
            })}
          >
            {EMOTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {findOptionSummary(EMOTION_OPTIONS, basicForm.emotionIntensity)}
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-estimated" hint={BASIC_INFO_FIELD_HINTS.estimatedChapterCount}>预计章节数</FieldLabel>
          <Input
            id="director-basic-estimated"
            type="number"
            min={1}
            max={2000}
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
            <div className={`rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              建议先小范围尝试：先查看规划和前期章节方向，确认符合想法后再扩大产出范围。
            </div>
          ) : null}
        </div>
      </div>

      <BookFramingSection
        basicForm={basicForm}
        onFormChange={onBasicFormChange}
        quickFill={(
          <BookFramingQuickFillButton
            basicForm={basicForm}
            genreOptions={genreOptions}
            descriptionOverride={idea}
            onApplySuggestion={onBasicFormChange}
          />
        )}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onBack}>返回想法</Button>
        <Button type="button" onClick={onConfirm}>确认起始设置</Button>
      </div>
    </section>
  );
}

