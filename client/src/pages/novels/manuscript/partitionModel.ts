import type { ManuscriptPartitionUnit } from "@ai-novel/shared/types/manuscript";

export const manuscriptRoleLabels = {body:"正文章",toc:"目录区 · 保留附属",front_matter:"前言 · 保留附属",back_matter:"后记 · 保留附属",other_reviewed:"其他 · 保留附属"} as const;
/** Move a shared edge, preserving the partition on both sides. Server verifies source coordinates. */
export function moveManuscriptBoundary(units:ManuscriptPartitionUnit[], draftId:string, start:number):ManuscriptPartitionUnit[] {
  const index=units.findIndex(item=>item.draftId===draftId);
  if(index<=0 || !Number.isInteger(start) || start<=units[index-1].range.start || start>=units[index].range.end) throw new Error("切分点需位于前一区域起点与本区域终点之间。");
  return units.map((unit,i)=>i===index-1?{...unit,range:{...unit.range,end:start}}:i===index?{...unit,range:{...unit.range,start}}:unit);
}
export function splitManuscriptUnit(units:ManuscriptPartitionUnit[], draftId:string, offset:number, newId:string):ManuscriptPartitionUnit[] {
  const unit=units.find(item=>item.draftId===draftId);
  if(!unit || !Number.isInteger(offset) || offset<=unit.range.start || offset>=unit.range.end) throw new Error("请在当前区域内部选择切分点。");
  return units.flatMap(item=>item.draftId!==draftId?[item]:[{...item,range:{...item.range,end:offset},needsReview:true},{...item,draftId:newId,title:"待命名章节",range:{start:offset,end:item.range.end},needsReview:true}]);
}
export function mergeManuscriptPrevious(units:ManuscriptPartitionUnit[],draftId:string):ManuscriptPartitionUnit[] {
  const index=units.findIndex(item=>item.draftId===draftId);
  if(index<=0) throw new Error("首个区域没有可合并的前一区域。");
  return units.filter((_,i)=>i!==index).map((item,i)=>i===index-1?{...item,range:{start:item.range.start,end:units[index].range.end},needsReview:true}:item);
}
export function manuscriptPageItems<T>(items:T[],page:number,pageSize=40):T[] {
  return items.slice(Math.max(0,page)*pageSize,(Math.max(0,page)+1)*pageSize);
}
