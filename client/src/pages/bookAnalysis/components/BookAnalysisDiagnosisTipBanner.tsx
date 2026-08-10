import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Badge } from "@/components/ui/badge";

interface BookAnalysisDiagnosisTipBannerProps {
  documentTitle: string;
}

export default function BookAnalysisDiagnosisTipBanner({ documentTitle }: BookAnalysisDiagnosisTipBannerProps) {
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{i18next.t("dict.gen_03311a5e")}</Badge>
        <span className="font-medium">{documentTitle}</span>
      </div>
      <div className="mt-2 leading-6 text-muted-foreground">{i18next.t("bookAnalysis.bookAnalysisDiagnosisTipBanner.jdcw0m")}</div>
    </div>
  );
}
