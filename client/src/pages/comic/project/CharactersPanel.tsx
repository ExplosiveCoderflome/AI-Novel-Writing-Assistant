import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Smile, Sparkles, Users } from "lucide-react";
import {
  characterExpressionImageUrl,
  characterSheetImageUrl,
  generateCharacterExpressionSheet,
  generateCharacterSheet,
  type CharacterExpressionData,
  type CharacterSheetData,
  type ComicCharacter,
} from "@/api/comic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

function CharacterSheetCard({
  character,
  provider,
}: {
  character: ComicCharacter;
  provider: string;
}) {
  const queryClient = useQueryClient();
  const sheetData: CharacterSheetData = (() => {
    try { return character.sheetData ? JSON.parse(character.sheetData) : { status: "idle" }; } catch { return { status: "idle" }; }
  })();
  const expressionData: CharacterExpressionData = sheetData.assets?.expression ?? { status: "idle" };

  const genMut = useMutation({
    mutationFn: () => generateCharacterSheet(character.id, provider || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project"] });
      toast.success(`${character.name} 设计稿生成完成`);
    },
    onError: (e) => toast.error(String(e)),
  });

  const expressionMut = useMutation({
    mutationFn: () => generateCharacterExpressionSheet(character.id, provider || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project"] });
      toast.success(`${character.name} 表情稿生成完成`);
    },
    onError: (e) => toast.error(String(e)),
  });

  const isGenerating = genMut.isPending || sheetData.status === "generating";
  const isExpressionGenerating = expressionMut.isPending || expressionData.status === "generating";

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="relative flex aspect-[3/2] items-center justify-center bg-muted">
        {sheetData.status === "done" ? (
          <img
            src={characterSheetImageUrl(character.id)}
            alt={`${character.name} 设计稿`}
            className="h-full w-full object-cover"
          />
        ) : isGenerating ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-xs">生成中…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
            <Users className="h-10 w-10" />
            <span className="text-xs">暂无设计稿</span>
          </div>
        )}
        {sheetData.status === "error" && (
          <div className="absolute inset-x-0 bottom-0 truncate bg-destructive/80 px-2 py-1 text-xs text-white">
            {sheetData.error}
          </div>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{character.name}</p>
            {character.persona && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{character.persona}</p>
            )}
          </div>
          {sheetData.status === "done" && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">v{sheetData.version ?? 1}</Badge>
          )}
        </div>

        {expressionData.status === "done" ? (
          <div className="overflow-hidden rounded border bg-muted">
            <img
              src={characterExpressionImageUrl(character.id)}
              alt={`${character.name} 表情稿`}
              className="aspect-[3/2] w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between rounded border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Smile className="h-3 w-3" />
              表情稿
            </span>
            <span>{expressionData.status === "error" ? "生成失败" : "待生成"}</span>
          </div>
        )}

        {character.visualAnchor && (
          <p className="line-clamp-2 rounded bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
            {(() => {
              try {
                const parsed = JSON.parse(character.visualAnchor) as Record<string, unknown>;
                return (typeof parsed.description === "string" ? parsed.description : typeof parsed.hint === "string" ? parsed.hint : character.visualAnchor) ?? "";
              } catch { return character.visualAnchor; }
            })()}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant={sheetData.status === "done" ? "outline" : "default"}
            className="h-7 text-xs"
            disabled={isGenerating}
            onClick={() => genMut.mutate()}
          >
            {isGenerating ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> 生成中…</>
            ) : sheetData.status === "done" ? (
              <><RefreshCw className="h-3 w-3" /> 三视图</>
            ) : (
              <><Sparkles className="h-3 w-3" /> 三视图</>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={expressionData.status === "done" ? "outline" : "secondary"}
            className="h-7 text-xs"
            disabled={isExpressionGenerating}
            onClick={() => expressionMut.mutate()}
          >
            {isExpressionGenerating ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> 生成中…</>
            ) : expressionData.status === "done" ? (
              <><RefreshCw className="h-3 w-3" /> 表情稿</>
            ) : (
              <><Smile className="h-3 w-3" /> 表情稿</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CharactersPanel({
  project,
  provider,
}: {
  project: { characters: ComicCharacter[] };
  provider: string;
}) {
  if (project.characters.length === 0) {
    return (
      <div className="space-y-2 py-12 text-center text-sm text-muted-foreground">
        <Users className="mx-auto h-10 w-10 opacity-30" />
        <p>暂无角色。</p>
        <p className="text-xs">导入内容源后，角色会自动提取到这里。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">角色视觉资产</p>
        <p className="text-xs leading-relaxed">
          三视图锁定外貌和服装，表情稿补齐常用情绪。格子图生成会自动组合角色锚点、设计稿和表情裁切参考。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {project.characters.map((character) => (
          <CharacterSheetCard key={character.id} character={character} provider={provider} />
        ))}
      </div>
    </div>
  );
}
