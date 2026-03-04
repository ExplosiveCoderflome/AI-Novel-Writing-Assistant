import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StreamOutput from "@/components/common/StreamOutput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWritingFormulas } from "@/api/writingFormula";
import { queryKeys } from "@/api/queryKeys";
import { useSSE } from "@/hooks/useSSE";

export default function WritingFormulaPage() {
  const [extractInput, setExtractInput] = useState({
    name: "",
    sourceText: "",
  });
  const [applyInput, setApplyInput] = useState({
    topic: "",
    formulaContent: "",
  });

  const formulaListQuery = useQuery({
    queryKey: queryKeys.writingFormula.all,
    queryFn: getWritingFormulas,
  });

  const extractSSE = useSSE();
  const applySSE = useSSE();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>提取写作公式</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <input
            className="w-full rounded-md border p-2 text-sm"
            placeholder="公式名称"
            value={extractInput.name}
            onChange={(event) => setExtractInput((prev) => ({ ...prev, name: event.target.value }))}
          />
          <textarea
            className="min-h-[150px] w-full rounded-md border p-2 text-sm"
            placeholder="粘贴需要分析的原文"
            value={extractInput.sourceText}
            onChange={(event) =>
              setExtractInput((prev) => ({ ...prev, sourceText: event.target.value }))
            }
          />
          <div className="flex gap-2">
            <Button
              onClick={() =>
                void extractSSE.start("/writing-formula/extract", {
                  name: extractInput.name,
                  sourceText: extractInput.sourceText,
                  extractLevel: "standard",
                  focusAreas: ["style", "structure", "pacing", "narrative"],
                })
              }
              disabled={extractSSE.isStreaming || !extractInput.name.trim() || !extractInput.sourceText.trim()}
            >
              提取公式
            </Button>
            <Button variant="secondary" onClick={extractSSE.abort} disabled={!extractSSE.isStreaming}>
              停止
            </Button>
          </div>
          <StreamOutput content={extractSSE.content} isStreaming={extractSSE.isStreaming} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>应用写作公式</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            className="min-h-[120px] w-full rounded-md border p-2 text-sm"
            placeholder="输入公式内容（可选）"
            value={applyInput.formulaContent}
            onChange={(event) =>
              setApplyInput((prev) => ({ ...prev, formulaContent: event.target.value }))
            }
          />
          <input
            className="w-full rounded-md border p-2 text-sm"
            placeholder="输入创作主题"
            value={applyInput.topic}
            onChange={(event) => setApplyInput((prev) => ({ ...prev, topic: event.target.value }))}
          />
          <div className="flex gap-2">
            <Button
              onClick={() =>
                void applySSE.start("/writing-formula/apply", {
                  formulaContent: applyInput.formulaContent,
                  mode: "generate",
                  topic: applyInput.topic,
                  targetLength: 1200,
                })
              }
              disabled={applySSE.isStreaming || !applyInput.topic.trim() || !applyInput.formulaContent.trim()}
            >
              生成文本
            </Button>
            <Button variant="secondary" onClick={applySSE.abort} disabled={!applySSE.isStreaming}>
              停止
            </Button>
          </div>
          <StreamOutput content={applySSE.content} isStreaming={applySSE.isStreaming} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>公式列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(formulaListQuery.data?.data ?? []).map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <div className="font-medium">{item.name}</div>
              <div className="text-sm text-muted-foreground">{item.style ?? "暂无风格说明"}</div>
            </div>
          ))}
          {(formulaListQuery.data?.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无写作公式。</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
