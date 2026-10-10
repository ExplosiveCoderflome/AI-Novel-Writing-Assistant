# 正文章节编辑闭环

## Background

章节编辑器同时处理作者手动输入、服务端保存版本和 AI 局部改写候选。三者的时间顺序可能不同：作者继续输入时，章节列表会收到新版本；AI 候选返回时，原文可能已经变化；保存请求发出后，另一个窗口也可能先保存。若编辑器把展示文本、保存文本和 AI 目标片段混成一份状态，就会出现选区错位、旧内容覆盖新内容或保存后重复消耗章节诊断的问题。

## Decision

编辑器以“正文中心、候选先预览、用户确认后写入”为唯一交互闭环。正文坐标使用规范化后的原文 UTF-16 偏移，规范化只处理换行符，不裁剪空格、不删除空段、不把单换行改写成空格。服务端与客户端共用同一套段落和选区替换规则。

保存和接受 AI 候选必须携带打开时拿到的 `updatedAt`。服务端在写入前检查版本，发现版本变化就拒绝旧写入；编辑器保留本地草稿，作者可以先加载新的保存版本，再重新选择正文并生成候选。接受候选前先创建正文快照，候选只能替换仍与生成时完全一致的目标片段。

章节工作区诊断属于按需 AI 能力。保存正文或接受候选只刷新章节资料，不自动重新请求章节诊断；作者通过“重新分析本章”主动获取新的诊断，避免普通打字和保存动作重复消耗 Token。页面刷新或服务端推送新版本时，干净编辑器跟随新版本；有未保存输入时保留本地草稿并提示作者选择。

## Current Rule

- `shared/types/chapterEditor/document.ts` 是跨端正文坐标和替换规则的唯一来源。
- `useChapterDraft` 负责编辑中的正文、最近保存正文、保存版本时间和会话草稿恢复，不能由页面组件再维护第二份正文真源。
- AI 预览请求必须保留目标片段的 `from`、`to` 和原文；应用候选前再次校验原文，失败时要求重新选区。
- `updateChapter` 的 `expectedUpdatedAt` 是编辑器保存和候选接受的并发保护字段；其他后台写入不得绕过章节生命周期的版本约束。
- 任务中心只展示运行记录和影响分析。半自动导演的“确认手动修改并继续”应继续放在小说工作区或正文编辑来源页，由作者看到正文上下文后执行。

## Failure Modes

- 只比较章节 ID：旧窗口会覆盖新正文。应使用 `expectedUpdatedAt` 并在冲突后保留本地草稿。
- 对正文 `trim` 或压缩空白：会改变选区偏移，导致 AI 候选替换错误位置。应保留原文空格、空段和单换行。
- 保存后无条件刷新工作区：会再次调用诊断 AI，把普通保存变成额外用量。应使用显式“重新分析本章”。
- AI 候选返回后直接写入：用户在等待期间的输入会丢失。应先校验目标片段，再创建快照并接受候选。

## Related Modules

- `client/src/pages/novels/components/chapterEditor/document/`
- `client/src/pages/novels/components/chapterEditor/ChapterEditorShell.tsx`
- `server/src/services/novel/chapterEditor/context/`
- `server/src/services/novel/novelCoreCrudService.ts`
- `server/src/services/novel/director/runtime/DirectorWorkspaceAnalyzer.ts`
