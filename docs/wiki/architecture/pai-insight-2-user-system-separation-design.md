# PAI 启示二：USER / SYSTEM 资产与架构分离设计规范 (User/System Separation & Asset Protection)

本文档针对 Daniel Miessler PAI 框架的**启示二（用户资产与系统基础设施分离：USER / SYSTEM Separation）**，基于 **Daydream Engine（白日做梦引擎 / GeneralAgent）** 的全量代码库与数据存储架构，制定创作者资产隔离、无损版本升级与数据保护规则。

---

## 一、 核心痛点与设计目标

### 1.1 痛点：系统升级侵入与数据污染风险
在传统的 AI 内容生成与软件迭代中，常见的痛点包括：
1. **升级清空用户资产**：数据库 Migration、依赖升级或脚本重置（如 `reset-and-seed-db.js`）不慎擦除用户的创作者数据库 (`dev.db`)。
2. **硬编码配置覆写**：引擎启动时强行覆盖 `AppSetting`（如强行将用户自定义的 LLM 节点重置为系统默认端口）。
3. **旧架构耦合**：系统升级代码时直接改动存量数据的表结构导致历史作品无法读取。

### 1.2 目标：USER / SYSTEM 彻底解耦与单一版本高可维护性
> **原则：USER 层的作品资产（小说正文、世界观沙盒、角色卡、多模态渲染文件、个性化设置）是创作者的核心个人资产，独立于 SYSTEM 层的代码、Prompt 模版与引擎算法。引擎迭代只更新 SYSTEM，绝对不侵入或破坏 USER 资产；同时 SYSTEM 层保持单一活跃主版本（Single Active Canonical Version），避免多版本遗留膨胀。**

---

## 二、 USER / SYSTEM 全量代码边界划分 (Boundary Map)

```
                            Daydream Engine 资产与系统分层架构
                            
+---------------------------------------------------------------------------------------+
|  USER Space (创作者资产层 - 100% 隔离、持久保护、成果化落地)                           |
|  ├─ 创作数据 (Prisma DB): Novel, Chapter, NovelVolume, World, Character, LoreSandbox   |
|  ├─ 个性化设置 (AppSetting): LLM Key 偏好, 自定义模型路由, 创作者风格 Profile          |
|  └─ 生成媒体资产 (Storage): /assets/projects/ (视频渲染文件, 导图, 生成音频)            |
+---------------------------------------------------------------------------------------+
                                           │ 读取 / 驱动 (Read-Only Bridge)
                                           ▼
+---------------------------------------------------------------------------------------+
|  SYSTEM Space (基础设施系统层 - 单一主版本管理，无历史包袱)                            |
|  ├─ Prompt 资产库 (server/src/prompting/): 保持单一主版本，成果落库后与 Prompt 解耦   |
|  ├─ 自动导演与编排引擎 (server/src/services/novel/director/): 状态机与工作流算法       |
|  ├─ 离线视频渲染引擎 (server/src/services/video/): VellumReel / FFmpeg CLI 包装器       |
|  └─ 架构数据库 Migration (server/src/prisma/): 增量向后兼容 Migration                 |
+---------------------------------------------------------------------------------------+
```

---

## 三、 确定性资产保护与防覆盖细则 (Asset Protection Rules)

### 3.1 用户设置保护（AppSetting Non-Destructive Upsert）
* **规则**：引擎初始化或自动化脚本在配置默认设置（如离线模型端口、默认 TTS 路径）时，必须采用 **“不存在则创建，存在则保留” (Create If Missing, Preserve If Present)** 策略。
* **反模式**：`upsert({ update: { value: default } })` 强行覆盖用户配置。
* **正确模式**：
```typescript
// 示例：安全的用户配置加载器 (UserSettingProtectionService.ts)
export async function ensureDefaultAppSetting(key: string, defaultValue: string): Promise<void> {
  const existing = await prisma.appSetting.findUnique({ where: { key } });
  if (!existing) {
    await prisma.appSetting.create({ data: { key, value: defaultValue } });
  }
  // 若已存在，绝对不执行 update，100% 保护用户自定义设置
}
```

### 3.2 创作者资产安全导出与归档网关 (UserAssetBackupGateway.ts)
为确保系统升级或迁移前创作者资产安全，建立独立的资产导出与备份服务：
1. **全量元数据导出**：将创作者的所有 Novel、Chapter、WorldAxiom、Character 卡导出为版本化 JSON。
2. **备份验证机制**：在执行任何危险数据防护操作前，必须强行校验备份文件存在性与体积，零备份不允许擦除。

### 3.3 Prompt 单一主版本范式与成果落库解耦 (Single Canonical Version & Result Decoupling)
* **采纳建议**：**不采用**繁琐的多版本 Prompt 堆叠（如同时保留 `audit@v1`, `audit@v2`, `audit@v3`），避免技术债务爆炸。`server/src/prompting/` 统一维护**单一主版本 (Single Canonical Version)**。
* **解耦保障**：
  * LLM 生成的内容（如章纲、正文、角色卡）一旦通过校验，**立即作为标准文本/JSON 写入 USER 层的 SQLite 数据库**。
  * 落库后的作品数据 100% 独立存在，后续 SYSTEM 层的 Prompt 模版升级**完全不影响**已生成的历史作品数据。

---

## 四、 全量 100% 零回归兼容矩阵 (Zero-Regression Safeguards)

| 维度 | 安全保护设计 | 验证机制 |
| :--- | :--- | :--- |
| **数据库兼容** | 0 破坏性 Migration，已有表结构与数据只增不删 | SQLite 读写回归测试 |
| **用户配置保护** | `ensureDefaultAppSetting` 仅填充缺失项，不覆盖已有设置 | 设置持久化覆盖测试 |
| **系统 Prompt 维护** | 单一主版本维护，生成的作品成果落库即解耦 | 成果落库持久化验证 |
| **作品媒体资产** | `/assets/projects/` 按 `projectId` 绝对路径隔离存储 | 渲染文件持久化校验 |

---

* **文档位置**：[docs/wiki/architecture/pai-insight-2-user-system-separation-design.md](file:///Users/nvidia/GeneralAgent/docs/wiki/architecture/pai-insight-2-user-system-separation-design.md)
* **状态**：采纳单版本维护建议，启示二全量资产分离与解耦规范已归档
