import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface WebnovelWorkflowCardProps {
  directorCreateLink: string;
}

const WORKFLOW_STEPS = [
  {
    title: "一句灵感",
    description: "输入题材、主角或一个画面，AI 先拆出几条能长期连载的书级方向。",
  },
  {
    title: "你只选方向",
    description: "你判断哪条更有感觉，卖点、前三十章承诺和主线节奏交给导演收束。",
  },
  {
    title: "章节先定功能",
    description: "每章先明确场景作用、人物选择、代价变化和不能写漂的事实。",
  },
  {
    title: "正文四轮过闸",
    description: "先写现场，再查 AI 腔、连续性、角色口吻和章末钩子，过关再收稿。",
  },
];

const QUALITY_GATES = [
  "禁止模板化转场、泛化比喻、段尾升华",
  "设定只通过冲突、代价、误会和后果释放",
  "角色要有专属口吻、避讳和小动作",
  "每章至少发生一次可见的状态变化",
  "对话要有潜台词、错位或真实停顿",
  "章节收稿后回灌事实、人物状态和伏笔",
];

export default function WebnovelWorkflowCard({ directorCreateLink }: WebnovelWorkflowCardProps) {
  return (
    <Card className="overflow-hidden border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(239,246,255,0.9))] shadow-[0_18px_60px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))]">
      <CardHeader className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-slate-950 text-white hover:bg-slate-950 dark:bg-white dark:text-slate-950">网文生产线</Badge>
          <Badge variant="outline">方向决策</Badge>
          <Badge variant="outline">章节执行</Badge>
          <Badge variant="outline">事实回灌</Badge>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-4xl space-y-3">
            <CardTitle className="text-2xl tracking-tight sm:text-3xl">
              像写手一样先判断场景，再让模型下笔。
            </CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7">
              自动导演先把一本书拆成可执行的合同。正文生成时先过场景功能、现场落地、人物口吻、收束回灌四道闸，再进入去 AI 味和连续性检查。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={directorCreateLink}>从灵感开书</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/anti-ai-rules">反 AI 规则</Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          {WORKFLOW_STEPS.map((step, index) => (
            <div key={step.title} className="group rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
                  {index + 1}
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-slate-300 to-transparent opacity-70 dark:from-white/20" />
              </div>
              <div className="font-medium">{step.title}</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">正文收稿硬闸门</div>
                <div className="mt-1 text-sm text-muted-foreground">每章必须有可见变化，不能只是语言顺。</div>
              </div>
              <Badge variant="outline">22 条规则</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {QUALITY_GATES.map((gate) => (
                <div key={gate} className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-300">
                  {gate}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/80 p-4 dark:border-indigo-300/20 dark:bg-indigo-400/10">
            <div className="font-medium text-indigo-950 dark:text-indigo-100">推荐开书方式</div>
            <p className="mt-3 text-sm leading-6 text-indigo-950/75 dark:text-indigo-100/75">
              输入一句灵感，让系统给方向候选。你只选感觉对的方案，后面的书级契约、章节任务、正文审校和事实回灌交给工作台。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to={directorCreateLink}>启动导演</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/style-engine">写法资产</Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
