import { Film, RefreshCw, Sparkles, Video } from "lucide-react";
import type { DramaEpisode, DramaProjectDetail, DramaShot, DramaStoryboard, DramaVideoPrompt } from "@/api/drama";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DramaVisualPanel(props: {
  project: DramaProjectDetail;
  selectedOrder: number | null;
  onSelectOrder: (order: number) => void;
  onStoryboard: (order: number) => void;
  onVideoPrompt: (shot: DramaShot) => void;
  onProviderTask: (prompt: DramaVideoPrompt) => void;
  onRefreshProviderTask: (prompt: DramaVideoPrompt) => void;
  busy: boolean;
}) {
  const episodes = props.project.episodes ?? [];
  const selectedEpisode: DramaEpisode | undefined = episodes.find((episode) => episode.order === props.selectedOrder) ?? episodes[0];
  const storyboards = selectedEpisode?.storyboards ?? [];
  const storyboard = storyboards[0] as DramaStoryboard | undefined;
  const promptsByShot = new Map((props.project.videoPrompts ?? []).filter((prompt) => prompt.shotId).map((prompt) => [prompt.shotId, prompt]));

  if (!selectedEpisode) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">先生成分集和台本，再进入分镜与视频提示词。</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={selectedEpisode.order}
          onChange={(event) => props.onSelectOrder(Number(event.target.value))}
        >
          {episodes.map((episode) => (
            <option key={episode.id} value={episode.order}>第 {episode.order} 集 {episode.title}</option>
          ))}
        </select>
        <Button type="button" disabled={props.busy || !selectedEpisode.content?.trim()} onClick={() => props.onStoryboard(selectedEpisode.order)}>
          <Film className="h-4 w-4" />
          生成分镜
        </Button>
      </div>
      {!storyboard ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">当前集还没有分镜。</div>
      ) : (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">分镜</CardTitle>
            <CardDescription>{storyboard.summary || "已生成镜头序列。"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(storyboard.shots ?? []).map((shot) => {
              const prompt = promptsByShot.get(shot.id);
              return (
                <div key={shot.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">镜头 {shot.order} · {shot.shotSize || "景别待定"}</div>
                      <div className="text-sm text-muted-foreground">{shot.action}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" type="button" variant="outline" disabled={props.busy} onClick={() => props.onVideoPrompt(shot)}>
                        <Video className="h-4 w-4" />
                        视频提示词
                      </Button>
                      {prompt ? (
                        <>
                          <Button size="sm" type="button" disabled={props.busy} onClick={() => props.onProviderTask(prompt)}>
                            <Sparkles className="h-4 w-4" />
                            创建视频任务
                          </Button>
                          {prompt.providerTaskId ? (
                            <Button size="sm" type="button" variant="outline" disabled={props.busy} onClick={() => props.onRefreshProviderTask(prompt)}>
                              <RefreshCw className="h-4 w-4" />
                              刷新状态
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                  {prompt ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="secondary">{prompt.provider}</Badge>
                        <Badge variant="outline">{prompt.status}</Badge>
                        {prompt.providerTaskId ? <span className="text-muted-foreground">任务：{prompt.providerTaskId}</span> : null}
                      </div>
                      <pre className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-xs leading-5">{prompt.prompt}</pre>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
