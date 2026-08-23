# 自动导演故事星图

## Background

完整新手常常只有模糊的开书感觉，直接要求其写出人物、世界、冲突与长线目标会增加认知负担；只让 AI 返回若干完整梗概，又会让用户失去组合和取舍空间。故事星图位于自动导演“起始想法”阶段，用有限的可选元素帮助用户形成明确偏好，再把选择交给 AI 收束成可继续规划的开书想法。

## Decision

故事星图采用“用户选择创作变量，AI 生成候选并完成语义组合”的边界。题材基底和推进模式一旦选定就是固定上下文，星图不得擅自替换；静态候选只用于立即展示可操作的选择面，动态候选与最终起始想法必须通过 Prompt Registry 中的结构化 Prompt 生成。

## Current Rule

- 星图固定包含六个维度：人物底色、世界压力、开局钩子、长线欲望、关键变量、关系张力。
- 每个维度最多选择一项。前端只做选择互斥、布局和已有选择保留，不用关键词推断用户意图。
- 动态候选合同固定返回 24 项，即六个维度各四项；每项包含稳定类别、短标签、解释和匹配度，ID 与标签必须唯一。
- 候选必须兼容当前题材基底、主推进模式和副推进模式。缺失上下文可以补足，但不能让单个候选提前变成完整故事梗概。
- 最终组合合同接收用户真实选择和固定开书上下文，输出 45～220 字的单段起始想法。AI 必须把元素整理成因果关系，不能机械拼接标签。
- 结构化失败时只允许携带原始业务上下文进行一次受控重试；传输错误直接上抛，不使用脱离上下文的通用修复补造创意内容。
- 星图只负责起始想法，不新增自动导演运行阶段、恢复检查点或任务投影阶段。组合结果写回已有想法输入，再沿原创建流程继续。

## Examples

- 用户已选择都市职场与悬念博弈：候选可以补充人物处境、组织压力和关系张力，但不能把题材改成仙侠或把推进方式改成无敌碾压。
- 用户只选择“无法公开真实身份”的关系变量：组合 Prompt 可以轻量补足主角行动和开局牵引，使结果可直接开书，但不能压过该选择另造复杂主线。

## Failure Modes

- 六类数量不齐或类别重复：检查结构化 Schema、示例和模型输出预算，不在 service 中补齐虚构选项。
- 候选结构正确但偏离题材或推进方式：检查开书上下文装配，并使用原始上下文重试；不要让无业务上下文的 JSON repair 重写创意。
- 组合结果只是标签串联：调整组合 Prompt 的因果约束或语义重试条件，不在前端用模板拼句。
- 刷新候选后已选择内容消失：检查前端候选轮换与选择保留规则；这属于确定性状态处理，不应交给 AI 判断。
- 星图被加入恢复阶段或任务进度：撤回阶段扩张。它是创建页中的可选构思工具，不是独立生产阶段。

## Related Modules

- `shared/types/novelDirector.ts`
- `server/src/prompting/prompts/novel/ideaConstellation/`
- `server/src/services/novel/director/idea/`
- `server/src/services/novel/director/http/novelDirector.ts`
- `client/src/pages/novels/autoDirector/ideaConstellation/`
- `client/src/pages/novels/autoDirector/StageIdea.tsx`

## Source Documents

- [Prompt Registry 与结构化输出](../prompts/prompt-registry-and-structured-output.md)
- [自动导演新增阶段检查清单](./auto-director-stage-checklist.md)
