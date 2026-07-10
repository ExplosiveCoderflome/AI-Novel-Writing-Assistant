import {
  BookOpenText,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Compass,
  FileCheck2,
  KeyRound,
  ListTodo,
  Route,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DIRECTOR_CREATE_LINK = "/novels/create?mode=director";

interface GuideStep {
  title: string;
  description: string;
  icon: LucideIcon;
}

interface GoalEntry {
  title: string;
  description: string;
  href: string;
  action: string;
  icon: LucideIcon;
}

interface FaqItem {
  question: string;
  answer: string;
}

const guideSteps: GuideStep[] = [
  {
    title: "配置模型",
    description: "先在系统设置里配置模型厂商、API Key 和默认模型，后续自动导演和章节执行才能顺利运行。",
    icon: KeyRound,
  },
  {
    title: "输入一句灵感",
    description: "只写题材、主角、冲突或一个模糊想法都可以，AI 会先帮你整理成可开书方向。",
    icon: Sparkles,
  },
  {
    title: "让 AI 自动导演开书",
    description: "系统会生成整本方向、标题组和开书准备，把复杂规划拆成可确认的步骤。",
    icon: Compass,
  },
  {
    title: "确认方向",
    description: "从候选方案里选择最想写的一套；不满意时，可以继续生成或只调整选中的方案。",
    icon: CheckCircle2,
  },
  {
    title: "推进到可开写",
    description: "让 AI 继续准备故事主线、角色、卷策略和章节拆分，直到项目具备章节执行条件。",
    icon: Workflow,
  },
  {
    title: "进入章节执行",
    description: "按章节写作、审核和修复；想加速时，可以让整本生产任务持续向后推进。",
    icon: BookOpenText,
  },
  {
    title: "查看任务和跟进",
    description: "任务中心处理失败、排队和运行状态；导演跟进页集中处理需要回收的质量事项。",
    icon: ListTodo,
  },
];

const goalEntries: GoalEntry[] = [
  {
    title: "从零开书",
    description: "适合只有一个灵感，还没想清楚题材、卖点、主角和前期剧情。",
    href: DIRECTOR_CREATE_LINK,
    action: "开始第一本小说",
    icon: Sparkles,
  },
  {
    title: "继续项目",
    description: "回到小说列表，选择最值得继续的一本书，接着完成规划或章节写作。",
    href: "/novels",
    action: "打开小说列表",
    icon: BookOpenText,
  },
  {
    title: "配置模型厂商",
    description: "填写厂商接口、API Key 和默认模型，保证写作链路有可用模型。",
    href: "/settings",
    action: "打开系统设置",
    icon: Route,
  },
  {
    title: "处理任务",
    description: "查看后台运行、排队和失败任务，优先处理会影响继续写作的问题。",
    href: "/tasks",
    action: "打开任务中心",
    icon: ClipboardList,
  },
  {
    title: "导演跟进",
    description: "集中处理自动导演留下的质量回收事项，让整本书继续向完成推进。",
    href: "/auto-director/follow-ups",
    action: "查看导演跟进",
    icon: Workflow,
  },
  {
    title: "调整写法",
    description: "把喜欢的文本风格沉淀成写法资产，再绑定到小说里持续复用。",
    href: "/style-engine",
    action: "进入写法引擎",
    icon: WandSparkles,
  },
];

const faqItems: FaqItem[] = [
  {
    question: "我需要会写大纲吗？",
    answer: "不需要。第一次使用时，直接输入一句灵感，让 AI 自动导演先给出整本方向，再按步骤确认。",
  },
  {
    question: "知识库是必需的吗？",
    answer: "不是必需。先用自动导演把一本书推进到可开写；需要参考资料、拆书结果或长期设定时，再使用知识库。",
  },
  {
    question: "任务失败怎么办？",
    answer: "先到任务中心查看失败原因。常见的模型、网络或授权问题处理好后，可以回到原项目继续推进。",
  },
  {
    question: "质量待回收是什么意思？",
    answer: "这表示系统先把普通质量问题记录下来，优先把整本书继续写完，后续再集中修复这些章节。",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <section className="rounded-xl border bg-gradient-to-br from-primary/10 via-background to-emerald-500/10 p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>新手上路</Badge>
              <Badge variant="outline">推荐路线</Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
              从一句灵感开始，让 AI 带你写第一本小说
            </h1>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              按这条路线走，不需要先会写大纲、角色表或卷规划。你只负责提供想法和做关键选择，AI 会把整本书拆成能继续推进的步骤。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link to={DIRECTOR_CREATE_LINK}>开始第一本小说</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/settings">配置模型</Link>
            </Button>
          </div>
        </div>
      </section>

      <Card className="border-amber-300 bg-amber-50/80">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-700" />
            <CardTitle className="text-lg text-amber-950">开始写作前先配置模型</CardTitle>
          </div>
          <CardDescription className="text-amber-900/80">
            自动导演、正文写作和章节审阅都需要可用模型。先完成模型厂商、API Key 和默认模型配置，再启动开书流程会更顺畅。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/settings">去配置模型</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>推荐路线</CardTitle>
          <CardDescription>第一次使用时，照着这条路线推进，就能从想法进入可写章节。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {guideSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-lg border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{index + 1}</Badge>
                        <div className="font-semibold">{step.title}</div>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>按目标选择入口</CardTitle>
          <CardDescription>不用先理解全部功能，按你要完成的事选择入口。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {goalEntries.map((entry) => {
              const Icon = entry.icon;
              return (
                <div key={entry.title} className="flex flex-col justify-between gap-4 rounded-lg border bg-background p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="font-semibold">{entry.title}</div>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{entry.description}</p>
                  </div>
                  <Button asChild variant="outline" className="w-full justify-center">
                    <Link to={entry.href}>{entry.action}</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-card/90">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>宫寒个人版与 AI 标注</CardTitle>
          </div>
          <CardDescription>
            这个 fork 会保留上游来源、AGPL 许可证和 AI 辅助修改说明，方便后续向主项目提交 PR 或继续维护个人版本。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2 font-semibold">
                <FileCheck2 className="h-4 w-4 text-primary" aria-hidden="true" />
                项目来源
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                当前版本基于上游 AI Novel Writing Assistant 整理，公开说明中继续保留原项目、许可证和 fork 关系。
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                AI 辅助
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                本轮品牌文案、说明文档和前端打磨包含 AI 辅助生成与人工筛选，提交 PR 时应主动说明。
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2 font-semibold">
                <Route className="h-4 w-4 text-primary" aria-hidden="true" />
                接口边界
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                当前个人版优化保持 API、路由、query key、数据库和自动导演状态判断不变，主要改展示层和文档。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CircleHelp className="h-5 w-5 text-primary" />
            <CardTitle>常见问题</CardTitle>
          </div>
          <CardDescription>遇到不确定的地方，先看这些判断。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {faqItems.map((item) => (
              <div key={item.question} className="rounded-lg border bg-background p-4">
                <div className="font-semibold">{item.question}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
