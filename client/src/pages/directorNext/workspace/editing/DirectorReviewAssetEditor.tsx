import {useRef, useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {castReviewFields, volumeReviewFields, reviewAssetEditSchema, type ReviewAssetEdit} from "@ai-novel/shared/types/director/revision";
import {createDirectorCommandKey, submitDirectorCommand, type DirectorWorkspace} from "@/api/directorNext";
import type {ApiHttpError} from "@/api/client";
import {queryKeys} from "@/api/queryKeys";
import {Button} from "@/components/ui/button";
import {AppDialogContent, Dialog} from "@/components/ui/dialog";

type Field = ReviewAssetEdit["changes"][number]["field"];
const labels: Record<Field, string> = {
  personality: "性格设定", storyFunction: "故事作用", currentGoal: "行动目标",
  summary: "本卷故事", mainPromise: "读者期待", climax: "本卷高潮", nextVolumeHook: "下卷引线",
};

function editableRows(book: DirectorWorkspace, type: ReviewAssetEdit["type"]) {
  return type === "character_cast"
    ? book.materials.characters.map(person => ({id: person.id, title: person.name,
      fields: castReviewFields.map(field => ({field, value: person[field] ?? ""}))}))
    : (book.planning?.volumes ?? []).map(volume => ({id: volume.id, title: volume.title,
      fields: volumeReviewFields.map(field => ({field, value: volume[field] ?? ""}))}));
}

export function DirectorReviewAssetEditor({book, type, runId, expectedVersion, onClose}: {
  book: DirectorWorkspace; type: ReviewAssetEdit["type"]; runId: string; expectedVersion: number; onClose: () => void;
}) {
  const queries = useQueryClient();
  const [rows] = useState(() => editableRows(book, type));
  const [selectedId, setSelectedId] = useState(rows[0]?.id);
  const selectedRow = rows.find(row => row.id === selectedId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [discarding, setDiscarding] = useState(false);
  const request = useRef({body: "", key: ""});
  const changes = rows.flatMap(row => row.fields.flatMap(({field, value}) => {
    const draft = drafts[JSON.stringify([row.id, field])];
    return draft === undefined || draft.trim() === value.trim() ? [] : [{id: row.id, field, before: value, after: draft.trim()}];
  }));
  const novelId = book.novel.id;
  const save = useMutation({
    mutationFn: () => {
      const parsed = reviewAssetEditSchema.safeParse({type, changes});
      if (!parsed.success) throw new Error("请检查修改内容，每次最多保存 100 个字段。");
      const body = JSON.stringify(parsed.data);
      if (request.current.body !== body) request.current = {body, key: createDirectorCommandKey()};
      return submitDirectorCommand({type: "resolve_gate", runId, expectedVersion, decision: "confirm_after_edit", assetEdit: parsed.data, idempotencyKey: request.current.key});
    },
    onError: error => {
      if ((error as ApiHttpError).status === 409) {
        void queries.invalidateQueries({queryKey: ["directorBookWorkspace", novelId]});
      }
    },
    onSuccess: async () => {
      await Promise.all([["directorBookWorkspace", novelId], queryKeys.directorNext.summary(novelId), queryKeys.directorNext.detail(novelId)]
        .map(queryKey => queries.invalidateQueries({queryKey})));
      onClose();
    },
  });
  function close() {
    if (save.isPending) return;
    if (changes.length) setDiscarding(true);
    else onClose();
  }
  return <Dialog open onOpenChange={open => {if (!open) close();}}>
    <AppDialogContent title={type === "character_cast" ? "编辑角色阵容" : "编辑卷纲"} description="选择要调整的内容。保存后，导演将按修改后的资料继续。"
      footer={discarding ? <><p className="mr-auto text-sm">关闭会放弃未保存的修改。</p><Button variant="ghost" onClick={() => setDiscarding(false)}>继续编辑</Button><Button variant="outline" onClick={onClose}>放弃修改并关闭</Button></>
        : <><Button variant="ghost" disabled={save.isPending} onClick={close}>取消</Button><Button disabled={!changes.length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "正在保存…" : "保存修改并继续"}</Button></>}>
      {rows.length > 1 ? <label className="grid gap-1 text-sm">{type === "character_cast" ? "选择角色" : "选择分卷"}
        <select className="rounded-md border border-input bg-background px-3 py-2" value={selectedId} disabled={save.isPending} onChange={event => setSelectedId(event.target.value)}>
          {rows.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
        </select>
      </label> : <h3 className="font-medium">{selectedRow?.title}</h3>}
      {selectedRow ? <div className="mt-3 grid gap-3">{selectedRow.fields.map(({field, value}) => {
          const key = JSON.stringify([selectedRow.id, field]);
          return <label key={field} className="grid gap-1 text-sm">{labels[field]}
            <textarea className="rounded-md border border-input bg-background px-3 py-2" rows={3} maxLength={12000} disabled={save.isPending}
              value={drafts[key] ?? value} onChange={event => {const next = event.target.value; setDrafts(previous => ({...previous, [key]: next}));}}/>
          </label>;
        })}</div> : null}
      {changes.length > 0 ? <p className="mt-3 text-xs text-muted-foreground" role="status">待保存 {changes.length} 处修改</p> : null}
      {save.isError ? <p role="alert" className="mt-3 text-sm text-destructive">{save.error.message}</p> : null}
    </AppDialogContent>
  </Dialog>;
}
