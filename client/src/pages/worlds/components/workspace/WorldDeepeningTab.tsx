import type { Dispatch, SetStateAction } from "react";
import type { WorldDeepeningQuestion } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WorldDeepeningTabProps {
  questions: WorldDeepeningQuestion[];
  answerDrafts: Record<string, string>;
  setAnswerDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  llmQuickOptions: Record<string, string[]>;
  generatePending: boolean;
  submitPending: boolean;
  onGenerate: () => void;
  onSubmit: () => void;
}

export default function WorldDeepeningTab(props: WorldDeepeningTabProps) {
  const {
    questions,
    answerDrafts,
    setAnswerDrafts,
    llmQuickOptions,
    generatePending,
    submitPending,
    onGenerate,
    onSubmit,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>问答深化</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={onGenerate} disabled={generatePending}>
          {generatePending ? "生成中..." : "生成深化问题"}
        </Button>
        {questions.map((question) => {
          const quickOptions = (question.quickOptions ?? llmQuickOptions[question.id] ?? [])
            .map((option) => option.trim())
            .filter(Boolean)
            .slice(0, 4);

          return (
            <div key={question.id} className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">
                [{question.priority}] {question.question}
              </div>
              {quickOptions.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    快捷选项（由模型返回，可一键填入）
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickOptions.map((option) => (
                      <Button
                        key={`${question.id}-${option}`}
                        size="sm"
                        variant={answerDrafts[question.id] === option ? "default" : "outline"}
                        className="h-auto whitespace-normal text-left"
                        onClick={() =>
                          setAnswerDrafts((prev) => ({ ...prev, [question.id]: option }))
                        }
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  当前问题未返回快捷选项，请直接填写回答。
                </div>
              )}
              <textarea
                className="min-h-[100px] w-full rounded-md border bg-background p-2 text-sm"
                value={answerDrafts[question.id] ?? ""}
                onChange={(event) =>
                  setAnswerDrafts((prev) => ({ ...prev, [question.id]: event.target.value }))
                }
                placeholder="填写你的回答"
              />
              <div className="text-xs text-muted-foreground">
                target: {question.targetLayer ?? "-"} / {question.targetField ?? "-"} / status:{" "}
                {question.status}
              </div>
            </div>
          );
        })}
        <Button
          onClick={onSubmit}
          disabled={submitPending || Object.keys(answerDrafts).length === 0 || questions.length === 0}
        >
          {submitPending ? "整合中..." : "提交并整合回答"}
        </Button>
      </CardContent>
    </Card>
  );
}
