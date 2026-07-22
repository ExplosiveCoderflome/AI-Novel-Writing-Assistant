import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { FormEvent } from "react";
import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RuleFormState } from "../antiAiRulesPage.shared";
import AntiAiToggleLine from "./AntiAiToggleLine";

interface AntiAiRuleDialogProps {
  open: boolean;
  editingRule: AntiAiRule | null;
  form: RuleFormState;
  aiInstruction: string;
  isSaving: boolean;
  isAiDrafting: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (patch: Partial<RuleFormState>) => void;
  onAiInstructionChange: (value: string) => void;
  onGenerateDraft: () => void;
  onSubmit: (event: FormEvent) => void;
}

export default function AntiAiRuleDialog(props: AntiAiRuleDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent
        className="max-w-4xl"
        title={props.editingRule ? t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_31e25b48") : t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_be1f2431")}
        description={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_8258f53a")}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button>
            <Button type="submit" form="anti-ai-rule-form" disabled={props.isSaving}>
              {props.isSaving ? t("gen.pages.antiAiRules.components.AntiAiRuleDialog.savingInProgressDotDotDot") : t("gen.pages.antiAiRules.components.AntiAiRuleDialog.saveRules")}
            </Button>
          </>
        )}
      >
        <form id="anti-ai-rule-form" className="space-y-4" onSubmit={props.onSubmit}>
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4" />
                  AI 辅助
                </div>
                <div className="text-sm leading-6 text-muted-foreground">
                  {props.editingRule
                    ? t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_961eb478")
                    : t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_c9f1f2c9")}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={!props.aiInstruction.trim() || props.isAiDrafting}
                onClick={props.onGenerateDraft}
              >
                <Sparkles className="h-4 w-4" />
                {props.isAiDrafting ? t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_4d020ba3") : props.editingRule ? t("gen.pages.antiAiRules.components.AntiAiRuleDialog.aiOptimizationDraft") : t("gen.pages.antiAiRules.components.AntiAiRuleDialog.aiGenerateDraft")}
              </Button>
            </div>
            <textarea
              className="mt-3 min-h-[84px] w-full rounded-md border bg-background p-3 text-sm"
              value={props.aiInstruction}
              placeholder={props.editingRule
                ? t("gen.pages.antiAiRules.components.AntiAiRuleDialog.exampleAdjustRuleToSuppressSummarizingVibeButNotMisleadPsychologicalDescription")
                : t("gen.pages.antiAiRules.components.AntiAiRuleDialog.exampleReduceBlankVagueSummarizeExplainCharacterPsychologyModelReview")}
              onChange={(event) => props.onAiInstructionChange(event.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_f855c922")}</span>
              <Input
                value={props.form.key}
                placeholder={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.exampleDirectPsychologyExplain")}
                onChange={(event) => props.onFormChange({ key: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_87080256")}</span>
              <Input
                value={props.form.name}
                placeholder={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.exampleAvoidDirectPsyInterpretation")}
                onChange={(event) => props.onFormChange({ name: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_36582565")}</span>
              <Select value={props.form.type} onValueChange={(value) => props.onFormChange({ type: value as AntiAiRule["type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="forbidden">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_710ad08b")}</SelectItem>
                  <SelectItem value="risk">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_57846ffb")}</SelectItem>
                  <SelectItem value="encourage">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_cc092436")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.severityLevel")}</span>
              <Select value={props.form.severity} onValueChange={(value) => props.onFormChange({ severity: value as AntiAiRule["severity"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.low")}</SelectItem>
                  <SelectItem value="medium">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.mid")}</SelectItem>
                  <SelectItem value="high">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_4296d7d2")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_f411d0f1")}</span>
            <textarea
              className="min-h-[76px] w-full rounded-md border bg-background p-3 text-sm"
              value={props.form.description}
              placeholder={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_b7cebb44")}
              onChange={(event) => props.onFormChange({ description: event.target.value })}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_dc741ace")}</span>
            <textarea
              className="min-h-[80px] w-full rounded-md border bg-background p-3 text-sm"
              value={props.form.detectPatternsText}
              placeholder={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_700aeab4")}
              onChange={(event) => props.onFormChange({ detectPatternsText: event.target.value })}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_eba49f80")}</span>
              <textarea
                className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                value={props.form.promptInstruction}
                placeholder={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_2362168e")}
                onChange={(event) => props.onFormChange({ promptInstruction: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_fbbf1096")}</span>
              <textarea
                className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                value={props.form.rewriteSuggestion}
                placeholder={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_66880d7e")}
                onChange={(event) => props.onFormChange({ rewriteSuggestion: event.target.value })}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <AntiAiToggleLine
              label={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_fd2ea09f")}
              checked={props.form.enabled}
              onCheckedChange={(checked) => props.onFormChange({ enabled: checked })}
            />
            <AntiAiToggleLine
              label={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_6b8fb610")}
              checked={props.form.globalBaselineEnabled}
              onCheckedChange={(checked) => props.onFormChange({ globalBaselineEnabled: checked })}
            />
            <AntiAiToggleLine
              label={t("gen.pages.antiAiRules.components.AntiAiRuleDialog.gen_906a7d88")}
              checked={props.form.autoRewrite}
              onCheckedChange={(checked) => props.onFormChange({ autoRewrite: checked })}
            />
          </div>
        </form>
      </AppDialogContent>
    </Dialog>
  );
}
