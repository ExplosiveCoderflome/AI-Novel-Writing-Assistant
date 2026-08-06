# 📚 Wiki: 美股投研 Agent 基于 ACM 范式的上下文治理与复盘演化架构

## 背景与痛点 (Background & Problems)
在美股量化投研与个人操盘场景中，智能体面临高吞吐行情、实时新闻流与长周期履约日志。经典大模型堆叠 Prompt 会导致注意力污染（Context Pollution）、Token 上限爆表与逻辑跳跃。

ACM 论文 (*Agentic Context Management for Long-Horizon Tasks*, CMU & Meta 2026, [arXiv:2607.23809](https://arxiv.org/abs/2607.23809)) 提出了 Agent-Native 上下文压缩与无损外部持久化。本项目据此构建了工业级美股投研 Agent 架构。

---

## 核心架构原则 (Core Architecture Principles)

### 1. 三层无损记忆架构 (3-Tier Lossless Memory)
- **Hot Memory (热记忆)**: 内存/State 维护 OpenD 实时现价、闲置资金与今日 3 大指南卡片；
- **Warm Memory (温记忆)**: 每股知识图谱 (SKG)，Agent-Native 自主将成千上万字美股新闻压缩为轻量关系节点 (`knowledgeGraphNodes`) 与催化快讯 (`newsCatalysts`)；
- **Cold Memory (冷记忆)**: SQLite 持久化落库 `StockDailyStrategy`，无损保留历史策略快照用于跨周期复盘。

### 2. 三大核心指南与履约归因闭环 (3 Core Guidance Cards)
- **【指南一】：已有仓位增减与健康度诊断**（持仓集中度 >30% 风险拦截与减仓防线）；
- **【指南二】：新仓位建立与自选风口挖潜**（闲置资金/新增预算分配，优先 MooMoo 19 笔自选池）；
- **【指南三】：昨日指南复盘与沉淀优化**（历史指令 vs 真实持仓变化跟单率计算与纪律法则蒸馏）。

### 3. 确定性风控数学校准层 (Guardrail Layer)
- AI 仅负责交易方向决策 (`action`) 与逻辑阐述 (`rationale`)；
- 估算股价必须 100% 由 OpenD 实盘现价硬锁定替换；
- 买入股数受资金上限拦截公式硬约束：$\sum (\text{suggestedShares} \times \text{livePrice}) \le \text{CapitalCap}$。

---

## 数据流与组件关系 (Data Flow & Components)

```
OpenD Socket TCP (Cmd 3001/3004) ──► moomooAdapter.ts ──► stockRoutes.ts
                                                            │
                                                            ▼
                                               dailyStrategyDirector.ts
                                                            │
                                                            ▼
                                               stock.prompts.ts (@v1)
                                                            │
                                                            ▼
                                               Structured Output Zod
                                                            │
                                                            ▼
                                               applyGuardrails (纯数学校验)
                                                            │
                                                            ▼
                                               StockStudioPage.tsx (渲染)
```

---

## 调试与运维路线 (Debugging & Diagnosis)
1. **查看 OpenD 连通状态**：访问 `GET /api/stock/opend/status`；
2. **校验全流程数学校准**：在前端点击 `⚙️ 生成过程` 查看 5 步数据审计卡片与 3001/3004 抓取日志；
3. **查验历史跟单跟进率**：从数据库查询 `StockDailyStrategy` 比对最新 `StockPosition`。
