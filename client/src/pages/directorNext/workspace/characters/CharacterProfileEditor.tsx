import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  directorCharacterProfileKey, getDirectorCharacterProfile, saveDirectorCharacterProfile,
} from "@/api/directorCharacterProfile";
import { characterForwardPreviewKey } from "@/api/characterForwardAdjustment";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import {
  characterProfileFields, characterProfileLabels, characterProfileSaveSchema, type CharacterProfileWorkspace,
} from "@ai-novel/shared/types/director/characterProfile";
import { ReviewDiscussion } from "../editing/discussion/ReviewDiscussion";
import { applyReviewSuggestions } from "../editing/discussion/draft";

interface Props {
  novelId: string;
  character: {id: string; name: string};
  onClose: () => void;
}

export function CharacterProfileEditor(props: Props) {
  const {novelId, character, onClose} = props;
  const query = useQuery({
    queryKey: directorCharacterProfileKey(novelId, character.id),
    queryFn: () => getDirectorCharacterProfile(novelId, character.id), retry: false, refetchInterval: 10000, refetchOnMount: "always",
  });
  if (query.data && query.isFetchedAfterMount) return <ProfileDraft {...props} workspace={query.data}/>;
  return <Dialog open onOpenChange={open => {if (!open) onClose();}}>
    <AppDialogContent title={`编辑角色资料 · ${character.name}`} description="查看角色资料并与 AI 讨论修改。">
      {query.isError ? <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">{query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>重新读取</Button>
      </div> : <p role="status" className="text-sm text-muted-foreground">正在读取角色资料…</p>}
    </AppDialogContent>
  </Dialog>;
}

function ProfileDraft({novelId, character, onClose, workspace}: Props & {workspace: CharacterProfileWorkspace}) {
  const queries = useQueryClient();
  const [base] = useState(workspace.fields);
  const [draft, setDraft] = useState<Record<string, string>>(base);
  const [message, setMessage] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const edits = characterProfileFields.filter(field => draft[field].trim() !== base[field].trim());
  const hasUnsaved = edits.length > 0 || !!message.trim();
  const lockedNameEdit = !!workspace.renameBlockedReason && edits.includes("name");
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
      onClose();
    },
  });
  const disabled = save.isPending || discarding || !!workspace.editBlockedReason;
  const setField = (field: string, value: string) => setDraft(previous => ({...previous, [field]: value}));
  function close() {
    if (save.isPending) return;
    if (hasUnsaved) setDiscarding(true);
    else onClose();
  }
  return <Dialog open onOpenChange={open => {if (!open) close();}}>
    <AppDialogContent title={`编辑角色资料 · ${base.name}`} description="可以直接手改，也可以先让 AI 给出建议，再逐项采纳。"
      className="lg:h-[min(52rem,90dvh)] lg:max-w-6xl"
      bodyClassName="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:overflow-hidden"
      footer={discarding ? <>
        <p className="mr-auto text-sm text-muted-foreground">关闭会放弃未保存的修改。</p>
        <Button variant="ghost" onClick={() => setDiscarding(false)}>继续编辑</Button>
        <Button variant="outline" onClick={onClose}>放弃修改</Button>
      </> : <>
        <Button variant="ghost" onClick={close} disabled={save.isPending}>取消</Button>
        <Button onClick={() => save.mutate()} disabled={disabled || edits.length === 0 || lockedNameEdit}>
          {save.isPending ? "正在保存…" : "保存角色资料"}
        </Button>
      </>}>
      <div className="min-w-0 space-y-4 lg:overflow-y-auto lg:pr-3">
        {workspace.editBlockedReason && <p role="status" className="rounded-lg bg-muted/50 p-3 text-sm">{workspace.editBlockedReason}</p>}
        {save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        <label className="block space-y-1.5 text-sm font-medium">
          <span>姓名</span>
          <Input value={draft.name} onChange={event => setField("name", event.target.value)}
            disabled={disabled} readOnly={!!workspace.renameBlockedReason} maxLength={80}
            aria-describedby={workspace.renameBlockedReason ? "character-profile-name-lock" : undefined}/>
        </label>
        {workspace.renameBlockedReason && <p id="character-profile-name-lock" className="text-xs leading-5 text-muted-foreground">{workspace.renameBlockedReason}</p>}
        {lockedNameEdit && <Button variant="outline" size="sm" disabled={disabled} onClick={() => setField("name", base.name)}>还原姓名</Button>}
        {characterProfileFields.slice(1).map(field => <label key={field} className="block space-y-1.5 text-sm font-medium">
          <span>{characterProfileLabels[field]}</span>
          <textarea className="block w-full rounded-md border border-input bg-background px-3 py-2 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            rows={3} maxLength={12000} value={draft[field]} disabled={disabled}
            onChange={event => setField(field, event.target.value)}/>
        </label>)}
        {edits.length > 0 && <p role="status" className="text-xs text-muted-foreground">待保存 {edits.length} 项修改</p>}
      </div>
      <div className="order-first flex min-h-72 min-w-0 flex-col [&>div]:flex-1 lg:order-none lg:min-h-0">
        <ReviewDiscussion scope={{type: "character_profile"}} novelId={novelId} subject={{id: character.id, title: draft.name.trim() || base.name}}
          base={base} draft={draft} disabled={disabled} fieldLabels={characterProfileLabels}
          lockedField={workspace.renameBlockedReason ? "name" : undefined} message={message} onMessage={setMessage}
          onAccept={items => setDraft(previous => applyReviewSuggestions(previous, base, items))}/>
      </div>
    </AppDialogContent>
  </Dialog>;
}
