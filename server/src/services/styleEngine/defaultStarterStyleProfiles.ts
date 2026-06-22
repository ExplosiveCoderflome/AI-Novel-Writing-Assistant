import type { DefaultStarterStyleProfileDefinition } from "./defaultTypes";

export const DEFAULT_STARTER_STYLE_PROFILES: DefaultStarterStyleProfileDefinition[] = [
  {
    key: "starter-power-up",
    templateKey: "power-up-escalation",
    name: "我的默认爽文推进写法",
    description: "适合第一次开书先跑顺目标推进、爽点兑现和章节收益点，后续可以直接在此基础上微调。",
  },
  {
    key: "starter-suspense",
    templateKey: "suspense-pressure",
    name: "我的默认悬疑压迫写法",
    description: "适合异常、规则、调查和危险逼近类故事，先帮你把压迫感和信息差稳住。",
  },
  {
    key: "starter-emotional",
    templateKey: "emotional-tension",
    name: "我的默认情绪拉扯写法",
    description: "适合关系推进、误读拉扯和情绪兑现类故事，先有一套能直接开写的关系型表达底座。",
  },
  {
    key: "starter-daily",
    templateKey: "immersive-daily",
    name: "我的默认日常浸没写法",
    description: "适合治愈、陪伴、生活经营和轻缓成长类故事，优先保证生活感和沉浸感。",
  },
  {
    key: "starter-webnovel-human",
    templateKey: "webnovel-human-continuity",
    name: "我的默认网文去 AI 味写法",
    description: "适合作为长篇网文默认底座：用户只做方向判断，AI 按写手级四轮过闸完成规划、写章、审校、回灌事实。",
  },
];
