import { MAX_CHAPTER_REVIEW_RETRIES, type ChapterReviewRetryPolicy } from "@ai-novel/shared/types/directorIssue";

export function ChapterReviewRetryFields({ value, onChange }: {
  value: ChapterReviewRetryPolicy;
  onChange: (value: ChapterReviewRetryPolicy) => void;
}) {
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium">正文检查最大重试次数</span>
          <input type="number" min={0} max={MAX_CHAPTER_REVIEW_RETRIES} step={1}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value.maxRetries}
            onChange={event => {
              const maxRetries = Number(event.target.value);
              if (Number.isInteger(maxRetries) && maxRetries >= 0 && maxRetries <= MAX_CHAPTER_REVIEW_RETRIES) onChange({ ...value, maxRetries });
            }} />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">次数耗尽后</span>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value.onExhausted}
            onChange={event => onChange({ ...value, onExhausted: event.target.value as ChapterReviewRetryPolicy["onExhausted"] })}>
            <option value="continue_with_warning">跳过检查并继续</option>
            <option value="pause_for_manual">暂停等待处理</option>
          </select>
        </label>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        可设 0–{MAX_CHAPTER_REVIEW_RETRIES} 次，不含首次正文检查和修文后的首次复验。同一章的正文检查纠错共用次数；设为 0 时不自动重试。
        跳过会保留可用正文并标记检查未完成；暂停后从小说工作台继续处理。正文不可用或保存失败时会停止。
      </p>
    </div>
  );
}
