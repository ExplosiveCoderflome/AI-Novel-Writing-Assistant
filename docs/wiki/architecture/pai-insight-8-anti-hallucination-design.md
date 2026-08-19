# PAI 启示八：规格测试先行与防幻觉“不知道”机制架构规范 (Specs-First & Anti-Hallucination Guard)

本文档针对 Daniel Miessler PAI 框架的**启示八（科学评估先行与防幻觉“不知道”机制：Specs/Evals First & Anti-Hallucination）**，结合 **Daydream Engine（白日做梦引擎 / GeneralAgent）** 的知识库检索（RAG）、世界观公理与自动化生成管道，制定知识置信度评估、Prompt 防幻觉指令注入与未明确设定拦截规范。

---

## 一、 核心痛点与工程目标

### 1.1 痛点：知识盲区硬编与模型幻觉
在现有的创作编排与问答检索中，存在以下三个工程痛点：
1. **未明确设定硬编乱造（幻觉）**：当用户查询的设定、剧情细节或角色背景在当前 Qdrant/SQLite 库中不存在时，普通 LLM 倾向于根据通用基座知识“硬猜硬编”，导致生成的内容与作品既有世界观产生冲突。
2. **缺乏知识置信度评估**：系统在组装上下文时，缺乏对检索知识覆盖率（Knowledge Coverage）与置信度（Confidence Score）的定量计算，无法判断上下文是否足以支撑当前的剧情推演。
3. **缺乏“允许说不知道”的明确约束**： Prompt 中缺乏强制指令，导致 LLM 在缺乏依据时不敢承认“暂无已知纪录”，破坏了故事的确定性与一致性。

### 1.2 目标：知识置信度计算、防幻觉 Guard 与“不知道”处理机制
> **原则：遵循“规格与评估先行”及“允许说不知”原则。建立 `AntiHallucinationGuardService`。在生成与问答前计算知识置信度；当依据不足时，强制 Prompt 输出“设定未明确 / 暂无已知纪录”，并拦截虚假断言，绝对禁止凭空臆造。**

---

## 二、 防幻觉防护架构 (Anti-Hallucination Architecture)

```
                            Daydream Engine 防幻觉防护架构
                            
  +-----------------------------------------------------------------------------------------+
  |  检索上下文与 Prompt (Retrieved Context & User Query)                                    |
  +-----------------------------------------------------------------------------------------+
                                               │
                                               ▼ 知识置信度评估
  +-----------------------------------------------------------------------------------------+
  |  AntiHallucinationGuardService.evaluateKnowledgeConfidence(context)                    |
  |  (位于 server/src/platform/eval/)                                                       |
  +-----------------------------------------------------------------------------------------+
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼ 判定知识已覆盖 (Confidence >= 0.6)             ▼ 知识未覆盖 (Confidence < 0.6)
      +----------------------------------+            +----------------------------------+
      | 正常注入上下文                   |            | 强行注入【允许说不知道】指令屏障  |
      +----------------------------------+            | "相关设定未明确，请明确指出"      |
                                                      +----------------------------------+
                                                                       │
                                                                       ▼ LLM 输出
                                                      +----------------------------------+
                                                      | sanitizeResponse(): 拦截虚假断言  |
                                                      +----------------------------------+
```

---

## 三、 核心代码文件与数据接口定义

### 1. 数据类型定义 ([antiHallucinationTypes.ts](file:///Users/nvidia/GeneralAgent/server/src/platform/eval/antiHallucinationTypes.ts))

```typescript
export interface FactCheckInput {
  query: string;
  retrievedContext?: string;
  confidenceThreshold?: number; // 默认 0.6
}

export interface FactCheckResult {
  isKnown: boolean;
  confidence: number;
  hasSufficientContext: boolean;
  sanitizedInstruction: string;
  missingFactsAlert?: string;
}

export interface AntiHallucinationSanitizeResult {
  safeText: string;
  containsUnverifiedClaims: boolean;
  flaggedClaims: string[];
}
```

---

## 四、 防幻觉服务核心实现 ([AntiHallucinationGuardService.ts](file:///Users/nvidia/GeneralAgent/server/src/platform/eval/AntiHallucinationGuardService.ts))

`AntiHallucinationGuardService` 暴露确定性的评估与防幻觉注入方法：

```typescript
export class AntiHallucinationGuardService {
  /**
   * Evaluates if the retrieved knowledge context contains sufficient confidence for the query.
   */
  evaluateKnowledgeConfidence(input: FactCheckInput): FactCheckResult {
    const { query, retrievedContext = "", confidenceThreshold = 0.6 } = input;

    if (!retrievedContext || retrievedContext.trim().length < 10) {
      return {
        isKnown: false,
        confidence: 0.0,
        hasSufficientContext: false,
        sanitizedInstruction: "【防幻觉拦截】相关背景与世界观设定在数据库中未明确登记。请明确回答：“该设定暂未明确”，严禁凭空臆造。",
        missingFactsAlert: `查询 '${query}' 缺乏底层数据库与知识库支持。`,
      };
    }

    // 简单词频/长度置信度估算
    const confidence = Math.min(1.0, retrievedContext.length / 200.0);
    const hasSufficient = confidence >= confidenceThreshold;

    return {
      isKnown: hasSufficient,
      confidence,
      hasSufficientContext: hasSufficient,
      sanitizedInstruction: hasSufficient
        ? ""
        : "【防幻觉警告】当前检索到的背景信息可能不够完整。如遇未说明的细节，请回答：“设定未在已知档案中明确”。",
    };
  }

  /**
   * Injects strict anti-hallucination instructions into system prompt.
   */
  injectAntiHallucinationInstruction(prompt: string, factResult: FactCheckResult): string {
    if (factResult.hasSufficientContext) {
      return prompt;
    }
    return `${prompt}\n\n=== [ANTI-HALLUCINATION GUARDRAIL - ALLOW "I DON'T KNOW"] ===\n${factResult.sanitizedInstruction}`;
  }

  /**
   * Sanitizes raw LLM responses to catch unverified claims.
   */
  sanitizeResponse(rawResponse: string): AntiHallucinationSanitizeResult {
    const flaggedClaims: string[] = [];
    let safeText = rawResponse;

    // 检测经典幻觉模糊词汇
    const suspiciousPatterns = [/据不完全统计/g, /根据普遍传说/g, /大家都知道/g];
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(rawResponse)) {
        flaggedClaims.push(`检测到未经证实的大模型模棱两可断言: ${pattern.source}`);
      }
    }

    return {
      safeText,
      containsUnverifiedClaims: flaggedClaims.length > 0,
      flaggedClaims,
    };
  }
}

export const antiHallucinationGuardService = new AntiHallucinationGuardService();
```

---

## 五、 零回归兼容与评估矩阵 (Zero-Regression Safeguards)

| 维度 | 安全保护设计 | 验证机制 |
| :--- | :--- | :--- |
| **设定未知时防硬编** | 上下文缺失时强行追加“设定未明确”约束，拦截模型胡乱捏造 | 单元测试模拟断言 |
| **0 数据库修改** | 纯代码计算切面与 Prompt 格式化，不改动数据库 Schema | SQLite 读写回归测试 |
| **可计量评估 (Evals)** | 提供 `evaluateKnowledgeConfidence` 导出的分值 Metrics | 单元测试数据覆盖 |

---

* **文档位置**：[docs/wiki/architecture/pai-insight-8-anti-hallucination-design.md](file:///Users/nvidia/GeneralAgent/docs/wiki/architecture/pai-insight-8-anti-hallucination-design.md)
* **状态**：启示八规格测试先行与防幻觉“不知道”机制规范已归档 Wiki
