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
    <Card className="overflow-hidden border-amber-400/40 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.02),rgba(245,158,11,0.05))] shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>网文自动驾驶</Badge>
          <Badge variant="outline">DeepSeek 写作链路</Badge>
          <Badge variant="outline">写手级四轮过闸</Badge>
          <Badge variant="outline">连续性入库</Badge>
        </div>
        <div className="max-w-4xl space-y-2">
          <CardTitle>你负责判断方向，AI 按优秀写手流程把书推到能连载。</CardTitle>
          <CardDescription className="text-base leading-7">
            工作台按“方向确认、书级契约、世界观记忆、章节任务、正文审校、状态回灌”推进。
            写作链路默认先判断卖点和场景功能，再落到角色选择、局面代价和具体文字，适合从一个模糊想法开始做长篇网文。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          {WORKFLOW_STEPS.map((step, index) => (
            <div key={step.title} className="rounded-xl border bg-background/80 p-4">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-sm font-semibold text-amber-700">
                {index + 1}
              </div>
              <div className="font-medium">{step.title}</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border bg-background/80 p-4">
            <div className="font-medium">正文收稿硬闸门</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {QUALITY_GATES.map((gate) => (
                <div key={gate} className="rounded-lg bg-muted/50 px-3 py-2 text-sm leading-6 text-muted-foreground">
                  {gate}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3 rounded-xl border bg-background/80 p-4">
            <div className="font-medium">推荐入口</div>
            <p className="text-sm leading-6 text-muted-foreground">
              先走自动导演，让系统给可选择的书级方向。默认写法会压住 AI 腔，并要求每章有场景功能、人物代价和连续性回灌。喜欢的小说可以稍后导入拆书，只提取节奏和写法，不复制原文。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={directorCreateLink}>开始自动导演</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/style-engine">查看写法引擎</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/anti-ai-rules">查看反 AI 规则</Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
