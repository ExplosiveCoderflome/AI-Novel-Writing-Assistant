import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { applyManuscriptProposal, previewManuscriptStructure, type ManuscriptWorkspace, type ManuscriptStructureOperation, type ManuscriptProposalView } from "@/api/manuscripts";
import { Button } from "@/components/ui/button";
import { ManuscriptNotice } from "./ManuscriptUI";
export function ManuscriptStructurePanel({workspace,onChanged,onClose}:{workspace:ManuscriptWorkspace;onChanged:()=>void;onClose:()=>void}) {
  const {project,currentUnit,units}=workspace;
  const [kind,setKind]=useState<"insert_unit"|"deactivate_unit"|"restore_unit"|"merge_units">("insert_unit");
  const [title,setTitle]=useState(""),[purpose,setPurpose]=useState(""),[target,setTarget]=useState(currentUnit?.id??""),[other,setOther]=useState("");
  const [proposal,setProposal]=useState<ManuscriptProposalView|null>(null),[ack,setAck]=useState(false);
  const active=units.filter(unit=>unit.status==="active"),inactive=units.filter(unit=>unit.status==="inactive");
  const reset=()=>{setProposal(null);setAck(false);};
  const preview=useMutation({mutationFn:()=>{
    let operation:ManuscriptStructureOperation;
    if(kind==="insert_unit") {const index=active.findIndex(unit=>unit.id===target);operation={kind,afterUnitId:target||null,beforeUnitId:active[index+1]?.id??null,title,purpose};}
    else if(kind==="deactivate_unit")operation={kind,unitId:target,expectedUnitRevision:units.find(unit=>unit.id===target)!.workingRevision};
    else if(kind==="restore_unit")operation={kind,unitId:other,afterUnitId:target||null};
    else operation={kind,unitIds:[target,other],title};
    return previewManuscriptStructure(project.id,{expectedStructureVersion:project.structureVersion,unitId:currentUnit?.id,operations:[operation],requestKey:crypto.randomUUID()});
  },onSuccess:value=>{setProposal(value);setAck(false);}});
  const apply=useMutation({mutationFn:()=>applyManuscriptProposal(project.id,proposal!.id,{expectedStructureVersion:project.structureVersion,confirmImpact:true,requestKey:crypto.randomUUID()}),onSuccess:()=>{onChanged();onClose();}});
  const canPreview=kind==="insert_unit"?!!title.trim()&&!!purpose.trim():kind==="restore_unit"?!!other:kind==="merge_units"?!!title.trim()&&!!target&&!!other&&target!==other:!!target;
  const unitTitle=(id:string,after=false)=>{if(after&&kind==="merge_units"&&id===active.filter(unit=>[target,other].includes(unit.id))[0]?.id)return title;return units.find(item=>item.id===id)?.title??title??"新增章";};
  return <section className="space-y-5" aria-label="结构变化与影响确认"><p className="text-sm leading-7 text-muted-foreground">只调整当前工作稿。原文、原纲与稳定章节身份保留；后章正文不会自动重写。</p>
    {!proposal?<>
    <label className="block space-y-1 text-sm"><span>结构操作</span><select className="manuscript-field" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setOther("");reset();}}><option value="insert_unit">新增章节</option><option value="deactivate_unit">停用章节（可恢复）</option><option value="restore_unit">恢复已停用章</option><option value="merge_units">合并相邻章节</option></select></label>
    <label className="block space-y-1 text-sm"><span>{kind==="insert_unit"||kind==="restore_unit"?"放在这章之后":"目标章节"}</span><select className="manuscript-field" value={target} onChange={e=>{setTarget(e.target.value);reset();}}>{kind==="insert_unit"||kind==="restore_unit"?<option value="">放在全书开头</option>:null}{active.map(unit=><option value={unit.id} key={unit.id}>{unit.displayOrder}. {unit.title}</option>)}</select></label>
    {kind==="restore_unit"||kind==="merge_units"?<label className="block space-y-1 text-sm"><span>{kind==="restore_unit"?"需要恢复的章节":"合并的相邻章"}</span><select className="manuscript-field" value={other} onChange={e=>{setOther(e.target.value);reset();}}><option value="">请选择章节</option>{(kind==="restore_unit"?inactive:active.filter(unit=>unit.id!==target)).map(unit=><option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label>:null}
    {kind==="insert_unit"||kind==="merge_units"?<label className="block space-y-1 text-sm"><span>章节标题</span><input className="manuscript-field" value={title} onChange={e=>{setTitle(e.target.value);reset();}}/></label>:null}
    {kind==="insert_unit"?<label className="block space-y-1 text-sm"><span>本章用途与前后承接</span><textarea className="manuscript-field min-h-24" value={purpose} onChange={e=>{setPurpose(e.target.value);reset();}} placeholder="说明增章要解决什么，不会自动写入 AI 正文"/></label>:null}
    </>:<p className="text-sm font-medium">待确认：{({insert_unit:"新增章节",deactivate_unit:"停用章节（可恢复）",restore_unit:"恢复章节",merge_units:"合并相邻章节"})[kind]}{title?` · ${title}`:""}</p>}
    {!proposal?<Button variant="secondary" disabled={!canPreview||preview.isPending} onClick={()=>preview.mutate()}>{preview.isPending?"检查影响中…":"预览结构变化与影响"}</Button>:<div className="space-y-4 border-t border-border/50 pt-4"><h3 className="font-semibold">本次影响</h3>{proposal.impact?<><div className="grid grid-cols-2 gap-4 text-sm"><section><h4 className="mb-2 text-xs text-muted-foreground">变更前</h4>{proposal.impact.before.map(id=><p key={id} className="py-1">{unitTitle(id)}</p>)}</section><section><h4 className="mb-2 text-xs text-muted-foreground">变更后</h4>{proposal.impact.after.map(id=><p key={id} className="py-1">{unitTitle(id,true)}</p>)}</section></div><p className="text-sm leading-7">需重新对账：从第 {proposal.impact.invalidateFrom} 章起；受影响 {proposal.impact.affectedUnitIds.length} 章。</p>{proposal.impact.references.map((item,i)=><p key={i} className="text-sm leading-6">关联：{item}</p>)}{proposal.impact.warnings.map((item,i)=><ManuscriptNotice key={i}>{item}</ManuscriptNotice>)}</>:<p className="text-sm">请核对目标章与相邻承接；工作大纲随本次结构变更一起确认。</p>}<p className="text-sm leading-7">原稿与原纲保持只读。停用不删除正文；恢复时使用停用前的工作稿。</p><label className="flex items-start gap-2 text-sm leading-6"><input className="mt-1 accent-primary" type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>确认以上影响，仅采纳本次结构变更，不授权其他章改写</label><Button variant="ghost" disabled={apply.isPending} onClick={reset}>返回修改</Button><Button disabled={!ack||apply.isPending||proposal.status!=="pending"} onClick={()=>apply.mutate()}>{apply.isPending?"保存中…":"确认本次结构修订"}</Button></div>}
    {preview.error||apply.error?<ManuscriptNotice error>{(preview.error??apply.error)?.message}</ManuscriptNotice>:null}
  </section>;
}
