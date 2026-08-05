# 美股投研智能体与 MooMoo OpenD 直连集成 Wiki

## 1. 架构背景
美股投资研究与每日调仓智能体为用户提供开盘前调仓指令推荐与多维度研报。由于涉及实盘资产与实时股票行情，系统采用“数据归代码/OpenD，推演归 AI 智能体”的严格分工原则。

## 2. 核心模块与职责

### 2.1 OpenD 守护进程管理 (`openDaemonManager.ts`)
- 自动探测 `127.0.0.1:11111` 原生 TCP 响应。
- 若 OpenD 未运行，自动后台拉起 `moomoo_OpenD` 守护程序。
- 自动捕获 GUI 界面解锁状态（`unlocked: true`），在前端自动更新图标与禁用解锁按钮。

### 2.2 原生 TCP 协议通信 (`moomooAdapter.ts`)
- **持仓与资金拉取**：发送 Cmd 1001 (InitConnect) -> Cmd 2001 (Trd_GetAccList) -> Cmd 2102 (Trd_GetPositionList) -> Cmd 2101 (Trd_GetFunds)。
- **自选股关注列表拉取**：发送 Cmd 3213 (`Qot_GetUserSecurityList`)，零开槛读取用户 MooMoo 账户中的全部自选股（无需交易密码）。
- **实盘实时行情拉取**：发送 Cmd 3001 (`Qot_Sub`) 订阅行情数据 -> Cmd 3004 (`Qot_GetBasicQot`) 获取盘中/盘前/盘后/夜盘最新现价。

### 2.3 智能体推演与 Prompt Governance (`stock.prompts.ts`)
- **自选股优先法则**：AI 在推演加仓/建仓推荐 (BUY/TRIM) 时，强制优先从用户的 MooMoo 自选关注池中筛选具备大盘与催化剂风口的标的。
- **专业金融研报结构**：包含【持仓健康诊断】、【大盘与催化剂点评】、【核心个股归因分析】与【今日调仓与资金策略】。

### 2.4 100% 数据真实性后处理校验管道 (`dailyStrategyDirector.ts`)
- AI 生成结构化 JSON 后，所有数值字段（`estimatedPrice`、`suggestedShares`、`estimatedAmount`）必须经过确定性代码强制校准：
  - `estimatedPrice` = 100% 强制覆盖为 OpenD 实盘最新现价（如 NVDA $211.94）。
  - `suggestedShares` = 公式精算，确保买入不超越实际闲置资金与预算上限。
  - `estimatedAmount` = 由死公式 `suggestedShares * estimatedPrice` 决定，杜绝 AI 猜数字与数据幻觉。

## 3. 故障排除与常见问题
- **OpenD 未安装/未启动**：可通过环境变量 `OPEND_EXE_PATH`、`OPEND_HOST`、`OPEND_PORT` 动态配置。
- **实盘持仓返回 0 笔**：OpenD 默认保护实盘交易权限，用户可在 OpenD GUI 勾选允许实盘 API 或通过粘贴面板一键导入。系统会保留用户的自定义现金与持仓数据，不误抹除。
