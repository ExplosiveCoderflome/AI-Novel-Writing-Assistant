import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { characterForwardFieldLabels, characterForwardFieldNames, type CharacterForwardPreview } from "@ai-novel/shared/types/characterForwardAdjustment";
import { getCharacterForwardPreview, characterForwardPreviewKey, saveCharacterForwardAdjustment } from "@/api/characterForwardAdjustment";
import type { ApiHttpError } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

export function CharacterForwardAdjustDialog({ novelId, character, initialPreview, onClose }: {
  novelId: string;
  character: { id: string; name: string };
  initialPreview: CharacterForwardPreview;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [base, setBase] = useState(initialPreview);
  const [fields, setFields] = useState(initialPreview.fields);
  const [discarding, setDiscarding] = useState(false);
  const changed = characterForwardFieldNames.filter(field => (fields[field]?.trim() || null) !== (base.fields[field]?.trim() || null));
  const refresh = useMutation({
    mutationFn: () => getCharacterForwardPreview(novelId, character.id),
    onSuccess: next => {
      setBase(next);
      setFields(next.fields);
      save.reset();
      queryClient.setQueryData(characterForwardPreviewKey(novelId, character.id), next);
    },
  });
  const save = useMutation({
    mutationFn: () => saveCharacterForwardAdjustment(novelId, character.id, {
      effectiveFromChapterOrder: base.effectiveFromChapterOrder,
      fingerprint: base.fingerprint,
      fields: Object.fromEntries(changed.map(field => [field, fields[field]?.trim() || null])),
    }),
    onSuccess: result => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["directorBookWorkspace", novelId] }),
        queryClient.invalidateQueries({ queryKey: ["director-workspace", "character-history", novelId, character.id] }),
        queryClient.invalidateQueries({ queryKey: ["director-character-appearances", novelId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterDynamicsOverview(novelId) }),
        queryClient.invalidateQueries({ queryKey: characterForwardPreviewKey(novelId, character.id) }),
      ]);
      toast.success(`角色调整已保存，从第 ${result.effectiveFromChapterOrder} 章起生效。`);
      onClose();
    },
  });
  const conflict = (save.error as ApiHttpError | null)?.status === 409;
  const pending = save.isPending || refresh.isPending;
  function requestClose() {
    if (pending) return;
    if (changed.length) setDiscarding(true);
    else onClose();
  }

  return <Dialog open onOpenChange={open => { if (!open) requestClose(); }}>
    <AppDialogContent title={`调整 ${character.name}`} description="为后续写作修改角色状态、行动目标或成长弧。"
      footer={discarding ? <>
        <p className="mr-auto text-sm text-muted-foreground">关闭会放弃未保存的修改。</p>
        <Button variant="ghost" onClick={() => setDiscarding(false)}>继续编辑</Button>
        <Button variant="outline" onClick={onClose}>放弃修改</Button>
      </> : <>
        <Button variant="ghost" disabled={pending} onClick={requestClose}>取消</Button>
        <Button disabled={pending || !changed.length || !!base.blockedReason || conflict} onClick={() => save.mutate()}>
          {save.isPending ? "正在保存…" : "保存调整"}
        </Button>
      </>}>
      <div className="space-y-5">
        <section className="space-y-2 rounded-md bg-muted/40 p-4 text-sm">
          {base.blockedReason ? <p role="status">{base.blockedReason}</p> : <>
            <h3 className="font-medium">从第 {base.effectiveFromChapterOrder} 章起生效</h3>
            <p className="text-muted-foreground">{base.effectiveFromChapterOrder > 1
              ? `第 1 至 ${base.effectiveFromChapterOrder - 1} 章不受影响。保存不会重写正文。`
              : "保存不会重写正文。"}</p>
            {base.affectedPlans.length ? <>
              <p className="font-medium">保存后待核对的章节计划</p>
              <ul className="max-h-28 list-disc space-y-1 overflow-y-auto pl-5 text-muted-foreground">
                {base.affectedPlans.map(plan => <li key={plan.planId}>第 {plan.chapterOrder} 章 · {plan.title}</li>)}
              </ul>
            </> : <p className="text-muted-foreground">暂无需要核对的章节计划。</p>}
          </>}
        </section>
        {characterForwardFieldNames.map(field => <label key={field} className="block space-y-2 text-sm">
          <span>{characterForwardFieldLabels[field]}</span>
          <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            value={fields[field] ?? ""} onChange={event => setFields(previous => ({ ...previous, [field]: event.target.value }))}
            rows={field === "development" ? 4 : 2} maxLength={4000} disabled={pending || !!base.blockedReason || discarding}/>
        </label>)}
        {save.isError || refresh.isError ? <p role="alert" className="text-sm text-destructive">{refresh.error?.message ?? save.error?.message}</p> : null}
        {conflict || base.blockedReason ? <Button variant="outline" disabled={pending || discarding} onClick={() => refresh.mutate()}>
          {refresh.isPending ? "正在预览…" : "重新预览并重置表单"}
        </Button> : null}
      </div>
    </AppDialogContent>
  </Dialog>;
}
