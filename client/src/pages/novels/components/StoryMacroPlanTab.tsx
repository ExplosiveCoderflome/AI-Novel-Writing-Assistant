import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { StoryConflictLayers, StoryMacroField } from "@ai-novel/shared/types/storyMacro";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StoryMacroTabProps } from "./NovelEditView.types";
import {
  ENGINE_TEXT_FIELDS,
  FieldActions,
  listToText,
  SUMMARY_FIELDS,
  textareaClassName,
} from "./StoryMacroPlanTab.shared";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import { DetailDisclosure, SectionBlock, StepHero } from "./workspaceShell";

const EMPTY_CONFLICT_LAYERS: StoryConflictLayers = {
  external: "",
  internal: "",
  relational: "",
};

export default function StoryMacroPlanTab(props: StoryMacroTabProps) {
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
        title={t("gen.pages.novels.components.StoryMacroPlanTab.storyMacroPlanningTakeover")}
        description={t("gen.pages.novels.components.StoryMacroPlanTab.aiCheckStoryMacroBookContract")}
        entry={props.directorTakeoverEntry}
      />
      <StepHero
        title={t("gen.pages.novels.components.StoryMacroPlanTab.gen_15183ae2")}
        description={t("gen.pages.novels.components.StoryMacroPlanTab.gen_c06087a3")}
        actions={(
          <>
            <AiButton onClick={props.onDecompose} disabled={props.isDecomposing || !props.storyInput.trim()}>
              {props.isDecomposing ? t("gen.pages.novels.components.StoryMacroPlanTab.gen_4d020ba3") : props.hasPlan ? t("gen.pages.novels.components.StoryMacroPlanTab.gen_b2429c04") : t("gen.pages.novels.components.StoryMacroPlanTab.gen_486311df")}
            </AiButton>
            <AiButton
              variant="secondary"
              onClick={props.onBuildConstraintEngine}
              disabled={props.isBuilding || !props.decomposition.selling_point.trim()}
            >
              {props.isBuilding ? t("gen.pages.novels.components.StoryMacroPlanTab.gen_90059e73") : t("gen.pages.novels.components.StoryMacroPlanTab.gen_66cdbb1d")}
            </AiButton>
            <Button variant="outline" onClick={props.onSaveEdits} disabled={props.isSaving}>
              {props.isSaving ? t("gen.pages.novels.components.StoryMacroPlanTab.savingInProgressDotDotDot") : t("gen.pages.novels.components.StoryMacroPlanTab.saveChanges")}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_270e2ebb")}</div>
            <textarea
              value={props.storyInput}
              onChange={(event) => props.onStoryInputChange(event.target.value)}
              placeholder={t("gen.pages.novels.components.StoryMacroPlanTab.gen_4620ef74")}
              className={textareaClassName("min-h-36")}
            />
          </div>
          {props.message ? (
            <div className="rounded-xl bg-background/70 px-3 py-2 text-sm text-muted-foreground">
              {props.message}
            </div>
          ) : null}
        </div>
      </StepHero>

      <SectionBlock
        title={t("gen.pages.novels.components.StoryMacroPlanTab.gen_e2255e38")}
        description={t("gen.pages.novels.components.StoryMacroPlanTab.gen_0fb2659a")}
        contentClassName="grid gap-4 xl:grid-cols-2"
      >
          {SUMMARY_FIELDS.map((item) => {
            const value = props.decomposition[item.field as keyof typeof props.decomposition];
            return (
              <div key={item.field} className="space-y-2 rounded-xl bg-muted/15 p-4">
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

          <div className="space-y-2 rounded-xl bg-muted/15 p-4 xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_c681f960")}</div>
              <FieldActions
                field="major_payoffs"
                lockedFields={props.lockedFields}
                regeneratingField={props.regeneratingField}
                storyInput={props.storyInput}
                onToggleLock={props.onToggleLock}
                onRegenerateField={props.onRegenerateField}
              />
            </div>
            <textarea
              value={listToText(props.decomposition.major_payoffs)}
              onChange={(event) => props.onFieldChange(
                "major_payoffs",
                event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
              )}
              placeholder={t("gen.pages.novels.components.StoryMacroPlanTab.gen_a1741ac4")}
              className={textareaClassName("min-h-32")}
            />
          </div>
      </SectionBlock>

      <DetailDisclosure
        title={t("gen.pages.novels.components.StoryMacroPlanTab.gen_b671e9dd")}
        description={t("gen.pages.novels.components.StoryMacroPlanTab.gen_4b6001d6")}
      >
        <div className="space-y-4">
          {props.expansion ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("gen.pages.novels.components.StoryMacroPlanTab.gen_e9965e52")}</CardTitle>
                <CardDescription>
                  这里定义故事为什么能一直写下去：主角如何被困、冲突怎样升级、未知如何驱动读者继续读。
                </CardDescription>
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
                    <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_41c8c763")}</div>
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
                      <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_e659841d")}</div>
                      <textarea
                        value={expansion.conflict_layers.external}
                        onChange={(event) => props.onFieldChange("conflict_layers", {
                          ...expansion.conflict_layers,
                          external: event.target.value,
                        })}
                        placeholder={t("gen.pages.novels.components.StoryMacroPlanTab.gen_c8dfa619")}
                        className={textareaClassName("min-h-24")}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_adf6166e")}</div>
                      <textarea
                        value={expansion.conflict_layers.internal}
                        onChange={(event) => props.onFieldChange("conflict_layers", {
                          ...expansion.conflict_layers,
                          internal: event.target.value,
                        })}
                        placeholder={t("gen.pages.novels.components.StoryMacroPlanTab.mainCharacterSelfHate")}
                        className={textareaClassName("min-h-24")}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_500ced8e")}</div>
                      <textarea
                        value={expansion.conflict_layers.relational}
                        onChange={(event) => props.onFieldChange("conflict_layers", {
                          ...expansion.conflict_layers,
                          relational: event.target.value,
                        })}
                        placeholder={t("gen.pages.novels.components.StoryMacroPlanTab.gen_b74602f1")}
                        className={textareaClassName("min-h-24")}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_454c39a8")}</div>
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
                    placeholder={t("gen.pages.novels.components.StoryMacroPlanTab.gen_287e1f5f")}
                    className={textareaClassName("min-h-32")}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {props.issues.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("gen.pages.novels.components.StoryMacroPlanTab.gen_bd607833")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {props.issues.map((issue, index) => (
                  <div key={`${issue.type}-${issue.field}-${index}`} className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <div className="font-medium">{t("gen.pages.novels.components.StoryMacroPlanTab.issueTypeText")}</div>
                    <div className="mt-1">{issue.message}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("gen.pages.novels.components.StoryMacroPlanTab.gen_a75820ba")}</CardTitle>
              <CardDescription>
                这里的规则会作为后续生成的硬边界，防止故事在下游被写散。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_99d0017d")}</div>
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
                placeholder={t("gen.pages.novels.components.StoryMacroPlanTab.gen_bf11131a")}
                className={textareaClassName("min-h-36")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("gen.pages.novels.components.StoryMacroPlanTab.gen_1a452679")}</CardTitle>
              <CardDescription>
                当前保存的是后续角色、主线、章节规划可以直接消费的规则源。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {props.constraintEngine ? (
                <>
                  <div className="space-y-2 rounded-xl border border-border/70 p-4">
                    <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_c9de405e")}</div>
                    <div className="text-sm leading-7 text-muted-foreground">{props.constraintEngine.premise}</div>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_6f4a9bfe")}</div>
                      <div className="text-sm text-muted-foreground">{props.constraintEngine.mystery_box}</div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_bd942d84")}</div>
                      <div className="text-sm text-muted-foreground">{props.constraintEngine.conflict_axis}</div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_b3bbd74d")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.pressure_roles.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_3a9239f3")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.growth_path.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_db9f69aa")}</div>
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
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_af9d92f1")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.hard_constraints.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4 xl:col-span-2">
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_4c5dfdf5")}</div>
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
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_54a58752")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.ending_constraints.must_have.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-4">
                      <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_15d16c90")}</div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {props.constraintEngine.ending_constraints.must_not_have.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                  还没有约束引擎。先完成故事引擎拆解，再点击“构建约束引擎”。
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("gen.pages.novels.components.StoryMacroPlanTab.gen_b1356fcd")}</CardTitle>
              <CardDescription>
                保存当前阶段和主角处境，方便后续章节推进时复用。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[160px_160px_minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_ea328dc7")}</div>
                <Input
                  type="number"
                  value={props.state.currentPhase}
                  onChange={(event) => props.onStateChange("currentPhase", Number(event.target.value))}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.gen_c7bff79d")}</div>
                <Input
                  type="number"
                  value={props.state.progress}
                  onChange={(event) => props.onStateChange("progress", Number(event.target.value))}
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StoryMacroPlanTab.currentCharacterSituation")}</div>
                <Input
                  value={props.state.protagonistState}
                  onChange={(event) => props.onStateChange("protagonistState", event.target.value)}
                  placeholder={t("gen.pages.novels.components.StoryMacroPlanTab.exampleStillDenyTruthCannotExit")}
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={props.onSaveState} disabled={props.isSavingState}>
                  {props.isSavingState ? t("gen.pages.novels.components.StoryMacroPlanTab.savingInProgressDotDotDot") : t("gen.pages.novels.components.StoryMacroPlanTab.saveStatus")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DetailDisclosure>
    </div>
  );
}
