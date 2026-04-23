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
    label: "保留",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  weaken: {
    label: "弱化",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  remove: {
    label: "剥离",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const RULE_PATCH_SECTION_LABELS: Record<keyof StyleRulePatch, string> = {
  narrativeRules: "剧情推进",
  characterRules: "人物表达",
  languageRules: "语言质感",
  rhythmRules: "节奏密度",
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
          <CardTitle>编辑当前写法</CardTitle>
          {selectedProfile ? (
            <Button size="sm" variant="destructive" onClick={onDelete} disabled={deletePending}>
              删除
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!selectedProfile ? (
          <div className="text-sm text-muted-foreground">请先回到写法页列表，选中一套写法后再进入这里编辑。</div>
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
                <div className="text-base font-semibold text-slate-950">基础定位</div>
                <div className="text-sm leading-6 text-slate-500">
                  先把这套写法到底想写成什么感觉讲清楚，列表页展开时也会优先展示这里的内容。
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label="写法名称" hint="这是你以后在列表里识别这套写法的主标题，尽量写出题材或读感。">
                  <input
                    data-writing-formula-primary-input
                    className="w-full rounded-md border p-2 text-sm"
                    value={editor.name}
                    onChange={(event) => onEditorChange({ name: event.target.value })}
                  />
                </FieldBlock>
                <FieldBlock label="分类" hint="用于给自己归档，比如都市、玄幻、言情、热血快推流。">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="例如：都市热血"
                    value={editor.category}
                    onChange={(event) => onEditorChange({ category: event.target.value })}
                  />
                </FieldBlock>
              </div>

              <FieldBlock
                label="一句话简介"
                hint="用一句完整的话说明这套写法要产生什么读感、推进感或人物表达气质。"
              >
                <textarea
                  className="min-h-[96px] w-full rounded-md border p-2 text-sm"
                  placeholder="例如：冲突密集、推进快、对白直接、情绪外显，适合都市升级文。"
                  value={editor.description}
                  onChange={(event) => onEditorChange({ description: event.target.value })}
                />
              </FieldBlock>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label="标签" hint="给自己做检索用，写几个短词即可，逗号分隔。">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="例如：爽文, 快节奏, 强冲突"
                    value={editor.tags}
                    onChange={(event) => onEditorChange({ tags: event.target.value })}
                  />
                </FieldBlock>
                <FieldBlock label="适用题材" hint="告诉系统这套写法更适合什么题材或场景，逗号分隔。">
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder="例如：都市, 热血, 升级流"
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
                  <div className="text-base font-semibold text-slate-950">原文依据与提取特征</div>
                  <div className="text-sm leading-6 text-slate-500">
                    这部分是这套写法的“证据层”。从文本或知识库原文提取出来的写法，后续回看和重提取都会依赖这里。
                    这里会把特征说明、证据、分数、预设建议和推荐规则一起展示出来。
                  </div>
                </div>

                <FieldBlock
                  label="原文样本"
                  hint="这里保存提取这套写法时参考过的文本。样本越完整，系统越容易提取到稳定特征。"
                >
                  <textarea
                    className="min-h-[160px] w-full rounded-md border p-2 text-sm"
                    placeholder="这套写法资产提取时使用的原文样本"
                    value={editor.sourceContent}
                    onChange={(event) => onEditorChange({ sourceContent: event.target.value })}
                  />
                </FieldBlock>

                <div className="rounded-2xl border p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">提取特征启用</div>
                      <div className="text-xs leading-6 text-slate-500">
                        这里会列出原文里抽出来的风格特征。勾选表示继续保留到这套写法里。
                        {editor.extractedFeatures.length > 0 ? ` 当前共 ${editor.extractedFeatures.length} 项。` : ""}
                      </div>
                    </div>
                    {editor.sourceContent.trim() ? (
                      <Button size="sm" variant="outline" onClick={onReextractFeatures} disabled={reextractPending}>
                        {reextractPending ? "重提取中..." : "重新提取特征"}
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
                            <span className="mt-1 block text-xs leading-6 text-muted-foreground">证据：{feature.evidence}</span>
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
                            <div className="text-sm font-medium text-slate-900">提取预设建议</div>
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
                            <div className="text-sm font-medium text-slate-900">模型建议的反 AI 规则</div>
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
                                  {isBound ? " · 已绑定" : matchedRule ? " · 推荐未绑定" : " · 原始建议"}
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
                <div className="text-base font-semibold text-slate-950">给系统看的分析草稿</div>
                <div className="text-sm leading-6 text-slate-500">
                  这里不是给读者看的文案，而是给你自己和系统回看时用的补充说明。可以写为什么保留这套写法、它最重要的气质是什么。
                </div>
              </div>
              <textarea
                className="min-h-[110px] w-full rounded-md border p-2 text-sm"
                placeholder="例如：这套写法重点保留强推进和直给对白，不追求细腻抒情。"
                value={editor.analysisMarkdown}
                onChange={(event) => onEditorChange({ analysisMarkdown: event.target.value })}
              />
            </div>

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">高级规则块</div>
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
                  title="剧情推进规则"
                  hint="控制剧情怎么推进、场景怎么收束、是否多视角、是否允许回钩。"
                  section="narrativeRules"
                  value={editor.narrativeRules}
                  onChange={(value) => onEditorChange({ narrativeRules: value })}
                />
                <RuleFieldCard
                  title="人物表达规则"
                  hint="控制人物怎么说话、情绪怎么外露、是否倾向自省、是否优先保住体面。"
                  section="characterRules"
                  value={editor.characterRules}
                  onChange={(value) => onEditorChange({ characterRules: value })}
                />
                <RuleFieldCard
                  title="语言质感规则"
                  hint="控制句子粗粝度、口语程度、句式变化、是否允许不完整句。"
                  section="languageRules"
                  value={editor.languageRules}
                  onChange={(value) => onEditorChange({ languageRules: value })}
                />
                <RuleFieldCard
                  title="节奏密度规则"
                  hint="控制推进快慢、段落密度、动作和解释谁更优先。"
                  section="rhythmRules"
                  value={editor.rhythmRules}
                  onChange={(value) => onEditorChange({ rhythmRules: value })}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="text-base font-semibold text-slate-950">绑定反 AI 规则</div>
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
