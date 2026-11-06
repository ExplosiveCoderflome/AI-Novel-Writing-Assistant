# 自动导演外部通知与动作边界

## 背景与决定

通知适配器负责把内部事件转换为平台认可的消息，不把内部任务、回调 Token 或事件对象直接当作机器人请求体。通知发送失败只记录渠道投递失败，不改变导演任务状态，也不阻塞章节生产。适用范围为自动导演通知、跟进动作入口、渠道配置和前端投递状态。

桌面服务可以仅监听 `127.0.0.1`。飞书通过官方 Node SDK 的 `WSClient` 主动建立长连接接收 `card.action.trigger`，因此无需公网监听地址；钉钉和企业微信自定义机器人按钮使用签名链接，点击端仍须能够访问配置的站点地址。

## 平台协议

- 钉钉发送官方 `actionCard`，请求体只包含 `msgtype` 和 `actionCard`。可选 Secret 采用毫秒时间戳，以 Secret 为 HMAC-SHA256 密钥，对 `timestamp + "\n" + secret` 签名，Base64 后交给 URLSearchParams 编码；不可重复 URL 编码。Webhook 原有参数保留。
- 企业微信发送官方 `markdown`，请求体只包含 `msgtype` 和 `markdown`。两类机器人即使返回 HTTP 200，也必须检查 `errcode`，平台拒绝不能记成投递成功。
- 飞书使用企业自建应用；发送目标显式选择 `chat_id`、`open_id` 或 `user_id`，区域选择飞书或 Lark。应用需启用机器人和发送消息权限，在“事件与回调”的回调配置中启用长连接并订阅 `card.action.trigger`，发布应用并把机器人加入接收群。这里的通知事件订阅列表是应用内过滤条件，不是飞书平台回调订阅。
- 飞书卡片使用 JSON 2.0，按钮通过 `behaviors: [{type: "callback", value: ...}]` 回传事件、任务与动作标识。长连接立即返回 toast，动作异步执行后用应用消息更新接口移除按钮并显示结果，避免超过平台回调响应时限。

## 设置与身份

渠道设置保存在既有 AppSetting 中，不另建数据库表。服务启动时加载飞书配置并订阅保存事件；启停、应用凭证或区域改变时关闭旧连接并建立新连接；目标、事件订阅或用户映射改变不需要重连。服务关闭时取消订阅并强制关闭 SDK 连接。

飞书操作人从 SDK 验证过的回调中取得 `open_id`，也支持映射 `user_id`，经 `operatorMapJson` 转为站内操作人；未映射不能执行。所有动作复用 `AutoDirectorFollowUpActionExecutor`，携带稳定幂等键并写动作记录。钉钉/企微签名链接是持有者授权，不能宣称能识别实际点击人的平台身份；POST 集成保留 Token 和操作人映射校验。未配置回调 Token 时不能接受签名链接操作。

## V1 / V2 动作入口

- V1 保留原有任务版本和 epoch 校验、校验服务、继续与重试路径。属于历史代次或其他版本的旧 workflow ID 必须拒绝，不能查找本书最新 V2 Run 来代替。
- 原生 V2 Run ID 可通过渠道和单条跟进入口，到应用适配器转换为 V2 命令。暂停使用 `resume`；确认门仅接受继续动作并使用 `resolve_gate(confirm)`；尚未启动的队列重试使用 `retry_start`。其他状态返回状态变化提示，不能绕开内核限制。
- V2 执行前仍核验小说版本与 epoch，使用当前 `control.version` 和命令服务已有幂等事务；已保存命令应按原命令重放，不因运行已恢复而再次执行。安全暂停、预算授权、重规划要求等继续由原 V2 恢复事务处理，通知层不能清除。
- 批量跟进保留原有 V1 整批归属预检；本接口不扩展为跨版本的批量执行器。
- 运行记录保持只读，展示投递情况并导航回来源页面；渠道按钮不应被复制成运行记录里的恢复按钮。

## 排查与验证

先检查投递记录的 HTTP 状态和平台错误码，再核对 webhook/Secret 或应用权限和接收目标。消息可送达而按钮无响应时，检查站点可达性、签名和映射，飞书另查平台回调订阅与长连接。V2 操作被拒绝时检查 Run ID、版本、epoch、暂停类型与 control version，不能删除版本围栏来掩盖错误。

使用 `server/tests/*.test.js` 的 node:test 回归协议、签名、SDK 长连接生命周期、操作人映射、幂等和 V2 命令映射。Prisma delegate 是代理，使用项目已有 `stubDatabaseMethod`，不要对 delegate 使用依赖属性描述符的 `mock.method`。

## 相关模块与来源

- `server/src/services/task/autoDirectorFollowUps/README.md`
- [导演版本隔离](./director-version-isolation.md)
- [钉钉机器人协议](https://open.dingtalk.com/document/robots/custom-robot-access)、[加签设置](https://open.dingtalk.com/document/robots/customize-robot-security-settings)
- [飞书官方 Node SDK](https://github.com/larksuite/node-sdk)、[卡片 JSON 2.0](https://open.feishu.cn/document/feishu-cards/card-json-v2-breaking-changes-release-notes)
