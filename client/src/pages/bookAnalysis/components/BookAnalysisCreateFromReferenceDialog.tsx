import { BookOpen, GitBranch } from "lucide-react";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

export type BookAnalysisReferenceCreateMode = "continuation" | "adaptation";

interface BookAnalysisCreateFromReferenceDialogProps {
  open: boolean;
  documentTitle: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (mode: BookAnalysisReferenceCreateMode) => void;
}

export default function BookAnalysisCreateFromReferenceDialog({
  open,
  documentTitle,
  pending,
  onOpenChange,
  onChoose,
}: BookAnalysisCreateFromReferenceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="max-w-2xl"
        title="照着这本书写"
        description={`选择《${documentTitle}》在新项目中的作用，拆书结果和写法会自动带入。`}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="rounded-xl bg-muted/55 p-5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
            onClick={() => onChoose("continuation")}
          >
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            <div className="mt-4 font-semibold text-foreground">续写原作</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              保留已有角色、世界规则、时间线与未完线索，从原作结尾继续写。
            </p>
          </button>
          <button
            type="button"
            className="rounded-xl bg-muted/55 p-5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
            onClick={() => onChoose("adaptation")}
          >
            <GitBranch className="h-5 w-5" aria-hidden="true" />
            <div className="mt-4 font-semibold text-foreground">参考创作新书</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              参考结构、节奏和写法，重新生成角色、世界与剧情，避免复制原作。
            </p>
          </button>
        </div>
        {pending ? <p className="mt-4 text-sm text-muted-foreground">正在准备拆书上下文和写法…</p> : null}
      </AppDialogContent>
    </Dialog>
  );
}
