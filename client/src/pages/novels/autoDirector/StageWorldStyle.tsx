import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { DirectorWorldSetupMode } from "@ai-novel/shared/types/novelDirector";
import type { StyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import { BASIC_INFO_FIELD_HINTS } from "../novelBasicInfo.shared";
import { FieldLabel } from "../components/basicInfoForm/BasicInfoFormPrimitives";
import SelectControl from "@/components/common/SelectControl";

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
          <div className="text-2xl font-semibold tracking-normal text-foreground">{t("gen.pages.novels.autoDirector.StageWorldStyle.gen_bb01d91e")}</div>
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
          <FieldLabel htmlFor="director-basic-world" hint={BASIC_INFO_FIELD_HINTS.worldId}>{t("gen.pages.novels.autoDirector.StageWorldStyle.gen_5a3a4ea8")}</FieldLabel>
          <SelectControl
            id="director-basic-world"
            className={controlClassName}
            value={basicForm.worldId}
            onChange={(event) => onBasicFormChange({ worldId: event.target.value })}
          >
            <option value="">{t("gen.pages.novels.autoDirector.StageWorldStyle.noReferenceWorld")}</option>
            {worldOptions.length === 0 ? (
              <option value="" disabled>{t("gen.pages.novels.autoDirector.StageWorldStyle.gen_67385cd4")}</option>
            ) : null}
            {worldOptions.map((world) => (
              <option key={world.id} value={world.id}>{world.name}</option>
            ))}
          </SelectControl>
          <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {worldOptions.length > 0
              ? t("gen.pages.novels.autoDirector.StageWorldStyle.gen_50639e05")
              : t("gen.pages.novels.autoDirector.StageWorldStyle.gen_547de6b1")}
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.autoDirector.StageWorldStyle.gen_2c26f042")}</div>
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
                <div className="text-sm font-medium">{t("gen.pages.novels.autoDirector.StageWorldStyle.gen_a92d7dbb")}</div>
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
                <div className="text-sm font-medium">{t("gen.pages.novels.autoDirector.StageWorldStyle.gen_5dcc48bb")}</div>
                <div className={`mt-2 text-xs leading-5 ${worldSetupMode === "skip" ? "text-background/70" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  适合现实题材、轻设定项目，角色和章节会主要依据书级规划推进。
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-style-profile" hint={t("gen.pages.novels.autoDirector.StageWorldStyle.gen_83e458ed")}>
            书级默认写法
          </FieldLabel>
          <SelectControl
            id="director-basic-style-profile"
            className={controlClassName}
            value={selectedStyleProfileId}
            onChange={(event) => onStyleProfileChange(event.target.value)}
          >
            <option value="">{t("gen.pages.novels.autoDirector.StageWorldStyle.gen_ac566b27")}</option>
            {styleProfileOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </SelectControl>
          <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {selectedStyleSummary?.stageSummaryLines[0] ?? t("gen.pages.novels.autoDirector.StageWorldStyle.gen_6edb32ca")}
          </div>
          {selectedStyleSummary?.stageSummaryLines.length ? (
            <div className={`pt-1 text-xs leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              这套写法会影响后续章节的语气和节奏：{selectedStyleSummary.stageSummaryLines.join("；")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>{t("gen.pages.novels.autoDirector.StageWorldStyle.gen_995130f1")}</Button>
        <Button type="button" onClick={onConfirm}>{t("gen.pages.novels.autoDirector.StageWorldStyle.gen_53eb83ee")}</Button>
      </div>
    </section>
  );
}
