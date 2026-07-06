import type { DirectorWorldSetupMode } from "@ai-novel/shared/types/novelDirector";
import type { StyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import { BASIC_INFO_FIELD_HINTS } from "../novelBasicInfo.shared";
import { FieldLabel } from "../components/basicInfoForm/BasicInfoFormPrimitives";

interface StageWorldStyleProps {
  basicForm: NovelBasicFormState;
  worldOptions: Array<{ id: string; name: string }>;
  worldSetupMode: DirectorWorldSetupMode;
  onWorldSetupModeChange: (value: DirectorWorldSetupMode) => void;
  styleProfileOptions: Array<{ id: string; name: string }>;
  selectedStyleProfileId: string;
  selectedStyleSummary: StyleIntentSummary | null;
  onStyleProfileChange: (value: string) => void;
  onBasicFormChange: (patch: Partial<NovelBasicFormState>) => void;
  onBack: () => void;
  onConfirm: () => void;
}

export default function StageWorldStyle({
  basicForm,
  worldOptions,
  worldSetupMode,
  onWorldSetupModeChange,
  styleProfileOptions,
  selectedStyleProfileId,
  selectedStyleSummary,
  onStyleProfileChange,
  onBasicFormChange,
  onBack,
  onConfirm,
}: StageWorldStyleProps) {
  const selectedWorld = worldOptions.find((world) => world.id === basicForm.worldId) ?? null;
  const controlClassName = "w-full rounded-lg border-0 bg-muted/40 px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition hover:bg-muted/55 focus:bg-background focus:ring-2 focus:ring-primary/25";

  return (
    <section className="mx-auto w-full max-w-5xl space-y-7 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-normal text-foreground">给故事一个世界底色</div>
          <div className={`mt-2 max-w-2xl text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            可以选一个世界样本给 AI 参考，也可以让它根据起始想法自动整理本书世界。写法会作为后续规划和正文的默认语气。
          </div>
        </div>
        <div className="rounded-full bg-muted/55 px-3 py-1 text-xs text-muted-foreground">
          可保持默认
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-world" hint={BASIC_INFO_FIELD_HINTS.worldId}>规划参考世界样本</FieldLabel>
          <select
            id="director-basic-world"
            className={controlClassName}
            value={basicForm.worldId}
            onChange={(event) => onBasicFormChange({ worldId: event.target.value })}
          >
            <option value="">不指定参考世界</option>
            {worldOptions.length === 0 ? (
              <option value="" disabled>暂无可选世界样本</option>
            ) : null}
            {worldOptions.map((world) => (
              <option key={world.id} value={world.id}>{world.name}</option>
            ))}
          </select>
          <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {worldOptions.length > 0
              ? "这里只给自动导演提供快速参考。完整导入、生成和同步请在小说页的“本书世界”中完成。"
              : "没有可选世界样本时，可以先用起始想法开书。"}
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="text-sm font-medium text-foreground">本书世界处理</div>
          {selectedWorld ? (
            <div className={`text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              自动导演会参考「{selectedWorld.name}」这个世界样本，并在角色准备前整理可用于本书的世界约束。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-lg px-4 py-4 text-left transition ring-1 ${
                  worldSetupMode === "auto_generate"
                    ? "bg-foreground text-background ring-foreground shadow-sm"
                    : "bg-background/60 text-foreground ring-border/25 hover:bg-background"
                }`}
                onClick={() => onWorldSetupModeChange("auto_generate")}
              >
                <div className="text-sm font-medium">根据宏观规划生成本书世界</div>
                <div className={`mt-2 text-xs leading-5 ${worldSetupMode === "auto_generate" ? "text-background/70" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  适合奇幻、玄幻、科幻、悬疑等需要世界规则支撑的项目。
                </div>
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-4 text-left transition ring-1 ${
                  worldSetupMode === "skip"
                    ? "bg-foreground text-background ring-foreground shadow-sm"
                    : "bg-background/60 text-foreground ring-border/25 hover:bg-background"
                }`}
                onClick={() => onWorldSetupModeChange("skip")}
              >
                <div className="text-sm font-medium">暂不使用世界观</div>
                <div className={`mt-2 text-xs leading-5 ${worldSetupMode === "skip" ? "text-background/70" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  适合现实题材、轻设定项目，角色和章节会主要依据书级规划推进。
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-style-profile" hint="可选。选定后，导演前半段会只读取轻量写法摘要，正文阶段再继续使用完整写法规则。">
            书级默认写法
          </FieldLabel>
          <select
            id="director-basic-style-profile"
            className={controlClassName}
            value={selectedStyleProfileId}
            onChange={(event) => onStyleProfileChange(event.target.value)}
          >
            <option value="">先只用文风关键词</option>
            {styleProfileOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
          <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {selectedStyleSummary?.stageSummaryLines[0] ?? "有沉淀好的写法资产时，建议直接选一套，帮助你更清楚地预期导演会怎样写。"}
          </div>
          {selectedStyleSummary?.stageSummaryLines.length ? (
            <div className={`pt-1 text-xs leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              这套写法会影响后续章节的语气和节奏：{selectedStyleSummary.stageSummaryLines.join("；")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>返回起始设置</Button>
        <Button type="button" onClick={onConfirm}>确认世界与写法</Button>
      </div>
    </section>
  );
}
