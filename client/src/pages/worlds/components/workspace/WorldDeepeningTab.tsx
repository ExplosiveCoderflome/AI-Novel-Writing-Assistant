import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
        <CardTitle>{t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_5aca8bac")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-md border p-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_c425f122")}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              系统会根据这份世界手册提出少量问题。回答后会整合进世界设定，帮助规则、势力、地点和冲突更清晰。
            </div>
          </div>
          <Button onClick={onGenerate} disabled={generatePending}>
            {generatePending ? t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_4d020ba3") : t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_b89f7c25")}
          </Button>
        </div>

        {questions.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_30d4af46")}</div>
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
                      <span className="font-medium text-foreground">问题 {index + 1}</span>
                      <span className={answered ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
                        {answered ? t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_8ce34e40") : t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_94f1ce1b")}
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
                    这条回答会用于补齐世界手册。
                  </div>
                </div>
                {activeQuickOptions.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_ef7ab18a")}</div>
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
                    可以直接写你的设定答案，也可以先用一句话描述方向。
                  </div>
                )}
                <textarea
                  className="min-h-[100px] w-full rounded-md border bg-background p-2 text-sm"
                  value={answerDrafts[activeQuestion.id] ?? ""}
                  onChange={(event) =>
                    setAnswerDrafts((prev) => ({ ...prev, [activeQuestion.id]: event.target.value }))
                  }
                  placeholder={t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_a201e60c")}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            这里会展示能帮助世界成型的问题。生成问题后，逐条补充即可。
          </div>
        )}
        <div className="flex justify-end">
          <Button
            onClick={onSubmit}
            disabled={submitPending || answeredCount === 0 || questions.length === 0}
          >
            {submitPending ? t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_2202334c") : t("gen.pages.worlds.components.workspace.WorldDeepeningTab.gen_4dc912d6")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
