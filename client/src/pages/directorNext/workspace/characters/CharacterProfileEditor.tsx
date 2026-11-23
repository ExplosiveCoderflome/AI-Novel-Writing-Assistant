import { useState, useEffect, useImperativeHandle, type Ref } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  directorCharacterProfileKey, getDirectorCharacterProfile, saveDirectorCharacterProfile,
} from "@/api/directorCharacterProfile";
import { characterForwardPreviewKey } from "@/api/characterForwardAdjustment";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  characterProfileFields, characterProfileLabels, characterProfileSaveSchema, type CharacterProfileWorkspace,
} from "@ai-novel/shared/types/director/characterProfile";
import { ReviewDiscussion } from "../editing/discussion/ReviewDiscussion";
import { applyReviewSuggestions } from "../editing/discussion/draft";

interface Props {
  novelId: string;
  character: {id: string; name: string};
  onSaved: () => void;
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
  const save = useMutation({
    mutationFn: () => {
      const parsed = characterProfileSaveSchema.safeParse({
        changes: edits.map(field => ({field, before: base[field], after: draft[field]})),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      return saveDirectorCharacterProfile(novelId, character.id, parsed.data);
    },
    onSuccess: async saved => {
      queries.setQueryData(directorCharacterProfileKey(novelId, character.id), saved);
      await Promise.all([
        ["directorBookWorkspace", novelId], characterForwardPreviewKey(novelId, character.id),
        queryKeys.novels.characters(novelId), queryKeys.novels.characterDynamicsOverview(novelId),
        queryKeys.novels.characterRelations(novelId), queryKeys.novels.characterResources(novelId),
      ].map(queryKey => queries.invalidateQueries({queryKey})));
      onSaved();
    },
  });
  useImperativeHandle(ref, () => ({
    requestExit(exit) {
      if (save.isPending) return;
      if (hasUnsaved) setDiscardAction(() => exit);
      else exit();
    },
  }), [hasUnsaved, save.isPending]);
  const disabled = save.isPending || !!discardAction || !!workspace.editBlockedReason;
  const setField = (field: string, value: string) => setDraft(previous => ({...previous, [field]: value}));
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
    {save.isError && <p role="alert" className="shrink-0 border-t border-border/60 px-5 py-2 text-sm text-destructive">{save.error.message}</p>}
    {pendingName && !discardAction && <aside className="shrink-0 space-y-1 border-t border-border/60 bg-muted/40 px-5 py-3 text-sm">
      <p className="break-words font-medium">将「{base.name}」改为「{pendingName}」</p>
      <p className="text-xs leading-5 text-muted-foreground">角色档案、目录和关系图会采用新名，后续创作会读取更新后的档案。简介、世界设定和其他角色资料里提过旧名的地方，需要手动核对。</p>
    </aside>}
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
      {discardAction ? <>
        <p role="alert" className="mr-auto text-sm text-muted-foreground">离开会放弃未保存的修改。</p>
        <Button variant="ghost" onClick={() => setDiscardAction(null)}>继续编辑</Button>
        <Button variant="outline" onClick={discardAction}>放弃修改</Button>
      </> : <>
        {edits.length > 0 && <p role="status" className="mr-auto text-xs text-muted-foreground">待保存 {edits.length} 项修改</p>}
        <Button onClick={() => save.mutate()} disabled={disabled || edits.length === 0 || lockedNameEdit}>
          {save.isPending ? "正在保存…" : "保存角色资料"}
        </Button>
      </>}
    </div>
  </div>;
}
