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
        title={props.editingRule ? "编辑反 AI 规则" : "新建反 AI 规则"}
        description="规则可以进入全局默认，也可以只作为写法资产的可选约束。"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button>
            <Button type="submit" form="anti-ai-rule-form" disabled={props.isSaving}>
              {props.isSaving ? "保存中..." : "保存规则"}
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
                    ? "描述要调整的方向，AI 会基于表单内容优化规则。"
                    : "描述想压制或鼓励的表达，AI 会生成一条可编辑规则草稿。"}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={!props.aiInstruction.trim() || props.isAiDrafting}
                onClick={props.onGenerateDraft}
              >
                <Sparkles className="h-4 w-4" />
                {props.isAiDrafting ? "生成中..." : props.editingRule ? "AI 优化草稿" : "AI 生成草稿"}
              </Button>
            </div>
            <textarea
              className="mt-3 min-h-[84px] w-full rounded-md border bg-background p-3 text-sm"
              value={props.aiInstruction}
              placeholder={props.editingRule
                ? "例如：把这条规则改得更适合压制总结腔，但不要误伤正常心理描写。"
                : "例如：减少正文里空泛总结、解释人物心理、像模型在复盘剧情的表达。"}
              onChange={(event) => props.onAiInstructionChange(event.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">规则标识</span>
              <Input
                value={props.form.key}
                placeholder="例如 direct_psychology_explain"
                onChange={(event) => props.onFormChange({ key: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">规则名称</span>
              <Input
                value={props.form.name}
                placeholder="例如 避免直白心理解释"
                onChange={(event) => props.onFormChange({ name: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">规则类型</span>
              <Select value={props.form.type} onValueChange={(value) => props.onFormChange({ type: value as AntiAiRule["type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="forbidden">禁用</SelectItem>
                  <SelectItem value="risk">风险</SelectItem>
                  <SelectItem value="encourage">鼓励</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">严重度</span>
              <Select value={props.form.severity} onValueChange={(value) => props.onFormChange({ severity: value as AntiAiRule["severity"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">低</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="high">高</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">说明</span>
            <textarea
              className="min-h-[76px] w-full rounded-md border bg-background p-3 text-sm"
              value={props.form.description}
              placeholder="说明这条规则要压制或鼓励哪类表达。"
              onChange={(event) => props.onFormChange({ description: event.target.value })}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">检测关键词</span>
            <textarea
              className="min-h-[80px] w-full rounded-md border bg-background p-3 text-sm"
              value={props.form.detectPatternsText}
              placeholder="每行一个关键词，也可以用逗号分隔。"
              onChange={(event) => props.onFormChange({ detectPatternsText: event.target.value })}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">生成指令</span>
              <textarea
                className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                value={props.form.promptInstruction}
                placeholder="写进正文生成约束的具体表达要求。"
                onChange={(event) => props.onFormChange({ promptInstruction: event.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">修正建议</span>
              <textarea
                className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                value={props.form.rewriteSuggestion}
                placeholder="检测命中后给用户或改写链路的调整建议。"
                onChange={(event) => props.onFormChange({ rewriteSuggestion: event.target.value })}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <AntiAiToggleLine
              label="启用规则"
              checked={props.form.enabled}
              onCheckedChange={(checked) => props.onFormChange({ enabled: checked })}
            />
            <AntiAiToggleLine
              label="进入全局默认"
              checked={props.form.globalBaselineEnabled}
              onCheckedChange={(checked) => props.onFormChange({ globalBaselineEnabled: checked })}
            />
            <AntiAiToggleLine
              label="允许自动改写"
              checked={props.form.autoRewrite}
              onCheckedChange={(checked) => props.onFormChange({ autoRewrite: checked })}
            />
          </div>
        </form>
      </AppDialogContent>
    </Dialog>
  );
}
