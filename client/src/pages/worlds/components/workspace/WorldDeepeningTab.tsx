import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
  const answeredCount = questions.filter((question) => answerDrafts[question.id]?.trim()).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Completing the World Manual</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-md border p-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium">Filling in critical gaps in the World Handbook</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              The system will ask a small number of questions based on this world manual. The answers will be integrated into the world setting to help make rules, forces, locations, and conflicts clearer.
                                      </div>
          </div>
          <Button onClick={onGenerate} disabled={generatePending}>
            {generatePending ? "Generating..." : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
          </Button>
        </div>

        {questions.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Questions to be answered</div>
                <div className="text-xs text-muted-foreground">{answeredCount}/{questions.length}</div>
              </div>
              {questions.map((question, index) => {
                const answered = Boolean(answerDrafts[question.id]?.trim());
                const selected = activeQuestion?.id === question.id;
                return (
                  <button
                    key={question.id}
                    type="button"
                    className={[
                      "w-full rounded-md border p-2 text-left text-sm transition-colors",
                      selected ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40",
                    ].join(" ")}
                    onClick={() => setActiveQuestionId(question.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">question {index + 1}</span>
                      <span className={answered ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
                        {answered ? "There is an answer" : "To be answered"}
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
              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{activeQuestion.question}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    This answer will be used to complete the World Manual.
                                                        </div>
                </div>
                {activeQuickOptions.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Answer directions that can be taken directly</div>
                    <div className="flex flex-wrap gap-2">
                      {activeQuickOptions.map((option) => (
                        <Button
                          key={`${activeQuestion.id}-${option}`}
                          size="sm"
                          variant={answerDrafts[activeQuestion.id] === option ? "default" : "outline"}
                          className="h-auto whitespace-normal text-left"
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
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    You can write your set answer directly, or you can describe the direction in one sentence first.
                                                            </div>
                )}
                <textarea
                  className="min-h-[100px] w-full rounded-md border bg-background p-2 text-sm"
                  value={answerDrafts[activeQuestion.id] ?? ""}
                  onChange={(event) =>
                    setAnswerDrafts((prev) => ({ ...prev, [activeQuestion.id]: event.target.value }))
                  }
                  placeholder="Fill out this setting supplement"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Questions that help shape the world are presented here. After generating the questions, just add them one by one.
                                    </div>
        )}
        <div className="flex justify-end">
          <Button
            onClick={onSubmit}
            disabled={submitPending || answeredCount === 0 || questions.length === 0}
          >
            {submitPending ? "Integrating..." : "Submitting and integrating the answer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
