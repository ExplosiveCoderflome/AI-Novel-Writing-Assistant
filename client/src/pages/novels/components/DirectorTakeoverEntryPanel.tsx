import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DirectorTakeoverEntryPanelProps {
  title: string;
  description: string;
  entry?: ReactNode;
}

export default function DirectorTakeoverEntryPanel({
  title,
  description,
  entry,
}: DirectorTakeoverEntryPanelProps) {
  if (!entry) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="text-sm leading-6 text-muted-foreground">{description}</div>
        </div>
        <div className="shrink-0">{entry}</div>
      </CardHeader>
      <CardContent className="pt-0 text-xs leading-5 text-muted-foreground">
        接管前会先读取当前项目真实进度，并明确告诉你这次会跳过、继续还是重跑哪些步骤。
      </CardContent>
    </Card>
  );
}
