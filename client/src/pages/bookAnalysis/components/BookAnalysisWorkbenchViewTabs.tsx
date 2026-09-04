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
      <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border/45 bg-transparent p-0">
        <TabsTrigger value="sections" className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-2 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
          <BookOpen className="h-3.5 w-3.5" />
          <span>小节分析</span>
        </TabsTrigger>
        <TabsTrigger value="characters" className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-2 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
          <Users className="h-3.5 w-3.5" />
          <span>角色档案</span>
          {generatedCharacterCount > 0 ? (
            <Badge variant="secondary" className="ml-1 h-5 border-0 bg-muted/70 px-1.5 text-xs font-normal">
              {generatedCharacterCount}
            </Badge>
          ) : null}
          {candidateCharacterCount > 0 ? (
            <Badge variant="secondary" className="ml-1 h-5 border-0 bg-transparent px-1.5 text-xs font-normal text-muted-foreground">
              {candidateCharacterCount} 候选
            </Badge>
          ) : null}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
