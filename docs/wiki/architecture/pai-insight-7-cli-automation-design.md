# PAI 启示七：CLI 优先的可脚本化与自动化引擎架构规范 (CLI-First Automation Engine)

本文档针对 Daniel Miessler PAI 框架的**启示七（CLI 优先界面与 UNIX 哲学：CLI-First & UNIX Philosophy）**，结合 **Daydream Engine（白日做梦引擎 / GeneralAgent）** 的无头自动编排需求（Headless Execution & Scriptable Pipeline），制定 CLI 自动化网关、命令分派、标准参数解析与无头 CLI 脚本入口规范。

---

## 一、 核心痛点与工程目标

### 1.1 痛点：GUI 强绑定与无头自动化困难
在现有的自动化编排中，存在以下三个工程痛点：
1. **强绑定 Web GUI 交互**：部分核心能力（如全书批量审查、RAG 向量索引重建、渲染任务调度）需要通过 HTTP 请求或前端点击，无法通过简单的 Shell 命令行或 CI/CD 自动调度运行。
2. **缺乏 UNIX 管道化输出**：没有统一的命令行 JSON/Text 格式化输出规范，导致脚本（Shell / Python）难以读取工具的运行结果与 Metrics 统计。
3. **缺乏确定性的 CLI 参数解析器**：自动化脚本散落，缺乏统一定义的参数说明与帮助文档。

### 1.2 目标：UNIX 哲学、CLI 自动化网关与无头脚本入口
> **原则：遵循 UNIX 哲学——“做一件事，做好它（Do one thing and do it well）”。将所有核心系统能力包装为确定性的 `CLIAutomationService`，并提供无头 CLI 脚本入口 `cliRunner.ts`，支持通过 Shell 命令行一键调用任何编排任务。**

---

## 二、 CLI 自动化架构 (CLI Automation Architecture)

```
                            Daydream Engine CLI 自动化架构
                            
  +-----------------------------------------------------------------------------------------+
  |  Shell 命令行 / CI/CD / 自动调度器 (CommandLine / Terminal)                              |
  |  命令格式: pnpm --filter server run:cli <command> --novelId=<id> [options]               |
  +-----------------------------------------------------------------------------------------+
                                               │ 参数输入
                                               ▼
  +-----------------------------------------------------------------------------------------+
  |  CLI 脚本入口: cliRunner.ts (server/src/cliRunner.ts)                                   |
  |  解析 argv 参数与选项 (--novelId, --dryRun, --outputDir, --verbose)                       |
  +-----------------------------------------------------------------------------------------+
                                               │ 派发
                                               ▼
  +-----------------------------------------------------------------------------------------+
  |  CLI 自动化服务网关: CLIAutomationService.ts (server/src/platform/cli/)                |
  |  ├─ runBatchGenerate(): 无头批量章节生成                                                 |
  |  ├─ runRebuildRag(): 向量与硬规则索引重建                                                |
  |  ├─ runAuditHealth(): 项目质量健康审计                                                   |
  |  ├─ runExportAssets(): 创作者资产导包备份                                                |
  |  └─ runRenderVideo(): 无头视频渲染调度                                                   |
  +-----------------------------------------------------------------------------------------+
                                               │
                                               ▼ 运行结果输出
  +-----------------------------------------------------------------------------------------+
  |  UNIX 标准输出 (JSON / Clean Text Report)                                                |
  +-----------------------------------------------------------------------------------------+
```

---

## 三、 核心代码文件与数据接口定义

### 1. 数据类型定义 ([cliAutomationTypes.ts](file:///Users/nvidia/GeneralAgent/server/src/platform/cli/cliAutomationTypes.ts))

```typescript
export type CLICommandType =
  | "batch-generate"
  | "rebuild-rag"
  | "audit-health"
  | "export-assets"
  | "render-video";

export interface CLICommandOptions {
  novelId?: string;
  projectId?: string;
  chapterRange?: string; // 例如: "1-5"
  outputDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
  confirmToken?: string;
}

export interface CLIExecutionResult {
  success: boolean;
  command: CLICommandType;
  durationMs: number;
  metrics: Record<string, unknown>;
  logs: string[];
  error?: string;
}
```

---

## 四、 CLI 自动化服务网关 ([CLIAutomationService.ts](file:///Users/nvidia/GeneralAgent/server/src/platform/cli/CLIAutomationService.ts))

`CLIAutomationService` 暴露确定性的命令行执行逻辑：

```typescript
export class CLIAutomationService {
  /**
   * Dispatches and executes a CLI command with metrics and standard result formatting.
   */
  async executeCommand(command: CLICommandType, options: CLICommandOptions): Promise<CLIExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      let metrics: Record<string, unknown> = {};

      switch (command) {
        case "audit-health":
          metrics = await this.runAuditHealth(options, logs);
          break;
        case "export-assets":
          metrics = await this.runExportAssets(options, logs);
          break;
        case "rebuild-rag":
          metrics = await this.runRebuildRag(options, logs);
          break;
        case "batch-generate":
          metrics = await this.runBatchGenerate(options, logs);
          break;
        default:
          throw new Error(`未知的 CLI 命令类型: ${command}`);
      }

      return {
        success: true,
        command,
        durationMs: Date.now() - startTime,
        metrics,
        logs,
      };
    } catch (error) {
      return {
        success: false,
        command,
        durationMs: Date.now() - startTime,
        metrics: {},
        logs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // 内部具体无头执行实现...
}

export const cliAutomationService = new CLIAutomationService();
```

---

## 五、 零回归兼容与 UNIX 规范矩阵 (Zero-Regression Safeguards)

| 维度 | 安全保护设计 | 验证机制 |
| :--- | :--- | :--- |
| **无头脱机执行** | CLI 命令可完全脱离 Express Web Server 独立运行 | CLI 脚本独立测试 |
| **UNIX 标准流输出** | 支持 `--json` 输出结构化数据，方便 Shell 管道与第三方 Agent 消费 | 管道输出 JSON 测试 |
| **高危命令安全阻断** | 结合启示六，CLI 中执行高危导出/删除需提供 `confirmToken` | 结合 SafetyGuard 校验 |

---

* **文档位置**：[docs/wiki/architecture/pai-insight-7-cli-automation-design.md](file:///Users/nvidia/GeneralAgent/docs/wiki/architecture/pai-insight-7-cli-automation-design.md)
* **状态**：启示七 CLI 优先自动化与 UNIX 可脚本化引擎规范已归档 Wiki
