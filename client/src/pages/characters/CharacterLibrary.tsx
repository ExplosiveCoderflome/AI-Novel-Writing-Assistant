import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createBaseCharacter, generateBaseCharacter, getBaseCharacterList } from "@/api/character";
import { queryKeys } from "@/api/queryKeys";

export default function CharacterLibrary() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    role: "主角",
    personality: "",
    background: "",
    development: "",
    category: "主角",
  });
  const [aiDescription, setAIDescription] = useState("");

  const characterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createBaseCharacter({
        ...form,
        tags: "",
        appearance: "",
        weaknesses: "",
        interests: "",
        keyEvents: "",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.baseCharacters.all,
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateBaseCharacter({
        description: aiDescription,
        category: form.category,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.baseCharacters.all,
      });
      setAIDescription("");
    },
  });

  const characters = characterListQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>手动创建角色</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="角色名"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="角色定位（主角/反派/配角）"
            value={form.role}
            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
          />
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="性格特征"
            value={form.personality}
            onChange={(event) => setForm((prev) => ({ ...prev, personality: event.target.value }))}
          />
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="背景故事"
            value={form.background}
            onChange={(event) => setForm((prev) => ({ ...prev, background: event.target.value }))}
          />
          <input
            className="rounded-md border p-2 text-sm md:col-span-2"
            placeholder="成长轨迹"
            value={form.development}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, development: event.target.value }))
            }
          />
          <Button
            className="md:col-span-2"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.name.trim()}
          >
            {createMutation.isPending ? "创建中..." : "创建角色"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI 生成角色</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            className="min-h-[120px] w-full rounded-md border p-2 text-sm"
            placeholder="输入角色描述，例如：冷静理智但背负家仇的年轻剑士"
            value={aiDescription}
            onChange={(event) => setAIDescription(event.target.value)}
          />
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !aiDescription.trim()}
          >
            {generateMutation.isPending ? "生成中..." : "生成并入库"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>角色列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {characters.map((character) => (
            <div key={character.id} className="rounded-md border p-3">
              <div className="font-medium">{character.name}</div>
              <div className="text-sm text-muted-foreground">{character.role}</div>
              <div className="mt-1 text-sm">{character.personality}</div>
            </div>
          ))}
          {characters.length === 0 ? <div className="text-sm text-muted-foreground">暂无角色。</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
