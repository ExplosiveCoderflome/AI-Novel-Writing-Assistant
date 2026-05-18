# 角色连续性与硬事实排查

## 背景

章节连贯性问题不全是时间线问题。时间线能约束事件顺序、章节钩子和故事内时间，但人物的身份、阵营、境界、当前位置和可行动状态属于角色事实源。如果这些事实没有在角色准备阶段稳定生成，并在正文生成前进入 writer 上下文，后置审计只能发现问题，不能阻止错误进入初稿。

典型表现包括：

- 角色完整设定里的 `personality / background / development` 长期为空，导致角色只能以功能位或短描述进入后续规划。
- 角色阵营、身份标签缺失，正文把“阐教门下申公豹”误写成“截教外门弟子”。
- 角色境界或战力缺失，正文把“大罗金仙赵公明”误写成“真仙后期”。
- 已有角色状态没有进入生成前约束，正文需要靠审计或修复再兜底。

## 诊断结论

角色完整设定空字段的根因不是数据库缺列。`Character` 表已有 `personality / background / development`，但核心角色阵容的结构化输出和落库链路没有要求、保存这三项；补充角色链路已有类似字段，因此两条角色入口的结构不一致。

角色阵营和境界错误的根因也不应归到时间线。时间线只知道事件是否发生和钩子是否承接，无法天然判断“申公豹属于阐教还是截教”“赵公明当前境界是什么”。这些必须作为角色硬事实进入角色库和 writer required context。

## 当前规则

- 核心角色阵容和补充角色应输出一致的角色档案字段：`personality / background / development`。
- 角色硬事实至少包括：`identityLabel`、`factionLabel`、`stanceLabel`、`powerLevel`、`realm`、`currentLocation`、`availability`、`prohibitions`。
- 角色硬事实是写作约束，不替代 `CharacterTimeline`、`CharacterDynamics`、`StoryStateSnapshot` 或时间线模块。
- `participant_subset` 只承担软性人物简介和当前参与角色摘要，不承担不可违背事实约束。
- writer 前必须带 `character_hard_facts` required context。该块即使为空也要存在，空态要明确提示不得凭空改写角色身份、阵营、境界、所在地和行动可用性。
- 旧角色已有人工编辑内容时，自动应用角色阵容只能补空字段，不覆盖用户已填写的人物档案和硬事实。
- 审计继续作为后置检测和修复输入，但不能成为角色事实的主要来源。

## 排查路径

1. 先检查角色库中 `personality / background / development` 是否为空。如果核心角色为空而补充角色不为空，优先查角色阵容 schema 和 `applyCharacterCastOption()`。
2. 再检查角色硬事实是否进入运行时上下文。重点看 `GenerationContextPackage.characterHardFacts` 和 writer blocks 里的 `character_hard_facts`。
3. 如果正文出现阵营或境界错误，先判断角色库是否有对应硬事实；没有就修角色准备链路，有但 writer 没收到就修上下文组装。
4. 如果 writer 收到了硬事实仍写错，再进入审计、修复 prompt 或模型遵循度排查。

## 失败模式

- 只在审计阶段检测“阵营错误”，但 writer 输入里没有阵营事实：初稿会持续犯错。
- 只把阵营放在 `character_dynamics`：动态投影可能为空或被裁剪，不能承担硬约束。
- 只依赖时间线状态：时间线可发现事件顺序错乱，但不能稳定推断角色所属阵营和修为层级。
- 自动应用角色阵容覆盖人工编辑：会破坏用户已经修正过的人物设定。

## 相关模块

- `server/src/prompting/prompts/novel/characterPreparation.*`
- `server/src/services/novel/characterPrep/`
- `server/src/services/novel/characters/characterHardFacts.ts`
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`
- `server/src/prompting/prompts/novel/chapterLayeredContext.ts`
- `server/src/prompting/prompts/novel/chapterWriter.prompts.ts`
- `server/src/modules/timeline/`
