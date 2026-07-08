import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activatePromptTemplateVersion,
  getPromptContextReferences,
  getPromptTemplateOverride,
  restoreOfficialPromptTemplate,
  savePromptTemplateOverride,
  type PromptCatalogItem,
  type PromptTemplateJson,
  type PromptTemplateOverrideView,
  type PromptTemplateReferenceCatalog,
  type PromptTemplateVersionView,
} from "@/api/promptWorkbench";
import { queryKeys } from "@/api/queryKeys";

type TemplateRole = "system" | "human";

function templateKey(promptId: string, novelId: string) {
  return `${promptId}:${novelId}`;
}

function referencesKey(promptId: string, novelId: string, chapterId: string, entrypoint: string) {
  return `${promptId}:${novelId || "none"}:${chapterId || "none"}:${entrypoint}`;
}

function pickTemplate(view?: PromptTemplateOverrideView | null): PromptTemplateJson | null {
  if (!view) return null;
  return view.activeVersion?.template ?? view.officialTemplate;
}

function getMessageContent(template: PromptTemplateJson | null, role: TemplateRole): string {
  return template?.messages.find((message) => message.role === role)?.content ?? "";
}

function buildTemplate(systemContent: string, humanContent: string): PromptTemplateJson {
  return {
    kind: "chat",
    messages: [
      { role: "system", content: systemContent },
      { role: "human", content: humanContent },
    ],
  };
}

export function usePromptTemplateEditor(input: {
  prompt: PromptCatalogItem | null;
  novelId: string;
  chapterId: string;
  entrypoint: string;
  enabled: boolean;
}) {
  const { chapterId, enabled, entrypoint, novelId, prompt } = input;
  const queryClient = useQueryClient();
  const [systemContent, setSystemContent] = useState("");
  const [humanContent, setHumanContent] = useState("");
  const [notes, setNotes] = useState("");
  const [focusedRole, setFocusedRole] = useState<TemplateRole>("human");
  const systemRef = useRef<HTMLTextAreaElement | null>(null);
  const humanRef = useRef<HTMLTextAreaElement | null>(null);
  const loadedKeyRef = useRef("");
  const promptId = prompt?.id ?? "";
  const overrideKey = templateKey(promptId, novelId);

  const overrideQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.templateOverride(overrideKey),
    queryFn: () => getPromptTemplateOverride({ promptId, novelId }),
    enabled: Boolean(enabled && promptId && novelId),
    staleTime: 15_000,
  });

  const referenceQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.contextReferences(
      referencesKey(promptId, novelId, chapterId, entrypoint),
    ),
    queryFn: () => getPromptContextReferences({
      promptId,
      novelId: novelId || undefined,
      chapterId: chapterId || undefined,
      entrypoint,
    }),
    enabled: Boolean(enabled && promptId && novelId),
    staleTime: 15_000,
  });

  const view = overrideQuery.data?.data ?? null;
  const references = referenceQuery.data?.data ?? null;
  const sourceTemplate = useMemo(() => pickTemplate(view), [view]);
  const draftTemplate = useMemo(
    () => buildTemplate(systemContent, humanContent),
    [humanContent, systemContent],
  );
  const isDirty = Boolean(sourceTemplate)
    && (
      getMessageContent(sourceTemplate, "system") !== systemContent
      || getMessageContent(sourceTemplate, "human") !== humanContent
    );

  useEffect(() => {
    if (!enabled || !view) {
      loadedKeyRef.current = "";
      setSystemContent("");
      setHumanContent("");
      setNotes("");
      return;
    }
    const nextLoadedKey = `${view.promptId}:${view.novelId}:${view.activeVersionId ?? "official"}:${view.officialCompiledHash}`;
    if (loadedKeyRef.current === nextLoadedKey) {
      return;
    }
    const template = pickTemplate(view);
    loadedKeyRef.current = nextLoadedKey;
    setSystemContent(getMessageContent(template, "system"));
    setHumanContent(getMessageContent(template, "human"));
    setNotes("");
  }, [enabled, view]);

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.promptWorkbench.templateOverride(overrideKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.promptWorkbench.contextReferences(
        referencesKey(promptId, novelId, chapterId, entrypoint),
      ) }),
    ]);
  }, [chapterId, entrypoint, novelId, overrideKey, promptId, queryClient]);

  const saveMutation = useMutation({
    mutationFn: () => savePromptTemplateOverride({
      promptId,
      novelId,
      template: draftTemplate,
      notes: notes.trim() || null,
    }),
    onSuccess: async () => {
      setNotes("");
      await invalidate();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => restoreOfficialPromptTemplate({ promptId, novelId }),
    onSuccess: invalidate,
  });

  const activateMutation = useMutation({
    mutationFn: (versionId: string) => activatePromptTemplateVersion({ promptId, novelId, versionId }),
    onSuccess: invalidate,
  });

  const resetDraft = useCallback(() => {
    setSystemContent(getMessageContent(sourceTemplate, "system"));
    setHumanContent(getMessageContent(sourceTemplate, "human"));
    setNotes("");
  }, [sourceTemplate]);

  const loadVersionToDraft = useCallback((version: PromptTemplateVersionView) => {
    setSystemContent(getMessageContent(version.template, "system"));
    setHumanContent(getMessageContent(version.template, "human"));
    setNotes(`基于 v${version.versionNo} 调整`);
  }, []);

  const insertToken = useCallback((token: string) => {
    const role = focusedRole;
    const ref = role === "system" ? systemRef.current : humanRef.current;
    const value = role === "system" ? systemContent : humanContent;
    const start = ref?.selectionStart ?? value.length;
    const end = ref?.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}${token}${value.slice(end)}`;
    if (role === "system") {
      setSystemContent(nextValue);
    } else {
      setHumanContent(nextValue);
    }
    window.setTimeout(() => {
      const nextRef = role === "system" ? systemRef.current : humanRef.current;
      if (!nextRef) return;
      const cursor = start + token.length;
      nextRef.focus();
      nextRef.setSelectionRange(cursor, cursor);
    }, 0);
  }, [focusedRole, humanContent, systemContent]);

  return {
    activateMutation,
    draftTemplate,
    enabled,
    focusedRole,
    humanContent,
    humanRef,
    insertToken,
    isDirty,
    loadVersionToDraft,
    notes,
    overrideQuery,
    references: references as PromptTemplateReferenceCatalog | null,
    referenceQuery,
    resetDraft,
    restoreMutation,
    saveMutation,
    setFocusedRole,
    setHumanContent,
    setNotes,
    setSystemContent,
    systemContent,
    systemRef,
    view,
  };
}
