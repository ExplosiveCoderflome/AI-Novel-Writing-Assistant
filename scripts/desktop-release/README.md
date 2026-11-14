# 发版验证门面

`guard.cjs` 拥有版本／tag 关系、当前提交验证与隔离检查环境；`check.cjs` 只验证、不创建 tag、不上传。创建 tag 的入口仍是 `trigger-desktop-release.cjs`。CI 正式上传入口是 `publish-artifacts.cjs`（只上传已校验产物）；本地仍可通过 `run-electron-builder.cjs --publish always` 走 builder 上传。任一入口不得将失败检查转换成 warning 后继续。

## 证明职责

- `run.cjs` / `runReleaseChecks`：只生成可移植检查证明，不依赖 PG live proof。
- `pg-live-gate`：独立生成 PG proof。
- 各平台 `build-*`：`--publish never` 打包一次，签名在构建阶段完成，并写入 `build-manifest.json`（head／run／attempt／version／os／arch／文件摘要）。
- `verify-proof.cjs` / `verifyUpload` / `publish-artifacts.cjs`：上传前 fail-closed 校验双证明；`publish-artifacts.cjs` 额外校验构建清单与字节摘要，合并 `latest-mac.yml`，再上传既有文件。
- `check.cjs`（含 workflow_dispatch）：仍要求当前 run 的 PG proof；本地非 CI 仍跑 `test:pg-live`。

检查顺序为类型检查、全新测试库迁移、server/client 完整测试、server quality、desktop 编译、desktop/script 契约测试。临时测试目录会打印并保留，便于失败诊断；它不能指向现有小说数据库。

完整检查通过后，`checkRevision` 把 commit SHA、桌面版本和通过状态写入被忽略的 `.tmp/desktop-release/<SHA>.json`。之后只有 HEAD、桌面版本均一致且工作区在检查前后保持干净时才复用记录；SHA 不同、记录缺失或损坏、工作区不干净都会重新检查或拒绝发布。`trigger-desktop-release.cjs`、`check.cjs` 与发布上传守卫支持 `--force-tests` 强制重跑；重跑前会清除同 SHA 的旧记录，避免复用失败前的结果。不得用外部 success 布尔值、其他 SHA 的记录或未经验证的跳过开关代替实际检查。

版本来自 desktop/package.json，公共 tag 只能是 vX.Y.Z。GitHub 上传还需要匹配的 tag ref、当前 HEAD 和 main 归属。目录打包及 workflow_dispatch 可不带 tag，但必须使用 publish never。详细流程见开发 wiki 的桌面发布规则。
