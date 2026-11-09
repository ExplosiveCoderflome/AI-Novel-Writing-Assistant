# API 访问令牌边界

## 背景与决策

模型密钥、小说正文和任务操作共用服务端 API。仅靠 CORS 不能保护 API，且分散在各路由内的鉴权容易漏掉新增入口。因此应用在 `/api` 总入口统一鉴权，各业务路由的既有 middleware 可继续复用同一规则。

## 当前规则

- `AI_NOVEL_ACCESS_TOKEN` 配置后，所有业务请求都需有效 Bearer 令牌或已验证的浏览器会话，包括本机请求。令牌不进入 URL、日志或前端构建变量。
- 未配置时只允许非 production、socket 来自 loopback、Host 为 loopback 且 Origin 缺省或为 loopback 的本地开发请求。远程请求返回 503，配置后缺失或错误凭据返回 401。不得信任客户端转发头来扩大本机豁免。
- 部署必须设置 `NODE_ENV=production` 和 `AI_NOVEL_ACCESS_TOKEN`；反向代理保留原 Host。开发代理也保留 Host，防止局域网请求经代理后被当成本机请求。
- Web 在连接页输入令牌，以 Bearer 验证后获得 HttpOnly、SameSite=Strict 的会话 Cookie；API、资源、流式 Fetch 与 EventSource 共用会话。前后端应部署在同一站点，跨站前后端使用同源反向代理。公网由 HTTPS 终止点保护传输。
- 健康检查只返回服务存活信息，允许无凭据访问。钉钉、企业微信回调仅豁免已有的回调路径和方法，继续由各渠道签名／Token 校验，不可把普通任务操作加入豁免。
- 桌面托管模式在主进程生成 32 字节随机令牌，经进程环境传给本地服务，经既有 preload runtime 传给渲染器。Electron 只向对应 loopback API 注入 Authorization，覆盖 Axios、Fetch、资源加载和 EventSource。运行时令牌无需用户配置、不写入磁盘。外接开发服务使用其配置的令牌，不擅自更改外接服务。
- 桌面的 file Origin 仅在桌面服务运行时纳入 CORS，API 令牌校验仍然生效。

## 相关模块与验证

`middleware/auth.ts` 定义鉴权和浏览器会话；`app.ts` 负责总入口；桌面 `runtime/access.ts` 负责生成；主进程和 preload 负责注入。鉴权测试使用独立随机端口、内存配置和无数据请求，不启动后台任务或迁移应用数据库。

Electron 请求注入遵循 [WebRequest API](https://www.electronjs.org/docs/latest/api/web-request)。业务模块不得使用查询参数携带应用访问令牌。
