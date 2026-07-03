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

  return (
    <section className="space-y-4 rounded-xl border bg-background/95 p-4 shadow-sm">
      <div>
        <div className="text-lg font-semibold text-foreground">世界与写法</div>
        <div className={`mt-1 text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          选择可参考的世界样本，并决定本书默认写法。没有资料时可以让 AI 自动整理。
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="director-basic-world" hint={BASIC_INFO_FIELD_HINTS.worldId}>规划参考世界样本</FieldLabel>
        <select
          id="director-basic-world"
          className="w-full rounded-md border bg-background p-2 text-sm"
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

      <div className="rounded-lg border bg-muted/15 p-3">
        <div className="text-sm font-medium text-foreground">本书世界处理</div>
        {selectedWorld ? (
          <div className={`mt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            自动导演会使用「{selectedWorld.name}」作为本书世界样本，并在角色准备前整理可用于本书的世界约束。
          </div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={`rounded-lg border p-3 text-left transition ${
                worldSetupMode === "auto_generate"
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-background hover:border-primary/40"
              }`}
              onClick={() => onWorldSetupModeChange("auto_generate")}
            >
              <div className="text-sm font-medium text-foreground">根据宏观规划生成本书世界</div>
              <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                适合奇幻、玄幻、科幻、悬疑等需要世界规则支撑的项目。
              </div>
            </button>
            <button
              type="button"
              className={`rounded-lg border p-3 text-left transition ${
                worldSetupMode === "skip"
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-background hover:border-primary/40"
              }`}
              onClick={() => onWorldSetupModeChange("skip")}
            >
              <div className="text-sm font-medium text-foreground">暂不使用世界观</div>
              <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
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
          className="w-full rounded-md border bg-background p-2 text-sm"
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
          <div className={`rounded-xl border bg-muted/15 p-3 text-xs leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            本阶段仅生效的写法摘要：{selectedStyleSummary.stageSummaryLines.join("；")}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onBack}>返回起始设置</Button>
        <Button type="button" onClick={onConfirm}>确认世界与写法</Button>
      </div>
    </section>
  );
}

