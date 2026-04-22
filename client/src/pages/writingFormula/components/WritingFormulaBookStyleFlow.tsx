import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WritingFormulaBookStyleFlowProps {
  novelId: string;
  novelTitle?: string;
  onOpenAdvanced: () => void;
  onOpenCreate: () => void;
}

export default function WritingFormulaBookStyleFlow(props: WritingFormulaBookStyleFlowProps) {
  const {
    novelId,
    novelTitle,
    onOpenAdvanced,
    onOpenCreate,
  } = props;
  const novelRoute = novelId ? `/novels/${novelId}/edit` : "/novels";

  return (
    <Card className="border-slate-200/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <CardHeader>
        <CardTitle>从小说基础信息设置书级默认写法</CardTitle>
        <div className="text-sm leading-7 text-muted-foreground">
          写法引擎负责创建、测试和整理写法资产。当前小说要使用哪套默认写法，请回到小说基础信息里确认，再带入后续导演和正文流程。
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-4 rounded-2xl border bg-slate-50/70 p-4">
            <div className="text-sm font-medium text-slate-900">现在应该从哪里进入</div>
            <div className="rounded-2xl border bg-white p-4 text-sm leading-7 text-slate-700">
              {novelId
                ? `当前小说${novelTitle ? `《${novelTitle}》` : ""}的“默认写法”已经放到小说基础信息页里。`
                : "请先进入某本小说的基础信息页，在那里确认书级默认写法。"}
            </div>
            <div className="rounded-2xl border bg-slate-950 p-4 text-white">
              <div className="text-sm font-medium">两个入口分别负责什么</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                <div>小说页：为当前小说选择默认写法，触发推荐、比较候选，并决定何时带入自动导演。</div>
                <div>写法引擎：继续负责整理写法资产、试写、去 AI 味和规则管理。</div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">下一步</div>
            <div className="rounded-2xl border bg-slate-50/70 p-4 text-sm leading-7 text-slate-700">
              先去小说页确认这本书的默认写法。如果当前资产库里还没有合适的写法，再回到写法引擎创建或整理资产。
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild type="button">
                <Link to={novelRoute}>去小说页设置默认写法</Link>
              </Button>
              <Button type="button" variant="outline" onClick={onOpenAdvanced}>
                编辑当前写法
              </Button>
              <Button type="button" variant="outline" onClick={onOpenCreate}>
                新建一套写法
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
