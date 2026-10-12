interface WorldInjectionHintProps {
  worldInjectionSummary: string | null;
}

export default function WorldInjectionHint({ worldInjectionSummary }: WorldInjectionHintProps) {
  if (!worldInjectionSummary) {
    return (
      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        缺少可用的本书世界，生成过程会先根据小说基础信息推进。
      </div>
    );
  }

  return (
    <details className="group rounded-md bg-muted/40 px-3 py-2 text-xs">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
        <span>本书世界已用于本次生成</span>
        <span className="text-muted-foreground group-open:hidden">查看详情</span>
        <span className="hidden text-muted-foreground group-open:inline">收起详情</span>
      </summary>
      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap border-t pt-3 text-muted-foreground">
        {worldInjectionSummary}
      </pre>
    </details>
  );
}
