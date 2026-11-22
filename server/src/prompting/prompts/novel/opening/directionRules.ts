import type { PromptSlotDefReplace } from "../../../slots/slotTypes";

export const directionPairRules: PromptSlotDefReplace[] = [
  {
    key: "directions.fork", label: "从哪里拉开差异", kind: "replace", maxLength: 3000,
    description: "决定两条路线优先在哪些地方走向不同，例如主角想得到什么、愿意付出什么代价。",
    default: "从本次想法中找出最影响整本书的一处分岔，给出两种都值得写的答案。在作者留有选择的地方，让两条路线至少在主角追求的结果、持续面对的阻力、反复采取的行动、每轮成败的回报中拉开两项。根据本次灵感决定方向，不套用固定题材配对。",
  },
  {
    key: "directions.choice", label: "怎样一句话说清方向", kind: "replace", maxLength: 3000,
    description: "决定作者并排看两条方向时，第一眼会读到什么。",
    default: "choice 用一句话说清选这条会写什么，尽量用 12 至 28 个字，脱离书名和标签也能读懂。把主角反复采取的行动、每轮成败的后果和读者期待写入 engine。",
  },
  {
    key: "directions.contrastCheck", label: "怎样判断两条路线足够不同", kind: "replace", maxLength: 3000,
    description: "写下两条路线太像时，AI 应该重新比较什么。",
    default: "试着互换两套的典型行动和阶段回报。如果换个书名、道具、叙述视角或气氛后仍是相同的故事，就重选分岔，直到两条路线会写出不同的关键决定和后果。",
  },
];

export const candidateExpansionRules: PromptSlotDefReplace[] = [
  {
    key: "candidates.conflict", label: "主角选择与核心冲突", kind: "replace", maxLength: 3000,
    description: "决定同一个主角在两套完整方案里遇到什么阻力、做出怎样的选择。",
    default: "沿各自已定的路线，写出主角为达成目标必须采取的关键行动、谁会阻拦他，以及这样做会改变哪段关系。让主卖点、主冲突和主角成长体现这条路线独有的选择。",
  },
  {
    key: "candidates.progression", label: "开篇与后续推进", kind: "replace", maxLength: 3000,
    description: "决定两套方案如何从第一场选择开始，持续带给读者不同的期待。",
    default: "让开篇就出现本路线特有的选择。说明主角之后会反复面对什么挑战、每轮成败会带来什么新局面，以及这怎样导向不同的结局。两案的开篇悬念和后续推进方式都应看得出区别。",
  },
  {
    key: "candidates.contrastCheck", label: "完整方案的对照标准", kind: "replace", maxLength: 3000,
    description: "决定读者比较两套全文时，哪些细节最能看出差别。",
    default: "隐去书名和读感标签再读两套梗概，看能否各自对应到已定的方向。若关键行动与后果可以互换，重新展开撞车的部分。读感标签应来自写出的故事。",
  },
];
