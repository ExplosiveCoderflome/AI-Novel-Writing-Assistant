import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
    label: t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.preserve"),
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  weaken: {
    label: t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_e235157f"),
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  remove: {
    label: t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_9b012c13"),
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const RULE_PATCH_SECTION_LABELS: Record<keyof StyleRulePatch, string> = {
  narrativeRules: t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_95553c6d"),
  characterRules: t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.characterExpression"),
  languageRules: t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_98416f13"),
  rhythmRules: t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_3c7541b8"),
};

function formatScorePercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function countPresetDecisions(
  preset: StyleExtractionPreset,
): Record<NonNullable<StyleProfileFeature["selectedDecision"]>, number> {
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
          这块规则当前还没有可读字段。你可以先依赖上面的简介和反 AI 规则，确实需要精细兼容时再展开高级 JSON。
        </div>
      )}

      <details className="rounded-xl border bg-white">
        <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-slate-700">
          查看或编辑高级 JSON
        </summary>
        <div className="space-y-3 border-t px-3 py-3">
          <div className="text-xs leading-6 text-slate-500">
            这里保留原始 JSON 入口，主要用于兼容旧资产或做精细调参。常规情况下先看上面的可读字段即可。
          </div>
          {parseError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
              当前 JSON 结构无法正常识别。保存时系统会尽量回退为空对象，建议先修正格式再保存。
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
          <CardTitle>{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_94a3c6e8")}</CardTitle>
          {selectedProfile ? (
            <Button size="sm" variant="destructive" onClick={onDelete} disabled={deletePending}>
              删除
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!selectedProfile ? (
          <div className="text-sm text-muted-foreground">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_f6fb452c")}</div>
        ) : (
          <>
            {isStarterStyleProfile(selectedProfile) ? (
              <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm leading-7 text-muted-foreground">
                这是系统预置给你的起步写法。可以直接按自己的项目修改，不需要先复制一份再编辑。
              </div>
            ) : null}

            <div className="rounded-2xl border bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-700">
              如果你不想一上来就面对一堆技术字段，先维护这四块最重要：写法名称、简介、适用题材、反 AI 规则。
              下面四组高级规则是给系统更精细的控制层，不熟悉时可以先少动。
            </div>

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_983dbea1")}</div>
                <div className="text-sm leading-6 text-slate-500">
                  先把这套写法到底想写成什么感觉讲清楚，列表页展开时也会优先展示这里的内容。
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_a5d0edd4")} hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_ae722c6b")}>
                  <input
                    data-writing-formula-primary-input
                    className="w-full rounded-md border p-2 text-sm"
                    value={editor.name}
                    onChange={(event) => onEditorChange({ name: event.target.value })}
                  />
                </FieldBlock>
                <FieldBlock label={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_d0771a42")} hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_34a9dd9c")}>
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_例如都市热血_5rom")}
                    value={editor.category}
                    onChange={(event) => onEditorChange({ category: event.target.value })}
                  />
                </FieldBlock>
              </div>

              <FieldBlock
                label={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.oneLineIntro")}
                hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_ca589769")}
              >
                <textarea
                  className="min-h-[96px] w-full rounded-md border p-2 text-sm"
                  placeholder={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.exampleConflictsIntenseProgressiveDirectDialogueEmotionUrbanUpgrade")}
                  value={editor.description}
                  onChange={(event) => onEditorChange({ description: event.target.value })}
                />
              </FieldBlock>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_14d34236")} hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_e4fc65e3")}>
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.exampleLightReadFastRhythmStrongConflict")}
                    value={editor.tags}
                    onChange={(event) => onEditorChange({ tags: event.target.value })}
                  />
                </FieldBlock>
                <FieldBlock label={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_2fdc5592")} hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_ce4e9b7d")}>
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.exampleUrbanHeatUpgradeFlow")}
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
                  <div className="text-base font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_7f63b649")}</div>
                  <div className="text-sm leading-6 text-slate-500">
                    这部分是这套写法的“证据层”。从文本或知识库原文提取出来的写法，后续回看和重提取都会依赖这里。
                    这里会把特征说明、证据、分数、预设建议和推荐规则一起展示出来。
                  </div>
                </div>

                <FieldBlock
                  label={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_0e7cba99")}
                  hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_1c0b6190")}
                >
                  <textarea
                    className="min-h-[160px] w-full rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_fc48be6a")}
                    value={editor.sourceContent}
                    onChange={(event) => onEditorChange({ sourceContent: event.target.value })}
                  />
                </FieldBlock>

                <div className="rounded-2xl border p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_b62a0800")}</div>
                      <div className="text-xs leading-6 text-slate-500">
                        这里会列出原文里抽出来的风格特征。勾选表示继续保留到这套写法里。
                        {editor.extractedFeatures.length > 0 ? ` 当前共 ${editor.extractedFeatures.length} 项。` : ""}
                      </div>
                    </div>
                    {editor.sourceContent.trim() ? (
                      <Button size="sm" variant="outline" onClick={onReextractFeatures} disabled={reextractPending}>
                        {reextractPending ? t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_e43aeb21") : t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_94aaf87a")}
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
                            <span className="mt-1 block text-xs leading-6 text-muted-foreground">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_c3d5aa3f")}</span>
                            <span className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                重要度 {formatScorePercent(feature.importance)}
                              </span>
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                仿写价值 {formatScorePercent(feature.imitationValue)}
                              </span>
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                迁移性 {formatScorePercent(feature.transferability)}
                              </span>
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                指纹风险 {formatScorePercent(feature.fingerprintRisk)}
                              </span>
                            </span>
                            <span className="mt-2 flex flex-wrap gap-2">
                              {listRulePatchSections(feature.keepRulePatch).length > 0 ? (
                                listRulePatchSections(feature.keepRulePatch).map((label) => (
                                  <span key={`${feature.id}-${label}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                                    {label}规则
                                  </span>
                                ))
                              ) : (
                                <span className="rounded-full border border-dashed border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                                  当前只有摘要级规则
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
                            <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_361c117b")}</div>
                            <div className="text-xs leading-6 text-slate-500">
                              这里展示模型给出的三套保留方案。当前保存到写法里的选择会单独标出来，方便你判断是不是要换一种保留力度。
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
                                        当前套用
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 text-xs leading-6 text-slate-500">{preset.summary}</div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                                      保留 {counts.keep}
                                    </span>
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                                      弱化 {counts.weaken}
                                    </span>
                                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                                      剥离 {counts.remove}
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
                            <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_280d121e")}</div>
                            <div className="text-xs leading-6 text-slate-500">
                              这些是提取阶段推荐一起绑定的规则。已绑定会直接标出来，未绑定的也会继续保留原始建议名。
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
                                  {matchedRule?.name ?? ruleKey}
                                  {isBound ? t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.isBound") : matchedRule ? t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.recommendedUnbound") : t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.originalSuggestion")}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      这条文本写法还没生成可选特征条目。可以点“重新提取特征”，重新从原文样本生成完整特征池。
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_047fe1ff")}</div>
                <div className="text-sm leading-6 text-slate-500">
                  这里不是给读者看的文案，而是给你自己和系统回看时用的补充说明。可以写为什么保留这套写法、它最重要的气质是什么。
                </div>
              </div>
              <textarea
                className="min-h-[110px] w-full rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.exampleThisStyleFocusStrongProgressDirectDialogueNotSeekSubtleExpression")}
                value={editor.analysisMarkdown}
                onChange={(event) => onEditorChange({ analysisMarkdown: event.target.value })}
              />
            </div>

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_6528dbe6")}</div>
                <div className="text-sm leading-6 text-slate-500">
                  这四块是系统真正执行时会读取的机器规则层。不了解字段含义时，可以先看标题和说明，再决定是否要改。
                  如果当前主要显示“总述”字段，说明这次提取更多给出了摘要级规则，细颗粒兼容字段还不算多。
                </div>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                兼容字段主要用于旧资产兼容和少量实验场景：{compatibilityFields}。需要稳定控制读感时，优先维护表达层摘要和反 AI 规则。
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <RuleFieldCard
                  title={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_a9e43c4c")}
                  hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_c47dc063")}
                  section="narrativeRules"
                  value={editor.narrativeRules}
                  onChange={(value) => onEditorChange({ narrativeRules: value })}
                />
                <RuleFieldCard
                  title={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.characterExpressionRules")}
                  hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_f758d715")}
                  section="characterRules"
                  value={editor.characterRules}
                  onChange={(value) => onEditorChange({ characterRules: value })}
                />
                <RuleFieldCard
                  title={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_1f9170eb")}
                  hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_4fecc854")}
                  section="languageRules"
                  value={editor.languageRules}
                  onChange={(value) => onEditorChange({ languageRules: value })}
                />
                <RuleFieldCard
                  title={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_16e6dc89")}
                  hint={t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_9930819a")}
                  section="rhythmRules"
                  value={editor.rhythmRules}
                  onChange={(value) => onEditorChange({ rhythmRules: value })}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">{t("gen.pages.writingFormula.components.WritingFormulaEditorPanel.gen_1c0d9b75")}</div>
                <div className="text-sm leading-6 text-slate-500">
                  这里决定系统在检测和修正文稿时优先防什么问题。规则绑得越清楚，“去 AI 味”越有方向感。
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
                保存后，这套写法的展开详情、去 AI 味检测和应用测试都会同步读取新设定。
              </div>
              <Button onClick={onSave} disabled={savePending || !editor.name.trim()}>
                保存当前写法
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
