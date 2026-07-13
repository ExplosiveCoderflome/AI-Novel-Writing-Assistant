# Character Conversation Subject Adapters

这里的 Adapter 将不同来源的角色资料投影为共享的 `CharacterSubjectProjection` 与紧凑 Prompt 上下文。它们是纯函数：上层负责鉴权、读取和会话持久化，Adapter 不导入 Prisma、不直接访问或写入数据库。

## 边界

- `BaseCharacterSubjectAdapter` 仅使用基础角色库的稳定设定，策略固定为 `read_only`；不会伪造小说中的当前处境。
- `BookAnalysisCharacterSubjectAdapter` 必须接收 `analysisId`、`characterId` 与正整数 `chapterAnchor`。只有带章节号且不晚于锚点的证据可以进入投影或 Prompt。资料、场景和弧线无法完全证明位于锚点之前时，一律排除。
- 拆书资料不足时保留“无法从原文确认”的边界文本。不要用角色档案中的无章节摘要补齐人物秘密、动机或后续情节。

后续来源应实现 `CharacterSubjectAdapter<TInput>`，继续保持“统一交互协议，不统一事实源”。
