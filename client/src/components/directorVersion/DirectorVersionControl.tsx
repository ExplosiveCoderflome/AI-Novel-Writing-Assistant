import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "react-router-dom";
import type {DirectorVersion} from "@ai-novel/shared/types/director/version";
import {getNovelDirectorVersion, setNovelDirectorVersion} from "@/api/novel/directorVersion";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";

export default function DirectorVersionControl({novelId, version}: {novelId: string; version?: DirectorVersion}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DirectorVersion | null>(null);
  const client = useQueryClient(), navigate = useNavigate();
  const query = useQuery({queryKey: ["novels", novelId, "director-version"], queryFn: () => getNovelDirectorVersion(novelId), enabled: Boolean(novelId), retry: false});
  const identity = query.data;
  useEffect(() => {
    if (version && identity && identity.version !== version) navigate(identity.sourceRoute, {replace: true});
  }, [version, identity, navigate]);
  const save = useMutation({mutationFn: () => {
    if (!identity || !selected) throw new Error("请先读取本书导演设置。" );
    return setNovelDirectorVersion(novelId, selected, identity.epoch);
  }, onSuccess: async result => {
    await client.invalidateQueries();
    setOpen(false);
    navigate(result.sourceRoute);
  }});
  return <>
    <Button variant="ghost" size="sm" onClick={() => {setSelected(identity?.version ?? version ?? null); setOpen(true); save.reset(); void query.refetch();}}>
      {identity?.version || version ? `导演 ${(identity?.version ?? version)!.toUpperCase()}` : "导演版本"}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>本书导演版本</DialogTitle><DialogDescription>选择负责本书创作的流程。切换后，在目标工作台选择创作范围；已保存正文和历史记录会保留。</DialogDescription></DialogHeader>
        {identity ? <div className="space-y-4">
          <label className="block space-y-2 text-sm"><span>导演版本</span><select aria-label="导演版本" className="h-10 w-full rounded-md border border-input bg-background px-3" value={selected ?? identity.version} disabled={!identity.canSwitch || save.isPending} onChange={event => setSelected(event.target.value as DirectorVersion)}>
            {identity.availableVersions.map(value => <option key={value} value={value}>{value === "v2" ? "导演 V2 · 新导演" : "导演 V1 · 原导演"}</option>)}
            {!identity.availableVersions.includes(identity.version) ? <option value={identity.version}>导演 V2 · 未启用</option> : null}
          </select></label>
          <p className="text-xs leading-5 text-muted-foreground">各版本使用独立的任务与恢复流程。切换后，请在对应工作台选择创作范围；历史任务保留供查看。</p>
          {identity.blockedReason ? <p role="status" className="text-sm text-muted-foreground">{identity.blockedReason}</p> : null}
          <Button disabled={!identity.canSwitch || save.isPending || !selected || selected === identity.version} onClick={() => save.mutate()}>{save.isPending ? "正在保存…" : "保存并打开对应工作台"}</Button>
        </div> : <p className="text-sm text-muted-foreground">{query.isPending ? "正在读取本书导演设置…" : "本书导演设置读取失败。"}</p>}
        {query.isError ? <Button variant="ghost" onClick={() => void query.refetch()}>重新读取</Button> : null}
        {save.isError ? <p role="alert" className="text-sm text-destructive">{save.error.message}</p> : null}
      </DialogContent>
    </Dialog>
  </>;
}
