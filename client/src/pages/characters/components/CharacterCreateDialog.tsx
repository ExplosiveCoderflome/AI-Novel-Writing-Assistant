import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listBookAnalyses } from "@/api/bookAnalysis";
import type { CharacterGenerateConstraints } from "@/api/character";
import { createBaseCharacter, generateBaseCharacter } from "@/api/character";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import SelectControl from "@/components/common/SelectControl";

function createDefaultConstraints(): CharacterGenerateConstraints {
  return {
    storyFunction: undefined,
    externalGoal: "",
    internalNeed: "",
    coreFear: "",
    moralBottomLine: "",
    secret: "",
    coreFlaw: "",
    relationshipHooks: "",
    growthStage: undefined,
    toneStyle: "",
  };
}

interface CharacterCreateDialogProps {
  onCreated?: () => void;
}

export function CharacterCreateDialog({ onCreated }: CharacterCreateDialogProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: t("gen.pages.characters.components.CharacterCreateDialog.mainCharacter"),
    personality: "",
    background: "",
    development: "",
    category: t("gen.pages.characters.components.CharacterCreateDialog.mainCharacter"),
  });
  const [aiDescription, setAIDescription] = useState("");
  const [constraints, setConstraints] = useState<CharacterGenerateConstraints>(createDefaultConstraints());
  const [selectedKnowledgeDocumentIds, setSelectedKnowledgeDocumentIds] = useState<string[]>([]);
  const [selectedBookAnalysisIds, setSelectedBookAnalysisIds] = useState<string[]>([]);

  const knowledgeDocumentsQuery = useQuery({
    queryKey: queryKeys.knowledge.documents("character-generator"),
    queryFn: () => listKnowledgeDocuments({ status: "enabled" }),
  });
  const bookAnalysesQuery = useQuery({
    queryKey: queryKeys.bookAnalysis.list("character-generator-succeeded"),
    queryFn: () => listBookAnalyses({ status: "succeeded" }),
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.baseCharacters.all });
      onCreated?.();
      setIsOpen(false);
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateBaseCharacter({
        description: aiDescription,
        category: constraints.storyFunction ?? form.category,
        knowledgeDocumentIds: selectedKnowledgeDocumentIds.length > 0 ? selectedKnowledgeDocumentIds : undefined,
        bookAnalysisIds: selectedBookAnalysisIds.length > 0 ? selectedBookAnalysisIds : undefined,
        constraints: Object.values(constraints).some(Boolean) ? constraints : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.baseCharacters.all });
      onCreated?.();
      setAIDescription("");
      setIsOpen(false);
    },
  });

  const knowledgeDocuments = knowledgeDocumentsQuery.data?.data ?? [];
  const bookAnalyses = bookAnalysesQuery.data?.data ?? [];

  const toggleId = (ids: string[], id: string, checked: boolean) =>
    checked ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((item) => item !== id);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>{t("gen.pages.characters.components.CharacterCreateDialog.gen_00d61084")}</Button>
      </DialogTrigger>
      <DialogContent className="w-[96vw] max-h-[90vh] max-w-[1400px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("gen.pages.characters.components.CharacterCreateDialog.gen_00d61084")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("gen.pages.characters.components.CharacterCreateDialog.gen_9da1ccbd")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              <input
                className="rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_10a6f121")}
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_1461d16d")}
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_12c6fbb0")}
                value={form.personality}
                onChange={(event) => setForm((prev) => ({ ...prev, personality: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_78c847e0")}
                value={form.background}
                onChange={(event) => setForm((prev) => ({ ...prev, background: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm md:col-span-2"
                placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_4578b906")}
                value={form.development}
                onChange={(event) => setForm((prev) => ({ ...prev, development: event.target.value }))}
              />
              <Button
                className="md:col-span-2"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.name.trim()}
              >
                {createMutation.isPending ? t("gen.pages.characters.components.CharacterCreateDialog.gen_b26107b6") : t("gen.pages.characters.components.CharacterCreateDialog.gen_00d61084")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("gen.pages.characters.components.CharacterCreateDialog.aiGenerateCharacter")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_8d4203f3")}
                value={aiDescription}
                onChange={(event) => setAIDescription(event.target.value)}
              />

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{t("gen.pages.characters.components.CharacterCreateDialog.gen_dc6fc1c8")}</div>
                  <Button size="sm" variant="outline" onClick={() => setConstraints(createDefaultConstraints())}>
                    一键清空高级设定
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.characters.components.CharacterCreateDialog.gen_298006e9")}</div>
                    <SelectControl
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={constraints.storyFunction ?? ""}
                      onChange={(event) =>
                        setConstraints((prev) => ({
                          ...prev,
                          storyFunction: (event.target.value || undefined) as CharacterGenerateConstraints["storyFunction"],
                        }))}
                    >
                      <option value="">{t("gen.pages.characters.components.CharacterCreateDialog.unspecified")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.mainCharacter")}>{t("gen.pages.characters.components.CharacterCreateDialog.mainCharacter")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.gen_27dd76d8")}>{t("gen.pages.characters.components.CharacterCreateDialog.gen_27dd76d8")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.gen_d62518be")}>{t("gen.pages.characters.components.CharacterCreateDialog.gen_d62518be")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.gen_964031bc")}>{t("gen.pages.characters.components.CharacterCreateDialog.gen_964031bc")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.gen_f14665fc")}>{t("gen.pages.characters.components.CharacterCreateDialog.gen_f14665fc")}</option>
                    </SelectControl>
                  </label>

                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.characters.components.CharacterCreateDialog.gen_44ce6ba8")}</div>
                    <SelectControl
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={constraints.growthStage ?? ""}
                      onChange={(event) =>
                        setConstraints((prev) => ({
                          ...prev,
                          growthStage: (event.target.value || undefined) as CharacterGenerateConstraints["growthStage"],
                        }))}
                    >
                      <option value="">{t("gen.pages.characters.components.CharacterCreateDialog.unspecified")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.gen_9b57745d")}>{t("gen.pages.characters.components.CharacterCreateDialog.gen_9b57745d")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.gen_58c5a448")}>{t("gen.pages.characters.components.CharacterCreateDialog.gen_58c5a448")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.gen_96213d99")}>{t("gen.pages.characters.components.CharacterCreateDialog.gen_96213d99")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.gen_f6fef1f0")}>{t("gen.pages.characters.components.CharacterCreateDialog.gen_f6fef1f0")}</option>
                      <option value={t("gen.pages.characters.components.CharacterCreateDialog.gen_5c2ed3e4")}>{t("gen.pages.characters.components.CharacterCreateDialog.gen_5c2ed3e4")}</option>
                    </SelectControl>
                  </label>

                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_5dfc673a")}
                    value={constraints.externalGoal ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, externalGoal: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_925f779d")}
                    value={constraints.internalNeed ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, internalNeed: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_e75f940f")}
                    value={constraints.coreFear ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, coreFear: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_6130a3d1")}
                    value={constraints.moralBottomLine ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, moralBottomLine: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.characters.components.CharacterCreateDialog.secretUnspoken")}
                    value={constraints.secret ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, secret: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_49a13094")}
                    value={constraints.coreFlaw ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, coreFlaw: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm md:col-span-2"
                    placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_fc800c81")}
                    value={constraints.relationshipHooks ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, relationshipHooks: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm md:col-span-2"
                    placeholder={t("gen.pages.characters.components.CharacterCreateDialog.gen_e7825e21")}
                    value={constraints.toneStyle ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, toneStyle: event.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium">{t("gen.pages.characters.components.CharacterCreateDialog.gen_ee2a28e8")}</div>
                  <div className="max-h-48 space-y-2 overflow-auto rounded-md border p-2">
                    {knowledgeDocumentsQuery.isLoading ? (
                      <div className="text-sm text-muted-foreground">{t("gen.pages.characters.components.CharacterCreateDialog.gen_26b5bd49")}</div>
                    ) : null}
                    {!knowledgeDocumentsQuery.isLoading && knowledgeDocuments.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{t("gen.pages.characters.components.CharacterCreateDialog.gen_3a83bc80")}</div>
                    ) : null}
                    {knowledgeDocuments.map((document) => (
                      <label key={document.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedKnowledgeDocumentIds.includes(document.id)}
                          onChange={(event) =>
                            setSelectedKnowledgeDocumentIds((prev) => toggleId(prev, document.id, event.target.checked))
                          }
                        />
                        <div className="min-w-0">
                          <div className="font-medium">{document.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {document.fileName} | v{document.activeVersionNumber}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">{t("gen.pages.characters.components.CharacterCreateDialog.gen_9a71ba68")}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium">{t("gen.pages.characters.components.CharacterCreateDialog.gen_d042c3f6")}</div>
                  <div className="max-h-48 space-y-2 overflow-auto rounded-md border p-2">
                    {bookAnalysesQuery.isLoading ? (
                      <div className="text-sm text-muted-foreground">{t("gen.pages.characters.components.CharacterCreateDialog.gen_26b5bd49")}</div>
                    ) : null}
                    {!bookAnalysesQuery.isLoading && bookAnalyses.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{t("gen.pages.characters.components.CharacterCreateDialog.gen_90230846")}</div>
                    ) : null}
                    {bookAnalyses.map((analysis) => (
                      <label key={analysis.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedBookAnalysisIds.includes(analysis.id)}
                          onChange={(event) =>
                            setSelectedBookAnalysisIds((prev) => toggleId(prev, analysis.id, event.target.checked))
                          }
                        />
                        <div className="min-w-0">
                          <div className="font-medium">{analysis.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {analysis.documentTitle} | v{analysis.documentVersionNumber}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">{t("gen.pages.characters.components.CharacterCreateDialog.showCompletedDeconstructionAnalysis")}</div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                已选参考：知识库 {selectedKnowledgeDocumentIds.length} 项，拆书 {selectedBookAnalysisIds.length} 项。
              </div>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !aiDescription.trim()}
              >
                {generateMutation.isPending ? t("gen.pages.characters.components.CharacterCreateDialog.gen_4d020ba3") : t("gen.pages.characters.components.CharacterCreateDialog.gen_9add1017")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
