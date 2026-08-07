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
    role: "main character",
    personality: "",
    background: "",
    development: "",
    category: "main character",
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
        <Button>Create a role</Button>
      </DialogTrigger>
      <DialogContent className="w-[96vw] max-h-[90vh] max-w-[1400px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a role</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create a role manually</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="Character name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="Role positioning (protagonist/villain/supporting role)"
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="Character traits"
                value={form.personality}
                onChange={(event) => setForm((prev) => ({ ...prev, personality: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                value={form.background}
                onChange={(event) => setForm((prev) => ({ ...prev, background: event.target.value }))}
              />
              <input
                className="rounded-md border p-2 text-sm md:col-span-2"
                placeholder="Growth trajectory"
                value={form.development}
                onChange={(event) => setForm((prev) => ({ ...prev, development: event.target.value }))}
              />
              <Button
                className="md:col-span-2"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.name.trim()}
              >
                {createMutation.isPending ? "Creating..." : "Create a role"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI-generated characters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="min-h-[120px] w-full rounded-md border p-2 text-sm"
                placeholder="Enter a character description, for example: a calm and sensible young swordsman with a family feud."
                value={aiDescription}
                onChange={(event) => setAIDescription(event.target.value)}
              />

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">Advanced settings (optional)</div>
                  <Button size="sm" variant="outline" onClick={() => setConstraints(createDefaultConstraints())}>
                    Clear advanced settings with one click
                                                        </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">Role function bits</div>
                    <SelectControl
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={constraints.storyFunction ?? ""}
                      onChange={(event) =>
                        setConstraints((prev) => ({
                          ...prev,
                          storyFunction: (event.target.value || undefined) as CharacterGenerateConstraints["storyFunction"],
                        }))}
                    >
                      <option value="">Do not specify</option>
                      <option value="main character">main character</option>
                      <option value="Villain">Villain</option>
                      <option value="tutor">tutor</option>
                      <option value="control group">control group</option>
                      <option value="supporting role">supporting role</option>
                    </SelectControl>
                  </label>

                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">Growth stage</div>
                    <SelectControl
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={constraints.growthStage ?? ""}
                      onChange={(event) =>
                        setConstraints((prev) => ({
                          ...prev,
                          growthStage: (event.target.value || undefined) as CharacterGenerateConstraints["growthStage"],
                        }))}
                    >
                      <option value="">Do not specify</option>
                      <option value="starting point">starting point</option>
                      <option value="frustrated">frustrated</option>
                      <option value="turning point">turning point</option>
                      <option value="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
                      <option value="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
                    </SelectControl>
                  </label>

                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                    value={constraints.externalGoal ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, externalGoal: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder="Intrinsic needs (real desires)"
                    value={constraints.internalNeed ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, internalNeed: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder="core fear"
                    value={constraints.coreFear ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, coreFear: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder="moral bottom line"
                    value={constraints.moralBottomLine ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, moralBottomLine: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder="The secret that cannot be told"
                    value={constraints.secret ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, secret: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm"
                    placeholder="core flaw"
                    value={constraints.coreFlaw ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, coreFlaw: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm md:col-span-2"
                    placeholder="Relationship hooks (conflicts/entanglements with others)"
                    value={constraints.relationshipHooks ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, relationshipHooks: event.target.value }))}
                  />
                  <input
                    className="rounded-md border p-2 text-sm md:col-span-2"
                    placeholder="Tone style (such as cold and restrained, humorous and spicy)"
                    value={constraints.toneStyle ?? ""}
                    onChange={(event) => setConstraints((prev) => ({ ...prev, toneStyle: event.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Reference knowledge base (multiple choices available)</div>
                  <div className="max-h-48 space-y-2 overflow-auto rounded-md border p-2">
                    {knowledgeDocumentsQuery.isLoading ? (
                      <div className="text-sm text-muted-foreground">loading...</div>
                    ) : null}
                    {!knowledgeDocumentsQuery.isLoading && knowledgeDocuments.length === 0 ? (
                      <div className="text-sm text-muted-foreground">There is currently no optional knowledge document.</div>
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
                  <div className="text-xs text-muted-foreground">If not selected, the knowledge base content will not be referenced.</div>
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium">Reference book analysis (multiple choices available)</div>
                  <div className="max-h-48 space-y-2 overflow-auto rounded-md border p-2">
                    {bookAnalysesQuery.isLoading ? (
                      <div className="text-sm text-muted-foreground">loading...</div>
                    ) : null}
                    {!bookAnalysesQuery.isLoading && bookAnalyses.length === 0 ? (
                      <div className="text-sm text-muted-foreground">There is currently no optional book analysis.</div>
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
                  <div className="text-xs text-muted-foreground">Only display completed book split analysis.</div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Selected Reference: Knowledge Base {selectedKnowledgeDocumentIds.length} item, open book {selectedBookAnalysisIds.length} item.
                                            </div>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !aiDescription.trim()}
              >
                {generateMutation.isPending ? "Generating..." : "Generate and merge into database"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
