import type { RecoverableTaskSummary } from "@ai-novel/shared/types/task";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AppDialogContent,
  Dialog,
} from "@/components/ui/dialog";
import { useTaskRecovery } from "./TaskRecoveryContext";

function formatTaskKind(kind: RecoverableTaskSummary["kind"]): string {
  if (kind === "novel_workflow") {
    return "小说主流程";
  }
  if (kind === "novel_pipeline") {
    return "章节流水线";
  }
  if (kind === "book_analysis") {
    return "拆书任务";
  }
  if (kind === "style_extraction") {
    return "写法提取";
  }
  return "图片任务";
}

export default function TaskRecoveryDialog() {
  const { items, isOpen, closeDialog } = useTaskRecovery();

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); }}>
      <AppDialogContent
        title="需要处理的任务"
        description="打开对应创作页面，查看已保存结果和中断位置，再选择下一步。"
        footer={(
          <Button variant="outline" onClick={closeDialog}>
            稍后处理
          </Button>
        )}
      >
        <div className="divide-y divide-border">
          {items.map((item) => (
            <section key={`${item.kind}-${item.id}`} className="space-y-3 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{formatTaskKind(item.kind)}</Badge>
                    <Badge variant={item.status === "running" ? "default" : "secondary"}>
                      {item.status === "running" ? "运行中断" : "排队中断"}
                    </Badge>
                  </div>
                  <div className="text-base font-semibold">{item.title}</div>
                  <div className="text-sm text-muted-foreground">所属对象：{item.ownerLabel}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to={item.sourceRoute} onClick={closeDialog}>打开任务位置</Link>
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 text-sm text-muted-foreground">
                {item.currentStage ? <div>当前阶段：{item.currentStage}</div> : null}
                {item.currentItemLabel ? <div>中断位置：{item.currentItemLabel}</div> : null}
                {item.recoveryHint ? <div>恢复建议：{item.recoveryHint}</div> : null}
              </div>
            </section>
          ))}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
