# 结构化抽取遇到模型"差不多对"的输出：用 preprocess 归一化，不要只靠 LLM repair（issue #176）

## 背景

用户用 gemini-3.5-flash 跑导演 V2，章节产物抽取
（`novel.chapter.artifact_delta.extract@v9`）报
`[STRUCTURED_OUTPUT:schema_mismatch]`，导演暂停。两个字段没过校验：

- `stateDeltas.foreshadowStates[0].title`：expected string, received undefined
 （模型漏写了标题）
- `characterMindDeltas[0].confidence`：expected number, received string
  （模型写了 `"0.8"` 这样的字符串）

注意错误信息里还有一句"JSON repair 后仍未通过 Schema 校验"：
`structuredInvokeRepair.ts` 的 repair 是**再调一次 LLM** 按错误信息重修。
LLM repair 擅长修 JSON 语法和明显的结构错，但对"字段类型差一点"
（字符串数字、缺失的可推导字段）经常修不回来——它看不到"转一下类型
就能用"这种确定性操作。

## 决策

这类"差一点就能用"的输出，用 zod `z.preprocess` 做确定性归一化，
放在 schema 校验之前；LLM repair 只处理 preprocess 也救不了的真结构错。
这是"对已结构化 AI 输出的确定性后处理"，符合 AI-First 规则允许的固定判断。

## 当前规则

- `chapterArtifactDelta.prompts.ts` 已有归一化器家族（`normalizeArtifactDeltaOutput` /
  `normalizeRelationDynamic` / `normalizeCharacterResourceDelta` /
  `normalizePayoffDelta` / `normalizeCharacterCandidate` / `normalizeSyncPlan`），
  新增脆弱字段走同一模式：`z.preprocess(normalizeXxx, schema)`。
- #176 新增：
  - `normalizeCharacterMindDelta`：confidence 字符串转数字（支持百分号，
    大于 1 按百分比折算），夹到 [0,1]；解析失败回退 0.5（与顶层 confidence
    的既有回退一致）。
  - `normalizeForeshadowState`：缺失 title 时先找别名字段
    （foreshadowTitle/name/label），再从 summary 截前 24 字，兜底"未命名伏笔"。
    title 被下游当展示标识（`${item.title}(${item.status})`），不能留 undefined。
- 归一化只放宽"可确定性修复"的偏差；真正的结构错（缺必填大对象、数组套错层）
  仍走 LLM repair → schema_mismatch 报错的老路，不要把 preprocess 写成万能胶。

## 失败模式

- 现象「`[STRUCTURED_OUTPUT:schema_mismatch]` + 导演暂停」，先看具体是哪个
  字段没过：如果是类型小偏差/可推导缺失，优先加 preprocess 归一化；
  只有 preprocess 表达不了的，才去动 repair prompt 或放宽 schema。
- 同一家族的 issue（#175 是 world 生成的 schema_mismatch）修法相通，
  但每个 task 的 schema 是独立的，要按 task 加归一化，不要做全局字符串替换。

## 相关模块

- `server/src/prompting/prompts/novel/chapterArtifactDelta.prompts.ts`
  （normalizers + `chapterArtifactDeltaOutputSchema`）
- `server/src/prompting/prompts/novel/characterMind.promptSchemas.ts`
  （`characterMindDeltaSchema`，被 artifact delta 引用）
- `server/src/llm/structuredInvokeRepair.ts`（LLM repair 链路）
- `server/tests/chapterStructuredOutputNormalization.test.js`（回归测试）
- issue #176
