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
          <div className="text-2xl font-semibold tracking-normal text-foreground">Give the story a world background</div>
          <div className={`mt-2 max-w-2xl text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            You can select a world sample for the AI ​​to refer to, or you can let it automatically organize the world in this book based on your starting ideas. The writing method will serve as the default tone for subsequent planning and text.
                                </div>
        </div>
        <div className="rounded-full bg-muted/55 px-3 py-1 text-xs text-muted-foreground"> Keep the default settings</div> </div> <div className="space-y-5">
        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-world" hint={BASIC_INFO_FIELD_HINTS.worldId}>Planning Reference World Sample</FieldLabel>
          <SelectControl
            id="director-basic-world"
            className={controlClassName}
            value={basicForm.worldId}
            onChange={(event) => onBasicFormChange({ worldId: event.target.value })}
          >
            <option value="">Do not specify a reference world</option> {worldOptions.length === 0 ? ( <option value="" disabled>There are currently no world samples to choose from.</option>
            ) : null}
            {worldOptions.map((world) => (
              <option key={world.id} value={world.id}>{world.name}</option>
            ))}
          </SelectControl>
          <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {worldOptions.length > 0
              ? "This is just a quick reference for Auto Director. Please complete the complete import, generation and synchronization in the \"Book World\" on the novel page."
              : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="text-sm font-medium text-foreground">Book World Processing</div>
          {selectedWorld ? (
            <div className={`text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              The automatic director will refer to "{selectedWorld.name}” sample world and organize the world constraints that can be used in this book before character preparation.
                                      </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-lg px-4 py-4 text-left transition ring-1 ${
                  worldSetupMode === "auto_generate"
                    ? "bg-foreground text-background ring-foreground shadow-sm"
                    : "bg-background/60 text-foreground ring-border/25 hover:bg-background"
                }`} onClick={() => onWorldSetupModeChange("auto_generate")} > <div className="text-sm font-medium">Generate the world of this book based on the macro plan</div> <div className={`mt-2 text-xs leading-5 ${worldSetupMode === "auto_generate" ? "text-background/70" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  Suitable for fantasy, fantasy, science fiction, suspense and other projects that require the support of world rules.
                                                      </div>
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-4 text-left transition ring-1 ${
                  worldSetupMode === "skip"
                    ? "bg-foreground text-background ring-foreground shadow-sm"
                    : "bg-background/60 text-foreground ring-border/25 hover:bg-background"
                }`} onClick={() => onWorldSetupModeChange("skip")} > <div className="text-sm font-medium">Do not use world view for now</div> <div className={`mt-2 text-xs leading-5 ${worldSetupMode === "skip" ? "text-background/70" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  Suitable for realistic themes and light setting projects, characters and chapters will be mainly developed based on book-level planning.
                                                      </div>
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="director-basic-style-profile" hint="Optional. After selection, the director will only read the lightweight writing summary in the first half, and continue to use the full writing rules in the main text stage.">
            Book level default writing method
                                </FieldLabel>
          <SelectControl
            id="director-basic-style-profile"
            className={controlClassName}
            value={selectedStyleProfileId}
            onChange={(event) => onStyleProfileChange(event.target.value)}
          >
            <option value="">First use only style keywords</option>
            {styleProfileOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </SelectControl>
          <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {selectedStyleSummary?.stageSummaryLines[0] ?? "When you have good writing assets, it is recommended to choose a set directly to help you more clearly anticipate how the director will write."}
          </div>
          {selectedStyleSummary?.stageSummaryLines.length ? (
            <div className={`pt-1 text-xs leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              This way of writing will affect the tone and rhythm of subsequent chapters:{selectedStyleSummary.stageSummaryLines.join("；")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>Return to initial settings</Button>
        <Button type="button" onClick={onConfirm}>Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</Button>
      </div>
    </section>
  );
}
