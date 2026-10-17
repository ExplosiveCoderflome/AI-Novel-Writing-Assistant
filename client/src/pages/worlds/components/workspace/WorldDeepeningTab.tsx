import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {readWorldAnswerIntegration, type WorldDeepeningQuestion} from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";

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

export function collectWorldAnswerDrafts(questions: WorldDeepeningQuestion[], drafts: Record<string, string>) {
  return Object.fromEntries(questions.map(question => [question.id, drafts[question.id] ?? question.answer ?? ""])
    .filter(([id, answer]) => {
      const question = questions.find(row => row.id === id)!;
      return answer.trim() && (question.status !== "integrated" || answer.trim() !== question.answer?.trim() || !readWorldAnswerIntegration(question.integratedSummary));
    }));
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
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const activeQuestion = useMemo(() => {
    if (questions.length === 0) {
      return null;
    }
    return questions.find((question) => question.id === activeQuestionId) ?? questions[0];
  }, [activeQuestionId, questions]);
  const activeQuickOptions = activeQuestion
    ? (activeQuestion.quickOptions ?? llmQuickOptions[activeQuestion.id] ?? [])
      .map((option) => option.trim())
      .filter(Boolean)
      .slice(0, 4)
    : [];
  const answeredCount = Object.keys(collectWorldAnswerDrafts(questions, answerDrafts)).length;
  const activeIntegration = readWorldAnswerIntegration(activeQuestion?.integratedSummary);

  return (
    <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">补齐关键设定</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">AI 会从手册中找出最影响故事成立的空白，你只需选择方向或用一句话回答。</p>
        </div>

        <div className="flex flex-col gap-4 rounded-3xl bg-primary/[0.055] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="font-medium">寻找下一批关键问题</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              每次只聚焦少量高影响问题，回答会整合进规则、势力、地点或冲突设定。
            </div>
          </div>
          <Button className="shrink-0 rounded-full" onClick={onGenerate} disabled={generatePending}>
            {generatePending ? "生成中..." : "生成补齐问题"}
          </Button>
        </div>

        {questions.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-3xl bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="px-2 text-sm font-medium">待补问题</div>
                <div className="text-xs text-muted-foreground">{answeredCount}/{questions.length}</div>
              </div>
              {questions.map((question, index) => {
                const answered = Boolean(answerDrafts[question.id]?.trim() || question.answer?.trim());
                const integrated = question.status === "integrated" && readWorldAnswerIntegration(question.integratedSummary)
                  && (answerDrafts[question.id] === undefined || answerDrafts[question.id].trim() === question.answer?.trim());
                const selected = activeQuestion?.id === question.id;
                return (
                  <button
                    key={question.id}
                    type="button"
                    className={[
                      "w-full rounded-2xl px-3 py-2.5 text-left text-sm transition-colors",
                      selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60",
                    ].join(" ")}
                    onClick={() => setActiveQuestionId(question.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">问题 {index + 1}</span>
                      <span className={answered ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
                        {integrated ? "已整合" : answered ? "待整合" : "待回答"}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {question.question}
                    </div>
                  </button>
                );
              })}
            </div>

            {activeQuestion ? (
              <div className="space-y-4 rounded-3xl bg-muted/20 p-5">
                <div>
                  <div className="text-sm font-medium text-foreground">{activeQuestion.question}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    这条回答会用于补齐世界手册。
                  </div>
                </div>
                {activeIntegration ? <div role="status" className="rounded-2xl bg-primary/5 p-3 text-sm leading-6">
                  <div className="font-medium">手册整合结果</div>
                  <p>{activeIntegration.summary}</p>
                </div> : activeQuestion.answer ? <p className="text-sm text-muted-foreground">回答已保存，可提交整合到世界手册。</p> : null}
                {activeQuickOptions.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">可直接采用的回答方向</div>
                    <div className="flex flex-wrap gap-2">
                      {activeQuickOptions.map((option) => (
                        <Button
                          key={`${activeQuestion.id}-${option}`}
                          size="sm"
                          variant={answerDrafts[activeQuestion.id] === option ? "default" : "outline"}
                          className="h-auto rounded-2xl whitespace-normal text-left"
                          onClick={() =>
                            setAnswerDrafts((prev) => ({ ...prev, [activeQuestion.id]: option }))
                          }
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-muted/20 p-3 text-xs text-muted-foreground">
                    可以直接写你的设定答案，也可以先用一句话描述方向。
                  </div>
                )}
                <textarea
                  className="min-h-[120px] w-full rounded-2xl border border-border/45 bg-background/80 p-3 text-sm leading-6"
                  value={answerDrafts[activeQuestion.id] ?? activeQuestion.answer ?? ""}
                  onChange={(event) =>
                    setAnswerDrafts((prev) => ({ ...prev, [activeQuestion.id]: event.target.value }))
                  }
                  placeholder="填写这条设定补充"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl bg-muted/20 px-6 text-center">
            <div className="font-medium">等待发现世界中的关键空白</div>
            <div className="mt-1 text-sm text-muted-foreground">生成问题后，可以逐条选择建议方向或补充自己的设定。</div>
          </div>
        )}
        <div className="flex justify-end">
          <Button
            className="rounded-full"
            onClick={onSubmit}
            disabled={submitPending || answeredCount === 0 || questions.length === 0}
          >
            {submitPending ? "整合中..." : "提交并整合回答"}
          </Button>
        </div>
    </section>
  );
}
