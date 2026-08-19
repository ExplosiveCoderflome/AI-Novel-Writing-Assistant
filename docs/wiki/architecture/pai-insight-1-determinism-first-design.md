# PAI 启示一：全量代码确定性优先架构设计与增强规范 (Full-Codebase Determinism-First Architecture)

本文档针对 Daniel Miessler PAI 框架的**启示一（决策层次与确定性优先：Goal → Code → CLI → Prompt → Agent）**，基于对 **Daydream Engine（白日做梦引擎 / GeneralAgent）** 全量代码库（超过 250 个 LLM 调用点与 6 大核心子系统）的全面扫描与梳理，提供覆盖全站的具象确定性设计方案与零回归（Zero-Regression）无伤兼容机制。

---

## 一、 全量代码库扫描地图 (Full Codebase Audit & Scan Map)

通过对 `server/src/` 的深度代码扫描，全站包含 6 大核心业务子系统与 250+ 处 LLM/Prompt 触发点。确定性优先（Determinism-First）改造将按子系统全量覆盖：

```
                                Daydream Engine 全量确定性防护网
                                
   +---------------------------------------------------------------------------------------+
   |  [底层防护网] 1. LLM 基础解析框架 (structuredInvokeParser.ts & structuredInvoke.ts)   |
   |   -> 全量 250+ 结构化 LLM 调用点的纯代码词法修复、强类型矫正与 Schema Default 补全      |
   +---------------------------------------------------------------------------------------+
                                                │ 辐射支持
       ┌──────────────────┬─────────────────────┼────────────────────┬──────────────────┐
       ▼                  ▼                     ▼                    ▼                  ▼
+--------------+  +---------------+  +-------------------+  +------------------+  +-------------------+
| 2. Auto-     |  | 3. Drama      |  | 4. Audit & Novel  |  | 5. World & Lore  |  | 6. Video Workshop |
| Director     |  | 短剧工坊引擎  |  | 章节审查与撰写链  |  | 世界观沙盒引擎   |  | 视频渲染引擎      |
| 导演调度引擎 |  |               |  |                   |  |                  |  |                   |
+--------------+  +---------------+  +-------------------+  +------------------+  +-------------------+
```

---

## 二、 六大核心子系统的确定性增强规范 (Subsystem Specifications)

### 1. LLM 基础解析框架 ([structuredInvokeParser.ts](file:///Users/nvidia/GeneralAgent/server/src/llm/structuredInvokeParser.ts)) — 全局地基
* **定位**：全站所有 `runStructuredPrompt` 和 `invokeStructuredLlm` 的统一解析出口。
* **确定性增强**：
  1. **纯代码词法修复 `tryFixSyntacticJson`**：在 JSON.parse 失败后，自动剔除 Markdown 包裹标记、修复尾部多余逗号、替换非标引号、自动补全括号。
  2. **纯代码类型矫正 `applyDeterministicCoercion`**：在 Zod Validation 前自动完成字符串数字/布尔值隐式转换、单项包装为数组。
  3. **Schema Defaults 自动填充**：对于缺漏的非核心字段，依据 Zod 默认值或传入的 fallback 对象在代码层注入，避免重新触发 LLM。

### 2. Auto-Director 导演调度引擎 ([DirectorCommandService.ts](file:///Users/nvidia/GeneralAgent/server/src/services/novel/director/commands/DirectorCommandService.ts))
* **定位**：全书/卷章级别的自动化规划与指令分发中心。
* **确定性增强**：
  1. **状态机与 Payload 确定性前置守卫**：在 `createCommand` 方法中拦截非法指令，若小说处于不可重入的 `running` 状态或 Payload 必填参数缺失，在代码层直接返回结构化 AppError，拦截无效任务入库与进入 Worker。
  2. **候选名与卷章 ID 代码自动生成**：若 LLM 未生成标题或 ID，由代码层通过确定性哈希和时间戳自动生成，不触发 LLM 重试。

### 3. Drama 短剧工坊引擎 ([DramaScriptService.ts](file:///Users/nvidia/GeneralAgent/server/src/services/drama/DramaScriptService.ts), [DramaQualityGate.ts](file:///Users/nvidia/GeneralAgent/server/src/services/drama/DramaQualityGate.ts))
* **定位**：小说改编短剧、剧本分集、镜头脚本与合规审查。
* **确定性增强**：
  1. **镜头时长与分镜确定性计算**：分镜脚本中的时长计算、镜头序号递增完全由 TypeScript 计算逻辑控制，不依赖 LLM 算数。
  2. **合规性正则预过滤**：在调用 `DramaComplianceService` 的 LLM 审查 Prompt 之前，先使用本地正则敏敏感词词库预检，命中硬性违规时代码层直接拦截。

### 4. Audit & Novel 章节审查与撰写链 ([AuditService.ts](file:///Users/nvidia/GeneralAgent/server/src/services/audit/AuditService.ts), [ChapterAcceptanceAssessmentService.ts](file:///Users/nvidia/GeneralAgent/server/src/services/novel/runtime/ChapterAcceptanceAssessmentService.ts))
* **定位**：小说章节字数统计、角色出场审查、质量评估与自动修补。
* **确定性增强**：
  1. **代码级前置指标审查**：字数是否达标、出场人物正则匹配、段落空行格式等确定性指标，由代码层提前算出并作为 Prompt 的事实输入，禁止 LLM 自行盲猜字数。
  2. **0 字/空正文快速拦截**：正文为空或生成失败时，代码层直接标记为 `draft_obligation_unmet`，避免发起无效的 LLM 质量评估。

### 5. World 世界观沙盒引擎 ([WorldService.ts](file:///Users/nvidia/GeneralAgent/server/src/services/world/WorldService.ts), [sandboxRoutes.ts](file:///Users/nvidia/GeneralAgent/server/src/modules/setup/world/http/sandboxRoutes.ts))
* **定位**：世界观公理 (Axioms)、势力实体、设定规则自洽性推演。
* **确定性增强**：
  1. **实体引用完整性校验**：在保存或推演新实体时，由代码层检查关联 Entity ID 是否在数据库中存在，缺失引用时直接自动补全关联或代码报错。

### 6. Video 视频渲染引擎 ([VideoRenderService.ts](file:///Users/nvidia/GeneralAgent/server/src/services/video/VideoRenderService.ts))
* **定位**：VellumReel 渲染引擎、字幕生成与音视频合成。
* **确定性增强**：
  1. **100% 确定性 CLI 执行**：音视频剪辑、FFmpeg/FFprobe 命令拼装、字幕时间轴对齐完全由本地 CLI 命令和纯 Node.js 代码处理。
  2. **路径标准化与错误清除**：静态资源 URL 转换（`/assets` 相对路径）完全在代码层完成；渲染重新开始时，代码层自动清空历史错误日志 `errorMessage`。

---

## 三、 全量 100% 零回归无伤兼容保障 (Zero-Regression Matrix)

为了确保本次全量确定性增强**不破坏任何已有功能、不改动数据库 Schema、不变更 API 接口 shape**，我们制定了以下保障矩阵：

| 保障维度 | 设计机制 | 验证方式 |
| :--- | :--- | :--- |
| **API 接口兼容** | 所有服务层公共 API (`public method`) 参数与返回值签名 100% 保持不变 | `pnpm --filter server typecheck` |
| **LLM 解析降级链** | 纯代码词法修复与类型矫正仅作为前置拦截。无法拯救的数据静默降级走原有的 `repairWithLlm` | 现有全量单元测试 Pass (`pnpm test`) |
| **数据库兼容** | 0 数据库 Schema 修改，不新增/修改/删除 Prisma migration | SQLite 数据读写校验 |
| **并发与状态安全** | 在指令服务中追加确定性锁与状态机拦截，防止并发重入破坏任务状态 | 指令重复提交测试 |

---

## 四、 详细演进路线图与验证方法

1. **第一阶段：地基增强**
   * 重构 [structuredInvokeParser.ts](file:///Users/nvidia/GeneralAgent/server/src/llm/structuredInvokeParser.ts)，实现纯代码词法修复与类型矫正，全量辐射 250+ LLM 调用点。
2. **第二阶段：导演与工作流前置拦截**
   * 重构 [DirectorCommandService.ts](file:///Users/nvidia/GeneralAgent/server/src/services/novel/director/commands/DirectorCommandService.ts)，实现指令状态机与 Payload 确定性前置守卫。
3. **第三阶段：短剧与审查子系统前置代码校验**
   * 在 [AuditService.ts](file:///Users/nvidia/GeneralAgent/server/src/services/audit/AuditService.ts) 与 [DramaComplianceService.ts](file:///Users/nvidia/GeneralAgent/server/src/services/drama/DramaComplianceService.ts) 中增加纯代码指标预检。
4. **第四阶段：全量单元测试与回归验证**
   * 编写 `determinismGuardrails.test.ts`，跑通服务器全量测试，确保零回归。

---

* **文档位置**：[docs/wiki/architecture/pai-insight-1-determinism-first-design.md](file:///Users/nvidia/GeneralAgent/docs/wiki/architecture/pai-insight-1-determinism-first-design.md)
* **状态**：全量代码扫描完成，全子系统确定性设计与零回归规范已归档
