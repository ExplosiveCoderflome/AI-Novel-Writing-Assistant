import { useState, useEffect, useImperativeHandle, type Ref } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyDirectorCharacterProfileImpact, directorCharacterProfileKey, getDirectorCharacterProfile,
  previewDirectorCharacterProfileImpact,
} from "@/api/directorCharacterProfile";
import { characterForwardPreviewKey } from "@/api/characterForwardAdjustment";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  characterProfileFields, characterProfileLabels, characterProfileSaveSchema, type CharacterProfileWorkspace,
} from "@ai-novel/shared/types/director/characterProfile";
import { characterProfileImpactResourceLabels, type CharacterProfileImpactApplyResult, type CharacterProfileImpactPreview, type CharacterProfileImpactSuggestion } from "@ai-novel/shared/types/director/characterProfileImpact";
import { ReviewDiscussion } from "../editing/discussion/ReviewDiscussion";
import { applyReviewSuggestions } from "../editing/discussion/draft";

interface Props {
  novelId: string;
  character: {id: string; name: string};
  onSaved: (result?: CharacterProfileImpactApplyResult) => void;
  ref: Ref<CharacterProfileEditorHandle>;
}

export interface CharacterProfileEditorHandle {
  requestExit: (exit: () => void) => void;
}

export function CharacterProfileEditor(props: Props) {
  const {novelId, character} = props;
  const query = useQuery({
    queryKey: directorCharacterProfileKey(novelId, character.id),
    queryFn: () => getDirectorCharacterProfile(novelId, character.id), retry: false, refetchInterval: 10000, refetchOnMount: "always",
  });
  if (query.data && query.isFetchedAfterMount) return <ProfileDraft {...props} workspace={query.data}/>;
  return <div className="min-w-0 flex-1 space-y-3 px-5 py-4">
    {query.isError ? <>
      <p role="alert" className="text-sm text-destructive">{query.error.message}</p>
      <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>重新读取</Button>
    </> : <p role="status" className="text-sm text-muted-foreground">正在读取角色资料…</p>}
  </div>;
}

function ProfileDraft({novelId, character, onSaved, ref, workspace}: Props & {workspace: CharacterProfileWorkspace}) {
  const queries = useQueryClient();
  const [base] = useState(workspace.fields);
  const [draft, setDraft] = useState<Record<string, string>>(base);
  const [message, setMessage] = useState("");
  const [impactPreview, setImpactPreview] = useState<CharacterProfileImpactPreview | null>(null);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [narrowPane, setNarrowPane] = useState<"assistant" | "fields">("assistant");
  const edits = characterProfileFields.filter(field => draft[field].trim() !== base[field].trim());
  const hasUnsaved = edits.length > 0 || !!message.trim();
  const lockedNameEdit = !!workspace.renameBlockedReason && edits.includes("name");
  const pendingName = !workspace.renameBlockedReason && edits.includes("name") ? draft.name.trim() : "";
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = "";};
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);
  const buildSaveInput = () => {
    const parsed = characterProfileSaveSchema.safeParse({
      changes: edits.map(field => ({field, before: base[field], after: draft[field]})),
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    return parsed.data;
  };
  const impact = useMutation({
    mutationFn: () => previewDirectorCharacterProfileImpact(novelId, character.id, buildSaveInput()),
    onSuccess: preview => {
      setImpactPreview(preview);
      setSelectedSuggestionIds(new Set(preview.suggestions
        .filter(suggestion => suggestion.applyMode === "replace" || suggestion.resourceType === "prose")
        .map(suggestion => suggestion.candidateId)));
    },
  });
  const save = useMutation({
    mutationFn: () => {
      if (!impactPreview) throw new Error("请先检查角色资料的影响范围。");
      return applyDirectorCharacterProfileImpact(novelId, character.id, {
        ...buildSaveInput(),
        expectedCharacterUpdatedAt: impactPreview.character.updatedAt,
        suggestions: impactPreview.suggestions.filter(suggestion => selectedSuggestionIds.has(suggestion.candidateId)),
      });
    },
    onSuccess: async result => {
      await Promise.all([
        ["directorBookWorkspace", novelId], characterForwardPreviewKey(novelId, character.id),
        queryKeys.novels.characters(novelId), queryKeys.novels.characterDynamicsOverview(novelId),
        queryKeys.novels.characterRelations(novelId), queryKeys.novels.characterResources(novelId),
      ].map(queryKey => queries.invalidateQueries({queryKey})));
      onSaved(result);
    },
  });
  useImperativeHandle(ref, () => ({
    requestExit(exit) {
      if (save.isPending || impact.isPending) return;
      if (hasUnsaved) setDiscardAction(() => exit);
      else exit();
    },
  }), [hasUnsaved, impact.isPending, save.isPending]);
  const disabled = save.isPending || impact.isPending || !!discardAction || !!workspace.editBlockedReason;
  const impactCandidateSummary = impactPreview ? Object.entries(impactPreview.candidates.reduce<Record<string, number>>((counts, candidate) => {
    counts[candidate.resourceType] = (counts[candidate.resourceType] ?? 0) + 1;
    return counts;
  }, {})).map(([resourceType, count]) => `${characterProfileImpactResourceLabels[resourceType as keyof typeof characterProfileImpactResourceLabels]} ${count} 处`).join("、") : "";
  const setField = (field: string, value: string) => {
    setImpactPreview(null);
    setSelectedSuggestionIds(new Set());
    setDraft(previous => ({...previous, [field]: value}));
  };
  const toggleSuggestion = (suggestion: CharacterProfileImpactSuggestion) => {
    if (suggestion.applyMode === "review" && suggestion.resourceType !== "prose") return;
    setSelectedSuggestionIds(previous => {
      const next = new Set(previous);
      if (next.has(suggestion.candidateId)) next.delete(suggestion.candidateId);
      else next.add(suggestion.candidateId);
      return next;
    });
  };
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 gap-1 border-b border-border/60 px-4 py-2 md:hidden" role="group" aria-label="角色编辑视图">
      <Button size="sm" variant={narrowPane === "assistant" ? "secondary" : "ghost"} aria-pressed={narrowPane === "assistant"} onClick={() => setNarrowPane("assistant")}>AI 建议</Button>
      <Button size="sm" variant={narrowPane === "fields" ? "secondary" : "ghost"} aria-pressed={narrowPane === "fields"} onClick={() => setNarrowPane("fields")}>
        {edits.length ? `角色资料（${edits.length} 项待保存）` : "角色资料"}
      </Button>
    </div>
    {workspace.editBlockedReason && <p role="status" className="shrink-0 bg-muted/50 px-5 py-3 text-sm">{workspace.editBlockedReason}</p>}
    <div className="flex min-h-0 min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className={cn("min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 md:block", narrowPane !== "fields" && "hidden")}>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>姓名</span>
          <Input value={draft.name} onChange={event => setField("name", event.target.value)}
            disabled={disabled} readOnly={!!workspace.renameBlockedReason} maxLength={80}
            aria-describedby="character-profile-name-help"/>
        </label>
        <p id="character-profile-name-help" className="text-xs leading-5 text-muted-foreground">
          {workspace.renameBlockedReason ?? "修改姓名后，可在保存前核对改名的影响。"}
        </p>
        {lockedNameEdit && <Button variant="outline" size="sm" disabled={disabled} onClick={() => setField("name", base.name)}>还原姓名</Button>}
        {characterProfileFields.slice(1).map(field => <label key={field} className="block space-y-1.5 text-sm font-medium">
          <span>{characterProfileLabels[field]}</span>
          <textarea className="block w-full rounded-md border border-input bg-background px-3 py-2 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            rows={3} maxLength={12000} value={draft[field]} disabled={disabled}
            onChange={event => setField(field, event.target.value)}/>
        </label>)}
      </div>
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-4 md:flex md:border-l md:border-border/60 [&>div]:flex-1", narrowPane !== "assistant" && "hidden")}>
        <ReviewDiscussion scope={{type: "character_profile"}} novelId={novelId} subject={{id: character.id, title: draft.name.trim() || base.name}}
          base={base} draft={draft} disabled={disabled} fieldLabels={characterProfileLabels}
          lockedField={workspace.renameBlockedReason ? "name" : undefined} message={message} onMessage={setMessage}
          onAccept={items => setDraft(previous => applyReviewSuggestions(previous, base, items))}/>
      </div>
    </div>
    {(impact.isError || save.isError) && <p role="alert" className="shrink-0 border-t border-border/60 px-5 py-2 text-sm text-destructive">{(impact.error ?? save.error)?.message}</p>}
    {pendingName && !discardAction && <aside className="shrink-0 space-y-1 border-t border-border/60 bg-muted/40 px-5 py-3 text-sm">
      <p className="break-words font-medium">将「{base.name}」改为「{pendingName}」</p>
      <p className="text-xs leading-5 text-muted-foreground">角色档案、目录和关系图会采用新名，后续创作会读取更新后的档案。简介、世界设定和其他角色资料里提过旧名的地方，需要手动核对。</p>
    </aside>}
    {impactPreview && !discardAction && <section className="max-h-72 shrink-0 space-y-3 overflow-y-auto border-t border-border/60 bg-muted/20 px-5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">受影响资料</h3>
        <span className="text-xs text-muted-foreground">已识别 {impactPreview.candidates.length} 处 · 建议 {impactPreview.suggestions.length} 条</span>
      </div>
      {impactCandidateSummary && <p className="text-xs leading-5 text-muted-foreground">识别范围：{impactCandidateSummary}</p>}
      {impactPreview.suggestions.length === 0 ? <p className="text-sm leading-6 text-muted-foreground">暂未发现需要同步的资料。确认后只保存角色资料。</p> : <div className="space-y-2">
        {impactPreview.suggestions.map(suggestion => <label key={suggestion.candidateId} className="flex gap-2 rounded-md bg-background px-3 py-2 text-sm">
          <input className="mt-1 accent-primary" type="checkbox" checked={selectedSuggestionIds.has(suggestion.candidateId)} disabled={(suggestion.applyMode === "review" && suggestion.resourceType !== "prose") || disabled} onChange={() => toggleSuggestion(suggestion)}/>
          <span className="min-w-0 space-y-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium"><span>{characterProfileImpactResourceLabels[suggestion.resourceType]}</span><span className="text-muted-foreground">{suggestion.title}</span>{suggestion.resourceType === "prose" && suggestion.paragraphs?.length ? <span className="text-xs font-normal text-muted-foreground">定位 {suggestion.paragraphs.length} 段</span> : null}{suggestion.applyMode === "review" ? <span className="text-xs font-normal text-muted-foreground">需打开正文核对</span> : null}</span>
            <span className="block text-xs leading-5 text-muted-foreground">{suggestion.reason}</span>
            {suggestion.applyMode === "replace" ? <>
              <span className="block whitespace-pre-wrap text-xs leading-5 text-muted-foreground"><span className="font-medium">原文：</span>{suggestion.before}</span>
              {suggestion.after ? <span className="block whitespace-pre-wrap text-xs leading-5"><span className="text-muted-foreground">建议改为：</span>{suggestion.after}</span> : null}
            </> : null}
          </span>
        </label>)}
      </div>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs leading-5 text-muted-foreground">只会应用你勾选的资料建议。正文建议会在确认角色资料后打开对应章节，逐段核对并应用。</p>
        <Button size="sm" variant="ghost" onClick={() => {setImpactPreview(null); setSelectedSuggestionIds(new Set());}} disabled={disabled}>重新检查</Button>
      </div>
    </section>}
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
      {discardAction ? <>
        <p role="alert" className="mr-auto text-sm text-muted-foreground">离开会放弃未保存的修改。</p>
        <Button variant="ghost" onClick={() => setDiscardAction(null)}>继续编辑</Button>
        <Button variant="outline" onClick={discardAction}>放弃修改</Button>
      </> : <>
        {edits.length > 0 && <p role="status" className="mr-auto text-xs text-muted-foreground">待保存 {edits.length} 项修改</p>}
        <Button onClick={() => (impactPreview ? save.mutate() : impact.mutate())} disabled={disabled || edits.length === 0 || lockedNameEdit}>
          {impact.isPending ? "正在检查影响…" : save.isPending ? "正在保存…" : impactPreview ? "确认保存并应用所选建议" : "检查受影响资料"}
        </Button>
      </>}
    </div>
  </div>;
}
