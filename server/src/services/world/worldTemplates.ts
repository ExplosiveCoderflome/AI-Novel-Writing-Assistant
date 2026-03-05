import type { WorldLayerKey, WorldTemplate } from "@ai-novel/shared/types/world";

export const WORLD_LAYER_ORDER: WorldLayerKey[] = [
  "foundation",
  "power",
  "society",
  "culture",
  "history",
  "conflict",
];

export const LAYER_FIELD_MAP: Record<
  WorldLayerKey,
  Array<
    | "background"
    | "geography"
    | "magicSystem"
    | "technology"
    | "races"
    | "politics"
    | "factions"
    | "cultures"
    | "religions"
    | "economy"
    | "history"
    | "conflicts"
    | "description"
  >
> = {
  foundation: ["background", "geography"],
  power: ["magicSystem", "technology"],
  society: ["races", "politics", "factions"],
  culture: ["cultures", "religions", "economy"],
  history: ["history"],
  conflict: ["conflicts", "description"],
};

export const WORLD_TEMPLATES: WorldTemplate[] = [
  {
    key: "xuanhuan_eastern",
    name: "东方玄幻",
    description: "以修炼体系、宗门势力和天地法则为核心。",
    worldType: "东方玄幻",
    requiredLayers: ["foundation", "power", "society", "history", "conflict"],
    optionalLayers: ["culture"],
    classicElements: ["宗门", "秘境", "境界突破", "天材地宝", "王朝/世家"],
    pitfalls: ["境界不要过多", "力量代价要明确", "宗门势力边界要清晰"],
  },
  {
    key: "xianxia",
    name: "仙侠",
    description: "强调仙凡分界、飞升体系和天道规则。",
    worldType: "仙侠",
    requiredLayers: ["foundation", "power", "society", "history", "conflict"],
    optionalLayers: ["culture"],
    classicElements: ["飞升", "洞天福地", "因果", "渡劫", "仙门"],
    pitfalls: ["天道规则不可自相矛盾", "飞升路径必须闭环"],
  },
  {
    key: "urban_superpower",
    name: "都市异能",
    description: "现代社会中的超凡能力与隐秘组织。",
    worldType: "都市异能",
    requiredLayers: ["foundation", "power", "society", "conflict"],
    optionalLayers: ["culture", "history"],
    classicElements: ["异能等级", "特勤组织", "地下势力", "都市规则"],
    pitfalls: ["超凡与现实社会的冲突必须可解释"],
  },
  {
    key: "scifi",
    name: "科幻",
    description: "强调技术树、社会结构与文明冲突。",
    worldType: "科幻",
    requiredLayers: ["foundation", "power", "society", "history", "conflict"],
    optionalLayers: ["culture"],
    classicElements: ["AI", "星际政治", "跃迁技术", "公司联盟", "殖民地"],
    pitfalls: ["科技水平要前后一致", "关键技术边界必须明确"],
  },
  {
    key: "western_fantasy",
    name: "西方奇幻",
    description: "多种族、多神话体系与冒险叙事。",
    worldType: "西方奇幻",
    requiredLayers: ["foundation", "power", "society", "history", "conflict"],
    optionalLayers: ["culture"],
    classicElements: ["精灵", "龙", "王国联盟", "学院", "圣物"],
    pitfalls: ["种族设定差异要服务于冲突"],
  },
  {
    key: "post_apocalypse",
    name: "末日废土",
    description: "资源稀缺下的生存秩序与变异体系。",
    worldType: "末日废土",
    requiredLayers: ["foundation", "power", "society", "conflict"],
    optionalLayers: ["history", "culture"],
    classicElements: ["避难所", "感染者", "拾荒者", "资源点", "荒野组织"],
    pitfalls: ["生存资源循环要可运转"],
  },
  {
    key: "historical_alt",
    name: "历史架空",
    description: "历史偏转点触发的新政治与文明格局。",
    worldType: "历史架空",
    requiredLayers: ["foundation", "society", "history", "conflict"],
    optionalLayers: ["culture", "power"],
    classicElements: ["偏转事件", "新政权", "旧秩序残余", "史书争议"],
    pitfalls: ["偏转点前后逻辑链必须可推导"],
  },
  {
    key: "cyberpunk",
    name: "赛博朋克",
    description: "公司统治、义体改造与数字空间。",
    worldType: "赛博朋克",
    requiredLayers: ["foundation", "power", "society", "conflict"],
    optionalLayers: ["history", "culture"],
    classicElements: ["巨型公司", "义体", "黑客", "底层街区", "数据主权"],
    pitfalls: ["技术红利与阶层压迫需同时成立"],
  },
  {
    key: "custom",
    name: "自定义",
    description: "自由组合维度，适配个性化世界观需求。",
    worldType: "自定义",
    requiredLayers: ["foundation", "conflict"],
    optionalLayers: ["power", "society", "culture", "history"],
    classicElements: [],
    pitfalls: ["先定义核心公理再扩展细节"],
  },
];

export function getTemplateByKey(templateKey: string | null | undefined): WorldTemplate {
  return WORLD_TEMPLATES.find((item) => item.key === templateKey) ?? WORLD_TEMPLATES[WORLD_TEMPLATES.length - 1];
}
