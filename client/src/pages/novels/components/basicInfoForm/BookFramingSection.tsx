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
  const controlClassName = "rounded-xl border-0 bg-background/85 ring-1 ring-border/50 transition-colors hover:bg-background focus-visible:ring-primary/30";

  return (
    <div className="space-y-5">
      <div className="flex min-h-16 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">读者与追更理由</h3>
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
            placeholder="例如：爱看都市高压逆袭、关系拉扯和持续追更钩子的读者"
            onChange={(event) => onFormChange({ targetAudience: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-commercial-tags" hint={BASIC_INFO_FIELD_HINTS.commercialTagsText}>
            核心商业标签
          </FieldLabel>
          <Input
            id="basic-commercial-tags"
            className={controlClassName}
            value={basicForm.commercialTagsText}
            placeholder="例如：逆袭，强冲突，悬念拉满，职场博弈"
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
            本书核心卖点
          </FieldLabel>
          <textarea
            id="basic-book-selling-point"
            rows={3}
            className={`${controlClassName} min-h-[104px] w-full resize-y px-3 py-2.5 text-sm leading-6 outline-none`}
            value={basicForm.bookSellingPoint}
            placeholder="例如：主角每次解决现实困局都会撬动更大的关系链和利益链，读者会一直期待下一次反压。"
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
          rows={4}
          className={`${controlClassName} min-h-[120px] w-full resize-y px-3 py-2.5 text-sm leading-6 outline-none`}
          value={basicForm.first30ChapterPromise}
          placeholder="例如：前 30 章必须让读者看到主角站稳第一阶段立场、核心对手浮出水面、关系线第一次强反转，并明确这本书后面会越写越狠。"
          onChange={(event) => onFormChange({ first30ChapterPromise: event.target.value })}
        />
      </div>
    </div>
  );
}
