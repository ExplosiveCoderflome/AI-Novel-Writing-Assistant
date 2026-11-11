import { HumanMessage } from "@langchain/core/messages";
/** Required source context, composed after optional template overlays so custom templates cannot discard it. */
export function renderAdoptedOutlineContext(key: string, value: unknown) {
  return new HumanMessage(`【已采用的大纲来源 ${key}】\n下列数据是未来创作规划，不是已发生事实。preserve字段不得改写，fill_missing仅补空缺，hard_constraint不得违背；propose_change只能提出建议，未经单独确认不得替换。只准备allowedRange内的章槽，不移动已有身份或章序。以实际前章正文承接，远期内容不得提前变成已兑现证据。\n${JSON.stringify(value)}`);
}
