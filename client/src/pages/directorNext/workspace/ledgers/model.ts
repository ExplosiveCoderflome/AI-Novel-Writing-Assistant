import type {CharacterResourceLedgerItem} from "@ai-novel/shared/types/characterResource";
import type {WorkspaceBook} from "../model";

export function resolveLedgerChapter(book:Pick<WorkspaceBook,"chapters">,source:{chapterId?:string|null;chapterOrder?:number|null}) {
  if(source.chapterId) return book.chapters.find(chapter=>chapter.id===source.chapterId) ?? null;
  if(typeof source.chapterOrder!=="number") return null;
  const matches=book.chapters.filter(chapter=>chapter.order===source.chapterOrder);
  return matches.length===1 ? matches[0] : null;
}

export function characterResources(items:CharacterResourceLedgerItem[],novelId:string,characterId?:string) {
  return items.filter(item=>item.novelId===novelId && (!characterId || item.holderCharacterId===characterId || item.ownerCharacterId===characterId));
}

export const payoffStatusLabels={setup:"已埋设",hinted:"已提示",pending_payoff:"待兑现",paid_off:"已兑现",failed:"兑现失败",overdue:"超出兑现窗口"};
export const resourceStatusLabels={available:"可用",hidden:"隐藏",borrowed:"借用中",transferred:"已转移",lost:"已丢失",consumed:"已消耗",damaged:"已损坏",destroyed:"已毁坏",stale:"待核对状态"};
export const resourceFunctionLabels={tool:"工具",clue:"线索",weapon:"武器",proof:"证据",key:"关键凭证",cost:"代价",promise:"伏笔",hidden_card:"底牌",constraint:"限制"};
export const resourceEventLabels={introduced:"首次出现",acquired:"获得",revealed:"揭示",used:"使用",transferred:"转移",lost:"丢失",consumed:"消耗",damaged:"损坏",destroyed:"毁坏",recovered:"找回",stale_marked:"标记待核对"};
export function chapterWindow(from?:number|null,to?:number|null) {
  if(from && to) return from===to ? `第 ${from} 章` : `第 ${from}—${to} 章`;
  return from ? `第 ${from} 章起` : to ? `截至第 ${to} 章` : "未指定章节范围";
}
