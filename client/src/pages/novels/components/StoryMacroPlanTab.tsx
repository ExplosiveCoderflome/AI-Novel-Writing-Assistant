import type { StoryMacroField } from "@ai-novel/shared/types/storyMacro";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StoryMacroTabProps } from "./NovelEditView.types";

const FIELD_META: Array<{
  field: StoryMacroField;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { field: "selling_point", label: "核心卖点", placeholder: "一句话说明读者为什么会点开这个故事。" },
  { field: "core_conflict", label: "核心冲突", placeholder: "写清楚长期对立关系和卡点。" },
  { field: "main_hook", label: "主线钩子", placeholder: "最好写成一个会驱动持续阅读的问题。" },
  { field: "growth_path", label: "成长路径", placeholder: "写主角从什么状态走向什么状态。", multiline: true },
  { field: "major_payoffs", label: "关键爆点", placeholder: "每行一个关键节点。", multiline: true },
  { field: "ending_flavor", label: "结局味道", placeholder: "例如现实、苦涩、有余味、克制、温暖。" },
];

function toPayoffText(value: string[]): string {
  return value.join("\n");
}

export default function StoryMacroPlanTab(props: StoryMacroTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>故事宏观规划</CardTitle>
          <CardDescription>
            这一步位于世界观和角色之前。它先把自然语言想法拆成结构化规则，再把这些规则变成后续规划和生成的控制层。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">故事想法输入</div>
            <textarea
              value={props.storyInput}
              onChange={(event) => props.onStoryInputChange(event.target.value)}
              placeholder="用自然语言描述故事想法、情绪基调、想避免的风格或结局倾向。"
              className="min-h-36 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={props.onDecompose} disabled={props.isDecomposing || !props.storyInput.trim()}>
              {props.isDecomposing ? "深化与拆解中..." : props.hasPlan ? "重新深化并拆解" : "开始深化并拆解"}
            </Button>
            <Button
              variant="secondary"
              onClick={props.onBuildConstraintEngine}
              disabled={props.isBuilding || !props.decomposition.selling_point.trim()}
            >
              {props.isBuilding ? "构建中..." : "构建约束引擎"}
            </Button>
            <Button variant="outline" onClick={props.onSaveEdits} disabled={props.isSaving}>
              {props.isSaving ? "保存中..." : "保存拆解修改"}
            </Button>
          </div>
          {props.message ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {props.message}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {props.expansion ? (
        <Card>
          <CardHeader>
            <CardTitle>作家视角扩展</CardTitle>
            <CardDescription>
              这是 AI 先以资深作者的角度，把你的想法扩展成更有戏剧张力的创作底稿；它会作为六要素拆解的上游材料。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border/70 p-4">
              <div className="text-sm font-medium text-foreground">扩展前提</div>
              <div className="text-sm leading-7 text-muted-foreground">{props.expansion.expanded_premise}</div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-border/70 p-4">
                <div className="text-sm font-medium text-foreground">主角核心</div>
                <div className="text-sm leading-7 text-muted-foreground">{props.expansion.protagonist_core}</div>
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 p-4">
                <div className="text-sm font-medium text-foreground">情绪走势</div>
                <div className="text-sm leading-7 text-muted-foreground">{props.expansion.emotional_line}</div>
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 p-4">
                <div className="text-sm font-medium text-foreground">冲突层次</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {props.expansion.conflict_layers.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 p-4">
                <div className="text-sm font-medium text-foreground">高张力场面种子</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {props.expansion.setpiece_seeds.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-border/70 p-4">
              <div className="text-sm font-medium text-foreground">叙事气质建议</div>
              <div className="text-sm leading-7 text-muted-foreground">{props.expansion.tone_reference}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {props.issues.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>冲突与信息缺口</CardTitle>
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
          <CardTitle>六要素拆解</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {FIELD_META.map((item) => {
            const value = item.field === "major_payoffs"
              ? toPayoffText(props.decomposition.major_payoffs)
              : props.decomposition[item.field];
            const isLocked = Boolean(props.lockedFields[item.field]);
            return (
              <div key={item.field} className="space-y-2 rounded-xl border border-border/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={isLocked ? "secondary" : "outline"}
                      onClick={() => props.onToggleLock(item.field)}
                    >
                      {isLocked ? "已锁定" : "锁定"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => props.onRegenerateField(item.field)}
                      disabled={props.regeneratingField === item.field || isLocked || !props.storyInput.trim()}
                    >
                      {props.regeneratingField === item.field ? "重生成中..." : "重生成"}
                    </Button>
                  </div>
                </div>
                {item.multiline ? (
                  <textarea
                    value={value}
                    onChange={(event) => props.onFieldChange(
                      item.field,
                      item.field === "major_payoffs"
                        ? event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
                        : event.target.value,
                    )}
                    placeholder={item.placeholder}
                    className="min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : (
                  <Input
                    value={value}
                    onChange={(event) => props.onFieldChange(item.field, event.target.value)}
                    placeholder={item.placeholder}
                  />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>约束引擎</CardTitle>
          <CardDescription>
            当前保存的是后续角色、主线、章节规划可以直接消费的规则源。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {props.constraintEngine ? (
            <>
              <div className="space-y-2 rounded-xl border border-border/70 p-4">
                <div className="text-sm font-medium text-foreground">故事前提</div>
                <div className="text-sm text-muted-foreground">{props.constraintEngine.premise}</div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-border/70 p-4">
                  <div className="text-sm font-medium text-foreground">阶段模型</div>
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
                  <div className="text-sm font-medium text-foreground">禁止项</div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {props.constraintEngine.constraints.forbidden.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 rounded-xl border border-border/70 p-4">
                  <div className="text-sm font-medium text-foreground">必须趋势</div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {props.constraintEngine.constraints.required_trends.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 rounded-xl border border-border/70 p-4">
                  <div className="text-sm font-medium text-foreground">关键节点</div>
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
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              还没有约束引擎。先完成拆解，再点击“构建约束引擎”。
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>故事状态</CardTitle>
          <CardDescription>
            这是后续章节推进时可复用的宏观状态。先做基础实现，后续可以和章节生成的状态推进联动。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[160px_160px_minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">当前阶段</div>
            <Input
              type="number"
              value={props.state.currentPhase}
              onChange={(event) => props.onStateChange("currentPhase", Number(event.target.value))}
              min={0}
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">进度</div>
            <Input
              type="number"
              value={props.state.progress}
              onChange={(event) => props.onStateChange("progress", Number(event.target.value))}
              min={0}
              max={100}
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">主角状态</div>
            <Input
              value={props.state.protagonistState}
              onChange={(event) => props.onStateChange("protagonistState", event.target.value)}
              placeholder="例如：仍在逃避失业现实，但开始正视家庭裂缝。"
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
  );
}
