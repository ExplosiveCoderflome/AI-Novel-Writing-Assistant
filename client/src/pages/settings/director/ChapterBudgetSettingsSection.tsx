import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {DEFAULT_DIRECTOR_CHAPTER_TOKEN_LIMIT, directorChapterTokenLimitSchema, MAX_DIRECTOR_CHAPTER_TOKEN_LIMIT} from "@ai-novel/shared/types/director/chapterBudget";
import {getDirectorChapterBudgetSettings, saveDirectorChapterBudgetSettings} from "@/api/settings";
import {queryKeys} from "@/api/queryKeys";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

export function ChapterBudgetSettingsSection() {
  const queries = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const query = useQuery({queryKey: queryKeys.settings.directorChapterBudget, queryFn: getDirectorChapterBudgetSettings});
  const value = draft ?? String(query.data?.data?.tokenLimit ?? DEFAULT_DIRECTOR_CHAPTER_TOKEN_LIMIT);
  const valid = value.trim() !== "" && directorChapterTokenLimitSchema.safeParse(Number(value)).success;
  const save = useMutation({mutationFn: () => saveDirectorChapterBudgetSettings({tokenLimit: Number(value)}),
    onSuccess: async response => {
      queries.setQueryData(queryKeys.settings.directorChapterBudget, response);
      setDraft(null);
      setFeedback(response.message ?? "单章 AI 用量上限已保存，将用于新任务。");
      await queries.invalidateQueries({queryKey: queryKeys.settings.directorChapterBudget});
    }, onError: error => setFeedback(error instanceof Error ? error.message : "保存失败，请重试。")});
  return <section className="space-y-3 py-4" aria-labelledby="chapter-budget-settings-title">
    <div className="space-y-1">
      <h2 id="chapter-budget-settings-title" className="text-base font-medium">单章 AI 用量上限</h2>
      <p className="text-sm text-muted-foreground">设置新任务每章的累计 AI 用量。达到上限或剩余额度不足以进行下一步时，AI 会保存进度并询问是否追加预算。</p>
    </div>
    <label className="block max-w-xs space-y-2 text-sm">默认上限（Tokens）
      <Input type="number" min={16001} max={MAX_DIRECTOR_CHAPTER_TOKEN_LIMIT} step={1} value={value}
        disabled={query.isLoading || save.isPending} aria-invalid={!valid}
        onChange={event => {setDraft(event.target.value); setFeedback("");}}/>
    </label>
    <p className="text-xs leading-5 text-muted-foreground">默认 100,000；可设置 16,001—10,000,000。按未命中输入与输出累计计算，与模型的单次最大输出不同。任务开始后保留自己的额度设置。</p>
    {!valid ? <p className="text-xs text-destructive">请输入 16,001 至 10,000,000 之间的整数。</p> : null}
    {query.isError ? <p role="alert" className="text-xs text-destructive">读取设置失败，请重试。<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>重新读取</Button></p> : null}
    <Button disabled={query.isLoading || query.isError || save.isPending || !valid} onClick={() => save.mutate()}>{save.isPending ? "保存中…" : "保存"}</Button>
    {feedback ? <p role="status" className="text-sm text-muted-foreground">{feedback}</p> : null}
  </section>;
}
