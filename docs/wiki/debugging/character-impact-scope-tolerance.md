# 人物联动越界容忍

## 背景与范围

人物联动由三位审阅者（人物 / 卷章 / 伏笔）依次出结构化建议，每位只能改自己
范围内的节点与字段：人物只能改选中人物本人的六个字段；卷章只能改卷和章；
伏笔只能改伏笔节点或章的 endingHook。范围规则由
`server/src/modules/planning/outline/characterImpact/compose.ts` 确定性校验。

模型会系统性越界：伏笔审阅者常想改章的 summary、purpose、conflict、
emotionalBeat，卷章审阅者偶尔碰伏笔字段。2026-11-21 在默认路由
DeepSeek-flash 上复现：两次 `character-impact/generate` 与一次对话提案都
因此失败。

## 决策

工作台（模型生成）的建议按“过滤、不作废”处理，外部工具提交保持严格：

- 越界、已写章节、字段冲突的条目在工作台路径下跳过并记入服务端日志，
  其余可用改动照常成案；外部提交仍按原样直接拒绝。
- 跳过会留下悬空依赖：被保留的改动可能依赖一个已被跳过的节点。工作台
  路径下剪掉这类 dependsOn 引用（及自引用），提案保持结构有效；外部
  提交不剪，仍由校验报错。
- 某位审阅者的改动全部被跳过时，只对该位重试一次，重试输入里用文字重申
  该位的范围；重试仍无可用改动则继续走其他审阅者，不为此失败整轮。
- 三位审阅者跑完后仍无可用改动时，报错说真实原因：只在确实涉及已写
  章节时提已写章节，否则只说不在可改范围内。旧文案把范围越界和已写
  章节混成一句，改前的大纲没有任何章节写过正文也会报这句。
- 对话回复的 responseKind 不在 `explanation | proposal` 枚举内时，不再
  依赖一次结构化修复：按改动内容推导，有改动就是 proposal，否则是
  explanation。推导依据是模型实际给出的 changes，不是文案关键词。

## 失败模式

| 观测 | 原因与处理 |
| --- | --- |
| 提案失败，报错说超出了审阅范围或涉及已有正文 | 旧的整单作废逻辑；现改为跳过越界条目，只在全部被跳过时报真实原因 |
| 跳过后提案报依赖必须是同一提案里的操作编号 | 被跳过的节点仍被其他改动依赖；工作台路径已剪掉这类悬空引用 |
| 对话轮次报 responseKind 不在枚举内，自动修复也没修回来 | 模型用了枚举外的标签；现按 changes 有无推导 responseKind |

## 相关模块

`modules/planning/outline/characterImpact/compose.ts`、
`modules/planning/outline/characterImpact/CharacterImpactService.ts`、
`prompting/prompts/outline/characterImpact.prompt.ts`、
`shared/types/outlineCharacterImpact.ts`。回归测试在
`server/tests/outlineCharacterImpact.test.js`（越界跳过、单角色重试、
全部跳过报错、已写章节跳过、responseKind 推导）。
