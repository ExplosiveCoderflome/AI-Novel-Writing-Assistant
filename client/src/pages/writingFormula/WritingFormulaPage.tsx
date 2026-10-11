import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  StyleBinding,
  StyleProfile,
  StyleProfileFeature,
} from "@ai-novel/shared/types/styleEngine";
import { useNavigate, useSearchParams } from "react-router-dom";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getNovelDetail, getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import {
  createStyleBinding,
  deleteStyleBinding,
  deleteStyleProfile,
  detectStyleIssues,
  extractStyleFeaturesFromText,
  getAntiAiRules,
  getStyleBindings,
  getStyleProfiles,
  getStyleTemplates,
  rewriteStyleIssues,
  testWriteWithStyleProfile,
  updateStyleProfile,
} from "@/api/styleEngine";
import { useLLMStore } from "@/store/llmStore";
import WritingFormulaAdvancedWorkspace from "./components/WritingFormulaAdvancedWorkspace";
import WritingFormulaBookStyleFlow from "./components/WritingFormulaBookStyleFlow";
import WritingFormulaCleanPanel from "./components/WritingFormulaCleanPanel";
import WritingFormulaCreateDialog from "./components/WritingFormulaCreateDialog";
import WritingFormulaLanding from "./components/WritingFormulaLanding";
import WritingFormulaWorkbenchPanel from "./components/WritingFormulaWorkbenchPanel";
import {
  useWritingFormulaCreateFlow,
} from "./useWritingFormulaCreateFlow";
import { useWritingFormulaDialogFocus, type WritingFormulaDialogFocusIntent } from "./useWritingFormulaDialogFocus";
import { buildLandingProfileItems } from "./writingFormulaLandingItems";
import {
  buildProfileFeaturesFromDraft,
  buildRuleSetFromExtractedFeatures,
  normalizeCsv,
  parseJsonInput,
  prettyJson,
} from "./writingFormula.utils";
import { normalizeWritingFormulaMode } from "./writingFormulaV2.shared";

type WorkspaceDialog = null | "editor" | "workbench" | "clean";

export default function WritingFormulaPage() {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editorDialogRef = useRef<HTMLDivElement | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [message, setMessage] = useState("");
  const [activeWorkspaceDialog, setActiveWorkspaceDialog] = useState<WorkspaceDialog>(
    searchParams.get("profileId") ? "editor" : null,
  );
  const [editorFocusIntent, setEditorFocusIntent] = useState<WritingFormulaDialogFocusIntent>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(searchParams.get("mode") === "imitate");
  const [bookStyleNovelId, setBookStyleNovelId] = useState(searchParams.get("novelId") ?? "");
  const [editor, setEditor] = useState({
    name: "",
    description: "",
    category: "",
    tags: "",
    applicableGenres: "",
    sourceContent: "",
    extractedFeatures: [] as StyleProfileFeature[],
    analysisMarkdown: "",
    narrativeRules: "{}",
    characterRules: "{}",
    languageRules: "{}",
    rhythmRules: "{}",
    antiAiRuleIds: [] as string[],
  });
  const [bindingForm, setBindingForm] = useState({
    targetType: "novel" as StyleBinding["targetType"],
    novelId: "",
    chapterId: "",
    taskTargetId: "",
    priority: 1,
    weight: 1,
  });
  const [testWriteForm, setTestWriteForm] = useState({
    mode: "generate" as "generate" | "rewrite",
    topic: "",
    sourceText: "",
    targetLength: 1200,
  });
  const [testWriteOutput, setTestWriteOutput] = useState("");
  const [detectInput, setDetectInput] = useState("");
  const [rewritePreview, setRewritePreview] = useState("");

  const activeMode = normalizeWritingFormulaMode(searchParams.get("mode"));
  const incomingProfileId = searchParams.get("profileId") ?? "";
  const incomingSource = searchParams.get("source") ?? "";

  const profilesQuery = useQuery({
    queryKey: queryKeys.styleEngine.profiles,
    queryFn: getStyleProfiles,
  });
  const templatesQuery = useQuery({
    queryKey: queryKeys.styleEngine.templates,
    queryFn: getStyleTemplates,
  });
  const antiAiRulesQuery = useQuery({
    queryKey: queryKeys.styleEngine.antiAiRules,
    queryFn: getAntiAiRules,
  });
  const novelListQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
  });
  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(bindingForm.novelId || "none"),
    queryFn: () => getNovelDetail(bindingForm.novelId),
    enabled: Boolean(bindingForm.novelId),
  });
  const bindingsQuery = useQuery({
    queryKey: queryKeys.styleEngine.bindings(selectedProfileId || "selected-none"),
    queryFn: () => getStyleBindings(selectedProfileId ? { styleProfileId: selectedProfileId } : undefined),
  });
  const allBindingsQuery = useQuery({
    queryKey: queryKeys.styleEngine.bindings("all"),
    queryFn: () => getStyleBindings(),
  });

  const profiles = profilesQuery.data?.data ?? [];
  const templates = templatesQuery.data?.data ?? [];
  const antiAiRules = antiAiRulesQuery.data?.data ?? [];
  const bindings = bindingsQuery.data?.data ?? [];
  const allBindings = allBindingsQuery.data?.data ?? [];
  const novelOptions = (novelListQuery.data?.data?.items ?? []).map((novel) => ({
    id: novel.id,
    title: novel.title,
  }));
  const novelTitleMap = useMemo(
    () => Object.fromEntries(novelOptions.map((novel) => [novel.id, novel.title])),
    [novelOptions],
  );
  const chapterOptions = (novelDetailQuery.data?.data?.chapters ?? []).map((chapter) => ({
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
  }));
  const selectedProfile = useMemo(
    () => profiles.find((item) => item.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );
  const landingProfileItems = useMemo(
    () => buildLandingProfileItems({ profiles, allBindings, novelTitleMap }),
    [allBindings, novelTitleMap, profiles],
  );

  const openWorkspaceDialog = (dialog: Exclude<WorkspaceDialog, null>, profileId?: string) => {
    const targetProfileId = profileId || selectedProfileId || profiles[0]?.id || "";
    if (targetProfileId) {
      setSelectedProfileId(targetProfileId);
    }
    setActiveWorkspaceDialog(dialog);
    setEditorFocusIntent(dialog === "editor" ? "editor" : null);
  };

  const handleCreatedProfile = (profile: StyleProfile, successMessage: string) => {
    setSelectedProfileId(profile.id);
    setMessage(successMessage);
    setCreateDialogOpen(false);
    openWorkspaceDialog("editor", profile.id);
  };

  useEffect(() => {
    if (!selectedProfileId && profiles.length > 0) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  useEffect(() => {
    if (!bindingForm.novelId && novelOptions.length > 0) {
      setBindingForm((prev) => ({ ...prev, novelId: novelOptions[0].id }));
    }
  }, [bindingForm.novelId, novelOptions]);

  useEffect(() => {
    setBookStyleNovelId(searchParams.get("novelId") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (activeMode !== "imitate") {
      return;
    }

    setCreateDialogOpen(true);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("mode");
    setSearchParams(nextSearchParams, { replace: true });
  }, [activeMode, searchParams, setSearchParams]);

  useEffect(() => {
    if (activeMode !== "clean") {
      return;
    }

    const focusProfileId = selectedProfileId || profiles[0]?.id || "";
    if (!focusProfileId) {
      return;
    }

    openWorkspaceDialog("clean", focusProfileId);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("mode");
    setSearchParams(nextSearchParams, { replace: true });
  }, [activeMode, profiles, searchParams, selectedProfileId, setSearchParams]);

  useEffect(() => {
    if (!incomingProfileId || profiles.length === 0) {
      return;
    }

    const incomingProfile = profiles.find((item) => item.id === incomingProfileId);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("profileId");
    nextSearchParams.delete("source");

    if (!incomingProfile) {
      setSearchParams(nextSearchParams, { replace: true });
      return;
    }

    setSelectedProfileId(incomingProfile.id);
    setActiveWorkspaceDialog("editor");
    setEditorFocusIntent("editor");
    if (incomingSource === "book-analysis") {
      setMessage(`写法“${incomingProfile.name}”来自拆书结果，你可以继续检查规则、试写，或绑定到目标。`);
    }
    setSearchParams(nextSearchParams, { replace: true });
  }, [incomingProfileId, incomingSource, profiles, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedProfile) {
      return;
    }

    setEditor({
      name: selectedProfile.name,
      description: selectedProfile.description ?? "",
      category: selectedProfile.category ?? "",
      tags: selectedProfile.tags.join(", "),
      applicableGenres: selectedProfile.applicableGenres.join(", "),
      sourceContent: selectedProfile.sourceContent ?? "",
      extractedFeatures: selectedProfile.extractedFeatures ?? [],
      analysisMarkdown: selectedProfile.analysisMarkdown ?? "",
      narrativeRules: prettyJson(selectedProfile.narrativeRules),
      characterRules: prettyJson(selectedProfile.characterRules),
      languageRules: prettyJson(selectedProfile.languageRules),
      rhythmRules: prettyJson(selectedProfile.rhythmRules),
      antiAiRuleIds: selectedProfile.antiAiRules.map((rule) => rule.id),
    });
  }, [selectedProfile]);

  useEffect(() => {
    setTestWriteOutput("");
    setDetectInput("");
    setRewritePreview("");
  }, [selectedProfileId]);

  useWritingFormulaDialogFocus({
    dialogRef: editorDialogRef,
    open: activeWorkspaceDialog === "editor",
    focusIntent: editorFocusIntent,
    focusKey: selectedProfileId,
    setFocusIntent: setEditorFocusIntent,
  });

  async function refreshStyleData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.profiles }),
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.templates }),
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.antiAiRules }),
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(selectedProfileId || "selected-none") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings("all") }),
    ]);
  }

  const createFlow = useWritingFormulaCreateFlow({
    llm,
    refreshStyleData,
    onImmediateProfileCreated: handleCreatedProfile,
    onAutoSavedProfileReady: (profileId, successMessage) => {
      setSelectedProfileId(profileId);
      setMessage(successMessage);
      setCreateDialogOpen(false);
      openWorkspaceDialog("editor", profileId);
    },
    onExtractionTaskQueued: (task) => {
      setCreateDialogOpen(false);
      setMessage(`写法提取任务“${task.title}”已提交。系统会在后台自动提取并保存，完成后会自动打开结果。`);
    },
    onFlowMessage: setMessage,
  });

  const handleCreateDialogOpenChange = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) {
      createFlow.resetCreateFlow();
    }
  };

  const reextractFeaturesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId || !editor.sourceContent.trim()) {
        throw new Error("请先准备原文样本。");
      }

      return extractStyleFeaturesFromText({
        name: editor.name.trim() || selectedProfile?.name || "文本提取写法",
        category: editor.category || undefined,
        sourceText: editor.sourceContent,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      });
    },
    onSuccess: (response) => {
      const draft = response.data;
      if (!draft) {
        return;
      }

      const extractedFeatures = buildProfileFeaturesFromDraft(draft);
      const ruleSet = buildRuleSetFromExtractedFeatures(extractedFeatures);
      setEditor((prev) => ({
        ...prev,
        extractedFeatures,
        analysisMarkdown: draft.analysisMarkdown || prev.analysisMarkdown,
        narrativeRules: prettyJson(ruleSet.narrativeRules),
        characterRules: prettyJson(ruleSet.characterRules),
        languageRules: prettyJson(ruleSet.languageRules),
        rhythmRules: prettyJson(ruleSet.rhythmRules),
      }));
      setMessage(
        extractedFeatures.length > 0
          ? `已重新提取 ${extractedFeatures.length} 条特征，请确认后保存。`
          : "这次仍然没有生成可用特征，建议检查原文样本是否足够完整。",
      );
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId) {
        return;
      }

      await updateStyleProfile(selectedProfileId, {
        name: editor.name,
        description: editor.description,
        category: editor.category,
        tags: normalizeCsv(editor.tags),
        applicableGenres: normalizeCsv(editor.applicableGenres),
        sourceContent: editor.sourceContent || undefined,
        extractedFeatures: editor.extractedFeatures,
        analysisMarkdown: editor.analysisMarkdown,
        narrativeRules: parseJsonInput(editor.narrativeRules),
        characterRules: parseJsonInput(editor.characterRules),
        languageRules: parseJsonInput(editor.languageRules),
        rhythmRules: parseJsonInput(editor.rhythmRules),
        antiAiRuleIds: editor.antiAiRuleIds,
      });
    },
    onSuccess: async () => {
      setMessage("写法资产保存完成。");
      await refreshStyleData();
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: string) => deleteStyleProfile(id),
    onSuccess: async (_response, deletedProfileId) => {
      setMessage("这套写法已删除。");
      if (deletedProfileId === selectedProfileId) {
        setSelectedProfileId("");
        setActiveWorkspaceDialog(null);
      }
      await refreshStyleData();
    },
  });

  const createBindingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId) {
        return;
      }

      const targetId = bindingForm.targetType === "chapter"
        ? bindingForm.chapterId
        : bindingForm.targetType === "task"
          ? bindingForm.taskTargetId
          : bindingForm.novelId;

      await createStyleBinding({
        styleProfileId: selectedProfileId,
        targetType: bindingForm.targetType,
        targetId,
        priority: bindingForm.priority,
        weight: bindingForm.weight,
      });
    },
    onSuccess: async () => {
      setMessage("这套写法会参与目标对象的生成。");
      await refreshStyleData();
    },
  });

  const deleteBindingMutation = useMutation({
    mutationFn: (id: string) => deleteStyleBinding(id),
    onSuccess: async () => {
      await refreshStyleData();
    },
  });

  const testWriteMutation = useMutation({
    mutationFn: () => {
      if (!selectedProfileId) {
        throw new Error("请先选择写法资产。");
      }

      return testWriteWithStyleProfile(selectedProfileId, {
        mode: testWriteForm.mode,
        topic: testWriteForm.topic || undefined,
        sourceText: testWriteForm.sourceText || undefined,
        targetLength: testWriteForm.targetLength,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      });
    },
    onSuccess: (response) => setTestWriteOutput(response.data?.output ?? ""),
  });

  const reviewScope = JSON.stringify([selectedProfileId, profilesQuery.dataUpdatedAt, antiAiRulesQuery.dataUpdatedAt]);
  const detectionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId) {
        throw new Error("请先选择写法资产。");
      }

      const sourceContent = detectInput;
      const response = await detectStyleIssues({
        content: sourceContent,
        styleProfileId: selectedProfileId,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.2,
      });
      return { ...response, sourceContent, sourceScope: reviewScope };
    },
    onSuccess: () => { setRewritePreview(""); rewriteMutation.reset(); },
  });

  const rewriteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId) {
        throw new Error("请先选择写法资产。");
      }

      const sourceContent = detectInput;
      const response = await rewriteStyleIssues({
        content: sourceContent,
        styleProfileId: selectedProfileId,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.5,
      });
      return { ...response, sourceContent, sourceScope: reviewScope };
    },
    onSuccess: (response) => {
      setRewritePreview(response.data?.content ?? "");
      setMessage(response.data?.content === response.sourceContent ? "保留原稿，可查看写法建议。" : "比较修订预览，确认需要的修改。");
    },
  });

  useEffect(() => {
    testWriteMutation.reset();
    detectionMutation.reset();
    rewriteMutation.reset();
  }, [selectedProfileId]);

  const currentDetection = detectionMutation.data?.sourceContent === detectInput
    && detectionMutation.data.sourceScope === reviewScope ? detectionMutation.data.data : undefined;
  const currentRewrite = rewriteMutation.data?.sourceContent === detectInput
    && rewriteMutation.data.sourceScope === reviewScope ? rewriteMutation.data.data : undefined;

  return (
    <div className="writing-formula-theme flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">写法引擎</h1>
          <p className="text-sm leading-6 text-muted-foreground">保存喜欢的叙事风格，让后续正文保持一致的语言、节奏与人物表达。</p>
        </div>
        <OpenInCreativeHubButton bindings={{ styleProfileId: selectedProfileId || null }} label="带去创作中枢" variant="ghost" />
      </div>

      {message ? <div role="status" className="rounded-lg bg-muted/30 px-4 py-3 text-sm">{message}</div> : null}

      {activeMode === "book-style" ? (
        <WritingFormulaBookStyleFlow
          novelId={bookStyleNovelId}
          novelTitle={bookStyleNovelId ? novelTitleMap[bookStyleNovelId] : undefined}
          onOpenAdvanced={() => openWorkspaceDialog("editor", selectedProfileId)}
          onOpenCreate={() => setCreateDialogOpen(true)}
        />
      ) : null}

      <WritingFormulaLanding
        onOpenCreate={() => setCreateDialogOpen(true)}
        onOpenPromptLab={() => navigate("/prompt-workbench?experience=writing")}
        onSelectProfile={setSelectedProfileId}
        onEditProfile={(profileId) => openWorkspaceDialog("editor", profileId)}
        onOpenWorkbench={(profileId) => openWorkspaceDialog("workbench", profileId)}
        onUseProfileForClean={(profileId) => openWorkspaceDialog("clean", profileId)}
        onDeleteProfile={(profileId) => {
          const profile = profiles.find((item) => item.id === profileId);
          const profileName = profile?.name ?? "这套写法";
          const confirmed = window.confirm(`确认删除“${profileName}”吗？删除后无法恢复。`);
          if (!confirmed) {
            return;
          }
          deleteProfileMutation.mutate(profileId);
        }}
        deletePending={deleteProfileMutation.isPending}
        profileItems={landingProfileItems}
        selectedProfileId={selectedProfileId}
        loading={profilesQuery.isLoading}
        error={profilesQuery.isError ? "写法资产加载失败，请重新加载。" : undefined}
        onRetry={() => { void profilesQuery.refetch(); }}
      />

      <WritingFormulaCreateDialog
        open={createDialogOpen}
        onOpenChange={handleCreateDialogOpenChange}
        form={createFlow.form}
        onFormChange={createFlow.onFormChange}
        templates={templates}
        createManualPending={createFlow.createManualPending}
        createFromBriefPending={createFlow.createFromBriefPending}
        createFromTemplatePending={createFlow.createFromTemplatePending}
        extractTaskSubmitting={createFlow.extractTaskSubmitting}
        activeExtractionTask={createFlow.activeExtractionTask}
        knowledgeDocuments={createFlow.knowledgeDocuments}
        knowledgeDocumentsLoading={createFlow.knowledgeDocumentsLoading}
        selectedKnowledgeDocument={createFlow.selectedKnowledgeDocument}
        selectedKnowledgeDocumentLoading={createFlow.selectedKnowledgeDocumentLoading}
        bookAnalyses={createFlow.bookAnalyses}
        bookAnalysesLoading={createFlow.bookAnalysesLoading}
        selectedPresetKey={createFlow.selectedPresetKey}
        onCreateManual={createFlow.onCreateManual}
        onCreateFromBrief={createFlow.onCreateFromBrief}
        onCreateFromTemplate={createFlow.onCreateFromTemplate}
        onPresetChange={createFlow.onPresetChange}
        onSubmitExtractionTask={createFlow.onSubmitExtractionTask}
        onOpenTaskCenter={(task) => navigate(`/tasks?kind=style_extraction&id=${task.id}`)}
      />

      <Dialog
        open={activeWorkspaceDialog === "editor"}
        onOpenChange={(open) => {
          setActiveWorkspaceDialog(open ? "editor" : null);
          if (!open) {
            setEditorFocusIntent(null);
          }
        }}
      >
        <DialogContent ref={editorDialogRef} className="writing-formula-theme !flex h-[88vh] w-[min(1180px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5 pr-14">
            <DialogTitle>编辑当前写法</DialogTitle>
            <DialogDescription>
              调整写法说明、规则与反 AI 约束，保存后用于后续生成和检查。
            </DialogDescription>
          </DialogHeader>

          <div className="h-full min-h-0 overflow-hidden p-6 pt-4">
            <WritingFormulaAdvancedWorkspace
              antiAiRules={antiAiRules}
              selectedProfile={selectedProfile}
              editor={editor}
              savePending={saveProfileMutation.isPending}
              deletePending={deleteProfileMutation.isPending}
              reextractPending={reextractFeaturesMutation.isPending}
              onEditorChange={(patch) => setEditor((prev) => ({ ...prev, ...patch }))}
              onToggleExtractedFeature={(featureId, checked) => setEditor((prev) => {
                const extractedFeatures = prev.extractedFeatures.map((feature) => (
                  feature.id === featureId ? { ...feature, enabled: checked } : feature
                ));
                const ruleSet = buildRuleSetFromExtractedFeatures(extractedFeatures);
                return {
                  ...prev,
                  extractedFeatures,
                  narrativeRules: prettyJson(ruleSet.narrativeRules),
                  characterRules: prettyJson(ruleSet.characterRules),
                  languageRules: prettyJson(ruleSet.languageRules),
                  rhythmRules: prettyJson(ruleSet.rhythmRules),
                };
              })}
              onReextractFeatures={() => reextractFeaturesMutation.mutate()}
              onToggleAntiAiRule={(ruleId, checked) => setEditor((prev) => ({
                ...prev,
                antiAiRuleIds: checked
                  ? Array.from(new Set([...prev.antiAiRuleIds, ruleId]))
                  : prev.antiAiRuleIds.filter((item) => item !== ruleId),
              }))}
              onSave={() => saveProfileMutation.mutate()}
              onDelete={() => selectedProfile && deleteProfileMutation.mutate(selectedProfile.id)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeWorkspaceDialog === "workbench"}
        onOpenChange={(open) => setActiveWorkspaceDialog(open ? "workbench" : null)}
      >
        <DialogContent className="writing-formula-theme !flex h-[84vh] w-[min(1080px,94vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5 pr-14">
            <DialogTitle>当前写法的应用与测试</DialogTitle>
            <DialogDescription>
              将这套写法绑定到作品或章节，先试写一段正文，比较效果。
            </DialogDescription>
          </DialogHeader>

          <div className="h-full min-h-0 overflow-auto p-6 pt-4">
            <WritingFormulaWorkbenchPanel
              selectedProfileId={selectedProfileId}
              bindingForm={bindingForm}
              bindings={bindings}
              novelOptions={novelOptions}
              chapterOptions={chapterOptions}
              createBindingPending={createBindingMutation.isPending}
              onBindingFormChange={(patch) => setBindingForm((prev) => ({ ...prev, ...patch }))}
              onCreateBinding={() => createBindingMutation.mutate()}
              onDeleteBinding={(bindingId) => deleteBindingMutation.mutate(bindingId)}
              testWriteForm={testWriteForm}
              testWriteOutput={testWriteOutput}
              testWritePending={testWriteMutation.isPending}
              onTestWriteFormChange={(patch) => setTestWriteForm((prev) => ({ ...prev, ...patch }))}
              onRunTestWrite={() => testWriteMutation.mutate()}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeWorkspaceDialog === "clean"}
        onOpenChange={(open) => setActiveWorkspaceDialog(open ? "clean" : null)}
      >
        <DialogContent className="writing-formula-theme !flex h-[84vh] w-[min(980px,92vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5 pr-14">
            <DialogTitle>去 AI 味</DialogTitle>
            <DialogDescription>
              粘贴正文，查看表达问题并比较局部修订预览；采用前请核对人物口吻与设定。
            </DialogDescription>
          </DialogHeader>

          <div className="h-full min-h-0 overflow-auto p-6 pt-4">
            <WritingFormulaCleanPanel
              selectedProfile={selectedProfile}
              detectInput={detectInput}
              detectionReport={currentRewrite?.report ?? currentDetection ?? null}
              detectionPending={detectionMutation.isPending}
              rewritePending={rewriteMutation.isPending}
              rewritePreview={currentRewrite ? rewritePreview : ""}
              rewriteGuard={currentRewrite?.rewriteGuard}
              onDetectInputChange={setDetectInput}
              onDetect={() => detectionMutation.mutate()}
              onRewrite={() => rewriteMutation.mutate()}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
