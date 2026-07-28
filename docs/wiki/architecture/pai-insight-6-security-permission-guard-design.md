# PAI 启示六：确定性安全防护与破坏性操作拦截架构规范 (Security & Permission Guard)

本文档针对 Daniel Miessler PAI 框架的**启示六（安全与权限防护系统：Security & Permission System）**，结合 **Daydream Engine（白日做梦引擎 / GeneralAgent）** 的最高优先级数据保护原则（`AGENTS.md` Data Protection Rule），制定破坏性数据操作风险分级、事前自动备份校验、强行确认机制与确定性安全防护服务规范。

---

## 一、 核心痛点与工程目标

### 1.1 痛点：破坏性操作风险与无备份误删
在现有的项目编排与 REST 路由中，存在以下三个数据安全痛点：
1. **直接物理删除风险**：如 `novelCoreCrudService.deleteNovel` 或数据库重置接口，在接收到请求后直接执行 SQL/Prisma 物理删除，没有任何事前备份检查。
2. **缺乏确定性风险分级**：系统没有对读取（LOW）、更新（MEDIUM）、高危删除（HIGH）与毁灭性重置（CRITICAL）进行明确区分，存在误删数据导致创作者几周劳动成果化为泡影的风险。
3. **违反工程宪法 Data Protection 原则**：项目宪法 `AGENTS.md` 明确规定：“在没有经过验证的有效备份前，绝不执行任何破坏性数据操作”。

### 1.2 目标：SafetyGuardService 防线、事前备份强校验与确定性拦截
> **原则：建立 `SafetyGuardService` 安全防护网关。将操作划分为 LOW、MEDIUM、HIGH、CRITICAL 四个风险等级。对于 HIGH 与 CRITICAL 破坏性操作，强行校验“事前自动快照/有效备份存在性”与“用户显式二次确认 Token”，若校验不通过则绝对阻断执行。**

---

## 二、 确定性安全防护架构 (Safety Guard Architecture)

```
                            Daydream Engine 确定性安全防护架构
                            
  +-----------------------------------------------------------------------------------------+
  |  破坏性操作请求 (High Risk Deletion / Reset Request)                                    |
  |  例如: DELETE /api/novels/:id  /  POST /api/settings/reset                              |
  +-----------------------------------------------------------------------------------------+
                                               │
                                               ▼ 提交安全检查
  +-----------------------------------------------------------------------------------------+
  |  SafetyGuardService.assertSafetyCheck(input) (位于 server/src/platform/security/)        |
  +-----------------------------------------------------------------------------------------+
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼ 评估风险等级                                  ▼
      +----------------------------------+            +----------------------------------+
      | RISK LEVEL: HIGH / CRITICAL      |            | RISK LEVEL: LOW / MEDIUM         |
      +----------------------------------+            +----------------------------------+
                       │                                               │
                       ▼ 触发防线检查                                  ▼ 放行
      +----------------------------------+                     [ 正常执行业务逻辑 ]
      | 1. 显式确认校验 (confirmToken)   |
      | 2. 自动备份校验 (Backup Check)   |
      +----------------------------------+
                       │
             ┌─────────┴─────────┐
             ▼ 校验通过          ▼ 校验失败 (无备份 / 无 Token)
      [ 自动备份并放行 ]   [ 抛出 SafetyCheckFailedError 强行阻断 ]
```

---

## 三、 核心代码文件与数据接口定义

### 1. 数据类型定义 ([safetyGuardTypes.ts](file:///Users/nvidia/GeneralAgent/server/src/platform/security/safetyGuardTypes.ts))

```typescript
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SafetyCheckInput {
  operationName: string;            // 操作名称 (例如: "deleteNovel", "resetDatabase")
  riskLevel: RiskLevel;             // 风险等级
  novelId?: string;                 // 相关小说 ID
  confirmToken?: string;            // 显式二次确认 Token
  requireVerifiedBackup?: boolean;  // 是否必须要求已校验的备份
}

export interface SafetyCheckResult {
  safe: boolean;
  riskLevel: RiskLevel;
  backupCreated: boolean;
  backupPath?: string;
  reason?: string;
}

export class SafetyCheckFailedError extends Error {
  constructor(public readonly reason: string, public readonly requiredBackup: boolean = true) {
    super(`[SafetyGuardService] 破坏性操作已强行拦截: ${reason}`);
    this.name = "SafetyCheckFailedError";
  }
}
```

---

## 四、 核心防护逻辑 ([SafetyGuardService.ts](file:///Users/nvidia/GeneralAgent/server/src/platform/security/CreatorSafetyGuardService.ts))

`SafetyGuardService` 暴露 `assertSafetyCheck(input)` 方法：

```typescript
export class SafetyGuardService {
  /**
   * Asserts pre-operation safety checks for high-risk data mutations.
   * If riskLevel is HIGH or CRITICAL, forces backup creation/verification
   * and double-confirmation, otherwise throws SafetyCheckFailedError to block execution.
   */
  async assertSafetyCheck(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    const { riskLevel, operationName, novelId, confirmToken, requireVerifiedBackup = true } = input;

    if (riskLevel === "LOW" || riskLevel === "MEDIUM") {
      return { safe: true, riskLevel, backupCreated: false };
    }

    // 1. 显式确认 Token 校验
    if (!confirmToken || confirmToken.trim() !== "CONFIRM_DELETE") {
      throw new SafetyCheckFailedError(`操作 '${operationName}' 属于 ${riskLevel} 高危级，必须提供 confirmToken = 'CONFIRM_DELETE' 进行显式确认。`);
    }

    // 2. 事前备份强校验
    let backupCreated = false;
    let backupPath: string | undefined;

    if (novelId && requireVerifiedBackup) {
      try {
        const backupResult = await userAssetBackupGateway.exportProjectAssets(novelId);
        backupCreated = backupResult.verified;
        backupPath = backupResult.filePath;
      } catch (error) {
        throw new SafetyCheckFailedError(`无法为小说 ${novelId} 创建安全快照备份，破坏性操作取消。原因: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      safe: true,
      riskLevel,
      backupCreated,
      backupPath,
    };
  }
}

export const safetyGuardService = new SafetyGuardService();
```

---

## 五、 零回归兼容与安全矩阵 (Zero-Regression Safeguards)

| 维度 | 安全保护设计 | 验证机制 |
| :--- | :--- | :--- |
| **高危操作强行拦击** | 对 `deleteNovel` 等高危动作挂载安全检查，校验失败绝对不触碰数据库 deletion 指令 | 单元测试拦截模拟 |
| **自动安全快照** | 在删除小说前，由 `UserAssetBackupGateway` 自动生成全量 JSON 快照备份，防止误删无法恢复 | 单元测试快照落地校验 |
| **0 Schema 修改** | 不改动 SQLite 表结构，纯代码切面防护 | SQLite 读写回归测试 |

---

* **文档位置**：[docs/wiki/architecture/pai-insight-6-security-permission-guard-design.md](file:///Users/nvidia/GeneralAgent/docs/wiki/architecture/pai-insight-6-security-permission-guard-design.md)
* **状态**：启示六确定性安全防护与破坏性操作拦截规范已归档 Wiki
