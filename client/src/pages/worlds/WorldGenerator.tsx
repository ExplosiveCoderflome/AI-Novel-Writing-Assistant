import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LLMSelector from "@/components/common/LLMSelector";
import StreamOutput from "@/components/common/StreamOutput";
import { queryKeys } from "@/api/queryKeys";
import { useSSE } from "@/hooks/useSSE";
import { useLLMStore } from "@/store/llmStore";

export default function WorldGenerator() {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    description: "",
    worldType: "东方玄幻",
    complexity: "standard" as "simple" | "standard" | "detailed",
  });

  const sse = useSSE({
    onDone: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.worlds.all,
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>世界观生成器</CardTitle>
          <LLMSelector />
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            className="w-full rounded-md border p-2 text-sm"
            placeholder="世界名称"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <textarea
            className="min-h-[120px] w-full rounded-md border p-2 text-sm"
            placeholder="世界描述"
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
          />
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="rounded-md border p-2 text-sm"
              placeholder="世界类型"
              value={form.worldType}
              onChange={(event) => setForm((prev) => ({ ...prev, worldType: event.target.value }))}
            />
            <select
              className="rounded-md border p-2 text-sm"
              value={form.complexity}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  complexity: event.target.value as "simple" | "standard" | "detailed",
                }))
              }
            >
              <option value="simple">简略</option>
              <option value="standard">标准</option>
              <option value="detailed">详细</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                void sse.start("/worlds/generate", {
                  ...form,
                  dimensions: {
                    geography: true,
                    culture: true,
                    magicSystem: true,
                    technology: true,
                    history: true,
                  },
                  provider: llm.provider,
                  model: llm.model,
                })
              }
              disabled={sse.isStreaming || !form.name.trim() || !form.description.trim()}
            >
              生成世界观
            </Button>
            <Button variant="secondary" onClick={sse.abort} disabled={!sse.isStreaming}>
              停止生成
            </Button>
          </div>
          <StreamOutput content={sse.content} isStreaming={sse.isStreaming} onAbort={sse.abort} />
        </CardContent>
      </Card>
    </div>
  );
}
