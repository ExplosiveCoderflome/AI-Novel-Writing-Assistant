import {
  STYLE_ENGINE_COMPATIBILITY_FIELDS,
  type AntiAiRule,
  type StyleExtractionPreset,
  type StyleProfile,
  type StyleProfileFeature,
  type StyleRulePatch,
} from "@ai-novel/shared/types/styleEngine";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildReadableRuleEntries, type RuleSection } from "../writingFormulaRulePresentation";
import { parseJsonInput } from "../writingFormula.utils";
import { isStarterStyleProfile } from "../writingFormulaV2.shared";

interface WritingFormulaEditorState {
  name: string;
  description: string;
  category: string;
  tags: string;
  applicableGenres: string;
  sourceContent: string;
  extractedFeatures: StyleProfileFeature[];
  analysisMarkdown: string;
  narrativeRules: string;
  characterRules: string;
  languageRules: string;
  rhythmRules: string;
  antiAiRuleIds: string[];
}

interface WritingFormulaEditorPanelProps {
  selectedProfile: StyleProfile | null;
  editor: WritingFormulaEditorState;
  antiAiRules: AntiAiRule[];
  savePending: boolean;
  deletePending: boolean;
  reextractPending: boolean;
  onEditorChange: (patch: Partial<WritingFormulaEditorState>) => void;
  onToggleExtractedFeature: (featureId: string, checked: boolean) => void;
  onReextractFeatures: () => void;
  onToggleAntiAiRule: (ruleId: string, checked: boolean) => void;
  onSave: () => void;
  onDelete: () => void;
}

function FieldBlock(props: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <div className="space-y-1">
        <div className="text-sm font-medium text-slate-900">{props.label}</div>
        <div className="text-xs leading-6 text-slate-500">{props.hint}</div>
      </div>
      {props.children}
    </label>
  );
}

const FEATURE_DECISION_META: Record<NonNullable<StyleProfileFeature["selectedDecision"]>, { label: string; className: string }> = {
  keep: {
    label: "reserve",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  weaken: {
    label: "weaken",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  remove: {
    label: "peel off",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const RULE_PATCH_SECTION_LABELS: Record<keyof StyleRulePatch, string> = { narrativeRules: "Plot progression", characterRules: "Character expression", languageRules: "Language quality", rhythmRules: "Rhythm density", }; function formatScorePercent(value: number): string { return `${Math.round(value * 100)}%`; } function countPresetDecisions( preset: StyleExtractionPreset, ): Record<NonNullable<StyleProfileFeature["selectedDecision"]>, number> {
  return preset.decisions.reduce<Record<NonNullable<StyleProfileFeature["selectedDecision"]>, number>>((result, item) => {
    result[item.decision] += 1;
    return result;
  }, {
    keep: 0,
    weaken: 0,
    remove: 0,
  });
}

function listRulePatchSections(patch: StyleRulePatch | undefined): string[] {
  if (!patch) {
    return [];
  }

  return (Object.entries(RULE_PATCH_SECTION_LABELS) as Array<[keyof StyleRulePatch, string]>)
    .filter(([key]) => {
      const section = patch[key];
      return Boolean(section && typeof section === "object" && !Array.isArray(section) && Object.keys(section).length > 0);
    })
    .map(([, label]) => label);
}

function RuleFieldCard(props: {
  title: string;
  hint: string;
  section: RuleSection;
  value: string;
  onChange: (value: string) => void;
}) {
  let parseError = false;
  let parsedRules: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(props.value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      parsedRules = parsed as Record<string, unknown>;
    } else {
      parseError = true;
    }
  } catch {
    parsedRules = parseJsonInput(props.value);
    parseError = props.value.trim() !== "" && Object.keys(parsedRules).length === 0 && props.value.trim() !== "{}";
  }

  const entries = buildReadableRuleEntries(props.section, parsedRules);

  return (
    <div className="space-y-2 rounded-2xl border bg-slate-50/70 p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-slate-900">{props.title}</div>
        <div className="text-xs leading-6 text-slate-500">{props.hint}</div>
      </div>

      {entries.length > 0 ? (
        <div className="grid gap-2">
          {entries.map((entry) => (
            <div key={`${props.section}-${entry.key}`} className="rounded-xl border bg-white px-3 py-3">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{entry.label}</div>
              <div className="mt-1 text-sm leading-6 text-slate-700">{entry.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-white px-3 py-3 text-sm leading-6 text-slate-500">
          This rule currently has no readable fields. You can rely on the above introduction and anti-AI rules first, and then expand the advanced JSON when you really need fine-grained compatibility.
                              </div>
      )}

      <details className="rounded-xl border bg-white">
        <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-slate-700">
          View or edit advanced JSON
                          </summary>
        <div className="space-y-3 border-t px-3 py-3">
          <div className="text-xs leading-6 text-slate-500">
            The original JSON entry is retained here, mainly for compatibility with old assets or fine tuning of parameters. Under normal circumstances, just look at the readable fields above.
                                </div>
          {parseError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
              The current JSON structure is not recognized properly. When saving, the system will try to return it to an empty object. It is recommended to correct the format before saving.
                                      </div>
          ) : null}
          <textarea
            className="min-h-[190px] w-full rounded-xl border bg-slate-50 p-3 font-mono text-xs"
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
          />
        </div>
      </details>
    </div>
  );
}

export default function WritingFormulaEditorPanel(props: WritingFormulaEditorPanelProps) {
  const {
    selectedProfile,
    editor,
    antiAiRules,
    savePending,
    deletePending,
    reextractPending,
    onEditorChange,
    onToggleExtractedFeature,
    onReextractFeatures,
    onToggleAntiAiRule,
    onSave,
    onDelete,
  } = props;
  const compatibilityFields = STYLE_ENGINE_COMPATIBILITY_FIELDS.narrativeRules.join(" / ");
  const extractionPresets = selectedProfile?.extractionPresets ?? [];
  const selectedPresetKey = selectedProfile?.selectedExtractionPresetKey ?? null;
  const antiAiRuleByKey = new Map(antiAiRules.map((rule) => [rule.key, rule]));

  return (
    <Card data-writing-formula-editor-panel tabIndex={-1}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Edit current writing</CardTitle>
          {selectedProfile ? (
            <Button size="sm" variant="destructive" onClick={onDelete} disabled={deletePending}>
              delete
                                      </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!selectedProfile ? (
          <div className="text-sm text-muted-foreground">Please return to the writing method page list first, select a writing method, and then enter here to edit.</div>
        ) : (
          <>
            {isStarterStyleProfile(selectedProfile) ? (
              <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm leading-7 text-muted-foreground">
                This is the starting method preset by the system for you. You can directly modify it according to your own project, without making a copy first and then editing it.
                                                </div>
            ) : null}

            <div className="rounded-2xl border bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-700">
              If you don’t want to face a bunch of technical fields right off the bat, it’s important to maintain these four areas first: writing method name, introduction, applicable subject matter, and anti-AI rules.
                                            The following four sets of advanced rules give the system a more refined control layer. If you are not familiar with it, you can do it less first.
                                          </div>

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">Basic positioning</div>
                <div className="text-sm leading-6 text-slate-500">
                  First, let’s make it clear what this writing style is like. When the list page is expanded, the content here will be displayed first.
                                                      </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label="Written name" hint="This is the main title you will use to identify this style of writing in the list in the future. Try to write down the subject matter or sense of reading.">
                  <input
                    data-writing-formula-primary-input
                    className="w-full rounded-md border p-2 text-sm"
                    value={editor.name}
                    onChange={(event) => onEditorChange({ name: event.target.value })}
                  />
                </FieldBlock>
                <FieldBlock label="Classification" hint="Used to archive yourself, such as urban, fantasy, romance, and passionate quick push streams.">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="For example: urban passion"
                    value={editor.category}
                    onChange={(event) => onEditorChange({ category: event.target.value })}
                  />
                </FieldBlock>
              </div>

              <FieldBlock
                label="One sentence introduction"
                hint="Use a complete sentence to explain the sense of reading, progression, or character expression that this writing method is intended to produce."
              >
                <textarea
                  className="min-h-[96px] w-full rounded-md border p-2 text-sm"
                  placeholder="For example: intensive conflicts, fast advancement, direct dialogue, and explicit emotions are suitable for urban upgrade stories."
                  value={editor.description}
                  onChange={(event) => onEditorChange({ description: event.target.value })}
                />
              </FieldBlock>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label="Label" hint="For your own search, just write a few short words, separated by commas.">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="For example: cool writing, fast pace, strong conflict"
                    value={editor.tags}
                    onChange={(event) => onEditorChange({ tags: event.target.value })}
                  />
                </FieldBlock>
                <FieldBlock label="Applicable themes" hint="Tell the system which themes or scenes this writing method is more suitable for, separated by commas.">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="For example: urban, passionate, upgrade flow"
                    value={editor.applicableGenres}
                    onChange={(event) => onEditorChange({ applicableGenres: event.target.value })}
                  />
                </FieldBlock>
              </div>
            </div>

            {selectedProfile.sourceType === "from_text"
            || selectedProfile.sourceType === "from_knowledge_document"
            || editor.sourceContent.trim() ? (
              <div className="space-y-4 rounded-2xl border p-4">
                <div className="space-y-1">
                  <div className="text-base font-semibold text-slate-950">Original text basis and extracted features</div>
                  <div className="text-sm leading-6 text-slate-500">
                    This part is the "evidence layer" of this writing method. The writing method extracted from the original text or knowledge base will rely on this for subsequent review and re-extraction.
                                                                  Feature descriptions, evidence, scores, preset suggestions and recommendation rules will be displayed here.
                                                                </div>
                </div>

                <FieldBlock
                  label="Original text sample"
                  hint="The text that was referenced when extracting this set of writing is saved here. The more complete the sample, the easier it is for the system to extract stable features."
                >
                  <textarea
                    className="min-h-[160px] w-full rounded-md border p-2 text-sm"
                    placeholder="The original text sample used in asset extraction for this set of writing methods"
                    value={editor.sourceContent}
                    onChange={(event) => onEditorChange({ sourceContent: event.target.value })}
                  />
                </FieldBlock>

                <div className="rounded-2xl border p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">Extract features enabled</div>
                      <div className="text-xs leading-6 text-slate-500">
                        The stylistic features extracted from the original text will be listed here. Checking the box means continuing to keep this writing method.
                                                                              {editor.extractedFeatures.length > 0 ? ` 当前共 ${editor.extractedFeatures.length} 项。` : ""}
                      </div>
                    </div>
                    {editor.sourceContent.trim() ? (
                      <Button size="sm" variant="outline" onClick={onReextractFeatures} disabled={reextractPending}>
                        {reextractPending ? "Re-extracting..." : "Re-extract features"}
                      </Button>
                    ) : null}
                  </div>

                  {editor.extractedFeatures.length > 0 ? (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                      {editor.extractedFeatures.map((feature) => (
                        <label key={feature.id} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                          <input
                            type="checkbox"
                            checked={feature.enabled}
                            onChange={(event) => onToggleExtractedFeature(feature.id, event.target.checked)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{feature.label}</span>
                              <span className="text-xs text-muted-foreground">[{feature.group}]</span>
                              {feature.selectedDecision ? (
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${FEATURE_DECISION_META[feature.selectedDecision].className}`}>
                                  {FEATURE_DECISION_META[feature.selectedDecision].label}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-xs leading-6 text-muted-foreground">{feature.description}</span>
                            <span className="mt-1 block text-xs leading-6 text-muted-foreground">evidence:{feature.evidence}</span>
                            <span className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                importance {formatScorePercent(feature.importance)}
                              </span>
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                Imitation value {formatScorePercent(feature.imitationValue)}
                              </span>
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                Mobility {formatScorePercent(feature.transferability)}
                              </span>
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                Fingerprint risk {formatScorePercent(feature.fingerprintRisk)}
                              </span>
                            </span>
                            <span className="mt-2 flex flex-wrap gap-2">
                              {listRulePatchSections(feature.keepRulePatch).length > 0 ? (
                                listRulePatchSections(feature.keepRulePatch).map((label) => (
                                  <span key={`${feature.id}-${label}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                                    {label}rule
                                                                          </span>
                                ))
                              ) : (
                                <span className="rounded-full border border-dashed border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                                  Currently there are only summary level rules
                                                                                  </span>
                              )}
                            </span>
                          </span>
                        </label>
                      ))}
                      </div>

                      {extractionPresets.length > 0 ? (
                        <div className="rounded-2xl border bg-slate-50/70 p-3">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-slate-900">Extract preset suggestions</div>
                            <div className="text-xs leading-6 text-slate-500">
                              Here are three sets of retention options given by the model. The selection currently saved in the writing method will be marked separately to facilitate you to judge whether you need to change the retention intensity.
                                                                                              </div>
                          </div>
                          <div className="mt-3 grid gap-3 lg:grid-cols-3">
                            {extractionPresets.map((preset) => {
                              const counts = countPresetDecisions(preset);
                              const isSelected = preset.key === selectedPresetKey;
                              return (
                                <div
                                  key={preset.key}
                                  className={`rounded-xl border bg-white p-3 ${isSelected ? "border-primary ring-1 ring-primary/20" : ""}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium text-slate-900">{preset.label}</div>
                                    {isSelected ? (
                                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                        Currently applied
                                                                                        </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 text-xs leading-6 text-slate-500">{preset.summary}</div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                                      reserve {counts.keep}
                                    </span>
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                                      weaken {counts.weaken}
                                    </span>
                                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                                      peel off {counts.remove}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {selectedProfile.extractionAntiAiRuleKeys.length > 0 ? (
                        <div className="rounded-2xl border bg-slate-50/70 p-3">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-slate-900">Anti-AI rules suggested by the model</div>
                            <div className="text-xs leading-6 text-slate-500">
                              These are the rules that are recommended to be bundled together during the extraction phase. Bound ones will be marked directly, and unbound ones will continue to retain their original suggested names.
                                                                                              </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedProfile.extractionAntiAiRuleKeys.map((ruleKey) => {
                              const matchedRule = antiAiRuleByKey.get(ruleKey);
                              const isBound = Boolean(matchedRule && editor.antiAiRuleIds.includes(matchedRule.id));
                              return (
                                <span
                                  key={ruleKey}
                                  className={`rounded-full border px-2 py-1 text-xs ${
                                    isBound
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-slate-200 bg-white text-slate-600"
                                  }`}
                                >
                                  {matchedRule?.name ?? ruleKey} {isBound ? "· already bound" : matchedRule ? "· recommended not bound" : "· original suggestion"}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      This text writing method has not yet generated optional feature entries. You can click "Re-extract features" to regenerate a complete feature pool from the original text sample.
                                                                          </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">Analysis draft for the system</div>
                <div className="text-sm leading-6 text-slate-500">
                  This is not a copy for readers, but a supplementary explanation for yourself and the system to use when reviewing it. You can write about why this style of writing is retained and what its most important quality is.
                                                      </div>
              </div>
              <textarea
                className="min-h-[110px] w-full rounded-md border p-2 text-sm"
                placeholder="For example: This writing style focuses on retaining strong propulsion and direct dialogue, and does not pursue delicate lyricism."
                value={editor.analysisMarkdown}
                onChange={(event) => onEditorChange({ analysisMarkdown: event.target.value })}
              />
            </div>

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">Advanced rules block</div>
                <div className="text-sm leading-6 text-slate-500">
                  These four blocks are the machine rule layer that will be read when the system is actually executed. When you don’t understand the meaning of a field, you can first read the title and description before deciding whether to change it.
                                                        If the "Overview" field is currently mainly displayed, it means that this extraction provides more summary-level rules, and there are not many fine-grained compatible fields.
                                                      </div>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                The compatibility field is mainly used for old asset compatibility and a small number of experimental scenarios:{compatibilityFields}. When stable control of reading sense is required, priority should be given to maintaining expression layer summaries and anti-AI rules.
                                                </div>

              <div className="grid gap-4 md:grid-cols-2">
                <RuleFieldCard
                  title="Plot advancement rules"
                  hint="Control how the plot advances, how the scene ends, whether there are multiple perspectives, and whether back hooks are allowed."
                  section="narrativeRules"
                  value={editor.narrativeRules}
                  onChange={(value) => onEditorChange({ narrativeRules: value })}
                />
                <RuleFieldCard
                  title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                  hint="Control how the characters speak, how their emotions are exposed, whether they are inclined to introspection, and whether they prioritize maintaining dignity."
                  section="characterRules"
                  value={editor.characterRules}
                  onChange={(value) => onEditorChange({ characterRules: value })}
                />
                <RuleFieldCard
                  title="Language texture rules"
                  hint="Control the roughness of sentences, the degree of speaking, changes in sentence structure, and whether to allow incomplete sentences."
                  section="languageRules"
                  value={editor.languageRules}
                  onChange={(value) => onEditorChange({ languageRules: value })}
                />
                <RuleFieldCard
                  title="rhythm density rules"
                  hint="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                  section="rhythmRules"
                  value={editor.rhythmRules}
                  onChange={(value) => onEditorChange({ rhythmRules: value })}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">Bind anti-AI rules</div>
                <div className="text-sm leading-6 text-slate-500">
                  This determines what problems the system will prioritize to prevent when detecting and correcting manuscripts. The clearer the rules are tied, the more sense of direction there will be in "removing the AI ​​flavor".
                                                      </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {antiAiRules.map((rule) => (
                  <label key={rule.id} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={editor.antiAiRuleIds.includes(rule.id)}
                      onChange={(event) => onToggleAntiAiRule(rule.id, event.target.checked)}
                    />
                    <span>
                      <span className="font-medium">{rule.name}</span>
                      <span className="mt-1 block text-xs leading-6 text-muted-foreground">{rule.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-slate-50/70 px-4 py-3">
              <div className="text-sm leading-6 text-slate-600">
                After saving, the expansion details, AI flavor removal detection and application testing of this writing method will all read the new settings simultaneously.
                                                </div>
              <Button onClick={onSave} disabled={savePending || !editor.name.trim()}>
                Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                                </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
