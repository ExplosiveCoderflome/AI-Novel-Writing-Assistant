import { Badge } from "@/components/ui/badge";

interface BookAnalysisDiagnosisTipBannerProps {
  documentTitle: string;
}

export default function BookAnalysisDiagnosisTipBanner({ documentTitle }: BookAnalysisDiagnosisTipBannerProps) {
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Diagnostic Mode</Badge>
        <span className="font-medium">{documentTitle}</span>
      </div>
      <div className="mt-2 leading-6 text-muted-foreground">
        Here, use the book-opening framework to check your manuscript, focusing on whether the rhythm, characters, themes, foreshadowing, and commercial selling points are clear; the conclusions are used to make judgments about revisions, and the text of the original novel will not be changed.
                    </div>
    </div>
  );
}
