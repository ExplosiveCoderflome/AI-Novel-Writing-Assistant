import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { StoryConflictLayers } from "@ai-novel/shared/types/storyMacro";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StoryMacroTabProps } from "./NovelEditView.types";
import {
  ENGINE_TEXT_FIELDS,
  FieldActions,
  listToText,
  textareaClassName,
} from "./StoryMacroPlanTab.shared";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import { DetailDisclosure } from "./workspaceShell";
import StoryEngineStudio from "./storyMacroPlan/StoryEngineStudio";

const EMPTY_CONFLICT_LAYERS: StoryConflictLayers = {
  external: "",
  internal: "",
  relational: "",
};

export default function StoryMacroPlanTab(props: StoryMacroTabProps) {
  const { t } = useTranslation();
  const expansion = props.expansion ?? {
    expanded_premise: "",
    protagonist_core: "",
    conflict_engine: "",
    conflict_layers: EMPTY_CONFLICT_LAYERS,
    mystery_box: "",
    emotional_line: "",
    setpiece_seeds: [],
    tone_reference: "",
  };

  return (
    <div className="space-y-4">
      <DirectorTakeoverEntryPanel
        title={i18next.t("dict.storyMacroPlanningTakeover")}
        description={i18next.t("dict.aiCheckStoryMacroBookContract")}
        entry={props.directorTakeoverEntry}
      />
      <StoryEngineStudio tab={props} />

      <DetailDisclosure
        title={i18next.t("dict.gen_b671e9dd")}
        description={i18next.t("dict.gen_4b6001d6")}
      >
        <div className="space-y-4">
          {props.expansion ? (
            <Card>
              <CardHeader>
                <CardTitle>{i18next.t("dict.gen_e9965e52")}</CardTitle>
                <CardDescription>{i18next.t("novels.storyMacroPlanTab.k0p1cr")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  {ENGINE_TEXT_FIELDS.map((item) => {
                    const value = expansion[item.field as keyof typeof expansion];
                    return (
                      <div key={item.field} className="space-y-2 rounded-xl border border-border/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-medium text-foreground">{item.label}</div>
                          <FieldActions
                            field={item.field}
                            lockedFields={props.lockedFields}
                            regeneratingField={props.regeneratingField}
                            storyInput={props.storyInput}
                            onToggleLock={props.onToggleLock}
                            onRegenerateField={props.onRegenerateField}
                          />
                        </div>
                        {item.multiline ? (
                          <textarea
                            value={typeof value === "string" ? value : ""}
                            onChange={(event) => props.onFieldChange(item.field, event.target.value)}
                            placeholder={item.placeholder}
                            className={textareaClassName()}
                          />
                        ) : (
                          <Input
                            value={typeof value === "string" ? value : ""}
                            onChange={(event) => props.onFieldChange(item.field, event.target.value)}
                            placeholder={item.placeholder}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2 rounded-xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_41c8c763")}</div>
                    <FieldActions
                      field="conflict_layers"
                      lockedFields={props.lockedFields}
                      regeneratingField={props.regeneratingField}
                      storyInput={props.storyInput}
                      onToggleLock={props.onToggleLock}
                      onRegenerateField={props.onRegenerateField}
                    />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_e659841d")}</div>
                      <textarea
                        value={expansion.conflict_layers.external}
                        onChange={(event) => props.onFieldChange("conflict_layers", {
                          ...expansion.conflict_layers,
                          external: event.target.value,
                        })}
                        placeholder={i18next.t("dict.gen_c8dfa619")}
                        className={textareaClassName("min-h-24")}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_adf6166e")}</div>
                      <textarea
                        value={expansion.conflict_layers.internal}
                        onChange={(event) => props.onFieldChange("conflict_layers", {
                          ...expansion.conflict_layers,
                          internal: event.target.value,
                        })}
                        placeholder={i18next.t("dict.mainCharacterSelfHate")}
                        className={textareaClassName("min-h-24")}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_500ced8e")}</div>
                      <textarea
                        value={expansion.conflict_layers.relational}
                        onChange={(event) => props.onFieldChange("conflict_layers", {
                          ...expansion.conflict_layers,
                          relational: event.target.value,
                        })}
                        placeholder={i18next.t("dict.gen_b74602f1")}
                        className={textareaClassName("min-h-24")}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_454c39a8")}</div>
                    <FieldActions
                      field="setpiece_seeds"
                      lockedFields={props.lockedFields}
                      regeneratingField={props.regeneratingField}
                      storyInput={props.storyInput}
                      onToggleLock={props.onToggleLock}
                      onRegenerateField={props.onRegenerateField}
                    />
                  </div>
                  <textarea
                    value={listToText(expansion.setpiece_seeds)}
                    onChange={(event) => props.onFieldChange(
                      "setpiece_seeds",
                      event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
                    )}
                    placeholder={i18next.t("dict.gen_287e1f5f")}
                    className={textareaClassName("min-h-32")}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {props.issues.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{i18next.t("dict.gen_bd607833")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {props.issues.map((issue, index) => (
                  <div key={`${issue.type}-${issue.field}-${index}`} className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <div className="font-medium">{issue.type === "conflict" ? "输入冲突" : "信息不足"}</div>
                    <div className="mt-1">{issue.message}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{i18next.t("dict.gen_a75820ba")}</CardTitle>
              <CardDescription>{i18next.t("novels.storyMacroPlanTab.3leb2b")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_99d0017d")}</div>
                <FieldActions
                  field="constraints"
                  lockedFields={props.lockedFields}
                  regeneratingField={props.regeneratingField}
                  storyInput={props.storyInput}
                  onToggleLock={props.onToggleLock}
                  onRegenerateField={props.onRegenerateField}
                />
              </div>
              <textarea
                value={listToText(props.constraints)}
                onChange={(event) => props.onFieldChange(
                  "constraints",
                  event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
                )}
                placeholder={i18next.t("dict.gen_bf11131a")}
                className={textareaClassName("min-h-36")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{i18next.t("dict.gen_1a452679")}</CardTitle>
              <CardDescription>{i18next.t("novels.storyMacroPlanTab.rcmxm0")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {props.constraintEngine ? (
                <>
                  <div className="space-y-2 rounded-xl border border-border/70 p-4">
                    <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_c9de405e")}</div>
                    <div className="text-sm leading-7 text-muted-foreground">{props.constraintEngine.premise}</div>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_6f4a9bfe")}</div>
                      <div className="text-sm text-muted-foreground">{props.constraintEngine.mystery_box}</div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_bd942d84")}</div>
                      <div className="text-sm text-muted-foreground">{props.constraintEngine.conflict_axis}</div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_b3bbd74d")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.pressure_roles.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_3a9239f3")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.growth_path.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_db9f69aa")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.phase_model.map((phase) => (
                          <div key={phase.name}>
                            <span className="font-medium text-foreground">{phase.name}</span>
                            {" · "}
                            {phase.goal}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_af9d92f1")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.hard_constraints.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4 xl:col-span-2">
                      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_4c5dfdf5")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.turning_points.map((item) => (
                          <div key={`${item.phase}-${item.title}`}>
                            <span className="font-medium text-foreground">{item.phase}</span>
                            {" · "}
                            {item.summary}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_54a58752")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.ending_constraints.must_have.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_15d16c90")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.ending_constraints.must_not_have.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">{i18next.t("novels.storyMacroPlanTab.vzcnm6")}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{i18next.t("dict.gen_b1356fcd")}</CardTitle>
              <CardDescription>{i18next.t("novels.storyMacroPlanTab.qi9irt")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[160px_160px_minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_ea328dc7")}</div>
                <Input
                  type="number"
                  value={props.state.currentPhase}
                  onChange={(event) => props.onStateChange("currentPhase", Number(event.target.value))}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_c7bff79d")}</div>
                <Input
                  type="number"
                  value={props.state.progress}
                  onChange={(event) => props.onStateChange("progress", Number(event.target.value))}
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">{i18next.t("dict.currentCharacterSituation")}</div>
                <Input
                  value={props.state.protagonistState}
                  onChange={(event) => props.onStateChange("protagonistState", event.target.value)}
                  placeholder={i18next.t("dict.exampleStillDenyTruthCannotExit")}
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={props.onSaveState} disabled={props.isSavingState}>
                  {props.isSavingState ? "保存中..." : "保存状态"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DetailDisclosure>
    </div>
  );
}
