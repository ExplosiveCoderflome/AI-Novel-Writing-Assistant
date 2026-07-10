import { Badge } from "@/components/ui/badge";

interface BookAnalysisDiagnosisTipBannerProps {
  documentTitle: string;
}

export default function BookAnalysisDiagnosisTipBanner({ documentTitle }: BookAnalysisDiagnosisTipBannerProps) {
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">诊断模式</Badge>
        <span className="font-medium">{documentTitle}</span>
      </div>
      <div className="mt-2 leading-6 text-muted-foreground">
        这里用拆书框架检查自己的稿子，重点看节奏、人物、主题、伏笔和商业卖点是否清楚；结论用于改稿判断，不会改变原小说正文。
      </div>
    </div>
  );
}
