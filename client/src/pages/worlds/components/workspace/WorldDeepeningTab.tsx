import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorldDeepeningQuestion } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/api/queryKeys";
import { getWorldKnowledgeDocuments, updateWorldKnowledgeDocuments } from "@/api/knowledge";
import KnowledgeDocumentPicker from "@/components/knowledge/KnowledgeDocumentPicker";
import { toast } from "@/components/ui/toast";

interface WorldDeepeningTabProps {
  worldId?: string;
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
    worldId,
    questions,
    answerDrafts,
    setAnswerDrafts,
    llmQuickOptions,
    generatePending,
    submitPending,
    onGenerate,
    onSubmit,
  } = props;

  const queryClient = useQueryClient();
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const bindingsQuery = useQuery({
    queryKey: queryKeys.worlds.knowledgeDocuments(worldId ?? ""),
    queryFn: () => getWorldKnowledgeDocuments(worldId!),
    enabled: Boolean(worldId),
  });

  const boundDocuments = useMemo(() => bindingsQuery.data?.data ?? [], [bindingsQuery.data?.data]);

  useEffect(() => {
    if (bindingsQuery.data?.data) {
      setSelectedIds(bindingsQuery.data.data.map((item) => item.id));
    }
  }, [bindingsQuery.data?.data]);

  const updateBindingsMutation = useMutation({
    mutationFn: (ids: string[]) => updateWorldKnowledgeDocuments(worldId!, ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.worlds.knowledgeDocuments(worldId ?? ""),
      });
      toast.success(i18next.t("worlds.worldDeepeningTab.ij1jez"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "更新参考作品失败");
    },
  });

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

  const handleSaveBindings = () => {
    if (!worldId) return;
    updateBindingsMutation.mutate(selectedIds);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{i18next.t("dict.gen_5aca8bac")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 增补小说/相关作品关联面板 */}
        <div className="rounded-md border bg-muted/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{i18next.t("worlds.worldDeepeningTab.nekw0l")}</span>
                <Badge variant="secondary">已关联 {boundDocuments.length} 篇作品文档</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{i18next.t("worlds.worldDeepeningTab.2pw180")}</div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPicker((prev) => !prev)}
            >
              {showPicker ? "收起增补作品库" : "选择 / 增添相关小说文档"}
            </Button>
          </div>

          {boundDocuments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {boundDocuments.map((doc) => (
                <Badge key={doc.id} variant="outline" className="bg-background">
                  📖 {doc.title}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-xs text-amber-700 bg-amber-50 rounded p-2 border border-amber-200">{i18next.t("worlds.worldDeepeningTab.c58id")}</div>
          )}

          {showPicker ? (
            <div className="mt-3 space-y-3 rounded-md border bg-background p-3">
              <KnowledgeDocumentPicker
                selectedIds={selectedIds}
                onChange={(next) => setSelectedIds(next ?? [])}
                title={i18next.t("worlds.worldDeepeningTab.pdtznw")}
                description={i18next.t("worlds.worldDeepeningTab.sczvmm")}
                queryStatus="enabled"
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPicker(false)}
                >{i18next.t("common.cancel")}</Button>
                <Button
                  size="sm"
                  onClick={handleSaveBindings}
                  disabled={updateBindingsMutation.isPending}
                >
                  {updateBindingsMutation.isPending ? "保存中..." : "保存增补作品绑定"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* 生成提问主控制栏 */}
        <div className="flex flex-col gap-3 rounded-md border p-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium">{i18next.t("dict.gen_c425f122")}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{i18next.t("worlds.worldDeepeningTab.uxxlp4")}</div>
          </div>
          <Button onClick={onGenerate} disabled={generatePending}>
            {generatePending ? "正在结合增补作品生成提问..." : "结合增补作品生成深化问题"}
          </Button>
        </div>

        {questions.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{i18next.t("dict.gen_30d4af46")}</div>
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
                        {answered ? i18next.t("dict.gen_8ce34e40") : i18next.t("dict.gen_94f1ce1b")}
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
                  <div className="mt-1 text-xs text-muted-foreground">{i18next.t("worlds.worldDeepeningTab.fmni4e")}</div>
                </div>
                {activeQuickOptions.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_ef7ab18a")}</div>
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
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{i18next.t("worlds.worldDeepeningTab.g4zvuo")}</div>
                )}
                <textarea
                  className="min-h-[100px] w-full rounded-md border bg-background p-2 text-sm"
                  value={answerDrafts[activeQuestion.id] ?? ""}
                  onChange={(event) =>
                    setAnswerDrafts((prev) => ({ ...prev, [activeQuestion.id]: event.target.value }))
                  }
                  placeholder={i18next.t("dict.gen_a201e60c")}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{i18next.t("worlds.worldDeepeningTab.cv1fd4")}</div>
        )}
        <div className="flex justify-end">
          <Button
            onClick={onSubmit}
            disabled={submitPending || answeredCount === 0 || questions.length === 0}
          >
            {submitPending ? i18next.t("dict.gen_2202334c") : i18next.t("dict.gen_4dc912d6")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
