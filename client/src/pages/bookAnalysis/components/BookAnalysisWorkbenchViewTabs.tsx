import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { BookOpen, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BookAnalysisActiveView } from "../hooks/useBookAnalysisActiveView";

interface BookAnalysisWorkbenchViewTabsProps {
  activeView: BookAnalysisActiveView;
  onActiveViewChange: (view: BookAnalysisActiveView) => void;
  generatedCharacterCount: number;
  candidateCharacterCount: number;
}

export default function BookAnalysisWorkbenchViewTabs(props: BookAnalysisWorkbenchViewTabsProps) {
  const { activeView, onActiveViewChange, generatedCharacterCount, candidateCharacterCount } = props;

  return (
    <Tabs
      value={activeView}
      onValueChange={(value) => onActiveViewChange(value as BookAnalysisActiveView)}
    >
      <TabsList>
        <TabsTrigger value="sections" className="gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          <span>{t("gen.pages.bookAnalysis.components.BookAnalysisWorkbenchViewTabs.gen_98016d32")}</span>
        </TabsTrigger>
        <TabsTrigger value="characters" className="gap-1.5">
          <Users className="h-3.5 w-3.5" />
          <span>{t("gen.pages.bookAnalysis.components.BookAnalysisWorkbenchViewTabs.gen_90154762")}</span>
          {generatedCharacterCount > 0 ? (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {generatedCharacterCount}
            </Badge>
          ) : null}
          {candidateCharacterCount > 0 ? (
            <Badge variant="outline" className="ml-1 h-5 px-1.5 text-xs">
              {candidateCharacterCount} 候选
            </Badge>
          ) : null}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
