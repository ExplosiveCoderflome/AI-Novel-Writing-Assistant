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
        title={props.editingRule ? "Edit anti-AI rules" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
        description="Rules can be entered as global defaults, or they can only be used as optional constraints for writing assets."
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button>
            <Button type="submit" form="anti-ai-rule-form" disabled={props.isSaving}>
              {props.isSaving ? "Saving..." : "Saving rules"}
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
                  AI-assisted
                                                  </div>
                <div className="text-sm leading-6 text-muted-foreground">
                  {props.editingRule ? "Describes the direction to be adjusted; AI will optimize the rule based on the form content." : "Describes the expression you want to suppress or encourage; AI will generate an editable rule draft."}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={!props.aiInstruction.trim() || props.isAiDrafting}
                onClick={props.onGenerateDraft}
              >
                <Sparkles className="h-4 w-4" />
                {props.isAiDrafting ? "Generating..." : props.editingRule ? "AI Optimizing Draft" : "AI Generating Draft"}
              </Button>
            </div>
            <textarea
              className="mt-3 min-h-[84px] w-full rounded-md border bg-background p-3 text-sm"
              value={props.aiInstruction}
              placeholder={props.editingRule
                ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
              onChange={(event) => props.onAiInstructionChange(event.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Rule ID</span>
              <Input
                value={props.form.key}
                placeholder="For example direct_psychology_explain"
                onChange={(event) => props.onFormChange({ key: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Rule name</span>
              <Input
                value={props.form.name}
                placeholder="For example, avoid straightforward psychological explanations"
                onChange={(event) => props.onFormChange({ name: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Rule type</span>
              <Select value={props.form.type} onValueChange={(value) => props.onFormChange({ type: value as AntiAiRule["type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="forbidden">Disable</SelectItem>
                  <SelectItem value="risk">risk</SelectItem>
                  <SelectItem value="encourage">encourage</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Severity</span>
              <Select value={props.form.severity} onValueChange={(value) => props.onFormChange({ severity: value as AntiAiRule["severity"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">middle</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">illustrate</span>
            <textarea
              className="min-h-[76px] w-full rounded-md border bg-background p-3 text-sm"
              value={props.form.description}
              placeholder="Explain what kind of expression this rule suppresses or encourages."
              onChange={(event) => props.onFormChange({ description: event.target.value })}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Detect keywords</span>
            <textarea
              className="min-h-[80px] w-full rounded-md border bg-background p-3 text-sm"
              value={props.form.detectPatternsText}
              placeholder="One keyword per line, which can also be separated by commas."
              onChange={(event) => props.onFormChange({ detectPatternsText: event.target.value })}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Generate instructions</span>
              <textarea
                className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                value={props.form.promptInstruction}
                placeholder="Write the specific expression requirements for generating constraints into the text."
                onChange={(event) => props.onFormChange({ promptInstruction: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Correction suggestions</span>
              <textarea
                className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                value={props.form.rewriteSuggestion}
                placeholder="After detecting a hit, provide adjustment suggestions to the user or rewrite the link."
                onChange={(event) => props.onFormChange({ rewriteSuggestion: event.target.value })}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <AntiAiToggleLine
              label="Enable rules"
              checked={props.form.enabled}
              onCheckedChange={(checked) => props.onFormChange({ enabled: checked })}
            />
            <AntiAiToggleLine
              label="Enter global default"
              checked={props.form.globalBaselineEnabled}
              onCheckedChange={(checked) => props.onFormChange({ globalBaselineEnabled: checked })}
            />
            <AntiAiToggleLine
              label="Allow automatic overwriting"
              checked={props.form.autoRewrite}
              onCheckedChange={(checked) => props.onFormChange({ autoRewrite: checked })}
            />
          </div>
        </form>
      </AppDialogContent>
    </Dialog>
  );
}
