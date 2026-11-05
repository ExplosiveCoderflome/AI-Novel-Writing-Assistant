# 桌面端 API 资源地址

## 背景

打包后的渲染器通过 `file://` 加载页面。HTML 图片的 `/api/...` 地址会被解释为本地文件路径，无法经过 Web 开发代理；Axios 的 baseURL 配置也不会作用于 `<img>`。

## 当前规则

漫画等服务端资源的 URL helper 必须通过 `client/src/lib/constants.ts` 的 `assetUrl` 组装地址。其服务根路径从既有 `API_BASE_URL` 去掉末尾 `/api` 得出；桌面模式使用 `window.__AI_NOVEL_RUNTIME__.apiBaseUrl` 的本地服务地址，Web 的 `/api` 配置仍输出同源相对路径。不要硬编码桌面端口，也不要把正文接口路径作为 `file://` 文件处理。

验证 URL builder 时覆盖桌面绝对 API 地址及 Web 相对 API 地址；漫画角色立绘、表情、面部、角色资产、分镜、带字分镜和场景图片都属于此契约。
