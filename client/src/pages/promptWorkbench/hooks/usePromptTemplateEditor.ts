import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activatePromptTemplateVersion, getPromptContextReferences, getPromptTemplateOverride,
  restoreOfficialPromptTemplate, savePromptTemplateOverride,
  type PromptCatalogItem, type PromptTemplateJson, type PromptTemplateOverrideView,
  type PromptTemplateVersionView,
} from "@/api/promptWorkbench";
import { queryKeys } from "@/api/queryKeys";

type TemplateRole = "system" | "human";
interface TemplateDraft { template: PromptTemplateJson; notes: string }

function templateKey(promptId: string, novelId: string) {
  return `${promptId}:${novelId}`;
}
function pickTemplate(view?: PromptTemplateOverrideView | null): PromptTemplateJson | null {
  return view?.activeVersion?.template ?? view?.officialTemplate ?? null;
}
function getMessageContent(template: PromptTemplateJson | null, role: TemplateRole): string {
  return template?.messages.find((message) => message.role === role)?.content ?? "";
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
  // Drafts belong to a prompt and a scope, so browsing another book cannot overwrite them.
  const [drafts, setDrafts] = useState<Record<string, TemplateDraft>>({});
  const [focusedRole, setFocusedRole] = useState<TemplateRole>("human");
  const systemRef = useRef<HTMLTextAreaElement | null>(null);
  const humanRef = useRef<HTMLTextAreaElement | null>(null);
  const promptId = prompt?.id ?? "";
  const overrideKey = templateKey(promptId, novelId);
  const overrideQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.templateOverride(overrideKey),
    queryFn: () => getPromptTemplateOverride({ promptId, novelId: novelId || undefined }),
    enabled: Boolean(enabled && promptId),
    staleTime: 15_000,
  });
  const referenceQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.contextReferences(
      `${overrideKey}:${chapterId}:${entrypoint}`,
    ),
    queryFn: () => getPromptContextReferences({
      promptId, novelId: novelId || undefined, chapterId: novelId ? chapterId || undefined : undefined, entrypoint,
    }),
    enabled: Boolean(enabled && promptId),
    staleTime: 15_000,
  });
  const view = overrideQuery.data?.data ?? null;
  const sourceTemplate = useMemo(() => pickTemplate(view), [view]);
  const draft = drafts[overrideKey];
  const draftTemplate = draft?.template ?? sourceTemplate;
  const systemContent = getMessageContent(draftTemplate, "system");
  const humanContent = getMessageContent(draftTemplate, "human");
  const notes = draft?.notes ?? "";
  const isDirty = Boolean(sourceTemplate && draftTemplate) && (
    getMessageContent(sourceTemplate, "system") !== systemContent
    || getMessageContent(sourceTemplate, "human") !== humanContent
  );

  const updateDraft = useCallback((patch: { role?: TemplateRole; content?: string; notes?: string }) => {
    if (!sourceTemplate) return;
    setDrafts((current) => {
      const previous = current[overrideKey] ?? { template: sourceTemplate, notes: "" };
      return {
        ...current,
        [overrideKey]: {
          template: patch.role ? {
            kind: "chat",
            messages: previous.template.messages.map((message) => message.role === patch.role
              ? { ...message, content: patch.content ?? "" } : message),
          } : previous.template,
          notes: patch.notes ?? previous.notes,
        },
      };
    });
  }, [overrideKey, sourceTemplate]);

  const resetDraft = useCallback(() => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[overrideKey];
      return next;
    });
  }, [overrideKey]);

  const saveMutation = useMutation({
    mutationFn: (targetNovelId?: string) => {
      const destination = targetNovelId || novelId;
      if (!destination || !draftTemplate) throw new Error("请选择要应用模板的小说。");
      return savePromptTemplateOverride({
        promptId, novelId: destination, template: draftTemplate, notes: notes.trim() || null,
      });
    },
    onMutate: () => ({ key: overrideKey, draft }),
    onSuccess: (response, _targetNovelId, context) => {
      const saved = response.data;
      if (saved) {
        queryClient.setQueryData(
          queryKeys.promptWorkbench.templateOverride(templateKey(saved.promptId, saved.novelId)), response,
        );
      }
      // Only clear the exact submitted draft; later edits and other scopes must survive.
      if (context) setDrafts((current) => {
        if (current[context.key] !== context.draft) return current;
        const next = { ...current };
        delete next[context.key];
        return next;
      });
    },
  });

  const applySavedVersion = (response: Awaited<ReturnType<typeof restoreOfficialPromptTemplate>>) => {
    const saved = response.data;
    if (!saved) return;
    const key = templateKey(saved.promptId, saved.novelId);
    queryClient.setQueryData(queryKeys.promptWorkbench.templateOverride(key), response);
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const restoreMutation = useMutation({
    mutationFn: () => restoreOfficialPromptTemplate({ promptId, novelId }),
    onSuccess: applySavedVersion,
  });
  const activateMutation = useMutation({
    mutationFn: (versionId: string) => activatePromptTemplateVersion({ promptId, novelId, versionId }),
    onSuccess: applySavedVersion,
  });

  useEffect(() => {
    saveMutation.reset();
    restoreMutation.reset();
    activateMutation.reset();
  }, [overrideKey]);

  const loadVersionToDraft = useCallback((version: PromptTemplateVersionView) => {
    setDrafts((current) => ({
      ...current,
      [overrideKey]: { template: version.template, notes: `基于 v${version.versionNo} 调整` },
    }));
  }, [overrideKey]);

  const insertToken = useCallback((token: string) => {
    const ref = focusedRole === "system" ? systemRef.current : humanRef.current;
    const value = focusedRole === "system" ? systemContent : humanContent;
    const start = ref?.selectionStart ?? value.length;
    const end = ref?.selectionEnd ?? start;
    updateDraft({ role: focusedRole, content: `${value.slice(0, start)}${token}${value.slice(end)}` });
    window.setTimeout(() => {
      const nextRef = focusedRole === "system" ? systemRef.current : humanRef.current;
      nextRef?.focus();
      nextRef?.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  }, [focusedRole, humanContent, systemContent, updateDraft]);

  return {
    activateMutation, draftTemplate, enabled, focusedRole, humanContent, humanRef, insertToken,
    isDirty, loadVersionToDraft, notes, overrideQuery, references: referenceQuery.data?.data ?? null,
    referenceQuery, resetDraft, restoreMutation, saveMutation, setFocusedRole,
    setHumanContent: (content: string) => updateDraft({ role: "human", content }),
    setSystemContent: (content: string) => updateDraft({ role: "system", content }),
    setNotes: (value: string) => updateDraft({ notes: value }),
    systemContent, systemRef, view, canPersist: Boolean(novelId), isReady: Boolean(sourceTemplate),
  };
}
