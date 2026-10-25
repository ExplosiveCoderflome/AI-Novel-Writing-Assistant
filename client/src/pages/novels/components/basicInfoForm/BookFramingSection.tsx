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
  const literary = Boolean(basicForm.creativeProfile && basicForm.creativeProfile.orientation !== "web_serial");
  const controlClassName = "rounded-xl border-0 bg-background/85 ring-1 ring-border/50 transition-colors hover:bg-background focus-visible:ring-primary/30";

  return (
    <div className="space-y-5">
      <div className="flex min-h-16 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{literary ? "读者与作品关注点" : "读者与追更理由"}</h3>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            不用写专业策划词，按直觉说清楚谁会喜欢、最想看什么，以及前期会获得什么回报。
          </div>
        </div>
        {quickFill ? <div className="shrink-0">{quickFill}</div> : null}
      </div>

      <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="basic-target-audience" hint={BASIC_INFO_FIELD_HINTS.targetAudience}>
            目标读者
          </FieldLabel>
          <Input
            id="basic-target-audience"
            className={controlClassName}
            value={basicForm.targetAudience}
            placeholder={literary ? "例如：关注代际关系、迁居记忆与人物处境的读者" : "例如：爱看都市高压逆袭、关系拉扯和持续追更钩子的读者"}
            onChange={(event) => onFormChange({ targetAudience: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-commercial-tags" hint={BASIC_INFO_FIELD_HINTS.commercialTagsText}>
            {literary ? "作品主题与类型标签" : "核心商业标签"}
          </FieldLabel>
          <Input
            id="basic-commercial-tags"
            className={controlClassName}
            value={basicForm.commercialTagsText}
            placeholder={literary ? "例如：家族，迁居记忆，关系，地方生活" : "例如：逆袭，强冲突，悬念拉满，职场博弈"}
            onChange={(event) => onFormChange({ commercialTagsText: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-competing-feel" hint={BASIC_INFO_FIELD_HINTS.competingFeel}>
            竞品感 / 熟悉阅读感
          </FieldLabel>
          <Input
            id="basic-competing-feel"
            className={controlClassName}
            value={basicForm.competingFeel}
            placeholder="例如：现实职场压迫感里带一点冷幽默和高密度关系拉扯"
            onChange={(event) => onFormChange({ competingFeel: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-book-selling-point" hint={BASIC_INFO_FIELD_HINTS.bookSellingPoint}>
            {literary ? "本书的核心关注与吸引力" : "本书核心卖点"}
          </FieldLabel>
          <textarea
            id="basic-book-selling-point"
            rows={3}
            className={`${controlClassName} min-h-[104px] w-full resize-y px-3 py-2.5 text-sm leading-6 outline-none`}
            value={basicForm.bookSellingPoint}
            placeholder={literary ? "例如：一家人在搬迁选择中逐渐看清彼此的沉默，重复出现的修伞物件带出不同年代的生活经验。" : "例如：主角每次解决现实困局都会撬动更大的关系链和利益链，读者会一直期待下一次反压。"}
            onChange={(event) => onFormChange({ bookSellingPoint: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="basic-first30-promise" hint={BASIC_INFO_FIELD_HINTS.first30ChapterPromise}>
          {literary ? "开篇的叙事承诺" : "前 30 章承诺"}
        </FieldLabel>
        <textarea
          id="basic-first30-promise"
          rows={4}
          className={`${controlClassName} min-h-[120px] w-full resize-y px-3 py-2.5 text-sm leading-6 outline-none`}
          value={basicForm.first30ChapterPromise}
          placeholder={literary ? "例如：开篇建立家人对老店的不同感受，让迁居问题在生活细节与对白中逐渐清晰，不预设反转或胜利。" : "例如：前 30 章必须让读者看到主角站稳第一阶段立场、核心对手浮出水面、关系线第一次强反转，并明确这本书后面会越写越狠。"}
          onChange={(event) => onFormChange({ first30ChapterPromise: event.target.value })}
        />
      </div>
    </div>
  );
}
