import { useState } from "react";
import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import { ChevronDown, Edit3, FlaskConical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RuleFilter, severityLabels, typeLabels } from "../antiAiRulesPage.shared";
import AntiAiToggleLine from "./AntiAiToggleLine";

interface AntiAiRuleListProps {
  rules: AntiAiRule[];
  loading: boolean;
  error?: string;
  filter: RuleFilter;
  isSaving: boolean;
  testingRuleIds: string[];
  onRetry: () => void;
  onFilterChange: (filter: RuleFilter) => void;
  onQuickToggle: (rule: AntiAiRule, field: "enabled" | "globalBaselineEnabled" | "autoRewrite", checked: boolean) => void;
  onEditRule: (rule: AntiAiRule) => void;
  onToggleTestingRule: (ruleId: string) => void;
}

const filters = [
  ["all", "全部"],
  ["global", "全局默认"],
  ["style", "写法专属可用"],
  ["disabled", "已停用"],
] as const;

export default function AntiAiRuleList(props: AntiAiRuleListProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const visibleRules = props.rules.filter((rule) => (
    (rule.name + " " + rule.description).toLocaleLowerCase().includes(query)
  ));
  const testingRuleIdSet = new Set(props.testingRuleIds);

  return (
    <section aria-labelledby="anti-ai-rule-list-title" className="min-w-0 rounded-xl bg-card text-card-foreground">
      <div className="space-y-4 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="anti-ai-rule-list-title" className="text-lg font-semibold">规则列表</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{visibleRules.length} 条</span>
        </div>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            aria-label="搜索规则名称或说明" placeholder="搜索规则名称或说明" className="pl-9" />
        </div>
        <div role="group" aria-label="筛选规则" className="flex flex-wrap gap-1">
          {filters.map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant="ghost"
              aria-pressed={props.filter === value}
              className={cn("h-8 text-xs text-muted-foreground", props.filter === value && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
              onClick={() => props.onFilterChange(value)}>
              {label}
            </Button>
          ))}
        </div>
        <p className="pb-3 text-xs leading-5 text-muted-foreground">
          全局默认供正文生成使用；写法专属规则需在写法资产中绑定。加入测试只影响本页预览。
        </p>
      </div>

      {props.loading ? <div role="status" className="px-6 py-10 text-sm text-muted-foreground">正在加载规则…</div> : null}
      {props.error ? (
        <div role="alert" className="mx-5 mb-5 rounded-md bg-destructive/10 p-4 text-sm sm:mx-6">
          <p>{props.error}</p>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={props.onRetry}>重新加载</Button>
        </div>
      ) : null}
      {!props.loading && !props.error && visibleRules.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-muted-foreground">
          <p>{query ? "没有找到匹配的规则，试试其他名称或说明。" : "此分类下没有规则，可以切换分类查看。"}</p>
          {query ? <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setSearch("")}>清空搜索</Button> : null}
        </div>
      ) : null}

      <div className="divide-y divide-border/60">
        {visibleRules.map((rule) => {
          const isTesting = testingRuleIdSet.has(rule.id);
          return (
            <article key={rule.id} className={cn("px-5 py-5 sm:px-6", !rule.enabled && "bg-muted/20", isTesting && "bg-primary/5")}>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-48">
                  <h3 className="break-words text-base font-semibold leading-6">{rule.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{typeLabels[rule.type]} · 提醒级别：{severityLabels[rule.severity]}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" aria-pressed={isTesting}
                    aria-label={(isTesting ? "移出测试：" : "加入测试：") + rule.name}
                    className={cn("h-8 px-2 text-xs", isTesting ? "text-primary" : "text-muted-foreground")}
                    onClick={() => props.onToggleTestingRule(rule.id)}>
                    <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />
                    {isTesting ? "移出测试" : "加入测试"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground"
                    aria-label={"编辑：" + rule.name} onClick={() => props.onEditRule(rule)}>
                    <Edit3 aria-hidden="true" className="h-3.5 w-3.5" />编辑
                  </Button>
                </div>
              </div>
              <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{rule.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1">
                <AntiAiToggleLine label="启用" checked={rule.enabled} disabled={props.isSaving}
                  title={rule.name + "：启用"} onCheckedChange={(checked) => props.onQuickToggle(rule, "enabled", checked)} />
                <AntiAiToggleLine label="全局默认" checked={rule.globalBaselineEnabled} disabled={props.isSaving}
                  title={rule.name + "：全局默认"} onCheckedChange={(checked) => props.onQuickToggle(rule, "globalBaselineEnabled", checked)} />
                <AntiAiToggleLine label="自动改写" checked={rule.autoRewrite} disabled={props.isSaving}
                  title={rule.name + "：自动改写"} onCheckedChange={(checked) => props.onQuickToggle(rule, "autoRewrite", checked)} />
              </div>
              <details className="group mt-2">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded text-xs leading-7 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  规则详情
                  <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </summary>
                <dl className="mt-2 grid gap-4 rounded-lg bg-muted/30 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="mb-1 text-xs font-medium text-muted-foreground">生成指令</dt>
                    <dd className="whitespace-pre-wrap break-words leading-6">{rule.promptInstruction || "未填写"}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-xs font-medium text-muted-foreground">修正建议</dt>
                    <dd className="whitespace-pre-wrap break-words leading-6">{rule.rewriteSuggestion || "未填写"}</dd>
                  </div>
                  {rule.detectPatterns.length > 0 ? (
                    <div className="sm:col-span-2">
                      <dt className="mb-1 text-xs font-medium text-muted-foreground">检测参考表达</dt>
                      <dd className="break-words leading-6">{rule.detectPatterns.join(" · ")}</dd>
                    </div>
                  ) : null}
                </dl>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
