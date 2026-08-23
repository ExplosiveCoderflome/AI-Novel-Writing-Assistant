import {
  DIRECTOR_IDEA_CONSTELLATION_CATEGORIES,
  type DirectorIdeaConstellationCategory,
  type DirectorIdeaConstellationOption,
  type DirectorIdeaConstellationRelevance,
} from "@ai-novel/shared/types/novelDirector";

type StaticConstellationEntry = readonly [label: string, hint: string];

const STATIC_CONSTELLATION_LIBRARY: Record<DirectorIdeaConstellationCategory, readonly StaticConstellationEntry[]> = {
  protagonist: [
    ["清醒克制的野心家", "知道自己想要什么，也知道每一步会伤害谁。"],
    ["嘴硬心软的利己者", "总把自己放在第一位，却会为某个人反复破例。"],
    ["把胜利当作赎罪", "不断向前不是为了荣耀，而是不敢面对那次失败。"],
    ["害怕被爱的拯救者", "擅长救别人，却会在关系真正靠近时主动推开。"],
    ["只信结果的理想派", "目标看似正确，手段却逼近自己最厌恶的人。"],
    ["擅长伪装的局外人", "能融入任何人群，却从未相信自己属于哪里。"],
    ["不肯低头的失败者", "输掉一切后，仍拒绝让命运替自己下结论。"],
    ["温柔但绝不原谅", "愿意理解所有人的处境，却不会替伤害抹去代价。"],
  ],
  setting: [
    ["规则只保护胜利者", "秩序看似公平，失败者却连解释的资格都没有。"],
    ["资源正加速枯竭", "所有阵营都知道和平无法维持，却没人愿意先退让。"],
    ["所有人活在谎言里", "共同生活依赖同一个秘密，真相反而会带来毁灭。"],
    ["新旧秩序即将交替", "旧规则仍有力量，新规则却已开始争夺人心。"],
    ["安全建立在牺牲上", "多数人的安稳，需要少数人持续承担看不见的代价。"],
    ["真相会摧毁共同体", "揭开秘密能够伸张正义，也可能毁掉所有人的归处。"],
    ["权力正在重新洗牌", "过去可靠的身份与联盟随时可能失去作用。"],
    ["每个人都可以被替代", "能力和忠诚都不稀缺，只有不可复制的选择能留下人。"],
  ],
  opening_crisis: [
    ["主角失去最后退路", "逃避与拖延都不再可行，第一章就必须作出选择。"],
    ["最安全的人先背叛", "原本可靠的关系突然反转，主角必须重建判断。"],
    ["秘密被错误地公开", "部分真相落入众人眼中，误解比秘密本身更危险。"],
    ["必须救下不该救的人", "救人符合良心，却会立刻破坏主角最重要的计划。"],
    ["一次胜利引来灾难", "主角如愿赢下眼前局面，却暴露了更大的弱点。"],
    ["对手主动送来答案", "最想知道的真相唾手可得，但提供者绝不可信。"],
    ["主角被迫公开站队", "保持中立的空间消失，每个选择都会制造新的敌人。"],
    ["旧账在最坏时刻重启", "主角最想埋葬的过去，偏偏在新生活刚稳定时回归。"],
  ],
  core_goal: [
    ["赢回决定人生的权利", "主角真正争夺的不是胜负，而是不再被别人安排。"],
    ["建立不会失去的归处", "每一次扩张与守护，都在回答哪里才算真正的家。"],
    ["让错误规则付出代价", "主角不仅要打败某个人，还要改变制造悲剧的秩序。"],
    ["成为无法替代的人", "主角必须建立独特价值，也要面对被需要是否等于被爱。"],
    ["弄清自己究竟是谁", "身份答案会持续改变主角对过去与未来的判断。"],
    ["保护仅剩的真实关系", "外部利益不断要求主角拿最重要的人交换胜利。"],
    ["证明善意并非软弱", "主角要在残酷环境里赢下去，又不成为自己反对的人。"],
    ["亲手结束代际循环", "上一代留下的伤害与责任，必须在主角这里停止。"],
  ],
  story_variable: [
    ["每次获胜都要失去", "胜利从不免费，代价会持续改变主角与身边的人。"],
    ["真相只藏在谎言中", "越可信的答案越不完整，辨认动机比辨认真假更重要。"],
    ["敌人拥有同样先机", "主角掌握的优势并不独占，对手也能预判下一步。"],
    ["最强能力正在反噬", "解决问题的核心手段，也在持续制造更深的危机。"],
    ["正确选择没有好结果", "主角可以做对一件事，却无法让所有人都得到好结局。"],
    ["记忆与事实无法共存", "相信亲历感受还是外部证据，会导向完全不同的真相。"],
    ["帮助主角的人会受罚", "每一次求助都可能伤害盟友，独自承担也会带来失败。"],
    ["时间只对一方有利", "拖延会稳定地强化对手，主角必须在不完整信息下行动。"],
  ],
  relationship: [
    ["彼此利用却先动真心", "合作始于算计，真正的感情反而让双方失去主动。"],
    ["最懂主角的人必须为敌", "理解没有消除立场冲突，反而让每次交锋更准确。"],
    ["一方守护一方只想逃", "越用力保护，越让对方感到自己的选择被剥夺。"],
    ["两人只能有一个被原谅", "共同旧错把两人绑在一起，宽恕却成了稀缺资源。"],
    ["信任来自共同的罪", "双方最牢固的纽带，也是随时能够毁掉彼此的证据。"],
    ["爱意与立场无法共存", "感情真实存在，但任何妥协都会背叛各自守护的人。"],
    ["救赎者才是真正囚徒", "看似被拯救的一方逐渐自由，施救者却困在责任里。"],
    ["背叛是对方唯一保护", "最伤人的选择可能出于保护，但真相不能立刻公开。"],
  ],
};

const RELEVANCE_BY_POSITION: readonly DirectorIdeaConstellationRelevance[] = [
  "high",
  "medium",
  "medium",
  "low",
];

const OPTIONS_PER_CATEGORY = 4;
const PACK_COUNT = 2;

export function buildStaticIdeaConstellationOptions(packIndex = 0): DirectorIdeaConstellationOption[] {
  const normalizedPackIndex = ((packIndex % PACK_COUNT) + PACK_COUNT) % PACK_COUNT;
  const start = normalizedPackIndex * OPTIONS_PER_CATEGORY;

  return DIRECTOR_IDEA_CONSTELLATION_CATEGORIES.flatMap((category) => (
    STATIC_CONSTELLATION_LIBRARY[category]
      .slice(start, start + OPTIONS_PER_CATEGORY)
      .map(([label, hint], index) => ({
        id: `static-${category}-${start + index + 1}`,
        category,
        label,
        hint,
        relevance: RELEVANCE_BY_POSITION[index] ?? "medium",
      }))
  ));
}
