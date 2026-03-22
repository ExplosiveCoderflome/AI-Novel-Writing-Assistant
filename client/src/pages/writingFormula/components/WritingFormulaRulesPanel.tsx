import { useMemo, useState } from "react";
import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WritingFormulaRulesPanelProps {
  antiAiRules: AntiAiRule[];
  onToggleRule: (rule: AntiAiRule, enabled: boolean) => void;
}

export default function WritingFormulaRulesPanel(props: WritingFormulaRulesPanelProps) {
  const { antiAiRules, onToggleRule } = props;
  const [open, setOpen] = useState(false);

  const enabledCount = useMemo(
    () => antiAiRules.filter((rule) => rule.enabled).length,
    [antiAiRules],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>反 AI 特征库</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            已启用 {enabledCount} / {antiAiRules.length} 条规则
          </div>
          <div className="text-sm text-muted-foreground">
            把规则库收进弹窗后，主页面会更聚焦在写法编辑和应用。
          </div>
          <Button className="w-full" variant="secondary" onClick={() => setOpen(true)}>
            打开规则库
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>反 AI 特征库</DialogTitle>
            <DialogDescription>
              这里更适合做规则浏览、筛选、启停和后续扩展编辑。
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
            {antiAiRules.map((rule) => (
              <div key={rule.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{rule.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {rule.type} / {rule.severity}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) => onToggleRule(rule, event.target.checked)}
                    />
                    启用
                  </label>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">{rule.description}</div>
                {rule.promptInstruction ? (
                  <div className="mt-3 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                    Prompt：{rule.promptInstruction}
                  </div>
                ) : null}
                {rule.rewriteSuggestion ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    修正建议：{rule.rewriteSuggestion}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
